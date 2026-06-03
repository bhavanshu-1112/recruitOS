import type { Request, Response } from 'express';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';

const app = express();

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Global Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(compression());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter);

// ---------------------------------------------------------------------------
// Health Checks
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
import jobRoutes from './routes/job.routes.js';
app.use('/api/jobs', jobRoutes);

import resumeRoutes from './routes/resume.routes.js';
app.use('/api/resume', resumeRoutes);

import outreachRoutes from './routes/outreach.routes.js';
app.use('/api/outreach', outreachRoutes);

import sseRoutes from './routes/sse.routes.js';
app.use('/api/sse', sseRoutes);

import dashboardRoutes from './routes/dashboard.routes.js';
app.use('/api/dashboard', dashboardRoutes);

export default app;

