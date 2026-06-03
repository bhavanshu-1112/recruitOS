import type { Pool } from 'pg';
import type { StoredResumeAnalysis, ATSAnalysisResult } from '../types/resume.types.js';
import { getPool } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ResumeAnalysisRepository');

/**
 * Data-access layer for resume analysis records.
 * All queries use parameterized statements to prevent SQL injection.
 */
export class ResumeAnalysisRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  /**
   * Persist a new resume analysis result to the database.
   * Returns the full stored record including the generated UUID.
   */
  async save(analysis: {
    userId: string;
    jobListingId?: string;
    jobDescription: string;
    resumeFileName: string;
    result: ATSAnalysisResult;
  }): Promise<StoredResumeAnalysis> {
    const { userId, jobListingId, jobDescription, resumeFileName, result } = analysis;

    try {
      const queryResult = await this.pool.query(
        `INSERT INTO resume_analyses (
          user_id, job_listing_id, job_description, resume_file_name,
          overall_score, score_breakdown, reasoning,
          missing_keywords, bullet_rewrites, red_flags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          userId,
          jobListingId ?? null,
          jobDescription,
          resumeFileName,
          result.overallScore,
          JSON.stringify(result.scoreBreakdown),
          result.reasoning,
          JSON.stringify(result.missingKeywords),
          JSON.stringify(result.bulletRewrites),
          JSON.stringify(result.redFlags),
        ],
      );

      const saved = this.mapRowToAnalysis(queryResult.rows[0]);
      logger.info('Resume analysis saved', { id: saved.id, userId, score: result.overallScore });
      return saved;
    } catch (error) {
      logger.error('Failed to save resume analysis', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Query by user
  // ---------------------------------------------------------------------------

  /**
   * Retrieve all resume analyses for a specific user, newest first.
   *
   * @param userId - The user's UUID.
   * @param limit - Maximum number of records to return (default 20).
   */
  async findByUserId(userId: string, limit: number = 20): Promise<StoredResumeAnalysis[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM resume_analyses
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return result.rows.map((row: Record<string, unknown>) => this.mapRowToAnalysis(row));
    } catch (error) {
      logger.error(`Failed to find analyses for user ${userId}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Query by ID
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a single resume analysis by its UUID.
   */
  async findById(id: string): Promise<StoredResumeAnalysis | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM resume_analyses WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) {return null;}
      return this.mapRowToAnalysis(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to find analysis by id ${id}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Delete a resume analysis by its UUID.
   * Returns `true` if a row was deleted, `false` if not found.
   */
  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM resume_analyses WHERE id = $1',
        [id],
      );
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {
        logger.info(`Deleted resume analysis ${id}`);
      }
      return deleted;
    } catch (error) {
      logger.error(`Failed to delete analysis ${id}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Row mapping
  // ---------------------------------------------------------------------------

  /**
   * Convert a snake_case database row to a camelCase StoredResumeAnalysis.
   */
  private mapRowToAnalysis(row: Record<string, unknown>): StoredResumeAnalysis {
    const scoreBreakdown = typeof row.score_breakdown === 'string'
      ? JSON.parse(row.score_breakdown as string)
      : row.score_breakdown;

    const missingKeywords = typeof row.missing_keywords === 'string'
      ? JSON.parse(row.missing_keywords as string)
      : row.missing_keywords;

    const bulletRewrites = typeof row.bullet_rewrites === 'string'
      ? JSON.parse(row.bullet_rewrites as string)
      : row.bullet_rewrites;

    const redFlags = typeof row.red_flags === 'string'
      ? JSON.parse(row.red_flags as string)
      : row.red_flags;

    return {
      id: row.id as string,
      userId: row.user_id as string,
      jobListingId: (row.job_listing_id as string) ?? null,
      jobDescription: row.job_description as string,
      resumeFileName: row.resume_file_name as string,
      overallScore: Number(row.overall_score),
      result: {
        overallScore: Number(row.overall_score),
        scoreBreakdown,
        reasoning: row.reasoning as string,
        missingKeywords,
        bulletRewrites,
        redFlags,
      },
      createdAt: new Date(row.created_at as string),
    };
  }
}
