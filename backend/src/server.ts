import './config/index.js'; // Ensure env vars are loaded first
import app from './app.js';
import { initDatabase, closeDatabase } from './config/database.js';
import { initRedis, closeRedis } from './config/redis.js';
import config from './config/index.js';

const PORT = config.port;

async function start(): Promise<void> {
  // Initialize database (Neon / local Postgres)
  await initDatabase();

  // Initialize Redis (skip if not available in dev)
  try {
    await initRedis();
  } catch (err) {
    console.warn('[server] Redis not available — caching disabled.', (err as Error).message);
  }

  app.listen(PORT, () => {
    console.log(`[server] RecruiterOS backend listening on port ${PORT}`);
  });
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — shutting down gracefully...`);
  await closeRedis();
  await closeDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
