import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHeroVideoSource, resolveYouTubeHeroVideoSource } from '../src/components/hero/heroVideoSource.js';

test('resolveHeroVideoSource resolves real YouTube trailer object to youtube source contract', () => {
  const tmdbTrailer = {
    id: 'abc12345',
    key: 'WpW36ldAqnM',
    name: 'Official Trailer',
    site: 'YouTube',
    type: 'Trailer',
    videoId: 'WpW36ldAqnM',
  };

  const resolved = resolveHeroVideoSource(tmdbTrailer);
  assert.deepEqual(resolved, {
    kind: 'youtube',
    videoId: 'WpW36ldAqnM',
  });
});

test('resolveYouTubeHeroVideoSource extracts videoId from trailer videoUrl when key or videoId is URL', () => {
  const trailer = {
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };

  const resolved = resolveYouTubeHeroVideoSource(trailer);
  assert.deepEqual(resolved, {
    kind: 'youtube',
    videoId: 'dQw4w9WgXcQ',
  });
});
