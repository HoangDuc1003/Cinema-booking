import axios from 'axios';
import Movie from '../models/Movie.js';
import CatalogBatch from '../models/CatalogBatch.js';
import SiteConfig from '../models/SiteConfig.js';
import { acquireLock, releaseLock } from './lockService.js';
import { getJson, setJson, deleteByPattern, deleteKeys } from './cacheService.js';
import { redisKeys } from './redisKeys.js';
import { invalidateMovieCatalog } from './cacheInvalidationService.js';

// Seeded random helper
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash >>> 0;
}

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function getDeterministicPermutation(movieIds, seedString) {
    const list = [...movieIds];
    const seed = hashCode(seedString);
    const rand = mulberry32(seed);
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = list[i];
        list[i] = list[j];
        list[j] = temp;
    }
    return list;
}

export function getISOWeekKey(date) {
    const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const target = new Date(local.getTime());
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.getTime();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNum = 1 + Math.round((firstThursday - target.getTime()) / 604800000);
    const year = new Date(firstThursday).getUTCFullYear();
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

export function calculateCurrentSlot(date) {
    const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const day = local.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = local.getUTCHours();
    
    if (day === 1) { // Monday
        if (hour < 3) return 14;
        if (hour < 8) return 0;
        if (hour < 20) return 1;
        return 2;
    }
    if (day === 2) { // Tuesday
        if (hour < 8) return 2;
        if (hour < 20) return 3;
        return 4;
    }
    if (day === 3) { // Wednesday
        if (hour < 8) return 4;
        if (hour < 20) return 5;
        return 6;
    }
    if (day === 4) { // Thursday
        if (hour < 8) return 6;
        if (hour < 20) return 7;
        return 8;
    }
    if (day === 5) { // Friday
        if (hour < 8) return 8;
        if (hour < 20) return 9;
        return 10;
    }
    if (day === 6) { // Saturday
        if (hour < 8) return 10;
        if (hour < 20) return 11;
        return 12;
    }
    if (day === 0) { // Sunday
        if (hour < 8) return 12;
        if (hour < 20) return 13;
        return 14;
    }
    return 0; // fallback
}

// Concurrency pool runner
async function runWithConcurrencyLimit(concurrency, items, asyncFn) {
    const results = [];
    const executing = [];
    for (const item of items) {
        const p = Promise.resolve().then(() => asyncFn(item));
        results.push(p);
        if (concurrency > 0) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= concurrency) {
                await Promise.race(executing);
            }
        }
    }
    return Promise.all(results);
}

// TMDB Fetch details helper with retry and timeout
async function fetchDetailsAndCreditsWithRetry(movieId, retries = 3, delay = 500) {
    const url = `https://api.themoviedb.org/3/movie/${movieId}`;
    const params = {
        language: 'en-US',
        append_to_response: 'credits'
    };
    
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
                params,
                timeout: 3000
            });
            return response.data;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

function validateMovieProperties(details) {
    if (!details) return false;
    if (typeof details.id !== 'number' || !Number.isInteger(details.id) || details.id <= 0) return false;
    if (typeof details.title !== 'string' || details.title.trim() === '') return false;
    if (typeof details.overview !== 'string' || details.overview.trim() === '') return false;
    if (!details.release_date || typeof details.release_date !== 'string' || details.release_date.trim() === '') return false;
    if (!details.poster_path || typeof details.poster_path !== 'string' || details.poster_path.trim() === '') return false;
    if (!details.backdrop_path || typeof details.backdrop_path !== 'string' || details.backdrop_path.trim() === '') return false;
    if (details.adult === true) return false;
    if (typeof details.runtime !== 'number' || !Number.isFinite(details.runtime) || details.runtime <= 0) return false;
    if (!Array.isArray(details.genres)) return false;
    if (typeof details.vote_average !== 'number' || !Number.isFinite(details.vote_average)) return false;
    if (typeof details.original_language !== 'string' || details.original_language.trim() === '') return false;
    return true;
}

