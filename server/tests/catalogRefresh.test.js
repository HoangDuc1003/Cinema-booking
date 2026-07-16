import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import mongoose from 'mongoose';
import CatalogBatch from '../models/CatalogBatch.js';
import Movie from '../models/Movie.js';
import SiteConfig from '../models/SiteConfig.js';
import {
    getDeterministicPermutation,
    allocateCatalogSectionIds,
    getISOWeekKey,
    calculateCurrentSlot,
    buildWeeklyCatalogBatch,
    activateCatalogBatch,
    rotateActiveCatalogSlot,
    getPublicHomePayload
} from '../services/catalogRefreshService.js';
import { redisKeys } from '../services/redisKeys.js';

test('getISOWeekKey returns correct week keys', () => {
    // 2026-07-15T23:08:30+07:00 is a Wednesday in W29
    const date1 = new Date('2026-07-15T23:08:30+07:00');
    assert.equal(getISOWeekKey(date1), '2026-W29');

    // Monday before 3 AM is still in the same ISO week
    const date2 = new Date('2026-07-13T02:00:00+07:00');
    assert.equal(getISOWeekKey(date2), '2026-W29');
});

test('calculateCurrentSlot returns correct slot index', () => {
    assert.equal(calculateCurrentSlot(new Date('2026-07-13T07:59:59+07:00')), 13);
    assert.equal(calculateCurrentSlot(new Date('2026-07-13T08:00:00+07:00')), 0);
    assert.equal(calculateCurrentSlot(new Date('2026-07-13T20:00:00+07:00')), 1);
    assert.equal(calculateCurrentSlot(new Date('2026-07-14T07:59:59+07:00')), 1);
    assert.equal(calculateCurrentSlot(new Date('2026-07-19T20:00:00+07:00')), 13);
    for (let day = 13; day <= 19; day += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
            for (const minute of [0, 59]) {
                const slot = calculateCurrentSlot(new Date(`2026-07-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`));
                assert.ok(slot >= 0 && slot <= 13, `invalid slot ${slot} at day ${day}, ${hour}:${minute}`);
            }
        }
    }
});

test('section allocation preserves bucket semantics and 85 globally unique IDs', () => {
    const batch = {
        weekKey: '2026-W29',
        buckets: {
            newest: Array.from({ length: 50 }, (_, index) => `newest-${index}`),
            popular: Array.from({ length: 50 }, (_, index) => `popular-${index}`),
            classics: Array.from({ length: 50 }, (_, index) => `classic-${index}`),
        },
    };
    const seenAcrossWeek = new Set();
    for (let slot = 0; slot < 14; slot += 1) {
        const sections = allocateCatalogSectionIds(batch, slot);
        assert.equal(sections.hero.length, 5);
        assert.equal(sections.nowShowing.length, 20);
        assert.equal(sections.popular.length, 20);
        assert.equal(sections.classics.length, 20);
        assert.equal(sections.recommended.length, 20);
        assert.ok([...sections.hero, ...sections.nowShowing].every((id) => id.startsWith('newest-')));
        assert.ok(sections.popular.every((id) => id.startsWith('popular-')));
        assert.ok(sections.classics.every((id) => id.startsWith('classic-')));
        const all = Object.values(sections).flat();
        assert.equal(new Set(all).size, 85);
        all.forEach((id) => seenAcrossWeek.add(id));
    }
    assert.equal(seenAcrossWeek.size, 150);
});

test('getDeterministicPermutation is deterministic and based on seed', () => {
    const movieIds = Array.from({ length: 150 }, (_, i) => `movie-${i}`);
    const seed1 = '2026-W29-slot-5';
    const seed2 = '2026-W29-slot-6';

    const perm1 = getDeterministicPermutation(movieIds, seed1);
    const perm2 = getDeterministicPermutation(movieIds, seed1);
    const perm3 = getDeterministicPermutation(movieIds, seed2);

    assert.deepEqual(perm1, perm2);
    assert.notDeepEqual(perm1, perm3);
    assert.equal(perm1.length, 150);
    assert.equal(new Set(perm1).size, 150);
});

