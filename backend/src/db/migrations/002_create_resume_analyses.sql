-- ============================================================
-- Migration 002: Create Resume Analyses table
-- Resume Optimizer + ATS Scorer — RecruiterOS
-- ============================================================

CREATE TABLE IF NOT EXISTS resume_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who requested this analysis
  user_id UUID NOT NULL,

  -- Optional FK to a stored job listing
  job_listing_id UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- The raw JD text used for comparison
  job_description TEXT NOT NULL,

  -- Original uploaded PDF filename
  resume_file_name VARCHAR(500) NOT NULL,

  -- Overall score and breakdown
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  score_breakdown JSONB NOT NULL,
  reasoning TEXT NOT NULL,

  -- Analysis detail arrays stored as JSONB
  missing_keywords JSONB NOT NULL DEFAULT '[]',
  bullet_rewrites JSONB NOT NULL DEFAULT '[]',
  red_flags JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_resume_analyses_user_id
  ON resume_analyses(user_id);

CREATE INDEX IF NOT EXISTS idx_resume_analyses_job_listing_id
  ON resume_analyses(job_listing_id);

CREATE INDEX IF NOT EXISTS idx_resume_analyses_created_at
  ON resume_analyses(created_at DESC);
