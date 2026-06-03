import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import type {
  OutreachGenerationRequest,
  OutreachGenerationResult,
  StoredOutreachDraft,
  GeneratedCoverLetter,
  GeneratedOutreach,
  OutreachMetadata,
} from '../types/outreach.types.js';
import type { StoredResumeAnalysis } from '../types/resume.types.js';
import { OutreachDraftRepository } from '../repositories/outreach-draft.repository.js';
import { ResumeAnalysisRepository } from '../repositories/resume-analysis.repository.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OutreachGeneratorService');

/** Gemini model — same as resume optimizer but with higher temperature for creative output. */
const GENERATION_MODEL = 'gemini-2.0-flash';

// ---------------------------------------------------------------------------
// Prompt template loading (cached)
// ---------------------------------------------------------------------------

let cachedPromptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) {return cachedPromptTemplate;}

  const candidates = [
    resolve(__dirname, 'prompts', 'outreach-generator-prompt.md'),
    resolve(__dirname, '..', '..', 'src', 'services', 'prompts', 'outreach-generator-prompt.md'),
  ];

  for (const promptPath of candidates) {
    try {
      cachedPromptTemplate = readFileSync(promptPath, 'utf-8');
      return cachedPromptTemplate;
    } catch {
      // Try next candidate
    }
  }

  logger.warn('Could not load outreach prompt template from disk, using inline fallback');
  cachedPromptTemplate = getInlineFallbackPrompt();
  return cachedPromptTemplate;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service for generating personalized cover letters and outreach messages
 * using Gemini AI, based on a previous resume analysis result.
 *
 * Pipeline: Fetch analysis → Build context → Build prompt → Call Gemini → Validate → Store
 *
 * @example
 * ```ts
 * const service = new OutreachGeneratorService();
 * const draft = await service.generate({
 *   resumeAnalysisId: 'analysis-uuid',
 *   userId: 'user-uuid',
 * });
 * console.log(draft.coverLetter.body);
 * console.log(draft.outreachMessage.body);
 * ```
 */
export class OutreachGeneratorService {
  private model;
  private draftRepository: OutreachDraftRepository;
  private analysisRepository: ResumeAnalysisRepository;

