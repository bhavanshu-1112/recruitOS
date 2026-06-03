import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import type { JobSearchQuery } from '../types/job.types.js';
import { JobRepository } from '../repositories/job.repository.js';
import { JDParser } from '../services/jd-parser.js';
import { EmbeddingService } from '../services/embedding.service.js';
import {
  JobDiscoveryService,
  type ScrapingOrchestrator,
} from '../services/job-discovery.service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JobRoutes');
const router = Router();

// ---------------------------------------------------------------------------
// Validation middleware
// ---------------------------------------------------------------------------

const discoverValidation = [
  body('role')
    .isString()
    .trim()
    .escape()
    .isLength({ min: 2 })
    .withMessage('role is required and must be at least 2 characters'),
  body('location')
    .optional()
    .isString()
    .trim()
    .escape()
    .withMessage('location must be a string'),
  body('skills')
    .optional()
    .isArray()
    .withMessage('skills must be an array of strings'),
  body('skills.*')
    .optional()
    .isString()
    .trim()
    .escape()
    .withMessage('each skill must be a string'),
  body('salaryRange')
    .optional()
    .isObject()
    .withMessage('salaryRange must be an object'),
  body('salaryRange.min')
    .optional()
    .isNumeric()
    .withMessage('salaryRange.min must be a number'),
  body('salaryRange.max')
    .optional()
    .isNumeric()
    .withMessage('salaryRange.max must be a number'),
  body('salaryRange.currency')
    .optional()
    .isString()
    .withMessage('salaryRange.currency must be a string'),
];

/**
 * Returns a 400 response if express-validator found errors, or calls next().
 */
function handleValidationErrors(req: Request, res: Response, next: () => void): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /discover
// ---------------------------------------------------------------------------

router.post(
  '/discover',
  ...discoverValidation,
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const searchQuery: JobSearchQuery = {
        role: req.body.role,
        location: req.body.location,
        skills: req.body.skills,
        salaryRange: req.body.salaryRange,
      };

      const repository = new JobRepository();
      const parser = new JDParser();
      const embeddingService = new EmbeddingService();

      // The orchestrator is expected to be available; in a real app this would
      // be injected via a DI container. For now we dynamically import it.
      let orchestrator: ScrapingOrchestrator;
      try {
        const { ScrapingOrchestrator: Orch } = await import('../scrapers/scraping.orchestrator.js');
        const { createRateLimiter } = await import('../utils/rate-limiter.js');
        orchestrator = new Orch(createRateLimiter('linkedin'), createRateLimiter('naukri'));
      } catch {
        logger.warn('ScrapingOrchestrator not available — using stub');
        orchestrator = {
          orchestrate: () => Promise.resolve([]),
        };
      }

      const service = new JobDiscoveryService({
        repository,
        parser,
        embeddingService,
        orchestrator,
      });

      const result = await service.discover(searchQuery);
      const statusCode = result.success ? 200 : 500;
      res.status(statusCode).json(result);
    } catch (error) {
      logger.error('POST /discover failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /search?q=...
// ---------------------------------------------------------------------------

router.get(
  '/search',
  query('q')
    .isString()
    .trim()
    .isLength({ min: 1 })
    .withMessage('Query parameter q is required'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const embeddingService = new EmbeddingService();
      const repository = new JobRepository();

      const embedding = await embeddingService.generateEmbedding(q);
      const jobs = await repository.findSimilarByEmbedding(embedding, limit);

      res.json({ success: true, data: jobs, meta: { total: jobs.length } });
    } catch (error) {
      logger.error('GET /search failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:id
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repository = new JobRepository();
      const job = await repository.findById(req.params.id as string);

      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }

      res.json({ success: true, data: job });
    } catch (error) {
      logger.error(`GET /:id failed for ${req.params.id}`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  },
);

export default router;
