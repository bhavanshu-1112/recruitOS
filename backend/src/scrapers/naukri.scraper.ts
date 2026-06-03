import type { Page } from 'playwright';
import type { RawScrapedJob, JobSearchQuery, ScrapeResult } from '../types/job.types.js';
import { BaseScraper } from './base.scraper.js';
import { retryWithBackoff } from '../utils/retry.js';

/** Maximum number of job detail pages to visit per scrape run. */
const MAX_DETAIL_PAGES = 15;

/**
 * Scraper for Naukri.com job search pages.
 *
 * Navigates to Naukri's search results, extracts job card metadata,
 * then visits individual job pages to collect full descriptions.
 *
 * @remarks
 * Naukri may display cookie consent banners and promotional popups.
 * This scraper handles them proactively to avoid blocking interactions.
 */
export class NaukriScraper extends BaseScraper {
  constructor() {
    super('naukri');
  }

  /**
   * Scrapes Naukri.com job listings for the given query.
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
      this.logger.info(`Navigating to Naukri search: ${searchUrl}`);

      // Navigate to search results with retry
      await retryWithBackoff(
        () => page!.goto(searchUrl, { waitUntil: 'domcontentloaded' }).then(() => {}),
        { maxRetries: 2, baseDelayMs: 2000 },
      );

      // Dismiss popups and cookie consent overlays
      await this.dismissPopups(page);

      // Wait for job cards to load
      await this.waitForJobCards(page);

      // Extract job card metadata
      const jobCards = await this.extractJobCards(page);
      this.logger.info(`Found ${jobCards.length} job cards on Naukri`);

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

      this.logger.info(`Naukri scrape complete: ${jobs.length} jobs collected`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Naukri scrape failed: ${msg}`);
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
   * Builds the Naukri search URL from query parameters.
   *
   * Naukri uses a slug-based URL format:
   *   `https://www.naukri.com/software-engineer-jobs?l=Mumbai`
   */
  private buildSearchUrl(query: JobSearchQuery): string {
    // Convert role to URL slug: "Software Engineer" → "software-engineer"
    const roleSlug = query.role
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

    const url = new URL(`https://www.naukri.com/${roleSlug}-jobs`);

    if (query.location) {
      url.searchParams.set('l', query.location);
    }

    // Salary filter (Naukri uses lakhs per annum for INR)
    if (query.salaryRange?.min !== undefined) {
      // Convert to lakhs if currency is INR, otherwise pass raw
      const minVal =
        query.salaryRange.currency?.toUpperCase() === 'INR'
          ? Math.floor(query.salaryRange.min / 100000)
          : query.salaryRange.min;
      url.searchParams.set('nignbeacon_salary', String(minVal));
      url.searchParams.set('salary', String(minVal));
    }

    if (query.salaryRange?.max !== undefined) {
      const maxVal =
        query.salaryRange.currency?.toUpperCase() === 'INR'
          ? Math.floor(query.salaryRange.max / 100000)
          : query.salaryRange.max;
      url.searchParams.set('salaryType', '0');
      url.searchParams.set('maxSalary', String(maxVal));
    }

    // Skills as keywords
    if (query.skills && query.skills.length > 0) {
      const currentKeywords = url.searchParams.get('q') || '';
      const skillStr = query.skills.join(', ');
      url.searchParams.set('k', currentKeywords ? `${currentKeywords}, ${skillStr}` : skillStr);
    }

    return url.toString();
  }

