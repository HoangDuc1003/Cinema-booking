import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_NATIVE_MOCK_FIXTURE,
  HERO_NATIVE_MOCK_FIXTURES,
  canUseHeroBackgroundVideo,
  isHeroTrailerMockEnabled,
  resolveConfiguredHeroVideoSource,
  resolveHeroMockTrailers,
  resolveNativeHeroVideoSource,
} from '../src/components/hero/heroMock.js';

const fixtures = [
  {
    image: '/mock/alpha.jpg',
    videoUrl: '/mock/alpha.mp4',
  },
  {
    image: '/mock/beta.jpg',
    videoUrl: '/mock/beta.webm',
  },
  {
    image: '/mock/gamma.jpg',
    videoUrl: '/mock/gamma.ogg',
  },
];

test('hero trailer mock is enabled only by the development URL flag', () => {
  assert.equal(isHeroTrailerMockEnabled('?heroMock=1', true), true);
  assert.equal(isHeroTrailerMockEnabled('?view=home&heroMock=1', true), true);
  assert.equal(isHeroTrailerMockEnabled('?heroMock=0', true), false);
  assert.equal(isHeroTrailerMockEnabled('', true), false);
  assert.equal(isHeroTrailerMockEnabled('?heroMock=1', false), false);
});

test('the development mock fixture points to the fixed native MP4 source', () => {
  assert.equal(HERO_NATIVE_MOCK_FIXTURE.videoUrl, '/mock/hero-trailer.mp4');
  assert.equal(HERO_NATIVE_MOCK_FIXTURE.mimeType, 'video/mp4');
  assert.deepEqual(HERO_NATIVE_MOCK_FIXTURES, [HERO_NATIVE_MOCK_FIXTURE]);
  assert.equal(Object.isFrozen(HERO_NATIVE_MOCK_FIXTURE), true);
  assert.equal(Object.isFrozen(HERO_NATIVE_MOCK_FIXTURES), true);
});

test('movie keys map to injected fixtures deterministically', () => {
  const movie = { id: 42, title: 'Stable Movie' };
  const first = resolveHeroMockTrailers({ movieKey: 'movie-42', movie, fixtures });
  const second = resolveHeroMockTrailers({ movieKey: 'movie-42', movie, fixtures });

  assert.deepEqual(second, first);
  assert.ok(fixtures.some((fixture) => fixture.videoUrl === first[0].videoUrl));
});

test('fixture data is normalized to the Hero trailer loader shape', () => {
  const movie = {
    id: 7,
    title: 'Normalization Story',
    release_date: '2026-07-13',
    vote_average: 8.4,
  };
  const fixture = {
    image: '/mock/mock-key.jpg',
    videoUrl: '/mock/mock-key.mp4',
    mimeType: 'video/mp4',
  };

  const [trailer] = resolveHeroMockTrailers({
    movieKey: 'movie-7',
    movie,
    fixtures: [fixture],
  });

  assert.deepEqual(trailer, {
    id: 'hero-mock-movie-7-0',
    title: 'Normalization Story',
    release_date: '2026-07-13',
    vote_average: 8.4,
    videoUrl: fixture.videoUrl,
    mimeType: 'video/mp4',
    thumbnail: fixture.image,
    videoName: 'Mock Trailer',
    qualityLabel: '1080p',
    isRequestedTrailer: true,
  });
});

test('empty or missing fixture collections resolve to an empty trailer list', () => {
  assert.deepEqual(resolveHeroMockTrailers({ movieKey: 'movie-a', fixtures: [] }), []);
  assert.deepEqual(resolveHeroMockTrailers({ movieKey: 'movie-a' }), []);
});

test('native source resolver accepts direct supported video extensions', () => {
  assert.deepEqual(resolveNativeHeroVideoSource({ videoUrl: '/video/trailer.mp4' }), {
    kind: 'native',
    src: '/video/trailer.mp4',
    mimeType: 'video/mp4',
  });
  assert.deepEqual(resolveNativeHeroVideoSource({ videoUrl: '/video/trailer.WEBM?rev=2' }), {
    kind: 'native',
    src: '/video/trailer.WEBM?rev=2',
    mimeType: 'video/webm',
  });
  assert.deepEqual(resolveNativeHeroVideoSource({ src: 'https://cdn.test/trailer.ogg#start' }), {
    kind: 'native',
    src: 'https://cdn.test/trailer.ogg#start',
    mimeType: 'video/ogg',
  });
});

