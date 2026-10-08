import { httpStatusOf, isAbortError, s3ErrorCode } from '@/core/s3/s3-error';

export interface RetryOptions {
  /** Retries after the first attempt. */
  retries: number;
  baseDelayMs: number;
  signal?: AbortSignal;
}

export const DEFAULT_RETRY: RetryOptions = { retries: 3, baseDelayMs: 1000 };

const RETRYABLE_CODES = new Set([
  'SlowDown',
  'RequestTimeout',
  'InternalError',
  'ServiceUnavailable',
  'TimeoutError',
  'NetworkingError',
  'TypeError',
]);

/** Network failures, throttling and 5xx are worth retrying; auth and validation errors are not. */
export function isRetryable(error: unknown): boolean {
  if (isAbortError(error)) return false;
  const status = httpStatusOf(error);
  if (status !== undefined && (status >= 500 || status === 429)) return true;
  const code = s3ErrorCode(error);
  return code !== undefined && RETRYABLE_CODES.has(code);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Runs `operation`, retrying retryable failures with exponential backoff (1 s, 2 s, 4 s, ...). */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.retries || !isRetryable(error)) throw error;
      await sleep(options.baseDelayMs * 2 ** attempt, options.signal);
    }
  }
}