  /**
   * Dismisses cookie consent banners and promotional popups
   * that Naukri commonly shows.
   */
  private async dismissPopups(page: Page): Promise<void> {
    const popupSelectors = [
      // Cookie consent
      '#cookie-consent-accept',
      '.cookie-consent button',
      '[data-action="accept-cookie"]',
      // Login prompt / chatbot popups
      '.chatbot_closeBtn',
      '.chatbot-close-btn',
      'button[title="Close"]',
      '.login-layer__close',
      '.nPopupHdr .crossIcon',
    ];

    for (const selector of popupSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click({ timeout: 2000 });
          this.logger.debug(`Dismissed popup: ${selector}`);
          await page.waitForTimeout(500);
        }
      } catch {
        // Popup element not found or not clickable — expected
      }
    }
  }

  /**
   * Waits for job card elements to appear on the search results page.
   * Tries multiple possible selectors since Naukri updates their DOM frequently.
   */
  private async waitForJobCards(page: Page): Promise<void> {
    const selectors = [
      '.srp-jobtuple-wrapper',
      'article.jobTuple',
      '.jobTupleHeader',
      '.cust-job-tuple',
      '[data-job-id]',
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 8000 });
        this.logger.debug(`Job cards loaded with selector: ${selector}`);
        return;
      } catch {
        // Try next selector
      }
    }

    this.logger.warn('Could not detect job cards with known selectors — proceeding anyway');
  }

  /**
   * Extracts job card metadata from the Naukri search results page.
   *
   * @returns An array of partially-filled {@link RawScrapedJob} objects.
   */
  private async extractJobCards(page: Page): Promise<RawScrapedJob[]> {
    try {
      const cards = await page.$$eval(
        '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple, [data-job-id]',
        (elements) => {
          return elements.map((el) => {
            // Title — try multiple selector patterns
            const titleEl =
              el.querySelector('.title a') ??
              el.querySelector('a.title') ??
              el.querySelector('.row1 .title') ??
              el.querySelector('a[class*="title"]');

            // Company
            const companyEl =
              el.querySelector('.comp-name') ??
              el.querySelector('.subTitle a') ??
              el.querySelector('.companyInfo a') ??
              el.querySelector('a[class*="comp"]');

            // Location
            const locationEl =
              el.querySelector('.locWdth') ??
              el.querySelector('.loc-wrap .loc span') ??
              el.querySelector('.loc span') ??
              el.querySelector('.location') ??
              el.querySelector('[class*="loc"]');

            // Salary
            const salaryEl =
              el.querySelector('.sal-wrap span') ??
              el.querySelector('.salary') ??
              el.querySelector('.sal span') ??
              el.querySelector('[class*="salary"]');

            // Posted date / freshness
            const dateEl =
              el.querySelector('.job-post-day') ??
              el.querySelector('.freshness') ??
              el.querySelector('[class*="freshness"]') ??
              el.querySelector('.type br + span');

            // URL
            const linkEl = (titleEl as HTMLAnchorElement | null) ??
              el.querySelector('a.title') as HTMLAnchorElement | null ??
              el.querySelector('a[class*="title"]') as HTMLAnchorElement | null;

            return {
              title: titleEl?.textContent?.trim() ?? '',
              company: companyEl?.textContent?.trim() ?? '',
              location: locationEl?.textContent?.trim() ?? '',
              salaryText: salaryEl?.textContent?.trim() ?? '',
              postedDateText: dateEl?.textContent?.trim() ?? '',
              applyUrl: (linkEl as HTMLAnchorElement | null)?.href ?? '',
              descriptionHtml: '',
              descriptionText: '',
            };
          });
        },
      );

      // Filter out cards with no title
      return cards.filter((card) => card.title.length > 0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract job cards: ${msg}`);
      return [];
    }
  }

  /**
   * Navigates to a job's detail page and enriches the card with full
   * description data.
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

    // Dismiss any popups that appear on the detail page
    await this.dismissPopups(page);

    // Extract full job description — try multiple known selectors
    const descriptionData = await page.evaluate(() => {
      const descSelectors = [
        '.styles_JDC__dang-inner-html__h0K4t',
        '.job-desc',
        '.dang-inner-html',
        '.jd-container',
        '[class*="jd-container"]',
        '.job-description',
        'section.job-desc',
      ];

      let descEl: Element | null = null;
      for (const sel of descSelectors) {
        descEl = document.querySelector(sel);
        if (descEl) {break;}
      }

      return {
        html: descEl?.innerHTML?.trim() ?? '',
        text: descEl?.textContent?.trim() ?? '',
      };
    });

    // Extract salary if not already present
    let salaryText = card.salaryText;
    if (!salaryText) {
      salaryText = await page.evaluate(() => {
        const salaryEl =
          document.querySelector('.salary') ??
          document.querySelector('.sal') ??
          document.querySelector('[class*="salary"]');
        return salaryEl?.textContent?.trim() ?? '';
      });
    }

    return {
      ...card,
      descriptionHtml: descriptionData.html || card.descriptionHtml,
      descriptionText: descriptionData.text || card.descriptionText,
      salaryText: salaryText || card.salaryText,
    };
  }
}
