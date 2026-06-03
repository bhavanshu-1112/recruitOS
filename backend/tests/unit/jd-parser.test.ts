import { JDParser } from '../../src/services/jd-parser.js';
import type { RawScrapedJob } from '../../src/types/job.types.js';

const parser = new JDParser();

// =============================================================================
// Title normalisation
// =============================================================================

describe('JDParser.normalizeTitle', () => {
  it('should trim whitespace and collapse multiple spaces', () => {
    expect(parser.normalizeTitle('  Senior  Software   Engineer  ')).toBe(
      'Senior Software Engineer',
    );
  });

  it('should remove "- Apply Now" suffix', () => {
    expect(parser.normalizeTitle('Backend Developer - Apply Now')).toBe(
      'Backend Developer',
    );
  });

  it('should remove "(Hiring Urgently)" noise', () => {
    expect(
      parser.normalizeTitle('Frontend Engineer (Hiring Urgently)'),
    ).toBe('Frontend Engineer');
  });

  it('should remove "(Hiring)" noise', () => {
    expect(parser.normalizeTitle('Data Scientist (Hiring)')).toBe(
      'Data Scientist',
    );
  });

  it('should preserve legitimate parenthetical info like "(Remote)"', () => {
    expect(
      parser.normalizeTitle('Product Manager (Remote)'),
    ).toBe('Product Manager (Remote)');
  });

  it('should handle empty string', () => {
    expect(parser.normalizeTitle('')).toBe('');
  });

  it('should remove "(New)" tag', () => {
    expect(parser.normalizeTitle('DevOps Lead (New)')).toBe('DevOps Lead');
  });
});

// =============================================================================
// Company normalisation
// =============================================================================

describe('JDParser.normalizeCompany', () => {
  it('should trim and clean whitespace', () => {
    expect(parser.normalizeCompany('  Acme Corp  ')).toBe('Acme Corp');
  });

  it('should normalize "Pvt. Ltd." to "Pvt Ltd"', () => {
    expect(parser.normalizeCompany('Infosys Pvt. Ltd.')).toBe(
      'Infosys Pvt Ltd',
    );
  });

  it('should normalize "Inc." to "Inc"', () => {
    expect(parser.normalizeCompany('Google Inc.')).toBe('Google Inc');
  });

  it('should remove trailing dots', () => {
    expect(parser.normalizeCompany('Acme Corp.')).toBe('Acme Corp');
  });

  it('should normalize "Private Limited" to "Pvt Ltd"', () => {
    expect(parser.normalizeCompany('TCS Private Limited')).toBe(
      'TCS Pvt Ltd',
    );
  });

  it('should handle empty string', () => {
    expect(parser.normalizeCompany('')).toBe('');
  });
});

// =============================================================================
// Location normalisation
// =============================================================================

describe('JDParser.normalizeLocation', () => {
  it('should convert "Work from Home" to "Remote"', () => {
    expect(parser.normalizeLocation('Work from Home')).toBe('Remote');
  });

  it('should convert "WFH" to "Remote"', () => {
    expect(parser.normalizeLocation('WFH')).toBe('Remote');
  });

  it('should convert "Remote" (any case) to "Remote"', () => {
    expect(parser.normalizeLocation('remote')).toBe('Remote');
    expect(parser.normalizeLocation('REMOTE')).toBe('Remote');
  });

  it('should convert "Bangalore" to "Bengaluru"', () => {
    expect(parser.normalizeLocation('Bangalore')).toBe('Bengaluru');
    expect(parser.normalizeLocation('Bangalore, Karnataka')).toBe(
      'Bengaluru, Karnataka',
    );
  });

  it('should keep multi-location strings as-is', () => {
    expect(parser.normalizeLocation('Mumbai, Pune')).toBe('Mumbai, Pune');
  });

  it('should handle empty string', () => {
    expect(parser.normalizeLocation('')).toBe('');
  });

  it('should pass through normal locations', () => {
    expect(parser.normalizeLocation('Hyderabad, India')).toBe(
      'Hyderabad, India',
    );
  });
});

