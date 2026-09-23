import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_HERO_VIDEOS, attachHeroVideos, toHeroVideo } from '../services/heroVideoService.js';

const movies = [{ id: '101' }, { _id: '102' }, { id: '103' }];

test('only https video files on an allowed host become a Hero trailer', () => {
    const hosts = ['cdn.example.com'];
    assert.deepEqual(toHeroVideo('https://cdn.example.com/t/101.mp4', hosts), { src: 'https://cdn.example.com/t/101.mp4', type: 'video/mp4', zoom: 1 });
    assert.deepEqual(toHeroVideo('https://cdn.example.com/t/101.webm?v=2', hosts), { src: 'https://cdn.example.com/t/101.webm?v=2', type: 'video/webm', zoom: 1 });
    assert.equal(toHeroVideo('http://cdn.example.com/t/101.mp4', hosts), null);
    assert.equal(toHeroVideo('https://evil.example.com/t/101.mp4', hosts), null);
    assert.equal(toHeroVideo('https://cdn.example.com/t/101.html', hosts), null);
    assert.equal(toHeroVideo('https://www.youtube.com/watch?v=abc', ['www.youtube.com']), null);
    assert.equal(toHeroVideo('not a url', hosts), null);
    // Zoom crops baked-in letterboxing and is clamped to a sane range.
    assert.equal(toHeroVideo({ src: 'https://cdn.example.com/a.mp4', zoom: 1.33 }, hosts).zoom, 1.33);
    assert.equal(toHeroVideo({ src: 'https://cdn.example.com/a.mp4', zoom: 9 }, hosts).zoom, 1.5);
    assert.equal(toHeroVideo({ src: 'https://cdn.example.com/a.mp4', zoom: 'oops' }, hosts).zoom, 1);
});

test('configured trailers attach by movie ID; everything else gets null', () => {
    const result = attachHeroVideos(movies, {
        HERO_TRAILER_VIDEOS: JSON.stringify({ 102: 'https://cdn.example.com/102.mp4', 103: 'https://elsewhere.test/103.mp4' }),
        HERO_VIDEO_ALLOWED_HOSTS: 'cdn.example.com',
    });
    assert.equal(result[0].trailerVideo, null);
    assert.equal(result[1].trailerVideo.src, 'https://cdn.example.com/102.mp4');
    assert.equal(result[2].trailerVideo, null, 'a host outside the allowlist is dropped');
    assert.equal(movies[1].trailerVideo, undefined, 'the input is not mutated');
});

test('demo clips fill gaps locally but never in production, and bad JSON does not throw', () => {
    const quietly = (run) => {
        const warn = console.warn;
        console.warn = () => {};
        try { return run(); } finally { console.warn = warn; }
    };
    const local = quietly(() => attachHeroVideos(movies, { HERO_DEMO_VIDEOS: 'true', HERO_TRAILER_VIDEOS: '{oops' }));
    assert.deepEqual(
        local.map((movie) => movie.trailerVideo.src),
        DEMO_HERO_VIDEOS.slice(0, 3).map((entry) => (typeof entry === 'string' ? entry : entry.src)),
    );

    for (const env of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
        const production = attachHeroVideos(movies, { ...env, HERO_DEMO_VIDEOS: 'true' });
        assert.ok(production.every((movie) => movie.trailerVideo === null));
    }
});

test('an invalid trailer setting is reported once, not on every Hero request', () => {
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => { warnings += 1; };
    try {
        const env = { HERO_TRAILER_VIDEOS: '{still broken' };
        attachHeroVideos(movies, env);
        const again = attachHeroVideos(movies, env);
        assert.equal(warnings, 1);
        assert.ok(again.every((movie) => movie.trailerVideo === null));
    } finally {
        console.warn = warn;
    }
});
