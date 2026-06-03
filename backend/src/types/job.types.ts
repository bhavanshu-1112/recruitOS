/**
 * Core type definitions for the Job Intelligence Engine.
 *
 * These types define the data shapes used throughout the job discovery,
 * scraping, and embedding pipeline.
 */

/**
 * Supported scraper sources for job discovery.
 */
export type ScraperSource = 'linkedin' | 'naukri';

/**
 * Query parameters for searching/discovering jobs.
 */
export interface JobSearchQuery {
  /** Target job role or title to search for */
  role: string;
  /** Preferred job location (city, region, or "remote") */
  location?: string;
  /** Required or desired skills to match against */
  skills?: string[];
  /** Desired salary range constraints */
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
}

/**
 * Normalized job listing after parsing and transformation.
 * This is the canonical representation stored in the database.
 */
export interface JobListing {
  /** Unique identifier (UUID), assigned by the database */
  id?: string;
  /** Job title */
  title: string;
  /** Hiring company name */
  company: string;
  /** Job location (city, state, country, or "Remote") */
  location: string;
  /** Extracted skill tags */
  skills: string[];
  /** Minimum salary (null if not disclosed) */
  salaryMin: number | null;
  /** Maximum salary (null if not disclosed) */
  salaryMax: number | null;
  /** Salary currency code (e.g., "INR", "USD") */
  salaryCurrency: string;
  /** Date the job was originally posted (null if unknown) */
  postedDate: Date | null;
  /** Direct URL to apply for the position */
  applyUrl: string;
  /** Source platform the job was scraped from */
  source: ScraperSource;
  /** Raw plain-text description for embedding generation */
  rawText: string;
  /** Timestamp of record creation */
  createdAt?: Date;
  /** Timestamp of last record update */
  updatedAt?: Date;
}

/**
 * Raw data as scraped from a job board, before any normalization.
 * Field values are unprocessed strings that need parsing.
 */
export interface RawScrapedJob {
  /** Raw job title text */
  title: string;
  /** Raw company name text */
  company: string;
  /** Raw location text */
  location: string;
  /** Unparsed salary string (e.g., "₹8-12 LPA") */
  salaryText: string;
  /** Unparsed posting date text (e.g., "2 days ago") */
  postedDateText: string;
  /** Direct apply/detail URL */
  applyUrl: string;
  /** Full job description as HTML */
  descriptionHtml: string;
  /** Full job description as plain text */
  descriptionText: string;
}

/**
 * Result from a single scraper source run.
 */
export interface ScrapeResult {
  /** Which source platform produced these results */
  source: ScraperSource;
  /** Array of raw scraped job entries */
  jobs: RawScrapedJob[];
  /** Wall-clock duration of the scrape in milliseconds */
  duration: number;
  /** Non-fatal errors encountered during scraping */
  errors: string[];
}

/**
 * Final aggregated result from the job discovery pipeline,
 * combining results from all scraper sources.
 */
export interface JobDiscoveryResult {
  /** Whether the overall discovery operation succeeded */
  success: boolean;
  /** Normalized and deduplicated job listings */
  data: JobListing[];
  /** Metadata about the discovery run */
  meta: {
    /** Total number of jobs returned */
    total: number;
    /** Whether results were served from cache */
    cached: boolean;
    /** Total pipeline duration in milliseconds */
    duration: number;
    /** Per-source job counts */
    sources: {
      linkedin: number;
      naukri: number;
    };
  };
}
