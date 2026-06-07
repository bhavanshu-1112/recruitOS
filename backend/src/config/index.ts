import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In production (Render), env vars are injected by the platform — no .env file needed.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: resolve(__dirname, '..', '..', '..', '.env') });
}

const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'recruiter_os',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/auth/google/callback',
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },

  gcs: {
    bucketName: process.env.GCS_BUCKET_NAME || '',
    projectId: process.env.GCS_PROJECT_ID || '',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  scraper: {
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    timeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS || '30000', 10),
    maxConcurrent: parseInt(process.env.SCRAPER_MAX_CONCURRENT || '3', 10),
    linkedInRateLimit: parseInt(process.env.LINKEDIN_RATE_LIMIT || '2', 10),
    naukriRateLimit: parseInt(process.env.NAUKRI_RATE_LIMIT || '5', 10),
    delayMinMs: parseInt(process.env.SCRAPER_DELAY_MIN_MS || '2000', 10),
    delayMaxMs: parseInt(process.env.SCRAPER_DELAY_MAX_MS || '5000', 10),
  },

  embedding: {
    model: process.env.EMBEDDING_MODEL || 'text-embedding-004',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  },

  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '7200', 10),
  },
} as const;

export default config;
