/**
 * Type definitions for the Resume Optimizer + ATS Scorer feature.
 *
 * These types cover the full lifecycle: upload request → Gemini analysis →
 * stored result → API response.
 */

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/**
 * Internal request shape after multer processes the upload.
 */
export interface ResumeAnalysisRequest {
  /** Raw PDF file buffer */
  resumeBuffer: Buffer;
  /** Original uploaded filename */
  resumeFileName: string;
  /** Job description plain text to compare against */
  jobDescription: string;
  /** Optional link to a stored job listing */
  jobListingId?: string;
  /** Authenticated user's ID */
  userId: string;
}

// ---------------------------------------------------------------------------
// Gemini analysis result types
// ---------------------------------------------------------------------------

/**
 * Importance level for a missing keyword.
 * - `critical`: ATS will almost certainly reject without this keyword
 * - `high`: Strong negative signal if absent
 * - `medium`: Noticeable gap but not disqualifying
 * - `low`: Nice-to-have optimization
 */
export type KeywordImportance = 'critical' | 'high' | 'medium' | 'low';

/**
 * A keyword the ATS expects but the resume is missing.
 */
export interface MissingKeyword {
  /** The exact keyword or phrase */
  keyword: string;
  /** How important this keyword is for passing ATS filters */
  importance: KeywordImportance;
  /** Actionable suggestion on how/where to add it */
  suggestion: string;
}

/**
 * A suggested rewrite for an existing resume bullet point.
 */
export interface BulletRewrite {
  /** The original bullet point text from the resume */
  original: string;
  /** The improved version optimized for this JD */
  rewritten: string;
  /** Explanation of what was changed and why it improves the match */
  improvement: string;
}

/**
 * Red flag types that can be detected in a resume.
 */
export type RedFlagType =
  | 'gap'
  | 'seniority_mismatch'
  | 'skill_mismatch'
  | 'formatting'
  | 'other';

/**
 * A red flag detected during resume analysis.
 */
export interface RedFlag {
  /** Category of the red flag */
  type: RedFlagType;
  /** Description of the issue found */
  description: string;
  /** How serious this issue is */
  severity: 'high' | 'medium' | 'low';
  /** Actionable suggestion to fix this issue */
  suggestion: string;
}

/**
 * Breakdown of the overall ATS score into four weighted categories.
 * Each sub-score is 0–25, summing to the overall 0–100.
 */
export interface ScoreBreakdown {
  /** How well resume keywords match the JD (0–25) */
  keywordMatch: number;
  /** How well experience level/years align (0–25) */
  experienceAlignment: number;
  /** How relevant the listed skills are (0–25) */
  skillRelevance: number;
  /** Resume formatting and ATS-readability quality (0–25) */
  formatting: number;
}

/**
 * Complete ATS analysis result returned by Gemini.
 */
export interface ATSAnalysisResult {
  /** Overall resume-JD fit score (0–100) */
  overallScore: number;
  /** Breakdown into four scoring categories */
  scoreBreakdown: ScoreBreakdown;
  /** Human-readable reasoning for the score */
  reasoning: string;
  /** Keywords the ATS expects but the resume lacks */
  missingKeywords: MissingKeyword[];
  /** Suggested bullet point rewrites (3–5) */
  bulletRewrites: BulletRewrite[];
  /** Red flags detected in the resume */
  redFlags: RedFlag[];
}

// ---------------------------------------------------------------------------
// Stored / API response types
// ---------------------------------------------------------------------------

/**
 * A resume analysis record as stored in PostgreSQL.
 */
export interface StoredResumeAnalysis {
  /** UUID primary key */
  id: string;
  /** User who requested the analysis */
  userId: string;
  /** Optional linked job listing ID */
  jobListingId: string | null;
  /** The job description text used for comparison */
  jobDescription: string;
  /** Original uploaded PDF filename */
  resumeFileName: string;
  /** Overall ATS score (0–100) */
  overallScore: number;
  /** The full analysis result */
  result: ATSAnalysisResult;
  /** When the analysis was created */
  createdAt: Date;
}

/**
 * API response envelope for a resume analysis.
 */
export interface ResumeAnalysisResponse {
  success: boolean;
  data?: StoredResumeAnalysis;
  error?: string;
}

/**
 * API response for listing multiple analyses.
 */
export interface ResumeAnalysisListResponse {
  success: boolean;
  data: StoredResumeAnalysis[];
  meta: {
    total: number;
  };
}