// Fetch candidates lists helper
async function fetchCandidates(path, params) {
    try {
        if (!process.env.TMDB_API_KEY) return [];
        const response = await axios.get(`https://api.themoviedb.org/3${path}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            params,
            timeout: 3000
        });
        return response.data?.results || [];
    } catch (err) {
        console.warn(`[TMDB candidates fetch failed] path: ${path}, error: ${err.message}`);
        return [];
    }
}

export async function buildWeeklyCatalogBatch(weekKey) {
    console.log(`[buildWeeklyCatalogBatch] Starting for week: ${weekKey}`);
    
    // Delete any existing staging/failed batch for this week to avoid duplicate keys
    await CatalogBatch.findOneAndDelete({ weekKey, status: { $in: ['staging', 'failed'] } });
    
    const usedMovieIds = new Set();
    const validatedMoviesMap = new Map(); // ID -> movie data
    
    const newestBucket = [];
    const classicsBucket = [];
    const popularBucket = [];
    
    let fetched = 0;
    let rejected = 0;
    let duplicates = 0;
    let detailsFetched = 0;
    
    const newestPagesTrack = [];
    const classicsPagesTrack = [];
    const popularPagesTrack = [];
    
    // 1. Bucket NEWEST: 50 active movies (from theatrical/now playing/upcoming)
    let page = 1;
    while (newestBucket.length < 50 && page <= 10) {
        newestPagesTrack.push(page);
        const [nowPlaying, upcoming] = await Promise.all([
            fetchCandidates('/movie/now_playing', { language: 'en-US', page }),
            fetchCandidates('/movie/upcoming', { language: 'en-US', page })
        ]);
        
        const pageCandidates = [];
        const maxLen = Math.max(nowPlaying.length, upcoming.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < nowPlaying.length) pageCandidates.push(nowPlaying[i]);
            if (i < upcoming.length) pageCandidates.push(upcoming[i]);
        }
        
        if (pageCandidates.length === 0) break;
        fetched += pageCandidates.length;
        
        // Filter unique IDs in this batch
        const candidateIdsToFetch = [];
        for (const m of pageCandidates) {
            const mId = String(m.id);
            if (usedMovieIds.has(mId)) {
                duplicates++;
                continue;
            }
            if (candidateIdsToFetch.includes(mId)) {
                duplicates++;
                continue;
            }
            candidateIdsToFetch.push(mId);
        }
        
        // Fetch details in parallel up to concurrency limit 5
        const validationResults = await runWithConcurrencyLimit(5, candidateIdsToFetch, async (movieId) => {
            try {
                const details = await fetchDetailsAndCreditsWithRetry(movieId);
                detailsFetched++;
                if (validateMovieProperties(details)) {
                    return details;
                } else {
                    rejected++;
                    return null;
                }
            } catch (err) {
                rejected++;
                return null;
            }
        });
        
        for (const movieDetails of validationResults) {
            if (movieDetails && newestBucket.length < 50) {
                const mId = String(movieDetails.id);
                newestBucket.push(mId);
                usedMovieIds.add(mId);
                validatedMoviesMap.set(mId, movieDetails);
            }
        }
        
        page++;
    }
    
    // 2. Bucket CLASSICS: 50 classics (release_date <= 2011-12-31, vote_count >= 500, vote_average >= 7.0, sorted by popularity)
    page = 1;
    while (classicsBucket.length < 50 && page <= 10) {
        classicsPagesTrack.push(page);
        const candidates = await fetchCandidates('/discover/movie', {
            language: 'en-US',
            'release_date.lte': '2011-12-31',
            'vote_count.gte': 500,
            'vote_average.gte': 7.0,
            sort_by: 'popularity.desc',
            page
        });
        
        if (candidates.length === 0) break;
        fetched += candidates.length;
        
        const candidateIdsToFetch = [];
        for (const m of candidates) {
            const mId = String(m.id);
            if (usedMovieIds.has(mId)) {
                duplicates++;
                continue;
            }
            if (candidateIdsToFetch.includes(mId)) {
                duplicates++;
                continue;
            }
            candidateIdsToFetch.push(mId);
        }
        
        const validationResults = await runWithConcurrencyLimit(5, candidateIdsToFetch, async (movieId) => {
            try {
                const details = await fetchDetailsAndCreditsWithRetry(movieId);
                detailsFetched++;
                if (validateMovieProperties(details)) {
                    return details;
                } else {
                    rejected++;
                    return null;
                }
            } catch (err) {
                rejected++;
                return null;
            }
        });
        
        for (const movieDetails of validationResults) {
            if (movieDetails && classicsBucket.length < 50) {
                const mId = String(movieDetails.id);
                classicsBucket.push(mId);
                usedMovieIds.add(mId);
                validatedMoviesMap.set(mId, movieDetails);
            }
        }
        
        page++;
    }
    
    // 3. Bucket POPULAR: 50 popular movies (using seeded randomized pages derived from weekKey)
    const seed = hashCode(weekKey);
    const rand = mulberry32(seed);
    const popularPages = [];
    while (popularPages.length < 15) {
        const p = Math.floor(rand() * 100) + 1; // page 1 to 100
        if (!popularPages.includes(p)) {
            popularPages.push(p);
        }
    }
    
    let pageIdx = 0;
    while (popularBucket.length < 50 && pageIdx < popularPages.length) {
        const p = popularPages[pageIdx];
        popularPagesTrack.push(p);
        const candidates = await fetchCandidates('/movie/popular', { language: 'en-US', page: p });
        
        if (candidates.length > 0) {
            fetched += candidates.length;
            const candidateIdsToFetch = [];
            for (const m of candidates) {
                const mId = String(m.id);
                if (usedMovieIds.has(mId)) {
                    duplicates++;
                    continue;
                }
                if (candidateIdsToFetch.includes(mId)) {
                    duplicates++;
                    continue;
                }
                candidateIdsToFetch.push(mId);
            }
            
            const validationResults = await runWithConcurrencyLimit(5, candidateIdsToFetch, async (movieId) => {
                try {
                    const details = await fetchDetailsAndCreditsWithRetry(movieId);
                    detailsFetched++;
                    if (validateMovieProperties(details)) {
                        return details;
                    } else {
                        rejected++;
                        return null;
                    }
                } catch (err) {
                    rejected++;
                    return null;
                }
            });
            
            for (const movieDetails of validationResults) {
                if (movieDetails && popularBucket.length < 50) {
                    const mId = String(movieDetails.id);
                    popularBucket.push(mId);
                    usedMovieIds.add(mId);
                    validatedMoviesMap.set(mId, movieDetails);
                }
            }
        }
        pageIdx++;
    }
    
    const totalCount = newestBucket.length + classicsBucket.length + popularBucket.length;
    
    if (newestBucket.length !== 50 || classicsBucket.length !== 50 || popularBucket.length !== 50 || totalCount !== 150) {
        const failMsg = `Unable to reach 150 unique validated movies (newest: ${newestBucket.length}, classics: ${classicsBucket.length}, popular: ${popularBucket.length})`;
        console.error(`[buildWeeklyCatalogBatch] Failed: ${failMsg}`);
        
        const failedBatch = new CatalogBatch({
            weekKey,
            status: 'failed',
            buckets: {
                newest: newestBucket,
                classics: classicsBucket,
                popular: popularBucket
            },
            movieIds: [...newestBucket, ...classicsBucket, ...popularBucket],
            generatedAt: new Date(),
            failureReason: failMsg,
            metrics: { fetched, rejected, duplicates, detailsFetched }
        });
        await failedBatch.save();
        
        throw new Error(failMsg);
    }
    
    // Save staging batch
    const stagingBatch = new CatalogBatch({
        weekKey,
        status: 'staging',
        buckets: {
            newest: newestBucket,
            classics: classicsBucket,
            popular: popularBucket
        },
        movieIds: [...newestBucket, ...classicsBucket, ...popularBucket],
        generatedAt: new Date(),
        validatedAt: new Date(),
        sourceMeta: {
            region: 'US',
            language: 'en-US',
            newestPages: newestPagesTrack,
            classicPages: classicsPagesTrack,
            popularPages: popularPagesTrack
        },
        metrics: { fetched, rejected, duplicates, detailsFetched }
    });
    
    await stagingBatch.save();
    console.log(`[buildWeeklyCatalogBatch] Staging batch saved successfully for week: ${weekKey}`);
    
    // Format movies array for MongoDB upserting later
    const movies = [...validatedMoviesMap.values()].map(m => {
        const casts = m.credits?.cast || [];
        return {
            _id: String(m.id),
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            release_date: m.release_date,
            original_language: m.original_language,
            tagline: m.tagline || '',
            genres: m.genres || [],
            casts: casts.slice(0, 20),
            vote_average: m.vote_average,
            runtime: m.runtime
        };
    });
    
    return { batch: stagingBatch, movies };
}

export async function activateCatalogBatch(batchId, movies = []) {
    const lockKey = 'nitrocine:v1:lock:catalog-refresh';
    console.log(`[activateCatalogBatch] Attempting to acquire lock for batchId: ${batchId}`);
    
    const lock = await acquireLock(lockKey, { ttlMs: 30000, waitMs: 10000 });
    if (lock.available && !lock.acquired) {
        console.error(`[activateCatalogBatch] Failed to acquire lock: resource busy.`);
        await CatalogBatch.findByIdAndUpdate(batchId, { status: 'failed', failureReason: 'Could not acquire distributed Redis lock' });
        throw new Error('Could not acquire distributed Redis lock');
    }
    
    try {
        const batch = await CatalogBatch.findById(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }
        
        if (batch.status !== 'staging') {
            throw new Error(`Only staging batches can be activated. Current status: ${batch.status}`);
        }
        
        console.log(`[activateCatalogBatch] Setting catalog.refreshing = true`);
        await SiteConfig.findOneAndUpdate(
            { key: 'catalog' },
            { $set: { 'catalog.refreshing': true } },
            { upsert: true }
        );
        
        // If movies array is empty, we try to reconstruct it from the batch movieIds if they are already in the DB
        let movieDocs = movies;
        if (!movieDocs || movieDocs.length === 0) {
            const existing = await Movie.find({ _id: { $in: batch.movieIds } }).lean();
            movieDocs = existing;
        }
        
        console.log(`[activateCatalogBatch] Upserting ${movieDocs.length} Movie documents to MongoDB`);
        for (const movie of movieDocs) {
            const updateDoc = {
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
                    runtime: movie.runtime
                },
                $setOnInsert: {
                    heroVideoId: '',
                    heroVideoUrl: '',
                    heroVideoMimeType: '',
                    heroVideoPosterUrl: '',
                    heroVideoStatus: '',
                    heroVideoVersion: ''
                }
            };
            await Movie.updateOne({ _id: String(movie._id || movie.id) }, updateDoc, { upsert: true });
        }
        
        const currentSlot = calculateCurrentSlot(new Date());
        
        console.log(`[activateCatalogBatch] Setting SiteConfig activeBatchId and metadata`);
        await SiteConfig.findOneAndUpdate(
            { key: 'catalog' },
            {
                $set: {
                    'catalog.activeBatchId': batch._id,
                    'catalog.activeSlot': currentSlot,
                    'catalog.lastSuccessfulRefreshAt': new Date(),
                    'catalog.lastRotationAt': new Date()
                }
            },
            { upsert: true }
        );
        
        console.log(`[activateCatalogBatch] Retiring previous active batch`);
        const previousActive = await CatalogBatch.findOne({ status: 'active', _id: { $ne: batch._id } });
        if (previousActive) {
            previousActive.status = 'retired';
            previousActive.retiredAt = new Date();
            await previousActive.save();
        }
        
        batch.status = 'active';
        batch.activatedAt = new Date();
        await batch.save();
        
        console.log(`[activateCatalogBatch] Setting catalog.refreshing = false`);
        await SiteConfig.findOneAndUpdate(
            { key: 'catalog' },
            { $set: { 'catalog.refreshing': false } }
        );
        
        console.log(`[activateCatalogBatch] Invalidating Redis caches and warming cache`);
        await invalidateMovieCatalog();
        await deleteByPattern('nitrocine:v1:catalog:slot:*');
        
        // Warm cache for current slot
        await getPublicHomePayload(10, 'US', new Date());
        
        console.log(`[activateCatalogBatch] Activation completed successfully!`);
    } catch (error) {
        console.error(`[activateCatalogBatch] Error during activation:`, error);
        
        // Set staging batch to failed
        await CatalogBatch.findByIdAndUpdate(batchId, { status: 'failed', failureReason: error.message });
        
        // Turn off refreshing flag
        await SiteConfig.findOneAndUpdate(
            { key: 'catalog' },
            { $set: { 'catalog.refreshing': false } }
        );
        
        throw error;
    } finally {
        if (lock.acquired) {
            console.log(`[activateCatalogBatch] Releasing Redis lock`);
            await releaseLock(lock);
        }
    }
}

export async function rotateActiveCatalogSlot() {
    console.log(`[rotateActiveCatalogSlot] Starting slot rotation`);
    const config = await SiteConfig.findOne({ key: 'catalog' }).lean();
    const batchId = config?.catalog?.activeBatchId;
    if (!batchId) {
        console.warn(`[rotateActiveCatalogSlot] No active batch found in SiteConfig, skipping rotation.`);
        return;
    }
    
    const now = new Date();
    const slot = calculateCurrentSlot(now);
    
    console.log(`[rotateActiveCatalogSlot] Updating SiteConfig activeSlot: ${slot}`);
    await SiteConfig.findOneAndUpdate(
        { key: 'catalog' },
        {
            $set: {
                'catalog.activeSlot': slot,
                'catalog.lastRotationAt': now
            }
        }
    );
    
    console.log(`[rotateActiveCatalogSlot] Invalidating slot cache and warming`);
    // Invalidate slot-sensitive cache
    await deleteByPattern('nitrocine:v1:catalog:slot:*');
    
    // Warm cache for the new slot
    await getPublicHomePayload(10, 'US', now);
    console.log(`[rotateActiveCatalogSlot] Rotation completed successfully!`);
}

export async function getPublicHomePayload(limit = 10, region = 'US', now = new Date()) {
    const config = await SiteConfig.findOne({ key: 'catalog' }).lean();
    const refreshing = config?.catalog?.refreshing || false;
    let batchId = config?.catalog?.activeBatchId;
    
    let batch = null;
    if (batchId) {
        batch = await CatalogBatch.findById(batchId).lean();
    }
    
    if (!batch) {
        batch = await CatalogBatch.findOne({ status: 'active' }).lean();
    }
    
    if (!batch) {
        // Try last-good cache
        const lastGood = await getJson('nitrocine:v1:catalog:last-good');
        if (lastGood) {
            if (refreshing) {
                lastGood.hero = lastGood.hero.map(m => ({ ...m, heroVideoStatus: 'refreshing' }));
            }
            return lastGood;
        }
        return { hero: [], nowShowing: [], popular: [], classics: [], recommended: [] };
    }
    
    const slot = calculateCurrentSlot(now);
    const cacheKey = `nitrocine:v1:catalog:slot:${batch._id}:${slot}`;
    
    const cached = await getJson(cacheKey);
    if (cached) {
        if (refreshing) {
            cached.hero = cached.hero.map(m => ({ ...m, heroVideoStatus: 'refreshing' }));
        }
        return cached;
    }
    
    // Fetch and permutation
    const permutedIds = getDeterministicPermutation(batch.movieIds, `${batch.weekKey}-${slot}`);
    const movies = await Movie.find({ _id: { $in: permutedIds } }).lean();
    const movieMap = new Map(movies.map(m => [String(m._id), m]));
    
    const orderedMovies = permutedIds.map(id => {
        const m = movieMap.get(String(id));
        if (!m) return null;
        return {
            _id: String(m._id),
            id: String(m._id),
            title: m.title,
            overview: m.overview,
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            release_date: m.release_date,
            original_language: m.original_language,
            tagline: m.tagline || '',
            genres: m.genres || [],
            casts: m.casts || [],
            vote_average: m.vote_average,
            runtime: m.runtime,
            heroVideoId: m.heroVideoId || '',
            heroVideoUrl: m.heroVideoUrl || '',
            heroVideoMimeType: m.heroVideoMimeType || '',
            heroVideoPosterUrl: m.heroVideoPosterUrl || '',
            heroVideoStatus: m.heroVideoStatus || '',
            heroVideoVersion: m.heroVideoVersion || ''
        };
    }).filter(Boolean);
    
    const hero = orderedMovies.slice(0, 5);
    const nowShowing = orderedMovies.slice(5, 25);
    const popular = orderedMovies.slice(25, 45);
    const classics = orderedMovies.slice(45, 65);
    const recommended = orderedMovies.slice(65, 85);
    
    const payload = { hero, nowShowing, popular, classics, recommended };
    
    await setJson(cacheKey, payload, 86400 * 7);
    await setJson('nitrocine:v1:catalog:last-good', payload, 86400 * 30);
    
    if (refreshing) {
        payload.hero = payload.hero.map(m => ({ ...m, heroVideoStatus: 'refreshing' }));
    }
    
    return payload;
}
