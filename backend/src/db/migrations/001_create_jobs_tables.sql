-- ============================================================
-- Migration 001: Create Jobs and Job Embeddings tables
-- Job Intelligence Engine — RecruiterOS
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- -----------------------------------------------------------
-- Jobs table: stores normalized job listings from all sources
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  company VARCHAR(300) NOT NULL,
  location VARCHAR(300) NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency VARCHAR(10) DEFAULT 'INR',
  posted_date TIMESTAMPTZ,
  apply_url TEXT NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Job embeddings table: stores vector embeddings for semantic search
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  model_version VARCHAR(50) DEFAULT 'text-embedding-004',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Indexes for efficient querying
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON jobs USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_embeddings_job_id ON job_embeddings(job_id);

-- IVFFlat index for vector similarity search.
-- Uncomment after loading initial data (requires sufficient rows for list estimation):
-- CREATE INDEX IF NOT EXISTS idx_job_embeddings_vector
--   ON job_embeddings USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- -----------------------------------------------------------
-- Trigger: auto-update `updated_at` on row modification
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
