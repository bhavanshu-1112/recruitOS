import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import type { JobListing } from '../types/job.types.js';
import type { JobRepository } from '../repositories/job.repository.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('EmbeddingService');

/** Chunk size for batch embedding requests (API limit). */
const BATCH_CHUNK_SIZE = 100;

/** Default model version identifier for stored embeddings. */
const DEFAULT_MODEL_VERSION = 'text-embedding-004';

/**
 * Service for generating and storing vector embeddings via the
 * Google Generative AI (Gemini) embedding model.
 */
export class EmbeddingService {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = genAI.getGenerativeModel({ model: DEFAULT_MODEL_VERSION });
  }

  // ---------------------------------------------------------------------------
  // Single embedding
  // ---------------------------------------------------------------------------

  /**
   * Generate an embedding vector for a single piece of text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType: TaskType.RETRIEVAL_DOCUMENT,
      });
      return result.embedding.values;
    } catch (error) {
      logger.error('Failed to generate embedding', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Batch embeddings
  // ---------------------------------------------------------------------------

  /**
   * Generate embeddings for a batch of job listings.
   * Jobs are identified by `applyUrl` in the returned Map.
   * Processes in chunks of {@link BATCH_CHUNK_SIZE}.
   * Individual failures are logged and skipped — the batch continues.
   */
  async generateBatchEmbeddings(
    jobs: JobListing[],
  ): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    for (let i = 0; i < jobs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = jobs.slice(i, i + BATCH_CHUNK_SIZE);

      const promises = chunk.map(async (job) => {
        try {
          const text = this.buildJobText(job);
          const embedding = await this.generateEmbedding(text);
          results.set(job.applyUrl, embedding);
        } catch (error) {
          logger.warn(
            `Skipping embedding for job "${job.title}" (${job.applyUrl}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      await Promise.all(promises);
    }

    logger.info(
      `Generated ${results.size}/${jobs.length} embeddings successfully`,
    );
    return results;
  }

  // ---------------------------------------------------------------------------
  // Generate + Store
  // ---------------------------------------------------------------------------

  /**
   * Generate batch embeddings and persist them via the repository.
   */
  async generateAndStoreEmbeddings(
    jobs: JobListing[],
    repository: JobRepository,
  ): Promise<void> {
    const embeddings = await this.generateBatchEmbeddings(jobs);

    for (const job of jobs) {
      const embedding = embeddings.get(job.applyUrl);
      if (embedding && job.id) {
        try {
          await repository.saveEmbedding(job.id, embedding, DEFAULT_MODEL_VERSION);
        } catch (error) {
          logger.error(
            `Failed to store embedding for job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    logger.info(`Stored ${embeddings.size} embeddings`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a text representation of a job suitable for embedding.
   */
  private buildJobText(job: JobListing): string {
    return `${job.title} at ${job.company}. Location: ${job.location}. Skills: ${job.skills.join(', ')}. ${job.rawText}`;
  }
}