test('native source resolver accepts an explicit video MIME for extensionless sources', () => {
  assert.deepEqual(resolveNativeHeroVideoSource({
    videoUrl: 'https://media.test/trailer',
    mimeType: 'video/x-custom',
  }), {
    kind: 'native',
    src: 'https://media.test/trailer',
    mimeType: 'video/x-custom',
  });
});

test('native source resolver rejects YouTube and iframe sources', () => {
  assert.equal(resolveNativeHeroVideoSource({
    videoUrl: 'https://www.youtube.com/watch?v=WpW36ldAqnM',
    mimeType: 'video/mp4',
  }), null);
  assert.equal(resolveNativeHeroVideoSource({
    videoUrl: 'https://www.youtube-nocookie.com/embed/WpW36ldAqnM',
    mimeType: 'video/mp4',
  }), null);
  assert.equal(resolveNativeHeroVideoSource({
    videoUrl: 'https://media.test/embed/trailer.mp4',
  }), null);
  assert.equal(resolveNativeHeroVideoSource({
    embedUrl: 'https://player.test/trailer',
  }), null);
});

test('native source resolver rejects unsupported or missing source metadata', () => {
  assert.equal(resolveNativeHeroVideoSource({ videoUrl: 'https://media.test/trailer' }), null);
  assert.equal(resolveNativeHeroVideoSource({ videoUrl: '/video/trailer.m3u8' }), null);
  assert.equal(resolveNativeHeroVideoSource(null), null);
});

test('configured Hero source accepts first-party native fields and rejects iframe-only movies', () => {
  assert.deepEqual(resolveConfiguredHeroVideoSource({
    heroVideoUrl: 'https://cdn.test/hero.webm',
  }), {
    kind: 'native',
    src: 'https://cdn.test/hero.webm',
    mimeType: 'video/webm',
  });
  assert.deepEqual(resolveConfiguredHeroVideoSource({
    background_video_url: 'https://cdn.test/hero-stream',
    background_video_mime_type: 'video/mp4',
  }), {
    kind: 'native',
    src: 'https://cdn.test/hero-stream',
    mimeType: 'video/mp4',
  });
  assert.equal(resolveConfiguredHeroVideoSource({
    heroVideoUrl: 'https://www.youtube.com/watch?v=WpW36ldAqnM',
  }), null);
  assert.equal(resolveConfiguredHeroVideoSource({}), null);
});

test('production Hero stays on poster when a movie has only an iframe trailer', () => {
  const youtubeOnlyMovie = {
    id: 42,
    videoUrl: 'https://www.youtube.com/embed/WpW36ldAqnM',
  };

  assert.equal(canUseHeroBackgroundVideo(youtubeOnlyMovie), false);
  assert.equal(canUseHeroBackgroundVideo(youtubeOnlyMovie, { mockEnabled: true }), true);
  assert.equal(canUseHeroBackgroundVideo({ heroVideoUrl: '/hero/movie.mp4' }), true);
});

test('resolveConfiguredHeroVideoSource rejects /mock/hero-trailer.mp4 when mockEnabled is false and accepts when true', () => {
  const dummyMovie = {
    heroVideoStatus: 'ready',
    heroVideoMimeType: 'video/mp4',
    heroVideoUrl: '/mock/hero-trailer.mp4',
  };

  assert.equal(resolveConfiguredHeroVideoSource(dummyMovie, { mockEnabled: false }), null);
  assert.deepEqual(resolveConfiguredHeroVideoSource(dummyMovie, { mockEnabled: true }), {
    kind: 'native',
    src: '/mock/hero-trailer.mp4',
    mimeType: 'video/mp4',
  });
});
