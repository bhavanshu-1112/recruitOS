import { GoogleGenerativeAI } from '@google/generative-ai';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type {
  ResumeAnalysisRequest,
  ATSAnalysisResult,
  StoredResumeAnalysis,
  ScoreBreakdown,
} from '../types/resume.types.js';
import { ResumeAnalysisRepository } from '../repositories/resume-analysis.repository.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ResumeOptimizerService');

/** Maximum allowed PDF file size in bytes (5 MB). */
const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;

/** PDF magic bytes: every valid PDF starts with "%PDF". */
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

/** Gemini model used for resume analysis (generative, not embedding). */
const GENERATION_MODEL = 'gemini-2.0-flash';

/**
 * Loads the prompt template from the markdown file on disk.
 * Cached after first load to avoid repeated filesystem reads.
 */
let cachedPromptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) {return cachedPromptTemplate;}

  // In CJS, __dirname is the directory containing this compiled file.
  // Try the compiled location first (dist/services/prompts/), then the
  // source location (src/services/prompts/) for development.
  const candidates = [
    resolve(__dirname, 'prompts', 'resume-optimizer-prompt.md'),
    resolve(__dirname, '..', '..', 'src', 'services', 'prompts', 'resume-optimizer-prompt.md'),
  ];

  for (const promptPath of candidates) {
    try {
      cachedPromptTemplate = readFileSync(promptPath, 'utf-8');
      return cachedPromptTemplate;
    } catch {
      // Try next candidate
    }
  }

  logger.warn('Could not load prompt template from disk, using inline fallback');
  cachedPromptTemplate = getInlineFallbackPrompt();
  return cachedPromptTemplate;
}

/**
 * Service for analyzing resumes against job descriptions using Gemini AI.
 *
 * Pipeline: Validate PDF → Extract text → Build prompt → Call Gemini → Parse response → Store result
 *
 * @example
 * ```ts
 * const service = new ResumeOptimizerService();
 * const result = await service.analyze({
 *   resumeBuffer: pdfBuffer,
 *   resumeFileName: 'resume.pdf',
 *   jobDescription: 'We are looking for...',
 *   userId: 'user-uuid',
 * });
 * console.log(result.result.overallScore); // 0–100
 * ```
 */
export class ResumeOptimizerService {
  private model;
  private repository: ResumeAnalysisRepository;

  constructor(repository?: ResumeAnalysisRepository) {
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = genAI.getGenerativeModel({
      model: GENERATION_MODEL,
      generationConfig: {
        temperature: 0.3, // Low temperature for consistent, analytical output
        topP: 0.8,
        maxOutputTokens: 4096,
      },
    });
    this.repository = repository ?? new ResumeAnalysisRepository();
  }

  // ---------------------------------------------------------------------------
  // Public: Main entry point
  // ---------------------------------------------------------------------------

  /**
   * Analyze a resume against a job description.
   *
   * 1. Validates the PDF file (magic bytes + size)
   * 2. Extracts text using pdf-parse
   * 3. Sends resume text + JD to Gemini with a few-shot prompt
   * 4. Parses and validates the structured JSON response
   * 5. Stores the result in PostgreSQL
   *
   * @param request - The analysis request containing the PDF buffer, JD text, and user info.
   * @returns The stored analysis record including the generated UUID.
   * @throws {Error} If validation, extraction, or Gemini analysis fails.
   */
  async analyze(request: ResumeAnalysisRequest): Promise<StoredResumeAnalysis> {
    const startTime = Date.now();
    const { resumeBuffer, resumeFileName, jobDescription, jobListingId, userId } = request;

    logger.info('Starting resume analysis', { resumeFileName, userId });

    // Step 1: Validate PDF
    this.validatePdf(resumeBuffer, resumeFileName);

    // Step 2: Extract text from PDF
    const resumeText = await this.extractPdfText(resumeBuffer);
    if (!resumeText.trim()) {
      throw new Error('Could not extract any text from the PDF. The file may be scanned/image-based.');
    }
    logger.debug('PDF text extracted', { charCount: resumeText.length });

    // Step 3: Build prompt and call Gemini
    const prompt = this.buildPrompt(resumeText, jobDescription);
    const analysisResult = await this.callGemini(prompt);

    // Step 4: Store result
    const stored = await this.repository.save({
      userId,
      jobListingId,
      jobDescription,
      resumeFileName,
      result: analysisResult,
    });

    const duration = Date.now() - startTime;
    logger.info('Resume analysis completed', {
      id: stored.id,
      score: analysisResult.overallScore,
      durationMs: duration,
    });

    return stored;
  }

  // ---------------------------------------------------------------------------
  // PDF Validation
  // ---------------------------------------------------------------------------

