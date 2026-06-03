-- Migration 003: Create outreach_drafts table
-- Stores AI-generated cover letters and outreach messages

CREATE TABLE IF NOT EXISTS outreach_drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(255)     NOT NULL,
    resume_analysis_id UUID          NOT NULL REFERENCES resume_analyses(id) ON DELETE CASCADE,
    job_description TEXT             NOT NULL,

    -- Generated content (JSONB for flexible structured storage)
    cover_letter    JSONB            NOT NULL,
    outreach_message JSONB           NOT NULL,
    metadata        JSONB            NOT NULL DEFAULT '{}',

    -- Draft lifecycle
    status          VARCHAR(20)      NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'edited', 'finalized')),
    version         INTEGER          NOT NULL DEFAULT 1,

    -- Timestamps
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_outreach_drafts_user_id
    ON outreach_drafts(user_id);

CREATE INDEX IF NOT EXISTS idx_outreach_drafts_resume_analysis_id
    ON outreach_drafts(resume_analysis_id);

CREATE INDEX IF NOT EXISTS idx_outreach_drafts_status
    ON outreach_drafts(status);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_outreach_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outreach_drafts_updated_at
    BEFORE UPDATE ON outreach_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_outreach_drafts_updated_at();
