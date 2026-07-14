export class FetchTimeoutError extends Error {
  constructor(timeoutMs, cause) {
    super(`Request timed out after ${timeoutMs}ms`, { cause });
    this.name = 'TimeoutError';
    this.code = 'ETIMEDOUT';
    this.timeoutMs = timeoutMs;
  }
}

export const fetchWithTimeout = async (
  url,
  options = {},
  {
    timeoutMs = 4500,
    fetchImpl = globalThis.fetch,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
  } = {},
) => {
  const controller = new AbortController();
  const externalSignal = options.signal;
  let abortCause = null;

  const abortFromExternal = () => {
    if (abortCause) return;
    abortCause = 'external';
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener?.('abort', abortFromExternal, { once: true });

  const timeoutId = setTimer(() => {
    if (abortCause) return;
    abortCause = 'timeout';
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (abortCause === 'timeout') throw new FetchTimeoutError(timeoutMs, error);
    throw error;
  } finally {
    clearTimer(timeoutId);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
};