test('buildWeeklyCatalogBatch collects, validates, and buckets movies', async () => {
    const originalGet = axios.get;
    const originalSave = CatalogBatch.prototype.save;
    const originalDeleteOne = CatalogBatch.findOneAndDelete;
    let activeDetails = 0;
    let maxActiveDetails = 0;
    
    // Mock axios.get
    axios.get = async (url, config) => {
        const params = config?.params || {};
        if (url.includes('/movie/now_playing') || url.includes('/movie/upcoming')) {
            const page = params.page || 1;
            const results = Array.from({ length: 20 }, (_, i) => ({
                id: 1000 + page * 20 + i
            }));
            return { data: { results } };
        }
        if (url.includes('/discover/movie')) {
            const page = params.page || 1;
            const results = Array.from({ length: 20 }, (_, i) => ({
                id: 2000 + page * 20 + i
            }));
            return { data: { results } };
        }
        if (url.includes('/movie/popular')) {
            const page = params.page || 1;
            const results = Array.from({ length: 20 }, (_, i) => ({
                id: 3000 + page * 20 + i
            }));
            return { data: { results } };
        }
        if (url.includes('/movie/')) {
            // Return movie details
            const urlParts = url.split('/');
            const movieId = Number(urlParts[urlParts.length - 1]);
            activeDetails += 1;
            maxActiveDetails = Math.max(maxActiveDetails, activeDetails);
            await new Promise((resolve) => setTimeout(resolve, 1));
            activeDetails -= 1;
            return {
                data: {
                    id: movieId,
                    title: `Test Movie ${movieId}`,
                    overview: `Overview of ${movieId}`,
                    release_date: movieId >= 2000 && movieId < 3000 ? '2010-01-01' : '2020-01-01',
                    poster_path: `/poster-${movieId}.jpg`,
                    backdrop_path: `/backdrop-${movieId}.jpg`,
                    adult: false,
                    runtime: 120,
                    genres: [{ id: 1, name: 'Action' }],
                    vote_average: 8.5,
                    original_language: 'en',
                    credits: {
                        cast: [{ id: 1, name: 'Actor 1' }]
                    }
                }
            };
        }
        return { data: {} };
    };

    // Mock CatalogBatch methods to prevent writing to DB
    CatalogBatch.findOneAndDelete = async () => {};
    CatalogBatch.prototype.save = async function() {
        return this;
    };

    try {
        process.env.TMDB_API_KEY = 'mock-key';
        const { batch, movies } = await buildWeeklyCatalogBatch('2026-W29');
        
        assert.ok(batch);
        assert.equal(batch.status, 'staging');
        assert.equal(batch.buckets.newest.length, 50);
        assert.equal(batch.buckets.classics.length, 50);
        assert.equal(batch.buckets.popular.length, 50);
        assert.equal(batch.movieIds.length, 150);
        assert.equal(new Set(batch.movieIds).size, 150);
        
        assert.equal(movies.length, 150);
        assert.equal(movies[0].title, `Test Movie ${movies[0]._id}`);
        assert.ok(maxActiveDetails <= 5, `detail concurrency exceeded five: ${maxActiveDetails}`);
    } finally {
        axios.get = originalGet;
        CatalogBatch.prototype.save = originalSave;
        CatalogBatch.findOneAndDelete = originalDeleteOne;
    }
});

test('getPublicHomePayload partitions correctly and handles refreshing status', async () => {
    const originalFindOne = SiteConfig.findOne;
    const originalFindById = CatalogBatch.findById;
    const originalFind = Movie.find;
    
    // Set up Redis Mock state
    globalThis.__nitroCineRedisState = globalThis.__nitroCineRedisState || {};
    const originalClient = globalThis.__nitroCineRedisState.client;
    
    const cacheStore = {};
    globalThis.__nitroCineRedisState.client = {
        isReady: true,
        isOpen: true,
        get: async (key) => cacheStore[key] || null,
        set: async (key, val) => {
            cacheStore[key] = val;
            return 'OK';
        },
        del: async (keys) => {
            const arr = Array.isArray(keys) ? keys : [keys];
            arr.forEach(k => delete cacheStore[k]);
            return arr.length;
        }
    };
    
    const mockBatch = {
        _id: 'batch-123',
        weekKey: '2026-W29',
        version: 2,
        status: 'active',
        buckets: {
            newest: Array.from({ length: 50 }, (_, i) => `movie-${i}`),
            classics: Array.from({ length: 50 }, (_, i) => `movie-${i + 50}`),
            popular: Array.from({ length: 50 }, (_, i) => `movie-${i + 100}`),
        },
        movieIds: Array.from({ length: 150 }, (_, i) => `movie-${i}`),
    };
    
    SiteConfig.findOne = () => ({
        lean: () => ({
            catalog: {
                activeBatchId: 'batch-123',
                refreshing: true
            }
        })
    });
    
    CatalogBatch.findById = () => ({
        lean: () => mockBatch
    });
    
    Movie.find = () => ({
        lean: () => Array.from({ length: 150 }, (_, i) => ({
            _id: `movie-${i}`,
            title: `Movie ${i}`,
            poster_path: `/poster-${i}.jpg`,
            backdrop_path: `/backdrop-${i}.jpg`,
            release_date: '2020-01-01',
            vote_average: 8.0,
            runtime: 120,
            heroVideoStatus: 'ready'
        }))
    });
    
    try {
        cacheStore[redisKeys.catalogRefreshState()] = JSON.stringify({ active: true });
        const payload = await getPublicHomePayload(10, 'US', new Date());
        
        // Assert sizes
        assert.equal(payload.hero.length, 5);
        assert.equal(payload.nowShowing.length, 20);
        assert.equal(payload.popular.length, 20);
        assert.equal(payload.classics.length, 20);
        assert.equal(payload.recommended.length, 20);
        
        // Assert zero overlap
        const allIds = [...payload.hero, ...payload.nowShowing, ...payload.popular, ...payload.classics, ...payload.recommended].map(m => m._id);
        assert.equal(new Set(allIds).size, 85);
        
        // Assert hero video status is refreshing because catalog.refreshing is true
        assert.equal(payload.hero[0].heroVideoStatus, 'refreshing');
    } finally {
        SiteConfig.findOne = originalFindOne;
        CatalogBatch.findById = originalFindById;
        Movie.find = originalFind;
        globalThis.__nitroCineRedisState.client = originalClient;
    }
});
