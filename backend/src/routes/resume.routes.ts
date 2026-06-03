import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';

import { ResumeOptimizerService } from '../services/resume-optimizer.service.js';
import { ResumeAnalysisRepository } from '../repositories/resume-analysis.repository.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ResumeRoutes');
const router = Router();

// ---------------------------------------------------------------------------
// Multer configuration for PDF uploads
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

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
// POST /analyze — Upload PDF + JD, get ATS analysis
// ---------------------------------------------------------------------------

router.post(
  '/analyze',
  upload.single('resume'),
  [
    body('jobDescription')
      .isString()
      .trim()
      .isLength({ min: 50 })
      .withMessage('jobDescription is required and must be at least 50 characters'),
    body('jobListingId')
      .optional()
      .isUUID()
      .withMessage('jobListingId must be a valid UUID'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate file presence
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Resume PDF file is required. Upload using the "resume" form field.',
        });
        return;
      }

      // Extract userId from auth middleware (fallback to header for dev)
      const userId = (req as Request & { user?: { id: string } }).user?.id
        ?? req.headers['x-user-id'] as string
        ?? null;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required. Provide a valid user session or x-user-id header.',
        });
        return;
      }

      const service = new ResumeOptimizerService();
      const result = await service.analyze({
        resumeBuffer: req.file.buffer,
        resumeFileName: req.file.originalname,
        jobDescription: req.body.jobDescription,
        jobListingId: req.body.jobListingId,
        userId,
      });

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('POST /analyze failed', { error: message });

      // Return descriptive errors for validation failures
      if (
        message.includes('not a valid PDF') ||
        message.includes('too large') ||
        message.includes('Could not extract')
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /analyses — List user's past analyses
// ---------------------------------------------------------------------------

router.get(
  '/analyses',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as Request & { user?: { id: string } }).user?.id
        ?? req.headers['x-user-id'] as string
        ?? null;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required.',
        });
        return;
      }

      const limitParam = typeof req.query.limit === 'string' ? req.query.limit : '20';
      const limit = parseInt(limitParam, 10);
      const repository = new ResumeAnalysisRepository();
      const analyses = await repository.findByUserId(userId, limit);

      res.json({
        success: true,
        data: analyses,
        meta: { total: analyses.length },
      });
    } catch (error) {
      logger.error('GET /analyses failed', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /analyses/:id — Get a specific analysis
// ---------------------------------------------------------------------------

router.get(
  '/analyses/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repository = new ResumeAnalysisRepository();
      const analysisId = req.params.id as string;
      const analysis = await repository.findById(analysisId);

      if (!analysis) {
        res.status(404).json({ success: false, error: 'Analysis not found' });
        return;
      }

      res.json({ success: true, data: analysis });
    } catch (error) {
      logger.error(`GET /analyses/:id failed for ${req.params.id}`, error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// Multer error handler middleware
// ---------------------------------------------------------------------------

router.use((err: Error, _req: Request, res: Response, _next: () => void) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File too large. Maximum allowed size is 5 MB.',
      });
      return;
    }
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  if (err.message === 'Only PDF files are allowed') {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  logger.error('Unhandled route error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export default router;
