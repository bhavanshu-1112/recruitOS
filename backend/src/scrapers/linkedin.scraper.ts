import type { Page } from 'playwright';
import type { RawScrapedJob, JobSearchQuery, ScrapeResult } from '../types/job.types.js';
import { BaseScraper } from './base.scraper.js';
import { retryWithBackoff } from '../utils/retry.js';

/** Maximum number of job detail pages to visit per scrape run. */
const MAX_DETAIL_PAGES = 15;

/** Number of scroll iterations to trigger lazy-loading on the results page. */
const SCROLL_ITERATIONS = 3;

/** Delay in ms between scroll actions. */
const SCROLL_DELAY_MS = 2000;

/**
 * Scraper for LinkedIn's public job search pages.
 *
 * Navigates to LinkedIn's guest job search, extracts job cards from the
 * results list, then visits each detail page to collect full descriptions.
 *
 * @remarks
 * LinkedIn aggressively guards against automated access. This scraper:
 * - Uses stealth browser settings from {@link BaseScraper}
 * - Detects login-wall redirects and aborts gracefully
 * - Limits detail page visits to {@link MAX_DETAIL_PAGES}
 * - Inserts random delays between requests
 */
export class LinkedInScraper extends BaseScraper {
  constructor() {
    super('linkedin');
  }