  constructor(
    draftRepository?: OutreachDraftRepository,
    analysisRepository?: ResumeAnalysisRepository,
  ) {
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = genAI.getGenerativeModel({
      model: GENERATION_MODEL,
      generationConfig: {
        temperature: 0.7, // Higher temperature for creative writing
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    });
    this.draftRepository = draftRepository ?? new OutreachDraftRepository();
    this.analysisRepository = analysisRepository ?? new ResumeAnalysisRepository();
  }

  // ---------------------------------------------------------------------------
  // Generate (initial)
  // ---------------------------------------------------------------------------

  /**
   * Generate a new cover letter and outreach message based on a resume analysis.
   *
   * 1. Fetches the referenced resume analysis from the DB
   * 2. Builds a Gemini prompt with analysis context
   * 3. Calls Gemini and validates the structured response
   * 4. Stores the draft in PostgreSQL
   *
   * @param request - Generation request with analysis ID and optional context.
   * @returns The stored draft record.
   * @throws {Error} If analysis not found or Gemini fails.
   */
  async generate(request: OutreachGenerationRequest): Promise<StoredOutreachDraft> {
    const startTime = Date.now();
    const { resumeAnalysisId, userId, additionalContext, recipientName, companyNotes } = request;

    logger.info('Starting outreach generation', { resumeAnalysisId, userId });

    // Step 1: Fetch the resume analysis
    const analysis = await this.analysisRepository.findById(resumeAnalysisId);
    if (!analysis) {
      throw new Error(`Resume analysis ${resumeAnalysisId} not found. Please complete an ATS analysis first.`);
    }

    // Step 2: Build prompt
    const prompt = this.buildPrompt(analysis, { additionalContext, recipientName, companyNotes });

    // Step 3: Call Gemini
    const generationResult = await this.callGemini(prompt);

    // Step 4: Store draft
    const stored = await this.draftRepository.save({
      userId,
      resumeAnalysisId,
      jobDescription: analysis.jobDescription,
      result: generationResult,
    });

    const duration = Date.now() - startTime;
    logger.info('Outreach generation completed', {
      id: stored.id,
      version: stored.version,
      durationMs: duration,
    });

    return stored;
  }

  // ---------------------------------------------------------------------------
  // Regenerate
  // ---------------------------------------------------------------------------

  /**
   * Regenerate an existing draft with fresh Gemini output.
   * Increments the version number.
   *
   * @param draftId - UUID of the draft to regenerate.
   * @returns Updated draft with new content and incremented version.
   */
  async regenerate(draftId: string): Promise<StoredOutreachDraft> {
    logger.info('Regenerating draft', { draftId });

    // Fetch existing draft to get the context
    const existingDraft = await this.draftRepository.findById(draftId);
    if (!existingDraft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    // Fetch the original analysis
    const analysis = await this.analysisRepository.findById(existingDraft.resumeAnalysisId);
    if (!analysis) {
      throw new Error(`Original resume analysis ${existingDraft.resumeAnalysisId} not found`);
    }

    // Rebuild prompt and call Gemini
    const prompt = this.buildPrompt(analysis);
    const generationResult = await this.callGemini(prompt);

    // Update the draft with new content + version++
    const updated = await this.draftRepository.saveRegeneration(draftId, generationResult);

    logger.info('Draft regenerated', { id: draftId, version: updated.version });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Prompt Construction
  // ---------------------------------------------------------------------------

  /**
   * Builds the full Gemini prompt by combining the system template
   * with the resume analysis context and optional user-provided details.
   */
  buildPrompt(
    analysis: StoredResumeAnalysis,
    extras?: {
      additionalContext?: string;
      recipientName?: string;
      companyNotes?: string;
    },
  ): string {
    const systemPrompt = loadPromptTemplate();

    // Extract key information from the analysis
    const matchedSkills = analysis.result.bulletRewrites
      .map(br => br.improvement)
      .join('; ');

    const missingSkills = analysis.result.missingKeywords
      .map(kw => kw.keyword)
      .join(', ');

    const strengthsSummary = analysis.result.reasoning;

    let contextBlock = `## Generation Context

### Job Description:
${analysis.jobDescription}

### Resume Analysis Summary:
- **ATS Score**: ${analysis.result.overallScore}/100
- **Candidate's Resume File**: ${analysis.resumeFileName}
- **Key Strengths**: ${strengthsSummary}
- **Matched Skill Areas**: ${matchedSkills || 'General alignment noted'}
- **Missing Keywords** (gaps to acknowledge if score < 50): ${missingSkills || 'None significant'}
- **Score Breakdown**:
  - Keyword Match: ${analysis.result.scoreBreakdown.keywordMatch}/25
  - Experience Alignment: ${analysis.result.scoreBreakdown.experienceAlignment}/25
  - Skill Relevance: ${analysis.result.scoreBreakdown.skillRelevance}/25
  - Formatting: ${analysis.result.scoreBreakdown.formatting}/25`;

    if (extras?.recipientName) {
      contextBlock += `\n\n### Recipient Name: ${extras.recipientName}`;
    }
    if (extras?.companyNotes) {
      contextBlock += `\n\n### Additional Company Notes:\n${extras.companyNotes}`;
    }
    if (extras?.additionalContext) {
      contextBlock += `\n\n### Additional Context from User:\n${extras.additionalContext}`;
    }

    return `${systemPrompt}

---

${contextBlock}

Generate the cover letter and outreach message now. Return ONLY valid JSON, no markdown fences.`;
  }

  // ---------------------------------------------------------------------------
  // Gemini API Call
  // ---------------------------------------------------------------------------

  /**
   * Sends the prompt to Gemini and returns the parsed result.
   */
  async callGemini(prompt: string): Promise<OutreachGenerationResult> {
    try {
      logger.debug('Calling Gemini API for outreach generation', { model: GENERATION_MODEL });

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const rawText = response.text();

      logger.debug('Gemini raw response received', { charCount: rawText.length });

      return this.parseGeminiResponse(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Gemini API call failed', { error: message });
      throw new Error(`Outreach generation failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Response Parsing & Validation
  // ---------------------------------------------------------------------------

  /**
   * Parses and validates the Gemini response into a structured OutreachGenerationResult.
   *
   * - Strips markdown code fences
   * - Validates all required fields
   * - Enforces word count limits (with warnings, not rejections)
   */
  parseGeminiResponse(rawText: string): OutreachGenerationResult {
    // Strip markdown code fences
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      logger.error('Failed to parse Gemini outreach response as JSON', {
        rawText: rawText.substring(0, 500),
      });
      throw new Error('Gemini returned invalid JSON. Please retry generation.');
    }

    const result = parsed as Record<string, unknown>;

    // Validate coverLetter
    if (!result.coverLetter || typeof result.coverLetter !== 'object') {
      throw new Error('Missing or invalid coverLetter object');
    }
    const cl = result.coverLetter as Record<string, unknown>;
    this.validateDocumentField(cl, 'coverLetter', 'subject');
    this.validateDocumentField(cl, 'coverLetter', 'body');

    // Validate outreachMessage
    if (!result.outreachMessage || typeof result.outreachMessage !== 'object') {
      throw new Error('Missing or invalid outreachMessage object');
    }
    const om = result.outreachMessage as Record<string, unknown>;
    this.validateDocumentField(om, 'outreachMessage', 'subject');
    this.validateDocumentField(om, 'outreachMessage', 'body');

    // Validate metadata
    if (!result.metadata || typeof result.metadata !== 'object') {
      throw new Error('Missing or invalid metadata object');
    }
    const meta = result.metadata as Record<string, unknown>;
    if (typeof meta.targetCompany !== 'string') {
      throw new Error('metadata.targetCompany must be a string');
    }
    if (typeof meta.targetRole !== 'string') {
      throw new Error('metadata.targetRole must be a string');
    }

    // Compute actual word counts (don't trust Gemini's count)
    const clBody = cl.body as string;
    const omBody = om.body as string;
    const clWordCount = clBody.split(/\s+/).filter(Boolean).length;
    const omWordCount = omBody.split(/\s+/).filter(Boolean).length;

    // Log word count warnings (don't reject — user can edit)
    if (clWordCount > 260) {
      logger.warn('Cover letter exceeds 260 word limit', { wordCount: clWordCount });
    }
    if (omWordCount > 90) {
      logger.warn('Outreach message exceeds 90 word limit', { wordCount: omWordCount });
    }

    const coverLetter: GeneratedCoverLetter = {
      subject: cl.subject as string,
      body: clBody,
      wordCount: clWordCount,
      personalizedElements: Array.isArray(cl.personalizedElements)
        ? (cl.personalizedElements as string[])
        : [],
    };

    const outreachMessage: GeneratedOutreach = {
      subject: om.subject as string,
      body: omBody,
      wordCount: omWordCount,
      personalizedElements: Array.isArray(om.personalizedElements)
        ? (om.personalizedElements as string[])
        : [],
    };

    const metadata: OutreachMetadata = {
      targetCompany: meta.targetCompany as string,
      targetRole: meta.targetRole as string,
      keySkillsHighlighted: Array.isArray(meta.keySkillsHighlighted)
        ? (meta.keySkillsHighlighted as string[])
        : [],
      toneNotes: typeof meta.toneNotes === 'string' ? (meta.toneNotes as string) : '',
    };

    return { coverLetter, outreachMessage, metadata };
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  private validateDocumentField(
    doc: Record<string, unknown>,
    docName: string,
    field: string,
  ): void {
    if (typeof doc[field] !== 'string' || !(doc[field] as string).trim()) {
      throw new Error(`${docName}.${field} must be a non-empty string`);
    }
  }
}

// ---------------------------------------------------------------------------
// Inline fallback prompt
// ---------------------------------------------------------------------------

function getInlineFallbackPrompt(): string {
  return `You are an expert career communications specialist. Generate a personalized cover letter (200-250 words, professional tone) and cold outreach message (60-80 words, casual-professional tone).

Return JSON:
{
  "coverLetter": { "subject": "<6-10 word subject>", "body": "<cover letter>", "wordCount": <number>, "personalizedElements": ["<details used>"] },
  "outreachMessage": { "subject": "<4-8 word subject>", "body": "<outreach message>", "wordCount": <number>, "personalizedElements": ["<details used>"] },
  "metadata": { "targetCompany": "<company>", "targetRole": "<role>", "keySkillsHighlighted": ["<skills>"], "toneNotes": "<tone choices>" }
}
Return ONLY valid JSON. No markdown fences.`;
}
