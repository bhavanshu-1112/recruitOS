import winston from 'winston';
import config from '../config/index.js';

const { combine, timestamp, label, errors, printf, colorize, json } = winston.format;

/**
 * Determines the default log level based on the current environment.
 * Uses the LOG_LEVEL env var if set, otherwise defaults to 'debug' in
 * development and 'info' in production.
 */
function getDefaultLevel(): string {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  return config.nodeEnv === 'production' ? 'info' : 'debug';
}

/**
 * Human-readable format for development environments.
 * Produces colorized output with timestamps, labels, and stack traces.
 */
const devFormat = (ctx: string) =>
  combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    label({ label: ctx }),
    errors({ stack: true }),
    printf(({ timestamp: ts, level, message, label: lbl, stack, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      const base = `${ts} [${lbl}] ${level}: ${message}${metaStr}`;
      return stack ? `${base}\n${stack}` : base;
    }),
  );

/**
 * Structured JSON format for production environments.
 * Optimized for log aggregation and machine parsing.
 */
const prodFormat = (ctx: string) =>
  combine(
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    label({ label: ctx }),
    errors({ stack: true }),
    json(),
  );

/**
 * Creates a Winston logger instance scoped to a specific context.
 *
 * The logger automatically selects the appropriate format based on the
 * current NODE_ENV: structured JSON in production, colorized human-readable
 * output in development.
 *
 * @param context - Descriptive label for this logger (e.g., 'DatabasePool', 'LinkedInScraper').
 * @returns A configured Winston Logger instance.
 *
 * @example
 * ```ts
 * const logger = createLogger('MyService');
 * logger.info('Service started', { port: 3000 });
 * logger.error('Connection failed', { host: 'db.example.com' });
 * ```
 */
export function createLogger(context: string): winston.Logger {
  const isProduction = config.nodeEnv === 'production';

  return winston.createLogger({
    level: getDefaultLevel(),
    defaultMeta: { service: context },
    format: isProduction ? prodFormat(context) : devFormat(context),
    transports: [
      new winston.transports.Console({
        handleExceptions: true,
        handleRejections: true,
      }),
    ],
    exitOnError: false,
  });
}

/**
 * Default application-wide logger instance.
 * Use this for general-purpose logging outside of specific service contexts.
 *
 * @example
 * ```ts
 * import logger from './utils/logger.js';
 * logger.info('Application starting');
 * ```
 */
const logger = createLogger('App');

export default logger;