  /**
   * Validates a PDF buffer:
   * - Checks that the buffer starts with the PDF magic bytes (%PDF)
   * - Ensures the file size does not exceed 5 MB
   *
   * @param buffer - The raw file buffer.
   * @param filename - The original filename (for error messages).
   * @throws {Error} If validation fails.
   */
  validatePdf(buffer: Buffer, filename: string): void {
    // Check magic bytes
    if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC_BYTES)) {
      throw new Error(
        `File "${filename}" is not a valid PDF. Expected PDF magic bytes (%PDF) at the start of the file.`,
      );
    }

    // Check file size
    if (buffer.length > MAX_PDF_SIZE_BYTES) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      throw new Error(
        `File "${filename}" is too large (${sizeMB} MB). Maximum allowed size is 5 MB.`,
      );
    }

    logger.debug('PDF validation passed', { filename, sizeBytes: buffer.length });
  }

  // ---------------------------------------------------------------------------
  // Text Extraction
  // ---------------------------------------------------------------------------

  /**
   * Extracts plain text from a PDF buffer using pdf-parse.
   *
   * @param buffer - The raw PDF file buffer.
   * @returns The extracted plain text content.
   * @throws {Error} If pdf-parse fails to process the file.
   */
  async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const data = await (pdfParse as unknown as (buf: Buffer) => Promise<{ text: string }>)(buffer);
      return data.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('PDF text extraction failed', { error: message });
      throw new Error(`Failed to extract text from PDF: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt Construction
  // ---------------------------------------------------------------------------

  /**
   * Builds the full Gemini prompt by combining the system template
   * with the user-provided resume text and job description.
   *
   * @param resumeText - Plain text extracted from the resume PDF.
   * @param jobDescription - The target job description text.
   * @returns The complete prompt string to send to Gemini.
   */
  buildPrompt(resumeText: string, jobDescription: string): string {
    const systemPrompt = loadPromptTemplate();

    return `${systemPrompt}

---

## Analyze This Resume

### Resume Text:
${resumeText}

### Job Description:
${jobDescription}

Provide your analysis as the specified JSON object. Remember: ONLY valid JSON, no markdown fences.`;
  }

  // ---------------------------------------------------------------------------
  // Gemini API Call
  // ---------------------------------------------------------------------------

  /**
   * Sends the prompt to the Gemini generative model and parses the
   * structured JSON response.
   *
   * @param prompt - The full prompt including system template + resume + JD.
   * @returns Parsed and validated ATSAnalysisResult.
   * @throws {Error} If the API call fails or the response is not valid JSON.
   */
  async callGemini(prompt: string): Promise<ATSAnalysisResult> {
    try {
      logger.debug('Calling Gemini API', { model: GENERATION_MODEL });

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const rawText = response.text();

      logger.debug('Gemini raw response received', { charCount: rawText.length });

      return this.parseGeminiResponse(rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Gemini API call failed', { error: message });
      throw new Error(`Gemini analysis failed: ${message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Response Parsing & Validation
  // ---------------------------------------------------------------------------

  /**
   * Parses the raw Gemini text response into a validated ATSAnalysisResult.
   *
   * Handles common Gemini output quirks:
   * - Strips markdown code fences (```json ... ```)
   * - Trims whitespace
   * - Validates all required fields and types
   *
   * @param rawText - Raw text from Gemini's response.
   * @returns A validated ATSAnalysisResult object.
   * @throws {Error} If the response cannot be parsed or is missing required fields.
   */
  parseGeminiResponse(rawText: string): ATSAnalysisResult {
    // Strip markdown code fences if Gemini wrapped the JSON
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
      logger.error('Failed to parse Gemini response as JSON', { rawText: rawText.substring(0, 500) });
      throw new Error('Gemini returned invalid JSON. Please retry the analysis.');
    }

    // Validate structure
    const result = parsed as Record<string, unknown>;

    if (typeof result.overallScore !== 'number' || result.overallScore < 0 || result.overallScore > 100) {
      throw new Error(`Invalid overallScore: expected number 0–100, got ${result.overallScore}`);
    }

    if (!result.scoreBreakdown || typeof result.scoreBreakdown !== 'object') {
      throw new Error('Missing or invalid scoreBreakdown object');
    }

    const breakdown = result.scoreBreakdown as Record<string, unknown>;
    const requiredBreakdownKeys: (keyof ScoreBreakdown)[] = [
      'keywordMatch', 'experienceAlignment', 'skillRelevance', 'formatting',
    ];
    for (const key of requiredBreakdownKeys) {
      if (typeof breakdown[key] !== 'number') {
        throw new Error(`scoreBreakdown.${key} must be a number, got ${typeof breakdown[key]}`);
      }
    }

    if (typeof result.reasoning !== 'string') {
      throw new Error('reasoning must be a string');
    }

    if (!Array.isArray(result.missingKeywords)) {
      throw new Error('missingKeywords must be an array');
    }

    if (!Array.isArray(result.bulletRewrites)) {
      throw new Error('bulletRewrites must be an array');
    }

    if (!Array.isArray(result.redFlags)) {
      throw new Error('redFlags must be an array');
    }

    return {
      overallScore: result.overallScore as number,
      scoreBreakdown: result.scoreBreakdown as ScoreBreakdown,
      reasoning: result.reasoning as string,
      missingKeywords: result.missingKeywords as ATSAnalysisResult['missingKeywords'],
      bulletRewrites: result.bulletRewrites as ATSAnalysisResult['bulletRewrites'],
      redFlags: result.redFlags as ATSAnalysisResult['redFlags'],
    };
  }
}

// ---------------------------------------------------------------------------
// Inline fallback prompt (used only if the .md file is not found)
// ---------------------------------------------------------------------------

function getInlineFallbackPrompt(): string {
  return `You are an expert ATS (Applicant Tracking System) analyst. Analyze the resume against the job description and return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "scoreBreakdown": { "keywordMatch": <0-25>, "experienceAlignment": <0-25>, "skillRelevance": <0-25>, "formatting": <0-25> },
  "reasoning": "<summary>",
  "missingKeywords": [{ "keyword": "<word>", "importance": "critical|high|medium|low", "suggestion": "<how to add>" }],
  "bulletRewrites": [{ "original": "<original>", "rewritten": "<improved>", "improvement": "<why>" }],
  "redFlags": [{ "type": "gap|seniority_mismatch|skill_mismatch|formatting|other", "description": "<issue>", "severity": "high|medium|low", "suggestion": "<fix>" }]
}
Return ONLY valid JSON. No markdown fences.`;
}
