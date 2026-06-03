import type { JobSearchQuery, ScrapeResult } from '../types/job.types.js';
import { LinkedInScraper } from './linkedin.scraper.js';
import { NaukriScraper } from './naukri.scraper.js';
import type { BaseScraper } from './base.scraper.js';
import type { ScraperRateLimiter } from '../utils/rate-limiter.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ScrapingOrchestrator');

/**
 * Orchestrates parallel execution of multiple job scrapers.
 *
 * Manages the full lifecycle of each scraper (launch → scrape → close),
 * applies per-source rate limiting, and aggregates results. A scraper failure
 * never prevents other scrapers from completing.
 *
 * @example
 * ```ts
 * const orchestrator = new ScrapingOrchestrator(linkedInLimiter, naukriLimiter);
 * const results = await orchestrator.orchestrate({ role: 'Backend Engineer', location: 'Mumbai' });
 * ```
 */
export class ScrapingOrchestrator {
  private readonly linkedInRateLimiter: ScraperRateLimiter;
  private readonly naukriRateLimiter: ScraperRateLimiter;

  /** Tracks active scraper instances for cleanup during shutdown. */
  private activeScrapers: BaseScraper[] = [];

  /**
   * @param linkedInRateLimiter - Rate limiter for LinkedIn requests.
   * @param naukriRateLimiter - Rate limiter for Naukri requests.
   */
  constructor(linkedInRateLimiter: ScraperRateLimiter, naukriRateLimiter: ScraperRateLimiter) {
    this.linkedInRateLimiter = linkedInRateLimiter;
    this.naukriRateLimiter = naukriRateLimiter;
  }

  /**
   * Runs all configured scrapers in parallel against the given job query.
   *
   * Each scraper is independently launched, scraped, and closed. Failures in
   * one scraper do not affect others — results from all successful scrapers
   * are collected and returned.
   *
   * @param query - The job search parameters to pass to each scraper.
   * @returns An array of {@link ScrapeResult} from all successful scrapers.
   */
  async orchestrate(query: JobSearchQuery): Promise<ScrapeResult[]> {
    logger.info(`Starting orchestrated scrape for role="${query.role}" location="${query.location || 'any'}"`);
    const overallStart = Date.now();

    const linkedInScraper = new LinkedInScraper();
    const naukriScraper = new NaukriScraper();

    this.activeScrapers = [linkedInScraper, naukriScraper];

    // Define scraper tasks — each acquires its rate limiter, launches, scrapes, and closes
    const scraperTasks = [
      this.runScraper(linkedInScraper, query, this.linkedInRateLimiter, 'LinkedIn'),
      this.runScraper(naukriScraper, query, this.naukriRateLimiter, 'Naukri'),
    ];

    // Run all scrapers in parallel — failures are isolated
    const settled = await Promise.allSettled(scraperTasks);

    const results: ScrapeResult[] = [];
    let totalErrors = 0;

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        totalErrors += outcome.value.errors.length;
      } else {
        // This path should rarely trigger since runScraper catches internally,
        // but it's a safety net for truly unexpected errors.
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        logger.error(`Scraper task rejected unexpectedly: ${msg}`);
        totalErrors++;
      }
    }

    this.activeScrapers = [];

    // Summary log
    const linkedInJobs = results.find((r) => r.source === 'linkedin')?.jobs.length ?? 0;
    const naukriJobs = results.find((r) => r.source === 'naukri')?.jobs.length ?? 0;
    const totalDuration = Date.now() - overallStart;

    logger.info(
      `Orchestration complete in ${totalDuration}ms — LinkedIn: ${linkedInJobs} jobs, Naukri: ${naukriJobs} jobs, Errors: ${totalErrors}`,
    );

    return results;
  }

  /**
   * Runs a single scraper through its full lifecycle:
   * acquire rate-limit token → launch browser → scrape → close browser.
   *
   * @param scraper - The scraper instance to run.
   * @param query - The job search query.
   * @param rateLimiter - The source-specific rate limiter.
   * @param label - Human-readable name for logging.
   * @returns The {@link ScrapeResult} from the scraper.
   */
  private async runScraper(
    scraper: BaseScraper,
    query: JobSearchQuery,
    rateLimiter: ScraperRateLimiter,
    label: string,
  ): Promise<ScrapeResult> {
    try {
      logger.info(`[${label}] Acquiring rate-limit token...`);
      await rateLimiter.acquire();
      logger.info(`[${label}] Rate-limit token acquired, launching browser...`);

      await scraper.launch();

      logger.info(`[${label}] Browser launched, starting scrape...`);
      const result = await scraper.scrape(query);

      logger.info(`[${label}] Scrape finished: ${result.jobs.length} jobs in ${result.duration}ms`);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[${label}] Scraper failed entirely: ${msg}`);

      // Return an empty result with the error rather than throwing
      return {
        source: scraper['source'],
        jobs: [],
        duration: 0,
        errors: [`${label} scraper failed: ${msg}`],
      };
    } finally {
      try {
        await scraper.close();
      } catch (closeError) {
        const msg = closeError instanceof Error ? closeError.message : String(closeError);
        logger.warn(`[${label}] Error during browser cleanup: ${msg}`);
      }
    }
  }

  /**
   * Gracefully shuts down all active scrapers.
   * Safe to call at any time, including during an active orchestration.
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down all active scrapers...');

    const closePromises = this.activeScrapers.map(async (scraper) => {
      try {
        await scraper.close();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Error during shutdown cleanup: ${msg}`);
      }
    });

    await Promise.allSettled(closePromises);
    this.activeScrapers = [];
    logger.info('All scrapers shut down');
  }
}
