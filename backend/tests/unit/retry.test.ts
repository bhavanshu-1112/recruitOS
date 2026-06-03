import { retryWithBackoff } from '../../src/utils/retry.js';

// =============================================================================
// retryWithBackoff tests
// =============================================================================

describe('retryWithBackoff', () => {
  beforeEach(() => {
    // Speed up tests by replacing setTimeout with immediate resolution
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Helper: advance all pending timers so retries proceed instantly.
   * We run pending timers in a loop because each retry schedules a new timer.
   */
  async function flushTimers(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      jest.runAllTimers();
      // Yield to the microtask queue so awaited promises resolve
      await Promise.resolve();
    }
  }

  // ---------------------------------------------------------------------------
  // Success on first try
  // ---------------------------------------------------------------------------

  it('should return result on first try without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const resultPromise = retryWithBackoff(fn, { maxRetries: 3 });
    await flushTimers();
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Success after retries
  // ---------------------------------------------------------------------------

  it('should succeed after failures if a retry succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });
    await flushTimers();
    const result = await resultPromise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });

  // ---------------------------------------------------------------------------
  // Max retries exceeded
  // ---------------------------------------------------------------------------

  it('should throw after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });
    await flushTimers();

    await expect(resultPromise).rejects.toThrow('always fails');
    // 1 initial attempt + 2 retries = 3 total
    expect(fn).toHaveBeenCalledTimes(3);
  });

  // ---------------------------------------------------------------------------
  // Respects maxRetries option
  // ---------------------------------------------------------------------------

  it('should respect maxRetries=1 — at most 2 attempts total', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('no luck'));

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 1,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });
    await flushTimers();

    await expect(resultPromise).rejects.toThrow('no luck');
    expect(fn).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  // ---------------------------------------------------------------------------
  // Default maxRetries (3)
  // ---------------------------------------------------------------------------

  it('should default to 3 retries when options are not provided', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('oops'));

    const resultPromise = retryWithBackoff(fn);
    await flushTimers();

    await expect(resultPromise).rejects.toThrow('oops');
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  // ---------------------------------------------------------------------------
  // Non-Error rejection is wrapped
  // ---------------------------------------------------------------------------

  it('should handle non-Error rejections gracefully', async () => {
    const fn = jest.fn().mockRejectedValue('string error');

    const resultPromise = retryWithBackoff(fn, {
      maxRetries: 0,
      baseDelayMs: 10,
    });
    await flushTimers();

    await expect(resultPromise).rejects.toThrow('string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
