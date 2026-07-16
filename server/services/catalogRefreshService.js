import { randomUUID } from 'node:crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import Movie from '../models/Movie.js';
import CatalogBatch from '../models/CatalogBatch.js';
import CatalogRefreshRun from '../models/CatalogRefreshRun.js';
import SiteConfig from '../models/SiteConfig.js';
import { verifyCatalogV2Indexes } from '../configs/indexes.js';
import {
    acquireFencedLock,
    releaseFencedLock,
    renewFencedLock,
    verifyFencedLock,
} from './lockService.js';
import {
    deleteByPattern,
    deleteKeys,
    getJson,
    setJson,
    setRequiredJson,
} from './cacheService.js';
import { redisKeys, redisTtl } from './redisKeys.js';

const BUCKET_SIZE = 50;
const DETAIL_CONCURRENCY = 5;
const MAX_TMDB_ATTEMPTS = 600;
const MAX_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed']);
const CLEAR_REFRESH_STATE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local ok, state = pcall(cjson.decode, value)
if not ok or tostring(state.fencingToken) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export class CatalogRefreshError extends Error {
    constructor(code, message, { transient = false, cause } = {}) {
        super(message, { cause });
        this.name = 'CatalogRefreshError';
        this.code = code;
        this.transient = transient;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hashCode(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    let value = seed;
    return () => {
        value += 0x6D2B79F5;
        let result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
}

export function getDeterministicPermutation(movieIds, seedString) {
    const list = [...movieIds];
    const random = mulberry32(hashCode(seedString));
    for (let index = list.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [list[index], list[target]] = [list[target], list[index]];
    }
    return list;
}

export function getISOWeekKey(date) {
    const local = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const target = new Date(local.getTime());
    const dayNumber = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNumber + 3);
    const firstThursday = target.getTime();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const week = 1 + Math.round((firstThursday - target.getTime()) / 604800000);
    return `${new Date(firstThursday).getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function calculateCurrentSlot(date) {
    const local = new Date(date.getTime() + (7 * 60 * 60 * 1000));
    const mondayBasedDay = (local.getUTCDay() + 6) % 7;
    const hour = local.getUTCHours();
    if (mondayBasedDay === 0 && hour < 8) return 13;
    if (hour < 8) return (mondayBasedDay * 2) - 1;
    if (hour < 20) return mondayBasedDay * 2;
    return (mondayBasedDay * 2) + 1;
}

const rotate = (values, offset) => {
    if (!values.length) return [];
    const normalized = ((offset % values.length) + values.length) % values.length;
    return [...values.slice(normalized), ...values.slice(0, normalized)];
};

const interleave = (...groups) => {
    const output = [];
    const maxLength = Math.max(0, ...groups.map((group) => group.length));
    for (let index = 0; index < maxLength; index += 1) {
        for (const group of groups) {
            if (index < group.length) output.push(group[index]);
        }
    }
    return output;
};

export function allocateCatalogSectionIds(batch, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 13) {
        throw new CatalogRefreshError('INVALID_SLOT', `Catalog slot must be between 0 and 13; received ${slot}`);
    }
    const newest = getDeterministicPermutation(batch.buckets.newest, `${batch.weekKey}:newest`);
    const popular = getDeterministicPermutation(batch.buckets.popular, `${batch.weekKey}:popular`);
    const classics = getDeterministicPermutation(batch.buckets.classics, `${batch.weekKey}:classics`);
    const rotatedNewest = rotate(newest, slot * 7);
    const rotatedPopular = rotate(popular, slot * 11);
    const rotatedClassics = rotate(classics, slot * 13);

    const hero = rotatedNewest.slice(0, 5);
    const nowShowing = rotatedNewest.slice(5, 25);
    const popularSection = rotatedPopular.slice(0, 20);
    const classicsSection = rotatedClassics.slice(0, 20);
    const used = new Set([...hero, ...nowShowing, ...popularSection, ...classicsSection]);
    const remaining = interleave(
        rotatedNewest.slice(25),
        rotatedPopular.slice(20),
        rotatedClassics.slice(20),
    );
    const recommended = [];
    for (const id of remaining) {
        if (!used.has(id)) {
            used.add(id);
            recommended.push(id);
            if (recommended.length === 20) break;
        }
    }
    if (used.size !== 85 || recommended.length !== 20) {
        throw new CatalogRefreshError('SECTION_ALLOCATION_INVALID', 'Catalog section allocation must contain 85 unique movie IDs');
    }
    return { hero, nowShowing, popular: popularSection, classics: classicsSection, recommended };
}

const createMetrics = () => ({
    fetched: 0,
    rejected: 0,
    duplicates: 0,
    detailsFetched: 0,
    requestAttempts: 0,
    statusCounts: {},
});

const classifyRequestError = (error) => {
    const status = Number(error?.response?.status) || 0;
    const code = String(error?.code || 'UNKNOWN');
    const timeout = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENETRESET'].includes(code);
    return { status, code, retryable: timeout || RETRYABLE_STATUSES.has(status) };
};

const retryAfterMs = (error) => {
    const raw = error?.response?.headers?.['retry-after'];
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30000);
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.min(Math.max(0, date - Date.now()), 30000) : 0;
};

const createTmdbContext = ({ wait = sleep, random = Math.random } = {}) => ({ metrics: createMetrics(), wait, random });

async function requestTmdb(path, params, context) {
    if (!process.env.TMDB_API_KEY) {
        throw new CatalogRefreshError('TMDB_NOT_CONFIGURED', 'TMDB_API_KEY is not configured');
    }
    let lastError;
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
        context.metrics.requestAttempts += 1;
        if (context.metrics.requestAttempts > MAX_TMDB_ATTEMPTS) {
            throw new CatalogRefreshError('TMDB_REQUEST_BUDGET_EXHAUSTED', 'TMDB request budget was exhausted');
        }
        try {
            const response = await axios.get(`https://api.themoviedb.org/3${path}`, {
                headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
                params,
                timeout: Number(process.env.TMDB_TIMEOUT_MS) || 3000,
            });
            context.metrics.statusCounts[String(response.status || 200)] = (context.metrics.statusCounts[String(response.status || 200)] || 0) + 1;
            return response.data;
        } catch (error) {
            lastError = error;
            const classified = classifyRequestError(error);
            const category = classified.status ? String(classified.status) : classified.code;
            context.metrics.statusCounts[category] = (context.metrics.statusCounts[category] || 0) + 1;
            if (!classified.retryable || attempt === MAX_REQUEST_ATTEMPTS) break;
            const exponential = Math.min(500 * (2 ** (attempt - 1)), 8000);
            const delay = classified.status === 429 ? Math.max(exponential, retryAfterMs(error)) : exponential;
            await context.wait(delay + Math.floor(context.random() * 251));
        }
    }
    const classified = classifyRequestError(lastError);
    throw new CatalogRefreshError(
        classified.status === 429 ? 'TMDB_RATE_LIMITED' : 'TMDB_REQUEST_FAILED',
        `TMDB request failed for ${path}`,
        { transient: classified.retryable, cause: lastError },
    );
}

