import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPool } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DashboardRoutes');
const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parses a query-string value into a positive integer, falling back to
 * `fallback` when the value is missing or invalid.
 */
function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') {return fallback;}
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// GET /stats — Aggregate dashboard statistics
// ---------------------------------------------------------------------------

/**
 * Returns high-level counts used by the dashboard summary cards.
 *
 * Response shape:
 * ```json
 * { "jobsFound": 142, "analyzed": 38, "applied": 5, "responseRate": 12.5 }
 * ```
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    // Run all counts in parallel for speed
    const [jobsResult, analyzedResult, appliedResult] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM jobs'),
      pool.query<{ count: string }>(
        'SELECT COUNT(DISTINCT job_listing_id)::text AS count FROM resume_analyses',
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT ra.job_listing_id)::text AS count
         FROM outreach_drafts od
         JOIN resume_analyses ra ON ra.id = od.resume_analysis_id
         WHERE od.status = 'sent'`,
      ),
    ]);

    const jobsFound = parseInt(jobsResult.rows[0]?.count ?? '0', 10);
    const analyzed = parseInt(analyzedResult.rows[0]?.count ?? '0', 10);
    const applied = parseInt(appliedResult.rows[0]?.count ?? '0', 10);

    // Response rate = applied / analyzed (avoid division by zero)
    const responseRate = analyzed > 0
      ? Math.round((applied / analyzed) * 1000) / 10
      : 0;

    res.json({ jobsFound, analyzed, applied, responseRate });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('GET /stats failed', { error: message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /pipeline — Per-stage pipeline counts
// ---------------------------------------------------------------------------

/**
 * Returns the number of jobs at each pipeline stage.
 *
 * Stage derivation logic (highest-wins):
 * - **applied**  — outreach_drafts with status = 'sent'
 * - **outreach** — outreach_drafts exist (any status)
 * - **optimize** — resume_analyses exist with overall_score IS NOT NULL
 * - **analyze**  — resume_analyses exist
 * - **discover** — job exists but none of the above
 *
 * Response shape:
 * ```json
 * { "discover": 100, "analyze": 25, "optimize": 18, "outreach": 10, "applied": 3 }
 * ```
 */
router.get('/pipeline', async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    const { rows } = await pool.query<{ stage: string; count: string }>(`
      SELECT stage, COUNT(*)::text AS count
      FROM (
        SELECT j.id,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM outreach_drafts od
              JOIN resume_analyses ra2 ON ra2.id = od.resume_analysis_id
              WHERE ra2.job_listing_id = j.id AND od.status = 'sent'
            ) THEN 'applied'
            WHEN EXISTS (
              SELECT 1 FROM outreach_drafts od
              JOIN resume_analyses ra2 ON ra2.id = od.resume_analysis_id
              WHERE ra2.job_listing_id = j.id
            ) THEN 'outreach'
            WHEN EXISTS (
              SELECT 1 FROM resume_analyses ra
              WHERE ra.job_listing_id = j.id AND ra.overall_score IS NOT NULL
            ) THEN 'optimize'
            WHEN EXISTS (
              SELECT 1 FROM resume_analyses ra
              WHERE ra.job_listing_id = j.id
            ) THEN 'analyze'
            ELSE 'discover'
          END AS stage
        FROM jobs j
      ) AS staged
      GROUP BY stage
    `);

    // Ensure all stages are present, even when their count is 0
    const pipeline: Record<string, number> = {
      discover: 0,
      analyze: 0,
      optimize: 0,
      outreach: 0,
      applied: 0,
    };

    for (const row of rows) {
      if (row.stage in pipeline) {
        pipeline[row.stage] = parseInt(row.count, 10);
      }
    }

    res.json(pipeline);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('GET /pipeline failed', { error: message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /jobs — Paginated job cards with ATS score
// ---------------------------------------------------------------------------

/**
 * Returns paginated job cards enriched with the best ATS score and derived
 * pipeline stage.
 *
 * Query parameters:
 * - `stage`  — filter by pipeline stage (optional)
 * - `page`   — 1-based page number (default: 1)
 * - `limit`  — items per page (default: 20, max: 100)
 *
 * Response shape:
 * ```json
 * {
 *   "data": [ { "id", "title", "company", … } ],
 *   "meta": { "page": 1, "limit": 20, "total": 142 }
 * }
 * ```
 */
router.get('/jobs', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool();

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;
    const stageFilter = typeof req.query.stage === 'string' ? req.query.stage : null;

    // CTE that derives the pipeline stage and best ATS score per job
    const baseCTE = `
      WITH job_cards AS (
        SELECT
          j.id,
          j.title,
          j.company,
          COALESCE(j.location, 'Remote')          AS location,
          COALESCE(best_ra.ats_score, 0)           AS "atsScore",
          CASE
            WHEN best_ra.has_sent_outreach          THEN 'applied'
            WHEN best_ra.has_outreach               THEN 'outreach'
            WHEN best_ra.ats_score IS NOT NULL       THEN 'optimize'
            WHEN best_ra.analysis_id IS NOT NULL     THEN 'analyze'
            ELSE 'discover'
          END                                       AS "pipelineStage",
          COALESCE(best_ra.last_action, 'Discovered') AS "lastAction",
          COALESCE(best_ra.last_action_at, j.created_at) AS "lastActionAt"
        FROM jobs j
        LEFT JOIN LATERAL (
          SELECT
            ra.id                                    AS analysis_id,
            ra.overall_score                         AS ats_score,
            CASE WHEN od_any.id IS NOT NULL THEN true ELSE false END AS has_outreach,
            CASE WHEN od_sent.id IS NOT NULL THEN true ELSE false END AS has_sent_outreach,
            CASE
              WHEN od_sent.id IS NOT NULL THEN 'Applied'
              WHEN od_any.id  IS NOT NULL THEN 'Outreach drafted'
              WHEN ra.overall_score IS NOT NULL THEN 'ATS optimized'
              ELSE 'Analyzed'
            END                                     AS last_action,
            GREATEST(ra.created_at, od_any.updated_at) AS last_action_at
          FROM resume_analyses ra
          LEFT JOIN LATERAL (
            SELECT id, updated_at FROM outreach_drafts
            WHERE resume_analysis_id = ra.id
            ORDER BY updated_at DESC LIMIT 1
          ) od_any ON true
          LEFT JOIN LATERAL (
            SELECT id FROM outreach_drafts
            WHERE resume_analysis_id = ra.id AND status = 'sent'
            ORDER BY updated_at DESC LIMIT 1
          ) od_sent ON true
          WHERE ra.job_listing_id = j.id
          ORDER BY ra.overall_score DESC NULLS LAST
          LIMIT 1
        ) best_ra ON true
      )`;

    // Build WHERE clause dynamically based on stage filter
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (stageFilter) {
      params.push(stageFilter);
      conditions.push(`"pipelineStage" = $${params.length}`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Total count (for pagination metadata)
    const countQuery = `${baseCTE} SELECT COUNT(*)::text AS total FROM job_cards ${whereClause}`;
    const countResult = await pool.query<{ total: string }>(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Paginated data
    params.push(limit, offset);
    const dataQuery = `
      ${baseCTE}
      SELECT * FROM job_cards
      ${whereClause}
      ORDER BY "lastActionAt" DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const dataResult = await pool.query(dataQuery, params);

    res.json({
      data: dataResult.rows,
      meta: { page, limit, total },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('GET /jobs failed', { error: message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
