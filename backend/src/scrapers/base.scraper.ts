import { chromium } from 'playwright';
import type { Browser, Page, BrowserContext } from 'playwright';
import type { ScraperSource, JobSearchQuery, ScrapeResult } from '../types/job.types.js';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';
import type winston from 'winston';

/**
 * Pool of realistic Chrome user-agent strings for rotation.
 * Reduces detection likelihood by varying the fingerprint per launch.
 */
const USER_AGENTS: readonly string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

/**
 * Viewport size ranges for random selection.
 */
const VIEWPORT_WIDTHS = [1280, 1366, 1440, 1536, 1600, 1920] as const;
const VIEWPORT_HEIGHTS = [720, 768, 800, 900, 1024, 1080] as const;

/**
 * Abstract base class for all job scrapers.
 *
 * Provides shared browser lifecycle management, stealth-mode launch options,
 * random delay generation, and a consistent logging interface.
 * Subclasses must implement the {@link scrape} method with source-specific logic.
 *
 * @example
 * ```ts
 * class MyScraper extends BaseScraper {
 *   constructor() { super('linkedin'); }
 *   async scrape(query: JobSearchQuery): Promise<ScrapeResult> { ... }
 * }
 * ```
 */
export abstract class BaseScraper {
  /** The Playwright browser instance, or null if not yet launched. */
  protected browser: Browser | null = null;

  /** The browser context used for page creation. */
  protected context: BrowserContext | null = null;

  /** Winston logger instance scoped to this scraper. */
  protected logger: winston.Logger;

  /** Identifies which job source this scraper targets. */
  protected source: ScraperSource;

  constructor(source: ScraperSource) {
    this.source = source;
    this.logger = createLogger(`${source.charAt(0).toUpperCase() + source.slice(1)}Scraper`);
  }

  /**
   * Launches a Playwright Chromium browser with stealth-like settings.
   *
   * Applies anti-detection measures including:
   * - Random viewport size
   * - User-Agent rotation
   * - WebDriver flag suppression
   * - Automation-controlled feature disabled
   *
   * @throws Logs the error and rethrows if the browser cannot be launched.
   */
  async launch(): Promise<void> {
    try {
      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      const viewportWidth = VIEWPORT_WIDTHS[Math.floor(Math.random() * VIEWPORT_WIDTHS.length)];
      const viewportHeight = VIEWPORT_HEIGHTS[Math.floor(Math.random() * VIEWPORT_HEIGHTS.length)];

      this.logger.info(`Launching browser (headless=${config.scraper.headless})`);

      this.browser = await chromium.launch({
        headless: config.scraper.headless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--disable-extensions',
        ],
      });

      this.context = await this.browser.newContext({
        userAgent,
        viewport: { width: viewportWidth, height: viewportHeight },
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        javaScriptEnabled: true,
      });

      // Suppress the webdriver navigator property to avoid detection
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      this.logger.info('Browser launched successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to launch browser: ${message}`);
      throw error;
    }
  }

  /**
   * Gracefully closes the browser and releases resources.
   * Safe to call even if the browser is not running.
   */
  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.logger.info('Browser closed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error closing browser: ${message}`);
      // Force-null references even if close errors
      this.context = null;
      this.browser = null;
    }
  }

  /**
   * Creates a new browser page with the configured timeout.
   *
   * @returns A new Playwright {@link Page} with default navigation timeout set.
   * @throws If no browser context is available (call {@link launch} first).
   */
  protected async createPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized — call launch() first');
    }

    const page = await this.context.newPage();
    page.setDefaultNavigationTimeout(config.scraper.timeoutMs);
    page.setDefaultTimeout(config.scraper.timeoutMs);

    this.logger.debug('New page created');
    return page;
  }

  /**
   * Waits a random duration between the configured min and max delay.
   * Used between requests to appear more human-like and reduce detection risk.
   */
  protected async randomDelay(): Promise<void> {
    const min = config.scraper.delayMinMs;
    const max = config.scraper.delayMaxMs;
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    this.logger.debug(`Waiting ${delay}ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Scrapes job listings from the source based on the given query.
   * Must be implemented by each source-specific scraper subclass.
   *
   * @param query - The job search parameters.
   * @returns A {@link ScrapeResult} containing all found jobs, timing, and any errors.
   */
  abstract scrape(query: JobSearchQuery): Promise<ScrapeResult>;
}
