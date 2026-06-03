import { createHash } from 'node:crypto';
import type {
  JobSearchQuery,
  JobListing,
  JobDiscoveryResult,
  ScrapeResult,
} from '../types/job.types.js';
import type { JobRepository } from '../repositories/job.repository.js';
import type { JDParser } from './jd-parser.js';
import type { EmbeddingService } from './embedding.service.js';
import { getRedisClient } from '../config/redis.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JobDiscoveryService');

/** Cache TTL in seconds (2 hours). */
const CACHE_TTL = 7200;

/**
 * Minimal interface for the scraping orchestrator dependency.
 * Keeps this service decoupled from the concrete orchestrator implementation.
 */
export interface ScrapingOrchestrator {
  orchestrate(query: JobSearchQuery): Promise<ScrapeResult[]>;
}

/**
 * Dependencies injected into JobDiscoveryService.
 */
export interface JobDiscoveryDeps {
  repository: JobRepository;
  orchestrator: ScrapingOrchestrator;
  parser: JDParser;
  embeddingService: EmbeddingService;
}

/**
 * Main orchestrator for the job-discovery pipeline:
 * 1. Check Redis cache
 * 2. Scrape sources in parallel
 * 3. Parse & normalize raw jobs
 * 4. Deduplicate by applyUrl
 * 5. Upsert to PostgreSQL
 * 6. Fire-and-forget embedding generation
 * 7. Cache results in Redis
 */
export class JobDiscoveryService {
  private repository: JobRepository;
  private orchestrator: ScrapingOrchestrator;
  private parser: JDParser;
  private embeddingService: EmbeddingService;

  constructor(deps: JobDiscoveryDeps) {
    this.repository = deps.repository;
    this.orchestrator = deps.orchestrator;
    this.parser = deps.parser;
    this.embeddingService = deps.embeddingService;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Discover jobs matching the given query.
   * Returns cached results when available, otherwise runs the full pipeline.
   */
  async discover(query: JobSearchQuery): Promise<JobDiscoveryResult> {
    const startTime = Date.now();

    try {
      // 1. Check cache
      const cacheKey = this.generateCacheKey(query);
      const cached = await this.getCached(cacheKey);
      if (cached) {
        logger.info(`Cache hit for query: ${query.role}`);
        return {
          ...cached,
          meta: { ...cached.meta, cached: true, duration: Date.now() - startTime },
        };
      }

      // 2. Scrape
      logger.info(`Cache miss — scraping for: ${query.role}`);
      const scrapeResults = await this.orchestrator.orchestrate(query);

      // 3. Parse + normalize
      const sourceCounts = { linkedin: 0, naukri: 0 };
      const parsed: JobListing[] = [];

      for (const result of scrapeResults) {
        for (const rawJob of result.jobs) {
          const listing = this.parser.parseRawJob(rawJob, result.source);
          parsed.push(listing);
        }
        sourceCounts[result.source] = (sourceCounts[result.source] ?? 0) + result.jobs.length;
      }

      // 4. Deduplicate by applyUrl
      const seen = new Set<string>();
      const unique = parsed.filter((job) => {
        if (seen.has(job.applyUrl)) {return false;}
        seen.add(job.applyUrl);
        return true;
      });

      // 5. Upsert to database
      const upserted = await this.repository.upsertJobs(unique);

      // 6. Fire-and-forget embedding generation
      this.embeddingService
        .generateAndStoreEmbeddings(upserted, this.repository)
        .catch((err) => {
          logger.error('Background embedding generation failed', err);
        });

      // 7. Build result
      const discoveryResult: JobDiscoveryResult = {
        success: true,
        data: upserted,
        meta: {
          total: upserted.length,
          cached: false,
          duration: Date.now() - startTime,
          sources: sourceCounts,
        },
      };

      // 8. Cache
      await this.setCache(cacheKey, discoveryResult);

      return discoveryResult;
    } catch (error) {
      logger.error('Job discovery pipeline failed', error);
      return {
        success: false,
        data: [],
        meta: {
          total: 0,
          cached: false,
          duration: Date.now() - startTime,
          sources: { linkedin: 0, naukri: 0 },
        },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Cache helpers
  // ---------------------------------------------------------------------------

  /**
   * Deterministic cache key via SHA-256 of the sorted, serialised query.
   */
  generateCacheKey(query: JobSearchQuery): string {
    const sorted = JSON.stringify(query, Object.keys(query).sort());
    const hash = createHash('sha256').update(sorted).digest('hex');
    return `job-discovery:${hash}`;
  }

  private async getCached(key: string): Promise<JobDiscoveryResult | null> {
    try {
      const redis = getRedisClient();
      const raw = await redis.get(key);
      if (!raw) {return null;}
      return JSON.parse(raw) as JobDiscoveryResult;
    } catch (error) {
      logger.warn('Redis GET failed, treating as cache miss', error);
      return null;
    }
  }

  private async setCache(key: string, value: JobDiscoveryResult): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL);
    } catch (error) {
      logger.warn('Redis SET failed — result not cached', error);
    }
  }
}