// =============================================================================
// Skills extraction
// =============================================================================

describe('JDParser.extractSkills', () => {
  it('should extract known skills from description text', () => {
    const text =
      'We need React, Node.js, and PostgreSQL experience for this role.';
    const skills = parser.extractSkills(text);
    expect(skills).toContain('React');
    expect(skills).toContain('Node.js');
    expect(skills).toContain('PostgreSQL');
  });

  it('should handle aliases: "JS" → "JavaScript"', () => {
    const text = 'Must know JS and TS very well.';
    const skills = parser.extractSkills(text);
    expect(skills).toContain('JavaScript');
    expect(skills).toContain('TypeScript');
  });

  it('should deduplicate skills', () => {
    const text = 'React React.js ReactJS — we need React developers.';
    const skills = parser.extractSkills(text);
    const reactCount = skills.filter((s) => s === 'React').length;
    expect(reactCount).toBe(1);
  });

  it('should return sorted array', () => {
    const text = 'Python, Docker, AWS, React, TypeScript';
    const skills = parser.extractSkills(text);
    const sorted = [...skills].sort();
    expect(skills).toEqual(sorted);
  });

  it('should return empty array for empty text', () => {
    expect(parser.extractSkills('')).toEqual([]);
  });

  it('should return empty array for text with no known skills', () => {
    expect(
      parser.extractSkills('Looking for a motivated team player'),
    ).toEqual([]);
  });

  it('should handle Kubernetes alias "k8s"', () => {
    const text = 'Experience with k8s and Docker required';
    const skills = parser.extractSkills(text);
    expect(skills).toContain('Kubernetes');
    expect(skills).toContain('Docker');
  });
});

// =============================================================================
// Salary parsing
// =============================================================================

describe('JDParser.parseSalary', () => {
  it('should parse "₹10L - ₹15L"', () => {
    const result = parser.parseSalary('₹10L - ₹15L');
    expect(result).toEqual({
      min: 1000000,
      max: 1500000,
      currency: 'INR',
    });
  });

  it('should parse "10-15 LPA"', () => {
    const result = parser.parseSalary('10-15 LPA');
    expect(result).toEqual({
      min: 1000000,
      max: 1500000,
      currency: 'INR',
    });
  });

  it('should parse "$120K - $150K"', () => {
    const result = parser.parseSalary('$120K - $150K');
    expect(result).toEqual({
      min: 120000,
      max: 150000,
      currency: 'USD',
    });
  });

  it('should parse "$120,000" (single value)', () => {
    const result = parser.parseSalary('$120,000');
    expect(result.min).toBe(120000);
    expect(result.currency).toBe('USD');
  });

  it('should parse "₹10,00,000 - ₹15,00,000"', () => {
    const result = parser.parseSalary('₹10,00,000 - ₹15,00,000');
    expect(result).toEqual({
      min: 1000000,
      max: 1500000,
      currency: 'INR',
    });
  });

  it('should return nulls for "Not disclosed"', () => {
    const result = parser.parseSalary('Not disclosed');
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
  });

  it('should return nulls for empty string', () => {
    const result = parser.parseSalary('');
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
    expect(result.currency).toBe('INR');
  });

  it('should detect EUR currency from € symbol', () => {
    const result = parser.parseSalary('€80K - €120K');
    expect(result.currency).toBe('EUR');
    expect(result.min).toBe(80000);
    expect(result.max).toBe(120000);
  });

  it('should parse single L value: "₹12L"', () => {
    const result = parser.parseSalary('₹12L');
    expect(result.min).toBe(1200000);
    expect(result.max).toBeNull();
    expect(result.currency).toBe('INR');
  });
});

// =============================================================================
// Posted date parsing
// =============================================================================

