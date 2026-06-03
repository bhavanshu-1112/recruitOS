import type { Pool } from 'pg';
import type {
  StoredOutreachDraft,
  OutreachGenerationResult,
  OutreachDraftUpdate,
  DraftStatus,
  GeneratedCoverLetter,
  GeneratedOutreach,
  OutreachMetadata,
} from '../types/outreach.types.js';
import { getPool } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OutreachDraftRepository');

/**
 * Data-access layer for outreach draft records.
 * All queries use parameterized statements.
 */
export class OutreachDraftRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  /**
   * Persist a new outreach draft to the database.
   */
  async save(draft: {
    userId: string;
    resumeAnalysisId: string;
    jobDescription: string;
    result: OutreachGenerationResult;
  }): Promise<StoredOutreachDraft> {
    const { userId, resumeAnalysisId, jobDescription, result } = draft;

    try {
      const queryResult = await this.pool.query(
        `INSERT INTO outreach_drafts (
          user_id, resume_analysis_id, job_description,
          cover_letter, outreach_message, metadata,
          status, version
        ) VALUES ($1, $2, $3, $4, $5, $6, 'draft', 1)
        RETURNING *`,
        [
          userId,
          resumeAnalysisId,
          jobDescription,
          JSON.stringify(result.coverLetter),
          JSON.stringify(result.outreachMessage),
          JSON.stringify(result.metadata),
        ],
      );

      const saved = this.mapRowToDraft(queryResult.rows[0]);
      logger.info('Outreach draft saved', { id: saved.id, userId });
      return saved;
    } catch (error) {
      logger.error('Failed to save outreach draft', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Save regeneration (new version)
  // ---------------------------------------------------------------------------

  /**
   * Update an existing draft with newly generated content, incrementing the version.
   */
  async saveRegeneration(
    draftId: string,
    result: OutreachGenerationResult,
  ): Promise<StoredOutreachDraft> {
    try {
      const queryResult = await this.pool.query(
        `UPDATE outreach_drafts
         SET cover_letter = $1,
             outreach_message = $2,
             metadata = $3,
             status = 'draft',
             version = version + 1
         WHERE id = $4
         RETURNING *`,
        [
          JSON.stringify(result.coverLetter),
          JSON.stringify(result.outreachMessage),
          JSON.stringify(result.metadata),
          draftId,
        ],
      );

      if (queryResult.rows.length === 0) {
        throw new Error(`Draft ${draftId} not found`);
      }

      const updated = this.mapRowToDraft(queryResult.rows[0]);
      logger.info('Draft regenerated', { id: draftId, version: updated.version });
      return updated;
    } catch (error) {
      logger.error(`Failed to regenerate draft ${draftId}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Update (user edits)
  // ---------------------------------------------------------------------------

  /**
   * Apply user inline edits to a draft.
   */
  async update(id: string, updates: OutreachDraftUpdate): Promise<StoredOutreachDraft> {
    try {
      // Build the current draft first
      const existing = await this.findById(id);
      if (!existing) {throw new Error(`Draft ${id} not found`);}

      const updatedCoverLetter: GeneratedCoverLetter = {
        ...existing.coverLetter,
        ...(updates.coverLetterBody !== undefined && {
          body: updates.coverLetterBody,
          wordCount: updates.coverLetterBody.split(/\s+/).filter(Boolean).length,
        }),
        ...(updates.coverLetterSubject !== undefined && {
          subject: updates.coverLetterSubject,
        }),
      };

      const updatedOutreach: GeneratedOutreach = {
        ...existing.outreachMessage,
        ...(updates.outreachMessageBody !== undefined && {
          body: updates.outreachMessageBody,
          wordCount: updates.outreachMessageBody.split(/\s+/).filter(Boolean).length,
        }),
        ...(updates.outreachMessageSubject !== undefined && {
          subject: updates.outreachMessageSubject,
        }),
      };

      const status = updates.status ?? 'edited';

      const queryResult = await this.pool.query(
        `UPDATE outreach_drafts
         SET cover_letter = $1,
             outreach_message = $2,
             status = $3
         WHERE id = $4
         RETURNING *`,
        [
          JSON.stringify(updatedCoverLetter),
          JSON.stringify(updatedOutreach),
          status,
          id,
        ],
      );

      const updated = this.mapRowToDraft(queryResult.rows[0]);
      logger.info('Draft updated', { id, status });
      return updated;
    } catch (error) {
      logger.error(`Failed to update draft ${id}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<StoredOutreachDraft | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM outreach_drafts WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) {return null;}
      return this.mapRowToDraft(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to find draft by id ${id}`, error);
      throw error;
    }
  }

  async findByUserId(userId: string, limit: number = 20): Promise<StoredOutreachDraft[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM outreach_drafts
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return result.rows.map((row: Record<string, unknown>) => this.mapRowToDraft(row));
    } catch (error) {
      logger.error(`Failed to find drafts for user ${userId}`, error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM outreach_drafts WHERE id = $1',
        [id],
      );
      const deleted = (result.rowCount ?? 0) > 0;
      if (deleted) {logger.info(`Deleted draft ${id}`);}
      return deleted;
    } catch (error) {
      logger.error(`Failed to delete draft ${id}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Row mapping
  // ---------------------------------------------------------------------------

  private mapRowToDraft(row: Record<string, unknown>): StoredOutreachDraft {
    const coverLetter = typeof row.cover_letter === 'string'
      ? JSON.parse(row.cover_letter as string) as GeneratedCoverLetter
      : row.cover_letter as GeneratedCoverLetter;

    const outreachMessage = typeof row.outreach_message === 'string'
      ? JSON.parse(row.outreach_message as string) as GeneratedOutreach
      : row.outreach_message as GeneratedOutreach;

    const metadata = typeof row.metadata === 'string'
      ? JSON.parse(row.metadata as string) as OutreachMetadata
      : row.metadata as OutreachMetadata;

    return {
      id: row.id as string,
      userId: row.user_id as string,
      resumeAnalysisId: row.resume_analysis_id as string,
      jobDescription: row.job_description as string,
      coverLetter,
      outreachMessage,
      metadata,
      status: row.status as DraftStatus,
      version: Number(row.version),
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
