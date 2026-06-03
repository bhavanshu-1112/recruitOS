import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createLogger } from './logger.js';

const logger = createLogger('ActivityEmitter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The category of AI activity being performed. */
export type ActivityType =
  | 'analyzing'
  | 'scoring'
  | 'generating'
  | 'completed'
  | 'error';

/** Describes a single AI activity event broadcast to listeners. */
export interface ActivityEvent {
  /** Unique identifier for this event. */
  id: string;
  /** The category of activity. */
  type: ActivityType;
  /** Human-readable description of what happened. */
  message: string;
  /** Optional structured details about the event. */
  details?: Record<string, unknown>;
  /** ISO-8601 timestamp of when the event was created. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Singleton emitter
// ---------------------------------------------------------------------------

/**
 * Application-wide singleton EventEmitter for AI pipeline activity.
 *
 * Services emit events through this emitter and consumers (e.g. the SSE
 * route) subscribe to the `'activity'` event to forward them to clients.
 *
 * @example
 * ```ts
 * import { activityEmitter, emitActivity } from '../utils/activity-emitter.js';
 *
 * // Publishing
 * emitActivity('analyzing', 'Parsing job description …');
 *
 * // Subscribing
 * activityEmitter.on('activity', (event: ActivityEvent) => { ... });
 * ```
 */
class ActivityEmitterSingleton extends EventEmitter {
  constructor() {
    super();
    // Allow many SSE clients to subscribe without triggering warnings.
    this.setMaxListeners(100);
  }
}

/** The singleton instance. Import this when you need to subscribe to events. */
export const activityEmitter = new ActivityEmitterSingleton();

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that constructs an {@link ActivityEvent} and emits it
 * on the singleton {@link activityEmitter}.
 *
 * @param type    - The activity category.
 * @param message - A human-readable description.
 * @param details - Optional structured metadata.
 * @returns The emitted {@link ActivityEvent} (useful for testing / chaining).
 */
export function emitActivity(
  type: ActivityType,
  message: string,
  details?: Record<string, unknown>,
): ActivityEvent {
  const event: ActivityEvent = {
    id: randomUUID(),
    type,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  activityEmitter.emit('activity', event);
  logger.debug('Activity emitted', { type, message });

  return event;
}