export const catalogRefreshTestHooks = Object.freeze({
    createTmdbContext,
    requestTmdb,
    allocateVersionedBatch,
});

async function runWithConcurrencyLimit(limit, items, task) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await task(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

function validateMovie(details, { classicCutoff } = {}) {
    if (!details || !Number.isInteger(details.id) || details.id <= 0) return false;
    if (!String(details.title || '').trim() || !String(details.overview || '').trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(details.release_date || ''))) return false;
    if (classicCutoff && details.release_date > classicCutoff) return false;
    if (!String(details.poster_path || '').trim() || !String(details.backdrop_path || '').trim()) return false;
    if (details.adult === true || !Number.isFinite(details.runtime) || details.runtime <= 0) return false;
    if (!Array.isArray(details.genres) || !Number.isFinite(details.vote_average)) return false;
    return Boolean(String(details.original_language || '').trim());
}

const toMovieDocument = (movie) => ({
    _id: String(movie.id),
    title: movie.title,
    overview: movie.overview,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    original_language: movie.original_language,
    tagline: movie.tagline || '',
    genres: movie.genres || [],
    casts: (movie.credits?.cast || []).slice(0, 20),
    vote_average: movie.vote_average,
    runtime: movie.runtime,
});

const uniqueCandidateIds = (candidates, used, metrics) => {
    const pageSeen = new Set();
    const ids = [];
    for (const candidate of candidates) {
        const id = String(candidate?.id || '');
        if (!/^\d+$/.test(id) || used.has(id) || pageSeen.has(id)) {
            metrics.duplicates += 1;
            continue;
        }
        pageSeen.add(id);
        ids.push(id);
    }
    return ids;
};