  /**
   * Scrapes LinkedIn public job search results for the given query.
   *
   * @param query - Job search parameters (role, location, salary).
   * @returns A {@link ScrapeResult} with collected jobs, elapsed time, and any errors.
   */
  async scrape(query: JobSearchQuery): Promise<ScrapeResult> {
    const startTime = Date.now();
    const jobs: RawScrapedJob[] = [];
    const errors: string[] = [];

    let page: Page | null = null;

    try {
      page = await this.createPage();

      // Build the search URL
      const searchUrl = this.buildSearchUrl(query);
      this.logger.info(`Navigating to LinkedIn search: ${searchUrl}`);

      // Navigate to search results with retry
      await retryWithBackoff(
        () => page!.goto(searchUrl, { waitUntil: 'domcontentloaded' }).then(() => {}),
        { maxRetries: 2, baseDelayMs: 2000 },
      );

      // Detect login wall
      if (await this.isLoginWall(page)) {
        const msg = 'LinkedIn login wall detected — cannot scrape guest results';
        this.logger.warn(msg);
        errors.push(msg);
        return { source: this.source, jobs, duration: Date.now() - startTime, errors };
      }

      // Scroll to trigger lazy-loading of additional job cards
      await this.scrollForResults(page);

      // Extract job card metadata from the listing page
      const jobCards = await this.extractJobCards(page);
      this.logger.info(`Found ${jobCards.length} job cards on LinkedIn`);

      // Visit each detail page (capped at MAX_DETAIL_PAGES)
      const cardsToProcess = jobCards.slice(0, MAX_DETAIL_PAGES);
      this.logger.info(`Extracting details for ${cardsToProcess.length} jobs...`);

      for (let i = 0; i < cardsToProcess.length; i++) {
        const card = cardsToProcess[i];
        try {
          const detailJob = await this.extractJobDetail(page, card);
          jobs.push(detailJob);
          this.logger.debug(`[${i + 1}/${cardsToProcess.length}] Extracted: ${detailJob.title}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to extract detail for card ${i + 1}: ${msg}`);
          errors.push(`Detail extraction failed for "${card.title}": ${msg}`);
          // Push partial data even if detail extraction fails
          jobs.push(card);
        }

        // Respectful delay between detail page visits
        if (i < cardsToProcess.length - 1) {
          await this.randomDelay();
        }
      }

      this.logger.info(`LinkedIn scrape complete: ${jobs.length} jobs collected`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`LinkedIn scrape failed: ${msg}`);
      errors.push(`Scrape failed: ${msg}`);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          // Page may already be closed
        }
      }
    }

    return {
      source: this.source,
      jobs,
      duration: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Builds the LinkedIn public job search URL from query parameters.
   */
  private buildSearchUrl(query: JobSearchQuery): string {
    const params = new URLSearchParams();
    params.set('keywords', query.role);

    if (query.location) {
      params.set('location', query.location);
    }

    // Filter: last 24 hours
    params.set('f_TPR', 'r86400');

    // LinkedIn salary filter bands (approximate mapping)
    if (query.salaryRange?.min) {
      // LinkedIn uses salary bands: 1=$40k+, 2=$60k+, 3=$80k+, 4=$100k+, 5=$120k+
      const minSalary = query.salaryRange.min;
      if (minSalary >= 120000) {params.set('f_SB2', '5');}
      else if (minSalary >= 100000) {params.set('f_SB2', '4');}
      else if (minSalary >= 80000) {params.set('f_SB2', '3');}
      else if (minSalary >= 60000) {params.set('f_SB2', '2');}
      else if (minSalary >= 40000) {params.set('f_SB2', '1');}
    }

    return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
  }

  /**
   * Detects whether LinkedIn has redirected to a login wall.
   */
  private async isLoginWall(page: Page): Promise<boolean> {
    try {
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
        return true;
      }

      // Check for the sign-in prompt overlay
      const signInPrompt = await page.$('.authwall-join-form, .sign-in-modal, [data-tracking-control-name="auth_wall"]');
      return signInPrompt !== null;
    } catch {
      return false;
    }
  }

  /**
   * Scrolls the page multiple times to trigger LinkedIn's lazy-loading
   * of additional job cards.
   */
  private async scrollForResults(page: Page): Promise<void> {
    for (let i = 0; i < SCROLL_ITERATIONS; i++) {
      try {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(SCROLL_DELAY_MS);
        this.logger.debug(`Scroll iteration ${i + 1}/${SCROLL_ITERATIONS}`);
      } catch (error) {
        this.logger.debug(`Scroll iteration ${i + 1} failed (non-critical)`);
      }
    }

    // Scroll back to top
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
    } catch {
      // Non-critical
    }
  }

  /**
   * Extracts job card metadata from the LinkedIn search results page.
   *
   * @returns An array of partially-filled {@link RawScrapedJob} objects.
   */
  private async extractJobCards(page: Page): Promise<RawScrapedJob[]> {
    try {
      // Wait for job cards to appear (use multiple possible selectors)
      await page.waitForSelector('.jobs-search__results-list li, .base-card', {
        timeout: 10000,
      }).catch(() => {
        this.logger.warn('Job card selector timed out — page may have no results');
      });

      const cards = await page.$$eval(
        '.jobs-search__results-list li, .base-card',
        (elements) => {
          return elements.map((el) => {
            const titleEl = el.querySelector('.base-search-card__title');
            const companyEl = el.querySelector('.base-search-card__subtitle, .base-search-card__subtitle a');
            const locationEl = el.querySelector('.job-search-card__location');
            const linkEl = el.querySelector('a.base-card__full-link') as HTMLAnchorElement | null;
            const timeEl = el.querySelector('time');

            return {
              title: titleEl?.textContent?.trim() ?? '',
              company: companyEl?.textContent?.trim() ?? '',
              location: locationEl?.textContent?.trim() ?? '',
              salaryText: '',
              postedDateText: timeEl?.getAttribute('datetime') ?? timeEl?.textContent?.trim() ?? '',
              applyUrl: linkEl?.href ?? '',
              descriptionHtml: '',
              descriptionText: '',
            };
          });
        },
      );

      // Filter out cards with no title (likely noise)
      return cards.filter((card) => card.title.length > 0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract job cards: ${msg}`);
      return [];
    }
  }

  /**
   * Navigates to a job's detail page and enriches the card with full description
   * and salary data.
   *
   * @param page - The current Playwright page.
   * @param card - The partial job card to enrich.
   * @returns The enriched {@link RawScrapedJob}.
   */
  private async extractJobDetail(page: Page, card: RawScrapedJob): Promise<RawScrapedJob> {
    if (!card.applyUrl) {
      return card;
    }

    await retryWithBackoff(
      () => page.goto(card.applyUrl, { waitUntil: 'domcontentloaded' }).then(() => {}),
      { maxRetries: 1, baseDelayMs: 1500 },
    );

    // Check for login wall on detail page
    if (await this.isLoginWall(page)) {
      this.logger.debug('Login wall on detail page — using partial data');
      return card;
    }

    // Extract description
    const descriptionData = await page.evaluate(() => {
      const descEl = document.querySelector(
        '.show-more-less-html__markup, .description__text, .jobs-description__content',
      );
      return {
        html: descEl?.innerHTML?.trim() ?? '',
        text: descEl?.textContent?.trim() ?? '',
      };
    });

    // Extract salary if present
    const salaryText = await page.evaluate(() => {
      const salaryEl = document.querySelector(
        '.salary-main-rail__data-body, .compensation__salary, .job-details-jobs-unified-top-card__job-insight span',
      );
      return salaryEl?.textContent?.trim() ?? '';
    });

    return {
      ...card,
      descriptionHtml: descriptionData.html,
      descriptionText: descriptionData.text,
      salaryText: salaryText || card.salaryText,
    };
  }
}
