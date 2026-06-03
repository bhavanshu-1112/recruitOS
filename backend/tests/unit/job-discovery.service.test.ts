import { createHash } from 'node:crypto';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import type { ScrapingOrchestrator } from '../../src/services/job-discovery.service.js';
import type { JobRepository } from '../../src/repositories/job.repository.js';
import type { JDParser } from '../../src/services/jd-parser.js';
import type { EmbeddingService } from '../../src/services/embedding.service.js';
import type {
  JobSearchQuery,
  JobListing,
  ScrapeResult,
  JobDiscoveryResult,
} from '../../src/types/job.types.js';

// =============================================================================
// Mock Redis — must be hoisted before the import of the service
// =============================================================================

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

jest.mock('../../src/config/redis.js', () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
}));

// Suppress noisy logs during tests
jest.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// =============================================================================
// Helpers
// =============================================================================

function makeMockDeps() {
  const repository = {
    upsertJobs: jest.fn(),
    findByQuery: jest.fn(),
    findById: jest.fn(),
    saveEmbedding: jest.fn(),
    findSimilarByEmbedding: jest.fn(),
  } as unknown as jest.Mocked<JobRepository>;

  const orchestrator = {
    orchestrate: jest.fn(),
  } as unknown as jest.Mocked<ScrapingOrchestrator>;

  const parser = {
    parseRawJob: jest.fn(),
  } as unknown as jest.Mocked<JDParser>;

  const embeddingService = {
    generateEmbedding: jest.fn(),
    generateBatchEmbeddings: jest.fn(),
    generateAndStoreEmbeddings: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingService>;

  return { repository, orchestrator, parser, embeddingService };
}

function sampleJobListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: 'uuid-001',
    title: 'Senior React Developer',
    company: 'Acme Inc',
    location: 'Bengaluru',
    skills: ['React', 'TypeScript'],
    salaryMin: 1500000,
    salaryMax: 2500000,
    salaryCurrency: 'INR',
    postedDate: new Date('2026-05-20'),
    applyUrl: 'https://example.com/apply/001',
    source: 'linkedin',
    rawText: 'We need a React developer',
    ...overrides,
  };
}

