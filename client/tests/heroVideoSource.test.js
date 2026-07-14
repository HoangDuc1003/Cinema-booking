import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  resolveHeroVideoSource,
  resolveNativeHeroVideoSource,
  resolveYouTubeHeroVideoSource,
} from '../src/components/hero/heroVideoSource.js';

const VIDEO_ID = 'WpW36ldAqnM';

test('YouTube extractor accepts IDs and supported URL shapes from allowlisted hosts', () => {
  const accepted = [
    VIDEO_ID,
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://m.youtube.com/embed/${VIDEO_ID}?autoplay=1`,
    `https://youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}?t=3`,
  ];

  for (const value of accepted) assert.equal(extractYouTubeVideoId(value), VIDEO_ID);
});

test('YouTube extractor rejects arbitrary strings, malformed IDs, and lookalike hosts', () => {
  const rejected = [
    'abc',
    'not-a-video-id',
    `https://example.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com.example.test/watch?v=${VIDEO_ID}`,
    `https://youtube.com@evil.test/watch?v=${VIDEO_ID}`,
    `javascript:${VIDEO_ID}`,
    'https://www.youtube.com/watch?v=too-short',
    'https://www.youtube.com/channel/WpW36ldAqnM',
  ];

  for (const value of rejected) assert.equal(extractYouTubeVideoId(value), null);
});

test('native resolver returns the canonical source contract for supported media', () => {
  assert.deepEqual(resolveNativeHeroVideoSource({ videoUrl: '/video/trailer.mp4' }), {
    kind: 'native',
    src: '/video/trailer.mp4',
    mimeType: 'video/mp4',
  });
  assert.deepEqual(resolveNativeHeroVideoSource({
    src: 'https://cdn.test/trailer',
    mimeType: 'video/x-custom',
  }), {
    kind: 'native',
    src: 'https://cdn.test/trailer',
    mimeType: 'video/x-custom',
  });
});

test('YouTube and combined resolvers return canonical sources without accepting iframe URLs as native', () => {
  const trailer = { videoUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}` };
  assert.equal(resolveNativeHeroVideoSource(trailer), null);
  assert.deepEqual(resolveYouTubeHeroVideoSource(trailer), {
    kind: 'youtube',
    videoId: VIDEO_ID,
  });
  assert.deepEqual(resolveHeroVideoSource({ videoId: VIDEO_ID }), {
    kind: 'youtube',
    videoId: VIDEO_ID,
  });
});

