import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getNormalizedApiBase,
  buildApiUrl,
  API_BASE_URL,
  apiClient,
  fetchApi,
} from '../src/lib/apiClient.js';

const readSource = (relativePath) => readFile(
  new URL(`../src/${relativePath}`, import.meta.url),
  'utf8',
);

test('apiClient.js normalizes base URLs correctly', () => {
  assert.equal(getNormalizedApiBase('  http://localhost:3000/ '), 'http://localhost:3000');
  assert.equal(getNormalizedApiBase('http://localhost:3000/api'), 'http://localhost:3000');
  assert.equal(getNormalizedApiBase('http://localhost:3000/api/'), 'http://localhost:3000');
  assert.equal(getNormalizedApiBase('http://localhost:3000/api/api/'), 'http://localhost:3000');
  assert.equal(getNormalizedApiBase(''), '');
  assert.equal(getNormalizedApiBase(null), '');
});

test('buildApiUrl constructs clean paths and prevents duplicated /api/api', () => {
  assert.equal(buildApiUrl('/api/show/hero'), `${API_BASE_URL}/api/show/hero`);
  assert.equal(buildApiUrl('api/show/hero'), `${API_BASE_URL}/api/show/hero`);
  assert.equal(buildApiUrl('/api/api/show/hero'), `${API_BASE_URL}/api/show/hero`);
  assert.equal(
    buildApiUrl('http://localhost:3000/api/api/show/hero'),
    'http://localhost:3000/api/show/hero'
  );
});

test('apiClient exports configured Axios instance and fetch wrapper', () => {
  assert.equal(typeof apiClient.get, 'function');
  assert.equal(typeof fetchApi, 'function');
  assert.equal(apiClient.defaults.baseURL, API_BASE_URL);
});

test('apiClient retries one transient read but never replays a mutation', async () => {
  const originalAdapter = apiClient.defaults.adapter;
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error('database warming up');
      error.config = config;
      error.response = { status: 503, config, data: { code: 'DATABASE_UNAVAILABLE' } };
      throw error;
    }
    return { data: { success: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  // The retry delay uses an unref'd timer, and nothing else keeps this test's
  // event loop alive; on some Node versions the runner would end the test first.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const response = await apiClient.get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);

    attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      const error = new Error('database unavailable');
      error.config = config;
      error.response = { status: 503, config, data: { code: 'DATABASE_UNAVAILABLE' } };
      throw error;
    };
    await assert.rejects(apiClient.post('/api/admin/hero/refresh'), /database unavailable/);
    assert.equal(attempts, 1);
  } finally {
    clearInterval(keepAlive);
    apiClient.defaults.adapter = originalAdapter;
  }
});

test('tmdb.js consumes lib/apiClient.js', async () => {
  const tmdbSource = await readSource('services/tmdb.js');
  assert.match(tmdbSource, /import\s+.*from\s+['"]\.\.\/lib\/apiClient\.js['"]/);
  assert.doesNotMatch(tmdbSource, /runtimeEnv\.DEV \? '' :/);
});

test('AppContext.jsx consumes lib/apiClient.js', async () => {
  const appContextSource = await readSource('context/AppContext.jsx');
  assert.match(appContextSource, /import\s+.*apiClient.*from\s+['"]\.\.\/lib\/apiClient\.js['"]/);
});
