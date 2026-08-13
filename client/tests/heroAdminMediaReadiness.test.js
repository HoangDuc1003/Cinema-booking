import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('admin media readiness falls back to movie and registry status only when validation is absent', async () => {
  const uploader = await read('../src/pages/admin/HeroVideoUploader.jsx');

  assert.match(uploader, /const nativeValidationProvided = typeof movie\.nativeVideoValid === 'boolean'/);
  assert.match(uploader, /const ready = nativeValidationProvided\s*\? movie\.nativeVideoValid\s*: heroVideoStatus === 'ready' \|\| mediaStatus === 'ready'/);
  assert.match(uploader, /if \(ready\) return \{ ready: true, status: 'ready', label: 'Verified native trailer' \}/);
});

test('admin rows preserve in-flight and failed media states with a retry action', async () => {
  const uploader = await read('../src/pages/admin/HeroVideoUploader.jsx');

  for (const status of ['pending', 'ingesting', 'processing', 'failed']) {
    assert.match(uploader, new RegExp(`status: '${status}'`));
  }
  assert.match(uploader, /data-hero-media-status=\{readiness\.status\}/);
  assert.match(uploader, /mediaReadiness\.status === 'failed' && movie\.media\?\.id/);
  assert.match(uploader, /Retry ingestion/);
});

test('manual Hero uploads request native Cloudinary normalization and expose codec details', async () => {
  const uploader = await read('../src/pages/admin/HeroVideoUploader.jsx');

  assert.match(uploader, /formData.append\('transformation', sigData\.signatureData\.transformation\)/);
  assert.match(uploader, /HERO_VIDEO_CODEC_INVALID/);
  assert.match(uploader, /details\?\.videoCodec/);
  assert.match(uploader, /details\?\.audioCodec/);
  assert.match(uploader, /MP4 H\.264 \+ AAC/);
});

test('live, active-pool, manual, and library rows share the same readiness presentation', async () => {
  const settings = await read('../src/pages/admin/HeroSettings.jsx');

  assert.match(settings, /import HeroVideoUploader, \{ HeroVideoReadiness \}/);
  assert.equal((settings.match(/<HeroVideoReadiness movie=\{movie\}/g) || []).length, 3);
  assert.equal((settings.match(/<HeroVideoUploader movie=\{movie\}/g) || []).length, 3);
  assert.doesNotMatch(settings, /movie\.nativeVideoValid \|\| movie\.heroVideoStatus === 'ready'/);
  assert.doesNotMatch(settings, /eslint-disable-next-line react-hooks\/exhaustive-deps/);
});
