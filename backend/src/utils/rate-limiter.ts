import type { ScraperSource } from '../types/job.types.js';
import config from '../config/index.js';
import { createLogger } from './logger.js';

const logger = createLogger('RateLimiter');

/**
 * Token-bucket rate limiter for controlling scraper request frequency.
 *
 * Uses a sliding-window approach: tokens are refilled proportionally
 * based on elapsed time since the last refill, up to the configured
 * maximum. Callers that exceed the rate will await until a token
 * becomes available.
 *
 * @example
 * ```ts
 * const limiter = new ScraperRateLimiter(5); // 5 requests per minute
 * await limiter.acquire(); // blocks if bucket is empty
 * await fetchPage(url);
 * ```
 */
export class ScraperRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number;
  private readonly label: string;

  /**
   * Creates a new rate limiter.
   *
   * @param tokensPerMinute - Maximum number of requests allowed per minute.
   *                          Each call to {@link acquire} consumes one token.
   * @param label - Optional label for log messages (defaults to 'default').
   */
  constructor(tokensPerMinute: number, label: string = 'default') {
    this.maxTokens = tokensPerMinute;
    this.tokens = tokensPerMinute;
    // Time between token refills: evenly spread across one minute
    this.refillIntervalMs = Math.floor(60_000 / tokensPerMinute);
    this.lastRefillTime = Date.now();
    this.label = label;

    logger.debug('Rate limiter created', {
      label: this.label,
      tokensPerMinute,
      refillIntervalMs: this.refillIntervalMs,
    });
  }

  /**
   * Acquires a single token from the bucket, waiting if none are available.
   *
   * The method refills tokens based on elapsed time, then either consumes
   * one immediately or waits for the next refill cycle before retrying.
   * This guarantees callers never exceed the configured rate.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Calculate wait time until the next token is available
    const elapsed = Date.now() - this.lastRefillTime;
    const waitTime = Math.max(this.refillIntervalMs - elapsed, 0);

    logger.debug('Rate limit reached, waiting for token', {
      label: this.label,
      waitMs: waitTime,
      tokensRemaining: this.tokens,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    // Fallback: wait one full refill interval to guarantee a token
    logger.debug('Fallback wait for rate limiter', {
      label: this.label,
      waitMs: this.refillIntervalMs,
    });
    await new Promise<void>((resolve) =>
      setTimeout(resolve, this.refillIntervalMs),
    );
    this.refill();
    this.tokens = Math.max(this.tokens - 1, 0);
  }

  /**
   * Refills tokens based on elapsed time since the last refill.
   * Uses a sliding-window calculation to add proportional tokens
   * without exceeding the bucket maximum.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const newTokens = Math.floor(elapsed / this.refillIntervalMs);

    if (newTokens > 0) {
      this.tokens = Math.min(this.tokens + newTokens, this.maxTokens);
      this.lastRefillTime = now;
    }
  }
}

/**
 * Factory function that creates a rate limiter pre-configured for a
 * specific scraper source using values from the application config.
 *
 * - `'linkedin'` → uses `config.scraper.linkedInRateLimit` (requests/min)
 * - `'naukri'` → uses `config.scraper.naukriRateLimit` (requests/min)
 *
 * @param source - The scraper source to create a rate limiter for.
 * @returns A configured {@link ScraperRateLimiter} instance.
 */
export function createRateLimiter(source: ScraperSource): ScraperRateLimiter {
  const tokensPerMinute =
    source === 'linkedin'
      ? config.scraper.linkedInRateLimit
      : config.scraper.naukriRateLimit;

  logger.info('Creating rate limiter', { source, tokensPerMinute });
  return new ScraperRateLimiter(tokensPerMinute, source);
}