async function fetchValidatedDetails(ids, context, validationOptions) {
    return runWithConcurrencyLimit(DETAIL_CONCURRENCY, ids, async (id) => {
        try {
            const details = await requestTmdb(`/movie/${id}`, { language: 'en-US', append_to_response: 'credits' }, context);
            context.metrics.detailsFetched += 1;
            if (!validateMovie(details, validationOptions)) {
                context.metrics.rejected += 1;
                return null;
            }
            return details;
        } catch (error) {
            if (error.code === 'TMDB_REQUEST_BUDGET_EXHAUSTED') throw error;
            context.metrics.rejected += 1;
            return null;
        }
    });
}

export async function buildWeeklyCatalogDraft({ weekKey }) {
    const context = createTmdbContext();
    const used = new Set();
    const movieMap = new Map();
    const buckets = { newest: [], classics: [], popular: [] };
    const pages = { newest: [], classics: [], popular: [] };
    const weekYear = Number(String(weekKey).slice(0, 4));
    const classicCutoff = `${weekYear - 15}-12-31`;

    const collect = async ({ bucket, pageLimit, loadPage, validationOptions }) => {
        for (let pageIndex = 0; buckets[bucket].length < BUCKET_SIZE && pageIndex < pageLimit; pageIndex += 1) {
            const { candidates, pageLabel } = await loadPage(pageIndex);
            pages[bucket].push(pageLabel);
            context.metrics.fetched += candidates.length;
            const ids = uniqueCandidateIds(candidates, used, context.metrics);
            const details = await fetchValidatedDetails(ids, context, validationOptions);
            for (const movie of details) {
                if (!movie || buckets[bucket].length >= BUCKET_SIZE) continue;
                const id = String(movie.id);
                if (used.has(id)) continue;
                used.add(id);
                buckets[bucket].push(id);
                movieMap.set(id, movie);
            }
        }
    };

    await collect({
        bucket: 'newest',
        pageLimit: 10,
        loadPage: async (index) => {
            const page = index + 1;
            const [nowPlaying, upcoming] = await Promise.all([
                requestTmdb('/movie/now_playing', { language: 'en-US', page }, context),
                requestTmdb('/movie/upcoming', { language: 'en-US', page }, context),
            ]);
            const candidates = [];
            const left = nowPlaying.results || [];
            const right = upcoming.results || [];
            for (let item = 0; item < Math.max(left.length, right.length); item += 1) {
                if (left[item]) candidates.push(left[item]);
                if (right[item]) candidates.push(right[item]);
            }
            return { candidates, pageLabel: page };
        },
    });

    await collect({
        bucket: 'classics',
        pageLimit: 10,
        validationOptions: { classicCutoff },
        loadPage: async (index) => {
            const page = index + 1;
            const data = await requestTmdb('/discover/movie', {
                language: 'en-US',
                'release_date.lte': classicCutoff,
                'vote_count.gte': 500,
                'vote_average.gte': 7,
                sort_by: 'popularity.desc',
                page,
            }, context);
            return { candidates: data.results || [], pageLabel: page };
        },
    });

    const random = mulberry32(hashCode(weekKey));
    const popularPages = [];
    while (popularPages.length < 15) {
        const page = Math.floor(random() * 100) + 1;
        if (!popularPages.includes(page)) popularPages.push(page);
    }
    await collect({
        bucket: 'popular',
        pageLimit: popularPages.length,
        loadPage: async (index) => {
            const page = popularPages[index];
            const data = await requestTmdb('/movie/popular', { language: 'en-US', page }, context);
            return { candidates: data.results || [], pageLabel: page };
        },
    });

    if (Object.values(buckets).some((bucket) => bucket.length !== BUCKET_SIZE) || used.size !== 150) {
        throw new CatalogRefreshError(
            'CATALOG_VALIDATION_FAILED',
            `Unable to build 150 unique movies (${buckets.newest.length}/${buckets.classics.length}/${buckets.popular.length})`,
        );
    }

    return {
        weekKey,
        buckets,
        movieIds: [...buckets.newest, ...buckets.classics, ...buckets.popular],
        movies: [...movieMap.values()].map(toMovieDocument),
        sourceMeta: {
            region: 'US',
            language: 'en-US',
            newestPages: pages.newest,
            classicPages: pages.classics,
            popularPages: pages.popular,
        },
        metrics: context.metrics,
    };
}

// Compatibility export for focused tests and tooling. It is deliberately non-persistent.
export async function buildWeeklyCatalogBatch(weekKey) {
    const draft = await buildWeeklyCatalogDraft({ weekKey });
    return { batch: { weekKey, status: 'staging', ...draft }, movies: draft.movies };
}

