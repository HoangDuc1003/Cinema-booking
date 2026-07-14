import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithTimeout } from '../src/services/fetchWithTimeout.js';

const abortableFetch = (_url, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

test('an internal request timeout is reported as TimeoutError instead of AbortError', async () => {
  let fireTimeout;
  const request = fetchWithTimeout('/trailers', {}, {
    timeoutMs: 25,
    fetchImpl: abortableFetch,
    setTimer: (callback) => {
      fireTimeout = callback;
      return 1;
    },
    clearTimer: () => {},
  });

  fireTimeout();

  await assert.rejects(request, (error) => {
    assert.equal(error.name, 'TimeoutError');
    assert.equal(error.code, 'ETIMEDOUT');
    assert.equal(error.timeoutMs, 25);
    return true;
  });
});

test('an external cancellation remains an AbortError', async () => {
  const externalController = new AbortController();
  const request = fetchWithTimeout('/trailers', { signal: externalController.signal }, {
    timeoutMs: 25,
    fetchImpl: abortableFetch,
    setTimer: () => 1,
    clearTimer: () => {},
  });

  externalController.abort();

  await assert.rejects(request, (error) => {
    assert.equal(error.name, 'AbortError');
    assert.notEqual(error.name, 'TimeoutError');
    return true;
  });
});
