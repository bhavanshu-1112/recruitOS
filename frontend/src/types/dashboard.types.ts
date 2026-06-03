/* ──────────────────────────────────────────────────────────────
   Dashboard domain types
   ────────────────────────────────────────────────────────────── */

/** Aggregate stats shown in the top stat-cards. */
export interface DashboardStats {
  jobsFound: number;
  analyzed: number;
  applied: number;
  responseRate: number; // 0–100 percentage
}

/** Per-stage counts for the pipeline visualisation. */
export interface PipelineCounts {
  discover: number;
  analyze: number;
  optimize: number;
  outreach: number;
  applied: number;
}

/** The five sequential stages a job moves through. */
export type PipelineStage =
  | 'discover'
  | 'analyze'
  | 'optimize'
  | 'outreach'
  | 'applied';

/** A single job card shown in the dashboard grid. */
export interface DashboardJob {
  id: string;
  title: string;
  company: string;
  companyDomain: string;
  location: string;
  atsScore: number; // 0–100
  pipelineStage: PipelineStage;
  lastAction: string;
  lastActionAt: string; // ISO-8601
}

/** Real-time event streamed via SSE. */
export type ActivityEventType =
  | 'analyzing'
  | 'scoring'
  | 'generating'
  | 'completed'
  | 'error';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  message: string;
  details?: string;
  timestamp: string; // ISO-8601
}
