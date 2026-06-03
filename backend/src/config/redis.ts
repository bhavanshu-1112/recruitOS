import Redis from 'ioredis';
import config from './index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RedisClient');

let client: Redis | null = null;

/**
 * Returns the active Redis client instance.
 *
 * @throws {Error} If Redis has not been initialized via {@link initRedis}.
 * @returns The `ioredis` client instance.
 */
export function getRedisClient(): Redis {
  if (!client) {
    throw new Error(
      'Redis client has not been initialized. Call initRedis() first.',
    );
  }
  return client;
}

/**
 * Initializes the Redis client, attaches lifecycle event handlers,
 * and verifies connectivity with a PING command.
 *
 * This function is idempotent — calling it multiple times will reuse
 * the existing client if already initialized.
 *
 * @throws {Error} If the connection test (PING) fails.
 */
export async function initRedis(): Promise<void> {
  if (client) {
    logger.warn('Redis client already initialized, skipping');
    return;
  }

  const { host, port } = config.redis;

  client = new Redis({
    host,
    port,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5_000);
      logger.warn(`Redis reconnecting, attempt ${times}`, { delayMs: delay });
      return delay;
    },
    lazyConnect: true,
  });

  // Lifecycle event handlers
  client.on('connect', () => {
    logger.info('Redis connection established', { host, port });
  });

  client.on('ready', () => {
    logger.info('Redis client ready to accept commands');
  });

  client.on('error', (err: Error) => {
    logger.error('Redis client error', { error: err.message });
  });

  client.on('reconnecting', () => {
    logger.warn('Redis client reconnecting...');
  });

  client.on('close', () => {
    logger.debug('Redis connection closed');
  });

  // Connect and test
  try {
    await client.connect();
    const pong = await client.ping();
    logger.info('Redis connection verified', { response: pong });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to initialize Redis', { error: message });
    // Clean up on failure
    await client.quit().catch(() => {});
    client = null;
    throw new Error(`Redis initialization failed: ${message}`);
  }
}

/**
 * Gracefully shuts down the Redis client.
 * Sends a QUIT command and waits for pending replies before closing.
 *
 * Safe to call even if the client was never initialized (no-op in that case).
 */
export async function closeRedis(): Promise<void> {
  if (!client) {
    logger.debug('No Redis client to close');
    return;
  }

  try {
    await client.quit();
    logger.info('Redis client closed gracefully');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Error closing Redis client', { error: message });
  } finally {
    client = null;
  }
}
