import { Router } from 'express';
import type { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';

import { OutreachGeneratorService } from '../services/outreach-generator.service.js';
import { OutreachDraftRepository } from '../repositories/outreach-draft.repository.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OutreachRoutes');
const router = Router();

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

/**
 * Extracts the userId from auth middleware or dev header.
 */
function getUserId(req: Request): string | null {
  return (req as Request & { user?: { id: string } }).user?.id
    ?? (typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : null);
}

// ---------------------------------------------------------------------------
// POST /generate — Generate cover letter + outreach from analysis
// ---------------------------------------------------------------------------

router.post(
  '/generate',
  [
    body('resumeAnalysisId')
      .isUUID()
      .withMessage('resumeAnalysisId must be a valid UUID'),
    body('additionalContext')
      .optional()
      .isString()
      .trim()
      .escape()
      .isLength({ max: 2000 })
      .withMessage('additionalContext must be a string (max 2000 chars)'),
    body('recipientName')
      .optional()
      .isString()
      .trim()
      .escape()
      .isLength({ max: 200 })
      .withMessage('recipientName must be a string (max 200 chars)'),
    body('companyNotes')
      .optional()
      .isString()
      .trim()
      .escape()
      .isLength({ max: 2000 })
      .withMessage('companyNotes must be a string (max 2000 chars)'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }

      const service = new OutreachGeneratorService();
      const draft = await service.generate({
        resumeAnalysisId: req.body.resumeAnalysisId,
        userId,
        additionalContext: req.body.additionalContext,
        recipientName: req.body.recipientName,
        companyNotes: req.body.companyNotes,
      });

      res.status(201).json({ success: true, data: draft });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('POST /generate failed', { error: message });

      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/regenerate — Regenerate a draft with fresh AI output
// ---------------------------------------------------------------------------

router.post(
  '/:id/regenerate',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }

      const service = new OutreachGeneratorService();
      const draftId = req.params.id as string;
      const updated = await service.regenerate(draftId);

      res.json({ success: true, data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`POST /:id/regenerate failed`, { error: message });

      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /:id — Update draft (user inline edits)
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('id must be a valid UUID'),
    body('coverLetterBody')
      .optional()
      .isString()
      .withMessage('coverLetterBody must be a string'),
    body('coverLetterSubject')
      .optional()
      .isString()
      .withMessage('coverLetterSubject must be a string'),
    body('outreachMessageBody')
      .optional()
      .isString()
      .withMessage('outreachMessageBody must be a string'),
    body('outreachMessageSubject')
      .optional()
      .isString()
      .withMessage('outreachMessageSubject must be a string'),
    body('status')
      .optional()
      .isIn(['draft', 'edited', 'finalized'])
      .withMessage('status must be draft, edited, or finalized'),
  ],
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }

      const repository = new OutreachDraftRepository();
      const draftId = req.params.id as string;

      const updated = await repository.update(draftId, {
        coverLetterBody: req.body.coverLetterBody,
        coverLetterSubject: req.body.coverLetterSubject,
        outreachMessageBody: req.body.outreachMessageBody,
        outreachMessageSubject: req.body.outreachMessageSubject,
        status: req.body.status,
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`PUT /:id failed`, { error: message });

      if (message.includes('not found')) {
        res.status(404).json({ success: false, error: message });
        return;
      }

      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /drafts — List user's drafts
// ---------------------------------------------------------------------------

router.get(
  '/drafts',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required.' });
        return;
      }

      const limitParam = typeof req.query.limit === 'string' ? req.query.limit : '20';
      const limit = parseInt(limitParam, 10);
      const repository = new OutreachDraftRepository();
      const drafts = await repository.findByUserId(userId, limit);

      res.json({
        success: true,
        data: drafts,
        meta: { total: drafts.length },
      });
    } catch (error) {
      logger.error('GET /drafts failed', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /drafts/:id — Get a specific draft
// ---------------------------------------------------------------------------

router.get(
  '/drafts/:id',
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const repository = new OutreachDraftRepository();
      const draftId = req.params.id as string;
      const draft = await repository.findById(draftId);

      if (!draft) {
        res.status(404).json({ success: false, error: 'Draft not found' });
        return;
      }

      res.json({ success: true, data: draft });
    } catch (error) {
      logger.error(`GET /drafts/:id failed for ${req.params.id}`, error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);

export default router;