const serializeRun = (run) => ({
    runId: run.runId,
    source: run.source,
    requestedBy: run.requestedBy,
    dryRun: run.dryRun,
    status: run.status,
    weekKey: run.weekKey,
    targetVersion: run.targetVersion ?? null,
    batchId: run.batchId ? String(run.batchId) : null,
    fencingToken: run.fencingToken ?? null,
    currentPhase: run.currentPhase,
    attemptCount: run.attemptCount,
    metrics: run.metrics || {},
    errorCode: run.errorCode || '',
    errorMessage: run.errorMessage || '',
    startedAt: run.startedAt || null,
    completedAt: run.completedAt || null,
    createdAt: run.createdAt || null,
    updatedAt: run.updatedAt || null,
});

const publishRun = async (run) => {
    const payload = serializeRun(run);
    try {
        await setRequiredJson(redisKeys.catalogRefreshJob(run.runId), payload, redisTtl.catalogRefreshJob);
    } catch (error) {
        throw new CatalogRefreshError('REDIS_UNAVAILABLE', 'Redis is unavailable for catalog refresh.', { transient: true, cause: error });
    }
    return payload;
};

const publishRefreshState = async (lock, runId) => {
    try {
        await setRequiredJson(redisKeys.catalogRefreshState(), {
            active: true,
            runId,
            fencingToken: lock.fencingToken,
        }, Math.ceil(redisTtl.catalogRefreshLockMs / 1000) * 2);
    } catch (error) {
        throw new CatalogRefreshError('REDIS_UNAVAILABLE', 'Redis is unavailable for catalog refresh.', { transient: true, cause: error });
    }
};

const clearOwnedRefreshState = async (lock) => {
    if (!lock?.client?.isReady) return false;
    const cleared = await lock.client.eval(CLEAR_REFRESH_STATE_SCRIPT, {
        keys: [redisKeys.catalogRefreshState()],
        arguments: [String(lock.fencingToken)],
    });
    return Number(cleared) === 1;
};

