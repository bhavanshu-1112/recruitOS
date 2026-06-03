import { Router } from 'express';
import type { Request, Response } from 'express';
import { activityEmitter } from '../utils/activity-emitter.js';
import type { ActivityEvent } from '../utils/activity-emitter.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SSERoutes');
const router = Router();

// ---------------------------------------------------------------------------
// GET /activity — Server-Sent Events stream
// ---------------------------------------------------------------------------

/**
 * Establishes a long-lived SSE connection that pushes AI activity events
 * to the client in real time.
 *
 * **Protocol details**
 * - `Content-Type: text/event-stream`
 * - Each event is a JSON-encoded {@link ActivityEvent} sent as `data: …\n\n`
 * - A `:ping` comment is sent every 15 s to keep the connection alive
 * - The stream emits a `welcome` event immediately on connect
 */
router.get('/activity', (req: Request, res: Response): void => {
  // ---- SSE headers --------------------------------------------------------
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  logger.info('SSE client connected', { ip: req.ip });

  // ---- Welcome event ------------------------------------------------------
  const welcome: ActivityEvent = {
    id: 'welcome',
    type: 'completed',
    message: 'Connected to AI activity stream',
    timestamp: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(welcome)}\n\n`);

  // ---- Forward activity events --------------------------------------------
  const onActivity = (event: ActivityEvent): void => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to write SSE event', { error: message });
    }
  };

  activityEmitter.on('activity', onActivity);

  // ---- Heartbeat ----------------------------------------------------------
  const heartbeat = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch {
      // Connection may already be closed — cleanup will happen via 'close'
    }
  }, 15_000);

  // ---- Cleanup on disconnect ----------------------------------------------
  req.on('close', () => {
    logger.info('SSE client disconnected', { ip: req.ip });
    activityEmitter.off('activity', onActivity);
    clearInterval(heartbeat);
  });
});

export default router;
