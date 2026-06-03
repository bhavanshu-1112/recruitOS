import type { Pool } from 'pg';
import type { JobListing, JobSearchQuery } from '../types/job.types.js';
import { getPool } from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JobRepository');

/**
 * Data-access layer for job listings and embeddings.
 * All queries use parameterized statements to prevent SQL injection.
 */
export class JobRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  // ---------------------------------------------------------------------------
  // Upsert
  // ---------------------------------------------------------------------------

  /**
   * Bulk upsert job listings. On conflict (apply_url), existing rows are
   * updated with the newer data. Returns the full rows including IDs.
   */
  async upsertJobs(jobs: JobListing[]): Promise<JobListing[]> {
    if (jobs.length === 0) {return [];}

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const upserted: JobListing[] = [];

      for (const job of jobs) {
        const result = await client.query(
          `INSERT INTO jobs (
            title, company, location, skills,
            salary_min, salary_max, salary_currency,
            posted_date, apply_url, source, raw_text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (apply_url) DO UPDATE SET
            title = EXCLUDED.title,
            company = EXCLUDED.company,
            location = EXCLUDED.location,
            skills = EXCLUDED.skills,
            salary_min = EXCLUDED.salary_min,
            salary_max = EXCLUDED.salary_max,
            salary_currency = EXCLUDED.salary_currency,
            posted_date = EXCLUDED.posted_date,
            source = EXCLUDED.source,
            raw_text = EXCLUDED.raw_text,
            updated_at = NOW()
          RETURNING *`,
          [
            job.title,
            job.company,
            job.location,
            job.skills,
            job.salaryMin,
            job.salaryMax,
            job.salaryCurrency,
            job.postedDate,
            job.applyUrl,
            job.source,
            job.rawText,
          ],
        );

        if (result.rows.length > 0) {
          upserted.push(this.mapRowToJobListing(result.rows[0]));
        }
      }

      await client.query('COMMIT');
      logger.info(`Upserted ${upserted.length} jobs`);
      return upserted;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to upsert jobs', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /**
   * Find jobs matching a structured search query.
   * Builds a dynamic WHERE clause based on provided fields.
   */
  async findByQuery(query: JobSearchQuery, limit = 50): Promise<JobListing[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Role / title search (case-insensitive ILIKE)
    if (query.role) {
      conditions.push(`title ILIKE $${paramIndex}`);
      params.push(`%${query.role}%`);
      paramIndex++;
    }

    // Location
    if (query.location) {
      conditions.push(`location ILIKE $${paramIndex}`);
      params.push(`%${query.location}%`);
      paramIndex++;
    }

    // Skills – PostgreSQL array overlap operator &&
    if (query.skills && query.skills.length > 0) {
      conditions.push(`skills && $${paramIndex}::text[]`);
      params.push(query.skills);
      paramIndex++;
    }

    // Salary range
    if (query.salaryRange?.min !== undefined) {
      conditions.push(`salary_max >= $${paramIndex}`);
      params.push(query.salaryRange.min);
      paramIndex++;
    }
    if (query.salaryRange?.max !== undefined) {
      conditions.push(`salary_min <= $${paramIndex}`);
      params.push(query.salaryRange.max);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);

    const sql = `
      SELECT * FROM jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;

    try {
      const result = await this.pool.query(sql, params);
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapRowToJobListing(row),
      );
    } catch (error) {
      logger.error('Failed to query jobs', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Find by ID
  // ---------------------------------------------------------------------------

  /**
   * Find a single job listing by its UUID.
   */
  async findById(id: string): Promise<JobListing | null> {
    try {
      const result = await this.pool.query('SELECT * FROM jobs WHERE id = $1', [
        id,
      ]);
      if (result.rows.length === 0) {return null;}
      return this.mapRowToJobListing(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to find job by id ${id}`, error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  /**
   * Store (or replace) the embedding vector for a given job.
   */
  async saveEmbedding(
    jobId: string,
    embedding: number[],
    modelVersion: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO job_embeddings (job_id, embedding, model_version)
         VALUES ($1, $2, $3)
         ON CONFLICT (job_id) DO UPDATE SET
           embedding = EXCLUDED.embedding,
           model_version = EXCLUDED.model_version,
           updated_at = NOW()`,
        [jobId, JSON.stringify(embedding), modelVersion],
      );
    } catch (error) {
      logger.error(`Failed to save embedding for job ${jobId}`, error);
      throw error;
    }
  }

  /**
   * Find the most similar jobs to a given embedding vector using
   * pgvector's cosine distance operator.
   */
  async findSimilarByEmbedding(
    embedding: number[],
    limit = 10,
  ): Promise<JobListing[]> {
    try {
      const result = await this.pool.query(
        `SELECT j.*
         FROM jobs j
         INNER JOIN job_embeddings je ON je.job_id = j.id
         ORDER BY je.embedding <=> $1
         LIMIT $2`,
        [JSON.stringify(embedding), limit],
      );
      return result.rows.map((row: Record<string, unknown>) =>
        this.mapRowToJobListing(row),
      );
    } catch (error) {
      logger.error('Failed to find similar jobs by embedding', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * Convert a snake_case database row to a camelCase JobListing.
   */
  private mapRowToJobListing(row: Record<string, unknown>): JobListing {
    return {
      id: row.id as string,
      title: row.title as string,
      company: row.company as string,
      location: row.location as string,
      skills: (row.skills as string[]) ?? [],
      salaryMin: (row.salary_min !== null && row.salary_min !== undefined) ? Number(row.salary_min) : null,
      salaryMax: (row.salary_max !== null && row.salary_max !== undefined) ? Number(row.salary_max) : null,
      salaryCurrency: (row.salary_currency as string) ?? 'INR',
      postedDate: row.posted_date ? new Date(row.posted_date as string) : null,
      applyUrl: row.apply_url as string,
      source: row.source as JobListing['source'],
      rawText: (row.raw_text as string) ?? '',
      createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : undefined,
    };
  }
}
