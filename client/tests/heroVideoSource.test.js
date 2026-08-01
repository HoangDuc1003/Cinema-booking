import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseHeroBackgroundVideo,
  inferNativeVideoMimeType,
  isSafeNativeHeroVideoUrl,
  resolveConfiguredHeroVideoSource,
} from '../src/components/hero/heroVideoSource.js';

const readyMovie = (overrides = {}) => ({
  id: 'movie-42',
  heroVideoStatus: 'ready',
  heroVideoUrl: 'https://media.example.test/trailers/movie-42.mp4',
  heroVideoMimeType: 'video/mp4',
  heroVideoVersion: 7,
  heroVideoPoster: 'https://images.example.test/movie-42.webp',
  ...overrides,
});

test('Hero accepts only configured ready MP4/WebM native sources', () => {
  assert.deepEqual(resolveConfiguredHeroVideoSource(readyMovie()), {
    kind: 'native',
    src: 'https://media.example.test/trailers/movie-42.mp4',
    mimeType: 'video/mp4',
    version: '7',
    poster: 'https://images.example.test/movie-42.webp',
  });
  assert.deepEqual(resolveConfiguredHeroVideoSource(readyMovie({
    heroVideoUrl: 'https://media.example.test/trailers/movie-42.webm?rev=8',
    heroVideoMimeType: 'video/webm; codecs="vp9"',
    heroVideoVersion: '8',
  })), {
    kind: 'native',
    src: 'https://media.example.test/trailers/movie-42.webm?rev=8',
    mimeType: 'video/webm',
    version: '8',
    poster: 'https://images.example.test/movie-42.webp',
  });
});

test('Hero rejects non-ready, unsupported, embedded, unsafe, and credentialed sources', () => {
  const rejected = [
    readyMovie({ heroVideoStatus: 'pending' }),
    readyMovie({ heroVideoStatus: 'failed' }),
    readyMovie({ heroVideoUrl: 'https://media.example.test/trailer.m3u8', heroVideoMimeType: '' }),
    readyMovie({ heroVideoUrl: 'https://www.youtube.com/watch?v=WpW36ldAqnM' }),
    readyMovie({ heroVideoUrl: 'https://www.youtube-nocookie.com/embed/WpW36ldAqnM' }),
    readyMovie({ heroVideoUrl: 'https://media.example.test/embed/trailer.mp4' }),
    readyMovie({ heroVideoUrl: 'javascript:alert(1)' }),
    readyMovie({ heroVideoUrl: 'blob:https://media.example.test/123' }),
    readyMovie({ heroVideoUrl: 'https://user:password@media.example.test/trailer.mp4' }),
    readyMovie({ heroVideoUrl: '' }),
  ];

  for (const movie of rejected) {
    assert.equal(resolveConfiguredHeroVideoSource(movie), null);
  }
});

test('production requires HTTPS and enforces the configured CDN allowlist', () => {
  assert.equal(resolveConfiguredHeroVideoSource(readyMovie({
    heroVideoUrl: 'http://media.example.test/trailers/movie-42.mp4',
  }), {
    isProduction: true,
    allowedHosts: 'media.example.test',
  }), null);
  assert.equal(resolveConfiguredHeroVideoSource(readyMovie(), {
    isProduction: true,
    allowedHosts: 'res.cloudinary.com',
  }), null);
  assert.equal(resolveConfiguredHeroVideoSource(readyMovie(), {
    isProduction: true,
  }), null);
  assert.ok(resolveConfiguredHeroVideoSource(readyMovie({
    heroVideoUrl: 'https://res.cloudinary.com/demo/video/upload/movie-42.mp4',
  }), {
    isProduction: true,
  }));
  assert.ok(resolveConfiguredHeroVideoSource(readyMovie(), {
    isProduction: true,
    allowedHosts: 'media.example.test,res.cloudinary.com',
  }));
  assert.ok(resolveConfiguredHeroVideoSource(readyMovie({
    heroVideoUrl: 'https://edge.media.example.test/trailers/movie-42.mp4',
  }), {
    isProduction: true,
    allowedHosts: ['media.example.test'],
  }));
});

test('relative mock media is available only behind the explicit development flag', () => {
  const mockMovie = readyMovie({
    heroVideoUrl: '/mock/hero-trailer.mp4',
    heroVideoVersion: 'development-mock',
  });

  assert.equal(resolveConfiguredHeroVideoSource(mockMovie), null);
  assert.equal(resolveConfiguredHeroVideoSource(mockMovie, {
    mockEnabled: true,
    isProduction: true,
  }), null);
  assert.deepEqual(resolveConfiguredHeroVideoSource(mockMovie, {
    mockEnabled: true,
    isProduction: false,
  }), {
    kind: 'native',
    src: '/mock/hero-trailer.mp4',
    mimeType: 'video/mp4',
    version: 'development-mock',
    poster: 'https://images.example.test/movie-42.webp',
  });
});

test('URL and MIME helpers never classify YouTube or non-MP4/WebM media as native Hero video', () => {
  assert.equal(inferNativeVideoMimeType('/trailer.MP4?version=2'), 'video/mp4');
  assert.equal(inferNativeVideoMimeType('/trailer.webm#start'), 'video/webm');
  assert.equal(inferNativeVideoMimeType('/trailer.ogg'), '');
  assert.equal(isSafeNativeHeroVideoUrl('https://cdn.test/trailer.mp4'), true);
  assert.equal(isSafeNativeHeroVideoUrl('https://youtu.be/WpW36ldAqnM'), false);
  assert.equal(isSafeNativeHeroVideoUrl('data:video/mp4;base64,AAAA'), false);
  assert.equal(canUseHeroBackgroundVideo(readyMovie()), true);
});