describe('JDParser.parsePostedDate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-26T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should parse "2 days ago"', () => {
    const result = parser.parsePostedDate('2 days ago');
    expect(result).toBeInstanceOf(Date);
    const expected = new Date('2026-05-24T00:00:00');
    expected.setHours(0, 0, 0, 0);
    expect(result!.getDate()).toBe(expected.getDate());
  });

  it('should parse "1 week ago"', () => {
    const result = parser.parsePostedDate('1 week ago');
    expect(result).toBeInstanceOf(Date);
    // 7 days before May 26 = May 19
    expect(result!.getDate()).toBe(19);
  });

  it('should parse "Just now" as today', () => {
    const result = parser.parsePostedDate('Just now');
    expect(result).toBeInstanceOf(Date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(result!.getTime()).toBe(today.getTime());
  });

  it('should parse "Today" as today', () => {
    const result = parser.parsePostedDate('Today');
    expect(result).toBeInstanceOf(Date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(result!.getTime()).toBe(today.getTime());
  });

  it('should parse ISO date string', () => {
    const result = parser.parsePostedDate('2025-06-15T00:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('should parse "DD/MM/YYYY" format', () => {
    const result = parser.parsePostedDate('15/06/2025');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(15);
    expect(result!.getMonth()).toBe(5); // June = 5
    expect(result!.getFullYear()).toBe(2025);
  });

  it('should return null for unparseable text', () => {
    expect(parser.parsePostedDate('some random text')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parser.parsePostedDate('')).toBeNull();
  });

  it('should parse "3 months ago"', () => {
    const result = parser.parsePostedDate('3 months ago');
    expect(result).toBeInstanceOf(Date);
    // 3 months before May = February
    expect(result!.getMonth()).toBe(1); // February = 1
  });
});

// =============================================================================
// Full parseRawJob integration
// =============================================================================

describe('JDParser.parseRawJob', () => {
  it('should parse a complete RawScrapedJob correctly', () => {
    const raw: RawScrapedJob = {
      title: 'Senior React Developer - Apply Now',
      company: 'Infosys Pvt. Ltd.',
      location: 'Bangalore',
      salaryText: '₹15L - ₹25L',
      postedDateText: '2 days ago',
      applyUrl: 'https://example.com/apply/123',
      descriptionHtml: '<p>We need React and Node.js</p>',
      descriptionText: 'We need React and Node.js experience.',
    };

    const result = parser.parseRawJob(raw, 'linkedin');

    expect(result.title).toBe('Senior React Developer');
    expect(result.company).toBe('Infosys Pvt Ltd');
    expect(result.location).toBe('Bengaluru');
    expect(result.salaryMin).toBe(1500000);
    expect(result.salaryMax).toBe(2500000);
    expect(result.salaryCurrency).toBe('INR');
    expect(result.skills).toContain('React');
    expect(result.skills).toContain('Node.js');
    expect(result.source).toBe('linkedin');
    expect(result.applyUrl).toBe('https://example.com/apply/123');
    expect(result.postedDate).toBeInstanceOf(Date);
  });

  it('should handle minimal / empty input gracefully', () => {
    const raw: RawScrapedJob = {
      title: '',
      company: '',
      location: '',
      salaryText: '',
      postedDateText: '',
      applyUrl: '',
      descriptionHtml: '',
      descriptionText: '',
    };

    const result = parser.parseRawJob(raw, 'naukri');

    expect(result.title).toBe('');
    expect(result.company).toBe('');
    expect(result.location).toBe('');
    expect(result.skills).toEqual([]);
    expect(result.salaryMin).toBeNull();
    expect(result.salaryMax).toBeNull();
    expect(result.salaryCurrency).toBe('INR');
    expect(result.postedDate).toBeNull();
    expect(result.source).toBe('naukri');
  });

  it('should set rawText from descriptionText', () => {
    const raw: RawScrapedJob = {
      title: 'Engineer',
      company: 'Acme',
      location: 'Remote',
      salaryText: '',
      postedDateText: '',
      applyUrl: 'https://example.com/apply/456',
      descriptionHtml: '<p>Build things</p>',
      descriptionText: 'Build things with Python and AWS.',
    };

    const result = parser.parseRawJob(raw, 'linkedin');
    expect(result.rawText).toBe('Build things with Python and AWS.');
    expect(result.skills).toContain('Python');
    expect(result.skills).toContain('AWS');
  });
});
