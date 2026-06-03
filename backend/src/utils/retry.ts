import { createLogger } from './logger.js';

const logger = createLogger('Retry');

/**
 * Configuration options for {@link retryWithBackoff}.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /**
   * Predicate to determine if an error is retryable.
   * Return `true` to retry, `false` to fail immediately.
   * Defaults to retrying on network errors, timeouts, and 5xx status codes.
   */
  retryableError?: (err: Error) => boolean;
}

/**
 * Default retryable-error predicate.
 *
 * Returns `true` for errors that are likely transient:
 * - Network errors (ECONNREFUSED, ECONNRESET, ENOTFOUND, ETIMEDOUT, EAI_AGAIN)
 * - Timeout errors (message contains "timeout")
 * - HTTP 5xx server errors (status code >= 500)
 *
 * Returns `false` for client errors (4xx) and other non-transient failures.
 */
function isRetryableByDefault(err: Error): boolean {
  const message = err.message.toLowerCase();

  // Network-level errors
  const networkCodes = [
    'econnrefused',
    'econnreset',
    'enotfound',
    'etimedout',
    'eai_again',
    'epipe',
    'ehostunreach',
  ];
  if (networkCodes.some((code) => message.includes(code))) {
    return true;
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Check for HTTP status codes embedded in the error
  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    // Retry on 5xx, do not retry on 4xx
    return status >= 500;
  }

  // Check for a status property on the error object
  const errWithStatus = err as Error & { status?: number; statusCode?: number };
  const status = errWithStatus.status ?? errWithStatus.statusCode;
  if (status !== undefined) {
    return status >= 500;
  }

  // Default: retry on unknown errors (could be transient)
  return true;
}

/**
 * Executes an async function with exponential backoff and jitter.
 *
 * The delay formula is:
 * ```
 * delay = min(baseDelay * 2^attempt + random(0, 1000), maxDelay)
 * ```
 *
 * @param fn - The async function to execute and potentially retry.
 * @param options - Configuration for retry behavior.
 * @returns The resolved value from `fn`.
 * @throws The last encountered error if all retries are exhausted,
 *         or immediately if the error is deemed non-retryable.
 *
 * @example
 * ```ts
 * const data = await retryWithBackoff(
 *   () => fetchExternalApi('/jobs'),
 *   { maxRetries: 5, baseDelayMs: 500 },
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1_000;
  const maxDelayMs = options?.maxDelayMs ?? 30_000;
  const isRetryable = options?.retryableError ?? isRetryableByDefault;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // If this was the last attempt, bail out
      if (attempt === maxRetries) {
        logger.error('All retry attempts exhausted', {
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        break;
      }

      // Check if the error is retryable
      if (!isRetryable(lastError)) {
        logger.warn('Non-retryable error encountered, failing immediately', {
          attempt: attempt + 1,
          error: lastError.message,
        });
        throw lastError;
      }

      // Calculate delay: baseDelay * 2^attempt + random jitter (0–1000ms)
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 1_000);
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      logger.warn('Retrying after transient error', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
