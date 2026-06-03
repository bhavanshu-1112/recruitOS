import { OutreachGeneratorService } from '../../src/services/outreach-generator.service';
import type { OutreachGenerationResult } from '../../src/types/outreach.types';
import type { StoredResumeAnalysis } from '../../src/types/resume.types';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Mock @google/generative-ai
const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Mock outreach draft repository
const mockSaveDraft = jest.fn();
const mockFindDraftById = jest.fn();
const mockSaveRegeneration = jest.fn();
jest.mock('../../src/repositories/outreach-draft.repository', () => ({
  OutreachDraftRepository: jest.fn().mockImplementation(() => ({
    save: mockSaveDraft,
    findById: mockFindDraftById,
    saveRegeneration: mockSaveRegeneration,
  })),
}));

// Mock resume analysis repository
const mockFindAnalysisById = jest.fn();
jest.mock('../../src/repositories/resume-analysis.repository', () => ({
  ResumeAnalysisRepository: jest.fn().mockImplementation(() => ({
    findById: mockFindAnalysisById,
  })),
}));

// Mock config
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

const mockAnalysis: StoredResumeAnalysis = {
  id: 'analysis-uuid-123',
  userId: 'user-123',
  jobListingId: null,
  jobDescription: 'Senior Backend Engineer at Acme Corp. Requires 5+ years of Node.js and TypeScript experience. Experience with PostgreSQL and Redis preferred.',
  resumeFileName: 'resume.pdf',
  overallScore: 78,
  result: {
    overallScore: 78,
    scoreBreakdown: {
      keywordMatch: 20,
      experienceAlignment: 22,
      skillRelevance: 21,
      formatting: 15,
    },
    reasoning: 'Strong match on core technologies. Minor gaps in cloud-native tooling.',
    missingKeywords: [
      { keyword: 'Docker', importance: 'high', suggestion: 'Add Docker to skills' },
      { keyword: 'CI/CD', importance: 'medium', suggestion: 'Mention CI/CD experience' },
    ],
    bulletRewrites: [
      {
        original: 'Built APIs',
        rewritten: 'Designed scalable RESTful APIs using Node.js/TypeScript',
        improvement: 'Added TypeScript keyword and scalability metric',
      },
    ],
    redFlags: [],
  },
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

const mockGeminiResult: OutreachGenerationResult = {
  coverLetter: {
    subject: 'Senior Backend Engineer — Node.js Expertise',
    body: 'Dear Acme Corp Engineering Team,\n\nYour commitment to building scalable backend systems caught my attention. With 6 years of Node.js and TypeScript experience, I bring the exact technical foundation your Senior Backend Engineer role requires. At my current company, I architected a microservices platform handling 10K requests per second on PostgreSQL, reducing query latency by 45%. I also led the migration to Redis-based caching that improved API response times by 3x. These experiences align directly with the infrastructure challenges Acme Corp faces. I would welcome a conversation about how my backend engineering experience could accelerate your platform development. Would a brief call next week work for your schedule?',
    wordCount: 105,
    personalizedElements: ['Acme Corp', 'scalable backend systems', 'PostgreSQL', 'Redis'],
  },
  outreachMessage: {
    subject: 'Quick note about the Backend role',
    body: 'Hi! I saw the Senior Backend Engineer opening at Acme Corp. I have 6 years building Node.js/TypeScript backends at scale, including a PostgreSQL-backed platform handling 10K rps. Would love to chat about the role — free for a quick call this week?',
    wordCount: 44,
    personalizedElements: ['Acme Corp', 'Senior Backend Engineer'],
  },
  metadata: {
    targetCompany: 'Acme Corp',
    targetRole: 'Senior Backend Engineer',
    keySkillsHighlighted: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis'],
    toneNotes: 'Professional confidence for cover letter, casual peer-level for outreach.',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OutreachGeneratorService', () => {
  let service: OutreachGeneratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OutreachGeneratorService();

    // Default mocks
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockGeminiResult),
      },
    });

    mockFindAnalysisById.mockResolvedValue(mockAnalysis);

    mockSaveDraft.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'draft-uuid-456',
      userId: input.userId,
      resumeAnalysisId: input.resumeAnalysisId,
      jobDescription: input.jobDescription,
      coverLetter: (input.result as OutreachGenerationResult).coverLetter,
      outreachMessage: (input.result as OutreachGenerationResult).outreachMessage,
      metadata: (input.result as OutreachGenerationResult).metadata,
      status: 'draft',
      version: 1,
      createdAt: new Date('2026-01-15T10:00:00Z'),
      updatedAt: new Date('2026-01-15T10:00:00Z'),
    }));

    mockFindDraftById.mockResolvedValue({
      id: 'draft-uuid-456',
      userId: 'user-123',
      resumeAnalysisId: 'analysis-uuid-123',
      jobDescription: mockAnalysis.jobDescription,
      coverLetter: mockGeminiResult.coverLetter,
      outreachMessage: mockGeminiResult.outreachMessage,
      metadata: mockGeminiResult.metadata,
      status: 'draft',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockSaveRegeneration.mockImplementation(async (_id: string, result: OutreachGenerationResult) => ({
      id: 'draft-uuid-456',
      userId: 'user-123',
      resumeAnalysisId: 'analysis-uuid-123',
      jobDescription: mockAnalysis.jobDescription,
      coverLetter: result.coverLetter,
      outreachMessage: result.outreachMessage,
      metadata: result.metadata,
      status: 'draft',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  // -------------------------------------------------------------------------
  // Prompt Construction
  // -------------------------------------------------------------------------

  describe('buildPrompt', () => {
    it('should include job description and analysis details in prompt', () => {
      const prompt = service.buildPrompt(mockAnalysis);
      expect(prompt).toContain('Senior Backend Engineer at Acme Corp');
      expect(prompt).toContain('78/100');
      expect(prompt).toContain('Docker');
      expect(prompt).toContain('CI/CD');
    });

    it('should include score breakdown', () => {
      const prompt = service.buildPrompt(mockAnalysis);
      expect(prompt).toContain('Keyword Match: 20/25');
      expect(prompt).toContain('Experience Alignment: 22/25');
    });

    it('should include recipient name when provided', () => {
      const prompt = service.buildPrompt(mockAnalysis, { recipientName: 'Jane Smith' });
      expect(prompt).toContain('Jane Smith');
    });

    it('should include company notes when provided', () => {
      const prompt = service.buildPrompt(mockAnalysis, {
        companyNotes: 'Recently raised Series B funding',
      });
      expect(prompt).toContain('Recently raised Series B funding');
    });

    it('should include additional context when provided', () => {
      const prompt = service.buildPrompt(mockAnalysis, {
        additionalContext: 'I am particularly excited about their open-source work',
      });
      expect(prompt).toContain('particularly excited about their open-source work');
    });
  });

  // -------------------------------------------------------------------------
  // Gemini Response Parsing
  // -------------------------------------------------------------------------

  describe('parseGeminiResponse', () => {
    it('should parse a valid JSON response', () => {
      const result = service.parseGeminiResponse(JSON.stringify(mockGeminiResult));
      expect(result.coverLetter.subject).toBe('Senior Backend Engineer — Node.js Expertise');
      expect(result.outreachMessage.subject).toBe('Quick note about the Backend role');
      expect(result.metadata.targetCompany).toBe('Acme Corp');
    });

    it('should strip markdown code fences', () => {
      const wrapped = '```json\n' + JSON.stringify(mockGeminiResult) + '\n```';
      const result = service.parseGeminiResponse(wrapped);
      expect(result.coverLetter.body).toBeTruthy();
    });

    it('should compute actual word counts', () => {
      const result = service.parseGeminiResponse(JSON.stringify(mockGeminiResult));
      // Word count should be computed, not taken from Gemini
      expect(typeof result.coverLetter.wordCount).toBe('number');
      expect(result.coverLetter.wordCount).toBeGreaterThan(0);
    });

    it('should throw on invalid JSON', () => {
      expect(() => service.parseGeminiResponse('not json'))
        .toThrow('invalid JSON');
    });

    it('should throw on missing coverLetter', () => {
      const invalid = { ...mockGeminiResult, coverLetter: undefined };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid)))
        .toThrow('Missing or invalid coverLetter');
    });

    it('should throw on missing outreachMessage', () => {
      const invalid = { ...mockGeminiResult, outreachMessage: null };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid)))
        .toThrow('Missing or invalid outreachMessage');
    });

    it('should throw on missing metadata', () => {
      const invalid = { ...mockGeminiResult, metadata: undefined };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid)))
        .toThrow('Missing or invalid metadata');
    });

    it('should throw on missing coverLetter.body', () => {
      const invalid = {
        ...mockGeminiResult,
        coverLetter: { ...mockGeminiResult.coverLetter, body: '' },
      };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid)))
        .toThrow('coverLetter.body must be a non-empty string');
    });

    it('should throw on missing metadata.targetCompany', () => {
      const invalid = {
        ...mockGeminiResult,
        metadata: { ...mockGeminiResult.metadata, targetCompany: 42 },
      };
      expect(() => service.parseGeminiResponse(JSON.stringify(invalid)))
        .toThrow('metadata.targetCompany must be a string');
    });
  });

  // -------------------------------------------------------------------------
  // Full Generation Pipeline
  // -------------------------------------------------------------------------

  describe('generate', () => {
    const validRequest = {
      resumeAnalysisId: 'analysis-uuid-123',
      userId: 'user-123',
    };

    it('should complete the full generation pipeline', async () => {
      const result = await service.generate(validRequest);

      expect(result.id).toBe('draft-uuid-456');
      expect(result.coverLetter.body).toBeTruthy();
      expect(result.outreachMessage.body).toBeTruthy();
      expect(result.status).toBe('draft');
      expect(result.version).toBe(1);

      expect(mockFindAnalysisById).toHaveBeenCalledWith('analysis-uuid-123');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockSaveDraft).toHaveBeenCalledTimes(1);
    });

    it('should pass optional context to prompt', async () => {
      await service.generate({
        ...validRequest,
        recipientName: 'Jane Smith',
        companyNotes: 'Series B startup',
        additionalContext: 'Open source focus',
      });

      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Jane Smith');
      expect(prompt).toContain('Series B startup');
      expect(prompt).toContain('Open source focus');
    });

    it('should throw when analysis not found', async () => {
      mockFindAnalysisById.mockResolvedValue(null);

      await expect(service.generate(validRequest))
        .rejects.toThrow('not found');
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(mockSaveDraft).not.toHaveBeenCalled();
    });

    it('should handle Gemini API errors', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Rate limited'));

      await expect(service.generate(validRequest))
        .rejects.toThrow('Outreach generation failed');
      expect(mockSaveDraft).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Regeneration
  // -------------------------------------------------------------------------

  describe('regenerate', () => {
    it('should regenerate a draft with incremented version', async () => {
      const result = await service.regenerate('draft-uuid-456');

      expect(result.version).toBe(2);
      expect(mockFindDraftById).toHaveBeenCalledWith('draft-uuid-456');
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockSaveRegeneration).toHaveBeenCalledWith(
        'draft-uuid-456',
        expect.objectContaining({
          coverLetter: expect.any(Object),
          outreachMessage: expect.any(Object),
        }),
      );
    });

    it('should throw when draft not found', async () => {
      mockFindDraftById.mockResolvedValue(null);

      await expect(service.regenerate('nonexistent-id'))
        .rejects.toThrow('not found');
    });

    it('should throw when original analysis is missing', async () => {
      mockFindAnalysisById.mockResolvedValue(null);

      await expect(service.regenerate('draft-uuid-456'))
        .rejects.toThrow('not found');
    });
  });
});
