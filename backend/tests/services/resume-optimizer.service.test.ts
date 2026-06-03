import { ResumeOptimizerService } from '../../src/services/resume-optimizer.service';
import type { ATSAnalysisResult } from '../../src/types/resume.types';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return jest.fn().mockResolvedValue({
    text: 'Senior Software Engineer with 5 years of experience in Node.js, TypeScript, React, and PostgreSQL. Led a team of 3 engineers to build a microservices platform on AWS.',
    numpages: 2,
    info: { Title: 'Resume' },
  });
});

// Mock @google/generative-ai
const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    })),
  };
});

// Mock the repository
const mockSave = jest.fn();
jest.mock('../../src/repositories/resume-analysis.repository', () => {
  return {
    ResumeAnalysisRepository: jest.fn().mockImplementation(() => ({
      save: mockSave,
    })),
  };
});

// Mock config — jest.mock is hoisted, so inline the mock value directly
jest.mock('../../src/config/index', () => ({
  gemini: { apiKey: 'test-api-key' },
  nodeEnv: 'test',
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid PDF buffer (starts with %PDF magic bytes) */
function createValidPdfBuffer(sizeBytes: number = 1024): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  buf.write('%PDF-1.4', 0);
  return buf;
}

/** A realistic mock Gemini response */
const mockAnalysisResult: ATSAnalysisResult = {
  overallScore: 78,
  scoreBreakdown: {
    keywordMatch: 20,
    experienceAlignment: 22,
    skillRelevance: 21,
    formatting: 15,
  },
  reasoning:
    'Strong match on core technologies. Experience level aligns well with the 5+ year requirement. Minor gaps in cloud-native tooling mentions.',
  missingKeywords: [
    {
      keyword: 'Docker',
      importance: 'high',
      suggestion: 'Add Docker to your skills section and mention containerization in experience bullets',
    },
    {
      keyword: 'CI/CD',
      importance: 'medium',
      suggestion: 'Include CI/CD pipeline experience in your DevOps or tools section',
    },
  ],
  bulletRewrites: [
    {
      original: 'Led a team of 3 engineers to build a microservices platform on AWS',
      rewritten:
        'Led a cross-functional team of 3 engineers to architect and deploy a containerized microservices platform on AWS, leveraging Docker and CI/CD pipelines for continuous deployment',
      improvement: 'Added Docker and CI/CD keywords to match JD requirements, included more specific technical details',
    },
    {
      original: 'Built REST APIs using Node.js',
      rewritten:
        'Designed and implemented scalable RESTful APIs using Node.js and TypeScript, serving 10K+ daily active users with 99.9% uptime',
      improvement: 'Added TypeScript keyword, quantified impact with user metrics and uptime',
    },
    {
      original: 'Managed PostgreSQL databases',
      rewritten:
        'Architected and optimized PostgreSQL database schemas supporting 50M+ records, implementing query optimization that reduced p95 latency by 60%',
      improvement: 'Added quantified metrics and optimization details that demonstrate depth of database expertise',
    },
  ],
  redFlags: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResumeOptimizerService', () => {
  let service: ResumeOptimizerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResumeOptimizerService();

    // Default mock: Gemini returns valid JSON
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockAnalysisResult),
      },
    });

    // Default mock: repository.save returns the analysis with an ID
    mockSave.mockImplementation(async (input: Record<string, unknown>) => ({
      id: '550e8400-e29b-41d4-a716-446655440000',
      userId: input.userId,
      jobListingId: input.jobListingId ?? null,
      jobDescription: input.jobDescription,
      resumeFileName: input.resumeFileName,
      overallScore: (input.result as ATSAnalysisResult).overallScore,
      result: input.result,
      createdAt: new Date('2026-01-15T10:00:00Z'),
    }));
  });

  // -------------------------------------------------------------------------
  // PDF Validation
  // -------------------------------------------------------------------------

  describe('validatePdf', () => {
    it('should accept a valid PDF buffer', () => {
      const buffer = createValidPdfBuffer();
      expect(() => service.validatePdf(buffer, 'resume.pdf')).not.toThrow();
    });

    it('should reject a non-PDF buffer (wrong magic bytes)', () => {
      const buffer = Buffer.from('This is not a PDF file');
      expect(() => service.validatePdf(buffer, 'fake.pdf')).toThrow(
        'not a valid PDF',
      );
    });

    it('should reject an empty buffer', () => {
      const buffer = Buffer.alloc(0);
      expect(() => service.validatePdf(buffer, 'empty.pdf')).toThrow(
        'not a valid PDF',
      );
    });

    it('should reject a buffer larger than 5 MB', () => {
      const buffer = createValidPdfBuffer(6 * 1024 * 1024);
      expect(() => service.validatePdf(buffer, 'huge.pdf')).toThrow(
        'too large',
      );
    });

    it('should accept a buffer exactly at 5 MB', () => {
      const buffer = createValidPdfBuffer(5 * 1024 * 1024);
      expect(() => service.validatePdf(buffer, 'big.pdf')).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Gemini Response Parsing
  // -------------------------------------------------------------------------

  describe('parseGeminiResponse', () => {
    it('should parse a valid JSON response', () => {
      const result = service.parseGeminiResponse(JSON.stringify(mockAnalysisResult));
      expect(result.overallScore).toBe(78);
      expect(result.scoreBreakdown.keywordMatch).toBe(20);
      expect(result.missingKeywords).toHaveLength(2);
      expect(result.bulletRewrites).toHaveLength(3);
      expect(result.redFlags).toHaveLength(0);
    });

    it('should strip markdown code fences from response', () => {
      const wrapped = '```json\n' + JSON.stringify(mockAnalysisResult) + '\n```';
      const result = service.parseGeminiResponse(wrapped);
      expect(result.overallScore).toBe(78);
    });

    it('should strip generic code fences from response', () => {
      const wrapped = '```\n' + JSON.stringify(mockAnalysisResult) + '\n```';
      const result = service.parseGeminiResponse(wrapped);
      expect(result.overallScore).toBe(78);
    });

    it('should throw on invalid JSON', () => {
      expect(() => service.parseGeminiResponse('not json at all')).toThrow(
        'invalid JSON',
      );
    });

    it('should throw on missing overallScore', () => {
      const invalid = { ...mockAnalysisResult, overallScore: undefined };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'Invalid overallScore',
      );
    });

    it('should throw on overallScore out of range', () => {
      const invalid = { ...mockAnalysisResult, overallScore: 150 };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'Invalid overallScore',
      );
    });

    it('should throw on missing scoreBreakdown', () => {
      const invalid = { ...mockAnalysisResult, scoreBreakdown: null };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'Missing or invalid scoreBreakdown',
      );
    });

    it('should throw on missing reasoning', () => {
      const invalid = { ...mockAnalysisResult, reasoning: 42 };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'reasoning must be a string',
      );
    });

    it('should throw on non-array missingKeywords', () => {
      const invalid = { ...mockAnalysisResult, missingKeywords: 'not an array' };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'missingKeywords must be an array',
      );
    });

    it('should throw on non-array bulletRewrites', () => {
      const invalid = { ...mockAnalysisResult, bulletRewrites: {} };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'bulletRewrites must be an array',
      );
    });

    it('should throw on non-array redFlags', () => {
      const invalid = { ...mockAnalysisResult, redFlags: 'oops' };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid))).toThrow(
        'redFlags must be an array',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Full Analysis Pipeline
  // -------------------------------------------------------------------------

  describe('analyze (full pipeline)', () => {
    const validRequest = {
      resumeBuffer: createValidPdfBuffer(),
      resumeFileName: 'resume.pdf',
      jobDescription: 'Senior Backend Engineer with 5+ years of Node.js experience...',
      userId: 'user-123',
    };

    it('should complete the full analysis pipeline successfully', async () => {
      const result = await service.analyze(validRequest);

      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.result.overallScore).toBe(78);
      expect(result.result.missingKeywords).toHaveLength(2);
      expect(result.result.bulletRewrites).toHaveLength(3);

      // Verify pdf-parse was called
      const pdfParse = jest.requireMock('pdf-parse');
      expect(pdfParse).toHaveBeenCalledWith(validRequest.resumeBuffer);

      // Verify Gemini was called
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);

      // Verify repository.save was called with correct data
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          resumeFileName: 'resume.pdf',
          result: expect.objectContaining({ overallScore: 78 }),
        }),
      );
    });

    it('should include jobListingId when provided', async () => {
      const requestWithJob = {
        ...validRequest,
        jobListingId: 'job-uuid-123',
      };

      await service.analyze(requestWithJob);

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          jobListingId: 'job-uuid-123',
        }),
      );
    });

    it('should reject invalid PDF files before calling Gemini', async () => {
      const badRequest = {
        ...validRequest,
        resumeBuffer: Buffer.from('not a pdf'),
      };

      await expect(service.analyze(badRequest)).rejects.toThrow('not a valid PDF');
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should handle Gemini API errors gracefully', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

      await expect(service.analyze(validRequest)).rejects.toThrow('Gemini analysis failed');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should handle Gemini returning malformed JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Here is your analysis: {invalid json}',
        },
      });

      await expect(service.analyze(validRequest)).rejects.toThrow('invalid JSON');
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should handle empty PDF text extraction', async () => {
      const pdfParse = jest.requireMock('pdf-parse');
      pdfParse.mockResolvedValueOnce({ text: '   ', numpages: 1, info: {} });

      await expect(service.analyze(validRequest)).rejects.toThrow(
        'Could not extract any text',
      );
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });
});
