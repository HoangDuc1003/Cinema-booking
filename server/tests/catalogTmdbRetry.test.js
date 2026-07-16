import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { catalogRefreshTestHooks } from '../services/catalogRefreshService.js';

test('TMDB retry respects 429 as transient and does not retry permanent 400', async () => {
    const originalGet = axios.get;
    const originalKey = process.env.TMDB_API_KEY;
    const waits = [];
    process.env.TMDB_API_KEY = 'test-key';
    try {
        let calls = 0;
        axios.get = async () => {
            calls += 1;
            if (calls === 1) {
                const error = new Error('rate limited');
                error.response = { status: 429, headers: { 'retry-after': '2' } };
                throw error;
            }
            return { status: 200, data: { results: [] } };
        };
        const context = catalogRefreshTestHooks.createTmdbContext({ wait: async (ms) => waits.push(ms), random: () => 0 });
        await catalogRefreshTestHooks.requestTmdb('/movie/popular', { page: 1 }, context);
        assert.equal(calls, 2);
        assert.deepEqual(waits, [2000]);

        calls = 0;
        axios.get = async () => {
            calls += 1;
            const error = new Error('bad request');
            error.response = { status: 400, headers: {} };
            throw error;
        };
        await assert.rejects(
            catalogRefreshTestHooks.requestTmdb('/movie/popular', { page: 1 }, catalogRefreshTestHooks.createTmdbContext({ wait: async () => {} })),
            (error) => error.code === 'TMDB_REQUEST_FAILED',
        );
        assert.equal(calls, 1);
    } finally {
        axios.get = originalGet;
        if (originalKey === undefined) delete process.env.TMDB_API_KEY;
        else process.env.TMDB_API_KEY = originalKey;
    }
});

test('TMDB request budget aborts before issuing another upstream call', async () => {
    const originalGet = axios.get;
    const originalKey = process.env.TMDB_API_KEY;
    process.env.TMDB_API_KEY = 'test-key';
    let calls = 0;
    axios.get = async () => {
        calls += 1;
        return { status: 200, data: {} };
    };
    try {
        const context = catalogRefreshTestHooks.createTmdbContext({ wait: async () => {} });
        context.metrics.requestAttempts = 600;
        await assert.rejects(
            catalogRefreshTestHooks.requestTmdb('/movie/popular', { page: 1 }, context),
            (error) => error.code === 'TMDB_REQUEST_BUDGET_EXHAUSTED',
        );
        assert.equal(calls, 0);
    } finally {
        axios.get = originalGet;
        if (originalKey === undefined) delete process.env.TMDB_API_KEY;
        else process.env.TMDB_API_KEY = originalKey;
    }
});
