import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('App renders unified web layout across all viewports', () => {
  const app = read('App.jsx');
  assert.match(app, /Navbar/);
  assert.match(app, /Footer/);
  assert.doesNotMatch(app, /MobileExperienceGate/);
});

test('legacy Loading route no longer performs a fixed eight second redirect', () => {
  const loading = read('components/Loading.jsx');
  assert.doesNotMatch(loading, /8000/);
  assert.doesNotMatch(loading, /nextUrl/);
});