export async function queueCatalogRefreshRun({ runId = randomUUID(), source = 'admin', requestedBy = 'system', dryRun = false, now = new Date() } = {}) {
    const weekKey = getISOWeekKey(now);
    const run = await CatalogRefreshRun.findOneAndUpdate(
        { runId },
        { $setOnInsert: { runId, source, requestedBy, dryRun, status: 'queued', currentPhase: 'queued', weekKey } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await publishRun(run);
    return serializeRun(run);
}

export async function getCatalogRefreshRun(runId) {
    const cached = await getJson(redisKeys.catalogRefreshJob(runId));
    if (cached && TERMINAL_RUN_STATUSES.has(cached.status)) return cached;
    const run = await CatalogRefreshRun.findOne({ runId }).lean();
    if (!run) return cached || null;
    const durable = serializeRun(run);
    if (TERMINAL_RUN_STATUSES.has(durable.status)) {
        await setRequiredJson(redisKeys.catalogRefreshJob(runId), durable, redisTtl.catalogRefreshJob).catch(() => undefined);
        return durable;
    }
    return cached || durable;
}

export async function failQueuedCatalogRefreshRun(runId, error) {
    const run = await CatalogRefreshRun.findOneAndUpdate(
        { runId, status: 'queued' },
        {
            $set: {
                status: 'failed',
                currentPhase: 'failed',
                errorCode: error?.code || 'INNGEST_SEND_FAILED',
                errorMessage: 'Unable to queue the catalog refresh.',
                completedAt: new Date(),
            },
        },
        { new: true },
    );
    if (run) await publishRun(run);
    return run ? serializeRun(run) : null;
}

const updateRun = async (runId, fencingToken, patch, { terminal = false } = {}) => {
    const filter = { runId, status: { $nin: ['succeeded', 'failed'] } };
    if (fencingToken !== undefined && fencingToken !== null) filter.fencingToken = fencingToken;
    const update = { $set: patch };
    if (terminal) update.$set.completedAt = new Date();
    const run = await CatalogRefreshRun.findOneAndUpdate(filter, update, { new: true });
    if (!run) {
        const current = await CatalogRefreshRun.findOne({ runId });
        if (current) await publishRun(current).catch(() => undefined);
        return current;
    }
    await publishRun(run);
    return run;
};

async function claimRun({ runId, source, requestedBy, dryRun, weekKey, fencingToken }) {
    const existing = await CatalogRefreshRun.findOne({ runId });
    if (existing && TERMINAL_RUN_STATUSES.has(existing.status)) return { run: existing, terminal: true };
    const run = await CatalogRefreshRun.findOneAndUpdate(
        { runId, status: { $nin: ['succeeded', 'failed'] } },
        {
            $setOnInsert: { runId, source, requestedBy, dryRun, weekKey },
            $set: {
                status: 'running',
                currentPhase: 'acquired-lock',
                fencingToken,
                startedAt: existing?.startedAt || new Date(),
                errorCode: '',
                errorMessage: '',
            },
            $inc: { attemptCount: 1 },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await publishRun(run);
    return { run, terminal: false };
}

async function recordPreLeaseFailure({ runId, source, requestedBy, dryRun, weekKey, error }) {
    const run = await CatalogRefreshRun.findOneAndUpdate(
        { runId, status: { $nin: ['succeeded', 'failed'] } },
        {
            $setOnInsert: { runId, source, requestedBy, dryRun, weekKey },
            $set: {
                status: 'running',
                currentPhase: 'waiting-for-lock',
                errorCode: error.code,
                errorMessage: error.message,
                startedAt: new Date(),
            },
            $inc: { attemptCount: 1 },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const willRetry = error.transient && source !== 'cli' && run.attemptCount < 3;
    if (willRetry) {
        await publishRun(run).catch(() => undefined);
        return run;
    }
    const failed = await CatalogRefreshRun.findOneAndUpdate(
        { runId, status: { $nin: ['succeeded', 'failed'] }, attemptCount: run.attemptCount },
        {
            $set: {
                status: 'failed',
                currentPhase: 'failed',
                completedAt: new Date(),
            },
        },
        { new: true },
    );
    const current = failed || await CatalogRefreshRun.findOne({ runId }) || run;
    await publishRun(current).catch(() => undefined);
    return current;
}

async function allocateVersionedBatch({ weekKey, runId, fencingToken, source }) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const session = await mongoose.startSession();
        try {
            let allocated;
            await session.withTransaction(async () => {
                const existing = await CatalogBatch.findOne({ runId }).session(session);
                if (existing) {
                    if (existing.status !== 'active' && existing.status !== 'retired') {
                        existing.fencingToken = fencingToken;
                        existing.status = 'building';
                        existing.failureReason = '';
                        await existing.save({ session });
                    }
                    allocated = existing;
                    return;
                }
                const latest = await CatalogBatch.findOne({ weekKey }).sort({ version: -1 }).session(session).lean();
                const version = (latest?.version || 0) + 1;
                [allocated] = await CatalogBatch.create([{
                    weekKey,
                    version,
                    runId,
                    fencingToken,
                    status: 'building',
                    generatedAt: new Date(),
                    sourceMeta: { language: 'en-US', region: 'US' },
                    metrics: {},
                }], { session });
            });
            return allocated;
        } catch (error) {
            if (error?.code === 11000 && attempt < 3) continue;
            if (error?.code === 11000) {
                throw new CatalogRefreshError('VERSION_CONFLICT', 'Unable to allocate a catalog version', { transient: true, cause: error });
            }
            throw error;
        } finally {
            await session.endSession();
        }
    }
    throw new CatalogRefreshError('VERSION_CONFLICT', 'Unable to allocate a catalog version');
}

const movieBulkOperations = (movies) => movies.map((movie) => ({
    updateOne: {
        filter: { _id: String(movie._id) },
        update: {
            $set: {
                title: movie.title,
                overview: movie.overview,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                release_date: movie.release_date,
                original_language: movie.original_language,
                tagline: movie.tagline || '',
                genres: movie.genres || [],
                casts: movie.casts || [],
                vote_average: movie.vote_average,
                runtime: movie.runtime,
            },
            $setOnInsert: {
                heroVideoId: '',
                heroVideoUrl: '',
                heroVideoMimeType: '',
                heroVideoPosterUrl: '',
                heroVideoStatus: '',
                heroVideoVersion: '',
            },
        },
        upsert: true,
    },
}));

async function assertLease(lock, lostLease) {
    if (lostLease()) throw new CatalogRefreshError('LOCK_LOST', 'Catalog refresh lease was lost', { transient: true });
    if (!await verifyFencedLock(lock)) throw new CatalogRefreshError('STALE_FENCE', 'Catalog refresh fencing token is stale', { transient: true });
}

export async function activateCatalogBatch(batchId, movies, {
    lock,
    lostLease = () => false,
    now = new Date(),
    faultInjector = async () => undefined,
} = {}) {
    if (!lock) throw new CatalogRefreshError('LOCK_REQUIRED', 'A fenced catalog lease is required for activation');
    await assertLease(lock, lostLease);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const batch = await CatalogBatch.findById(batchId).session(session);
            if (!batch || batch.status !== 'staging') {
                throw new CatalogRefreshError('BATCH_NOT_STAGING', 'Only a staging batch can be activated');
            }
            await Movie.bulkWrite(movieBulkOperations(movies), { session, ordered: false });
            await faultInjector('after-movie-upsert');
            const persistedCount = await Movie.countDocuments({ _id: { $in: batch.movieIds } }).session(session);
            if (persistedCount !== 150) {
                throw new CatalogRefreshError('PERSISTED_MOVIES_INCOMPLETE', `Expected 150 persisted movies, found ${persistedCount}`);
            }
            await CatalogBatch.updateMany(
                { status: 'active', _id: { $ne: batch._id } },
                { $set: { status: 'retired', retiredAt: now } },
                { session },
            );
            await faultInjector('after-retire-active');
            batch.status = 'active';
            batch.activatedAt = now;
            await batch.save({ session });
            await faultInjector('after-activate-batch');

            await assertLease(lock, lostLease);
            await SiteConfig.updateOne(
                { key: 'catalog' },
                { $setOnInsert: { key: 'catalog', 'catalog.lastFencingToken': 0 } },
                { upsert: true, session },
            );
            const config = await SiteConfig.findOneAndUpdate(
                {
                    key: 'catalog',
                    $or: [
                        { 'catalog.lastFencingToken': { $lt: lock.fencingToken } },
                        { 'catalog.lastFencingToken': { $exists: false } },
                    ],
                },
                {
                    $set: {
                        'catalog.activeBatchId': batch._id,
                        'catalog.activeSlot': calculateCurrentSlot(now),
                        'catalog.lastSuccessfulRefreshAt': now,
                        'catalog.lastRotationAt': now,
                        'catalog.lastFencingToken': lock.fencingToken,
                    },
                },
                { new: true, session },
            );
            if (!config) throw new CatalogRefreshError('STALE_FENCE', 'A newer catalog fencing token is already active');
            await faultInjector('after-site-config-update');
            await assertLease(lock, lostLease);
            await faultInjector('before-commit');
        });
    } finally {
        await session.endSession();
    }
}

const normalizeMovieForPayload = (movie) => ({
    _id: String(movie._id),
    id: String(movie._id),
    title: movie.title,
    overview: movie.overview,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    original_language: movie.original_language,
    tagline: movie.tagline || '',
    genres: movie.genres || [],
    casts: movie.casts || [],
    vote_average: movie.vote_average,
    runtime: movie.runtime,
    heroVideoId: movie.heroVideoId || '',
    heroVideoUrl: movie.heroVideoUrl || '',
    heroVideoMimeType: movie.heroVideoMimeType || '',
    heroVideoPosterUrl: movie.heroVideoPosterUrl || '',
    heroVideoStatus: movie.heroVideoStatus || '',
    heroVideoVersion: movie.heroVideoVersion || '',
});

const posterOnlyPayload = (payload) => ({
    ...payload,
    hero: (payload.hero || []).map((movie) => ({
        ...movie,
        heroVideoStatus: 'refreshing',
        heroVideoUrl: '',
        heroVideoMimeType: '',
    })),
});

export async function getPublicHomePayload(limit = 10, region = 'US', now = new Date()) {
    void limit;
    void region;
    const [config, refreshState] = await Promise.all([
        SiteConfig.findOne({ key: 'catalog' }).lean(),
        getJson(redisKeys.catalogRefreshState()),
    ]);
    const refreshing = Boolean(refreshState?.active || config?.catalog?.refreshing);
    let batch = config?.catalog?.activeBatchId
        ? await CatalogBatch.findById(config.catalog.activeBatchId).lean()
        : null;
    if (!batch || batch.status !== 'active') batch = await CatalogBatch.findOne({ status: 'active' }).lean();
    if (!batch) {
        const lastGood = await getJson(redisKeys.catalogLastGood());
        if (!lastGood) return { hero: [], nowShowing: [], popular: [], classics: [], recommended: [], meta: null };
        return refreshing ? posterOnlyPayload(lastGood) : lastGood;
    }

    const slot = calculateCurrentSlot(now);
    const cacheKey = redisKeys.catalogSlot(batch._id, slot);
    let payload = await getJson(cacheKey);
    if (!payload) {
        const sectionIds = allocateCatalogSectionIds(batch, slot);
        const orderedIds = [
            ...sectionIds.hero,
            ...sectionIds.nowShowing,
            ...sectionIds.popular,
            ...sectionIds.classics,
            ...sectionIds.recommended,
        ];
        const movies = await Movie.find({ _id: { $in: orderedIds } }).lean();
        const movieMap = new Map(movies.map((movie) => [String(movie._id), normalizeMovieForPayload(movie)]));
        const resolve = (ids) => ids.map((id) => movieMap.get(String(id))).filter(Boolean);
        payload = {
            hero: resolve(sectionIds.hero),
            nowShowing: resolve(sectionIds.nowShowing),
            popular: resolve(sectionIds.popular),
            classics: resolve(sectionIds.classics),
            recommended: resolve(sectionIds.recommended),
            meta: {
                batchId: String(batch._id),
                weekKey: batch.weekKey,
                version: batch.version,
                slot,
            },
        };
        const payloadIds = [payload.hero, payload.nowShowing, payload.popular, payload.classics, payload.recommended]
            .flat()
            .map((movie) => movie._id);
        if (payloadIds.length !== 85 || new Set(payloadIds).size !== 85) {
            throw new CatalogRefreshError('PAYLOAD_MOVIES_INCOMPLETE', 'Catalog payload must resolve 85 unique Movie documents');
        }
        await setJson(cacheKey, payload, 86400 * 7);
        await setJson(redisKeys.catalogLastGood(), payload, 86400 * 30);
    }
    return refreshing ? posterOnlyPayload(payload) : payload;
}

export async function rotateActiveCatalogSlot(now = new Date()) {
    const config = await SiteConfig.findOne({ key: 'catalog' }).lean();
    if (!config?.catalog?.activeBatchId) return { skipped: true };
    const slot = calculateCurrentSlot(now);
    await SiteConfig.updateOne(
        { key: 'catalog' },
        { $set: { 'catalog.activeSlot': slot, 'catalog.lastRotationAt': now } },
    );
    await deleteKeys(redisKeys.homeHero());
    await deleteByPattern(redisKeys.homeHeroPattern());
    await deleteByPattern(redisKeys.tmdbTrailersPattern());
    const payload = await getPublicHomePayload(10, 'US', now);
    return { skipped: false, slot, meta: payload.meta };
}

export async function refreshWeeklyCatalog({
    dryRun = false,
    source = 'cli',
    runId = randomUUID(),
    requestedBy = 'system',
    now = new Date(),
} = {}) {
    await verifyCatalogV2Indexes();
    const weekKey = getISOWeekKey(now);
    const [terminalRun, fenceConfig] = await Promise.all([
        CatalogRefreshRun.findOne({ runId, status: { $in: ['succeeded', 'failed'] } }),
        SiteConfig.findOne({ key: 'catalog' }).select('catalog.lastFencingToken').lean(),
    ]);
    if (terminalRun) return serializeRun(terminalRun);
    let lock;
    try {
        lock = await acquireFencedLock(redisKeys.catalogRefreshLock(), redisKeys.catalogRefreshFence(), {
            ttlMs: redisTtl.catalogRefreshLockMs,
            waitMs: 10000,
            minimumFencingToken: fenceConfig?.catalog?.lastFencingToken || 0,
        });
    } catch (error) {
        const normalized = new CatalogRefreshError(
            error?.code === 'LOCK_BUSY' ? 'LOCK_BUSY' : 'REDIS_UNAVAILABLE',
            error?.code === 'LOCK_BUSY' ? 'Catalog refresh is waiting for the active lease.' : 'Redis is unavailable for catalog refresh.',
            { transient: true, cause: error },
        );
        await recordPreLeaseFailure({ runId, source, requestedBy, dryRun, weekKey, error: normalized });
        throw normalized;
    }
    let lost = false;
    let heartbeatBusy = false;
    const heartbeat = setInterval(async () => {
        if (heartbeatBusy || lost) return;
        heartbeatBusy = true;
        try {
            if (!await renewFencedLock(lock)) lost = true;
            if (!dryRun && !lost) {
                await publishRefreshState(lock, runId);
            }
        } catch {
            lost = true;
        } finally {
            heartbeatBusy = false;
        }
    }, Math.min(30000, Math.floor(redisTtl.catalogRefreshLockMs / 4)));
    heartbeat.unref?.();

    let batch = null;
    try {
        const claimed = await claimRun({ runId, source, requestedBy, dryRun, weekKey, fencingToken: lock.fencingToken });
        if (claimed.terminal) return serializeRun(claimed.run);
        console.info('[catalog-refresh]', JSON.stringify({ runId, status: 'started', source, dryRun, weekKey, fencingToken: lock.fencingToken }));
        if (!dryRun) {
            await publishRefreshState(lock, runId);
            await CatalogBatch.updateMany(
                {
                    status: { $in: ['building', 'staging'] },
                    $or: [
                        { fencingToken: { $lt: lock.fencingToken } },
                        { updatedAt: { $lt: new Date(now.getTime() - (redisTtl.catalogRefreshLockMs * 2)) } },
                    ],
                },
                { $set: { status: 'failed', failureReason: 'STALE_REFRESH_RUN' } },
            );
            batch = await allocateVersionedBatch({ weekKey, runId, fencingToken: lock.fencingToken, source });
            if (['active', 'retired'].includes(batch.status)) {
                const run = await updateRun(runId, lock.fencingToken, {
                    status: 'succeeded',
                    currentPhase: 'completed',
                    targetVersion: batch.version,
                    batchId: batch._id,
                    metrics: batch.metrics || {},
                }, { terminal: true });
                console.info('[catalog-refresh]', JSON.stringify({ runId, status: 'succeeded', weekKey, version: batch.version, idempotent: true }));
                return serializeRun(run);
            }
            await updateRun(runId, lock.fencingToken, {
                currentPhase: 'fetching',
                targetVersion: batch.version,
                batchId: batch._id,
            });
        } else {
            const latest = await CatalogBatch.findOne({ weekKey }).sort({ version: -1 }).lean();
            await updateRun(runId, lock.fencingToken, { currentPhase: 'validating', targetVersion: (latest?.version || 0) + 1 });
        }

        const draft = await buildWeeklyCatalogDraft({ weekKey });
        await assertLease(lock, () => lost);
        if (dryRun) {
            const run = await updateRun(runId, lock.fencingToken, {
                status: 'succeeded',
                currentPhase: 'completed',
                metrics: draft.metrics,
            }, { terminal: true });
            console.info('[catalog-refresh]', JSON.stringify({ runId, status: 'succeeded', weekKey, dryRun: true, metrics: draft.metrics }));
            return serializeRun(run);
        }

        batch.buckets = draft.buckets;
        batch.movieIds = draft.movieIds;
        batch.sourceMeta = { ...draft.sourceMeta, source };
        batch.metrics = draft.metrics;
        batch.validatedAt = new Date();
        batch.status = 'staging';
        await batch.save();
        await updateRun(runId, lock.fencingToken, { currentPhase: 'activating', metrics: draft.metrics });
        await activateCatalogBatch(batch._id, draft.movies, { lock, lostLease: () => lost, now });

        await deleteByPattern(redisKeys.catalogSlotPattern());
        await deleteKeys(redisKeys.homeHero());
        await deleteByPattern(redisKeys.homeHeroPattern());
        await deleteByPattern(redisKeys.tmdbTrailersPattern());
        await clearOwnedRefreshState(lock);
        const payload = await getPublicHomePayload(10, 'US', now);
        const run = await updateRun(runId, lock.fencingToken, {
            status: 'succeeded',
            currentPhase: 'completed',
            metrics: draft.metrics,
            batchId: batch._id,
            targetVersion: batch.version,
        }, { terminal: true });
        console.info('[catalog-refresh]', JSON.stringify({ runId, status: 'succeeded', weekKey, version: batch.version, slot: payload.meta?.slot }));
        return serializeRun(run);
    } catch (error) {
        const normalized = error instanceof CatalogRefreshError
            ? error
            : new CatalogRefreshError('CATALOG_REFRESH_FAILED', 'Catalog refresh failed.', { cause: error });
        if (batch?._id) {
            await CatalogBatch.updateOne(
                { _id: batch._id, status: { $in: ['building', 'staging'] } },
                { $set: { status: 'failed', failureReason: normalized.code } },
            ).catch(() => undefined);
        }
        const auditRun = await CatalogRefreshRun.findOne({ runId }).lean().catch(() => null);
        const willRetry = normalized.transient && source !== 'cli' && (auditRun?.attemptCount || 1) < 3;
        await updateRun(runId, lock.fencingToken, willRetry ? {
            currentPhase: 'retrying',
            errorCode: normalized.code,
            errorMessage: normalized.message,
        } : {
            status: 'failed',
            currentPhase: 'failed',
            errorCode: normalized.code,
            errorMessage: normalized.message,
        }, { terminal: !willRetry }).catch(() => undefined);
        console.error('[catalog-refresh]', JSON.stringify({ runId, status: willRetry ? 'retrying' : 'failed', code: normalized.code }));
        throw normalized;
    } finally {
        clearInterval(heartbeat);
        if (!dryRun) await clearOwnedRefreshState(lock).catch(() => undefined);
        await releaseFencedLock(lock);
    }
}