function sampleScrapeResult(
  source: 'linkedin' | 'naukri',
  jobCount: number,
): ScrapeResult {
  return {
    source,
    jobs: Array.from({ length: jobCount }, (_, i) => ({
      title: `Job ${i}`,
      company: 'TestCo',
      location: 'Remote',
      salaryText: '10-15 LPA',
      postedDateText: '2 days ago',
      applyUrl: `https://example.com/${source}/${i}`,
      descriptionHtml: '<p>desc</p>',
      descriptionText: 'desc',
    })),
    duration: 1000,
    errors: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('JobDiscoveryService', () => {
  let deps: ReturnType<typeof makeMockDeps>;
  let service: JobDiscoveryService;

  const query: JobSearchQuery = { role: 'React Developer', location: 'Bengaluru' };

  beforeEach(() => {
    jest.clearAllMocks();
    deps = makeMockDeps();
    service = new JobDiscoveryService(deps);
  });

  // ---------------------------------------------------------------------------
  // Cache hit
  // ---------------------------------------------------------------------------

  describe('cache hit', () => {
    it('should return cached result and NOT call the scraper', async () => {
      const cached: JobDiscoveryResult = {
        success: true,
        data: [sampleJobListing()],
        meta: { total: 1, cached: true, duration: 50, sources: { linkedin: 1, naukri: 0 } },
      };

      mockRedisGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await service.discover(query);

      expect(result.success).toBe(true);
      expect(result.meta.cached).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(deps.orchestrator.orchestrate).not.toHaveBeenCalled();
      expect(deps.repository.upsertJobs).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Cache miss → full pipeline
  // ---------------------------------------------------------------------------

  describe('cache miss — full pipeline', () => {
    it('should run scraper → parser → repo → cache on cache miss', async () => {
      // Cache miss
      mockRedisGet.mockResolvedValueOnce(null);

      // Scraper returns results from both sources
      const linkedinResults = sampleScrapeResult('linkedin', 2);
      const naukriResults = sampleScrapeResult('naukri', 1);
      deps.orchestrator.orchestrate.mockResolvedValueOnce([
        linkedinResults,
        naukriResults,
      ]);

      // Parser returns a job listing for each raw job
      let callIndex = 0;
      deps.parser.parseRawJob.mockImplementation((raw, source) => {
        callIndex++;
        return sampleJobListing({
          id: `uuid-${callIndex}`,
          applyUrl: raw.applyUrl,
          source,
        });
      });

      // Repo returns upserted jobs
      deps.repository.upsertJobs.mockImplementation(async (jobs) => jobs);

      // Embedding service resolves
      deps.embeddingService.generateAndStoreEmbeddings.mockResolvedValueOnce(
        undefined,
      );

      // Redis SET succeeds
      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await service.discover(query);

      expect(result.success).toBe(true);
      expect(result.meta.cached).toBe(false);
      expect(result.meta.sources.linkedin).toBe(2);
      expect(result.meta.sources.naukri).toBe(1);

      // Pipeline was called
      expect(deps.orchestrator.orchestrate).toHaveBeenCalledWith(query);
      expect(deps.parser.parseRawJob).toHaveBeenCalledTimes(3); // 2 linkedin + 1 naukri
      expect(deps.repository.upsertJobs).toHaveBeenCalledTimes(1);

      // Cache was set
      expect(mockRedisSet).toHaveBeenCalledTimes(1);
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('job-discovery:'),
        expect.any(String),
        'EX',
        7200,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  describe('deduplication', () => {
    it('should deduplicate jobs by applyUrl', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      // Two results with the same applyUrl
      const result1 = sampleScrapeResult('linkedin', 1);
      const result2 = sampleScrapeResult('naukri', 1);
      // Make them have the same URL
      result2.jobs[0]!.applyUrl = result1.jobs[0]!.applyUrl;

      deps.orchestrator.orchestrate.mockResolvedValueOnce([result1, result2]);

      deps.parser.parseRawJob.mockImplementation((raw, source) =>
        sampleJobListing({ applyUrl: raw.applyUrl, source }),
      );

      deps.repository.upsertJobs.mockImplementation(async (jobs) => jobs);
      deps.embeddingService.generateAndStoreEmbeddings.mockResolvedValueOnce(undefined);
      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await service.discover(query);

      // Only 1 unique job should be upserted (deduped)
      expect(deps.repository.upsertJobs).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({})]),
      );
      const upsertedJobs = deps.repository.upsertJobs.mock.calls[0]![0];
      expect(upsertedJobs).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Partial failure (one scraper fails)
  // ---------------------------------------------------------------------------

  describe('partial failure', () => {
    it('should still process results when orchestrator returns partial data', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      // Orchestrator returns only linkedin results (naukri had errors)
      const linkedinResults = sampleScrapeResult('linkedin', 3);
      deps.orchestrator.orchestrate.mockResolvedValueOnce([linkedinResults]);

      deps.parser.parseRawJob.mockImplementation((raw, source) =>
        sampleJobListing({ applyUrl: raw.applyUrl, source }),
      );

      deps.repository.upsertJobs.mockImplementation(async (jobs) => jobs);
      deps.embeddingService.generateAndStoreEmbeddings.mockResolvedValueOnce(undefined);
      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await service.discover(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Total failure
  // ---------------------------------------------------------------------------

  describe('total failure', () => {
    it('should return success: false when the pipeline throws', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      deps.orchestrator.orchestrate.mockRejectedValueOnce(
        new Error('Network failure'),
      );

      const result = await service.discover(query);

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should return success: false when repository throws', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      deps.orchestrator.orchestrate.mockResolvedValueOnce([
        sampleScrapeResult('linkedin', 1),
      ]);
      deps.parser.parseRawJob.mockImplementation((raw, source) =>
        sampleJobListing({ applyUrl: raw.applyUrl, source }),
      );
      deps.repository.upsertJobs.mockRejectedValueOnce(
        new Error('DB connection failed'),
      );

      const result = await service.discover(query);

      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Cache key consistency
  // ---------------------------------------------------------------------------

  describe('cache key consistency', () => {
    it('should produce the same cache key regardless of property order', () => {
      const query1: JobSearchQuery = {
        role: 'Backend Developer',
        location: 'Remote',
      };
      const query2: JobSearchQuery = {
        location: 'Remote',
        role: 'Backend Developer',
      };

      const key1 = service.generateCacheKey(query1);
      const key2 = service.generateCacheKey(query2);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^job-discovery:[a-f0-9]{64}$/);
    });

    it('should produce different keys for different queries', () => {
      const q1: JobSearchQuery = { role: 'Frontend Developer' };
      const q2: JobSearchQuery = { role: 'Backend Developer' };

      expect(service.generateCacheKey(q1)).not.toBe(
        service.generateCacheKey(q2),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Embedding fire-and-forget
  // ---------------------------------------------------------------------------

  describe('embedding fire-and-forget', () => {
    it('should not block the response even if embedding fails', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      deps.orchestrator.orchestrate.mockResolvedValueOnce([
        sampleScrapeResult('linkedin', 1),
      ]);
      deps.parser.parseRawJob.mockImplementation((raw, source) =>
        sampleJobListing({ applyUrl: raw.applyUrl, source }),
      );
      deps.repository.upsertJobs.mockImplementation(async (jobs) => jobs);

      // Embedding rejects — should NOT cause discover() to fail
      deps.embeddingService.generateAndStoreEmbeddings.mockRejectedValueOnce(
        new Error('Gemini quota exceeded'),
      );

      mockRedisSet.mockResolvedValueOnce('OK');

      const result = await service.discover(query);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });
  });
});
