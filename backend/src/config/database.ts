import pg from 'pg';
import pgvector from 'pgvector/pg';
import config from './index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('DatabasePool');

let pool: pg.Pool | null = null;

/**
 * Returns the active PostgreSQL connection pool.
 *
 * @throws {Error} If the database has not been initialized via {@link initDatabase}.
 * @returns The `pg.Pool` instance.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error(
      'Database pool has not been initialized. Call initDatabase() first.',
    );
  }
  return pool;
}

/**
 * Initializes the PostgreSQL connection pool, registers the pgvector
 * extension, and verifies connectivity with a test query.
 *
 * This function is idempotent — calling it multiple times will reuse
 * the existing pool if already initialized.
 *
 * @throws {Error} If the connection test fails.
 */
export async function initDatabase(): Promise<void> {
  if (pool) {
    logger.warn('Database pool already initialized, skipping');
    return;
  }

  const { host, port, name, user, password } = config.database;

  pool = new pg.Pool({
    host,
    port,
    database: name,
    user,
    password,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Log pool-level events
  pool.on('error', (err: Error) => {
    logger.error('Unexpected idle client error', { error: err.message });
  });

  pool.on('connect', () => {
    logger.debug('New client connected to pool');
  });

  pool.on('remove', () => {
    logger.debug('Client removed from pool');
  });

  // Register pgvector type handlers and verify the connection
  try {
    const client = await pool.connect();
    try {
      // Enable the vector extension if it doesn't exist
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      // Register pgvector types so vector columns are properly parsed
      await pgvector.registerTypes(client);
      logger.info('pgvector extension registered successfully');

      // Test connectivity
      const result = await client.query('SELECT NOW() AS current_time');
      logger.info('Database connection verified', {
        host,
        port,
        database: name,
        serverTime: result.rows[0]?.current_time,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to initialize database', { error: message });
    // Clean up the pool on failure
    await pool.end().catch(() => {});
    pool = null;
    throw new Error(`Database initialization failed: ${message}`);
  }
}

/**
 * Gracefully shuts down the PostgreSQL connection pool.
 * Waits for all active queries to complete before closing connections.
 *
 * Safe to call even if the pool was never initialized (no-op in that case).
 */
export async function closeDatabase(): Promise<void> {
  if (!pool) {
    logger.debug('No database pool to close');
    return;
  }

  try {
    await pool.end();
    logger.info('Database pool closed gracefully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error closing database pool', { error: message });
  } finally {
    pool = null;
  }
}
