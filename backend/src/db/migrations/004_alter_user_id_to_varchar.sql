-- Migration 004: Alter user_id in resume_analyses to VARCHAR(255)
-- Resolves type conflict with mock user IDs (e.g. 'demo-user') used by the frontend

ALTER TABLE resume_analyses 
  ALTER COLUMN user_id TYPE VARCHAR(255) USING user_id::varchar(255);
