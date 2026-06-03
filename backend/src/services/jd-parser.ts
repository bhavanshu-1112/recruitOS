import type { RawScrapedJob, ScraperSource, JobListing } from '../types/job.types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('JDParser');

// ---------------------------------------------------------------------------
// Known skills list (50+ entries) — used for extraction
// ---------------------------------------------------------------------------

const _KNOWN_SKILLS: string[] = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust',
  'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'R', 'Dart', 'Perl',
  'React', 'Angular', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt.js',
  'Node.js', 'Express', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Spring Boot',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'SQLite',
  'DynamoDB', 'Cassandra', 'Neo4j',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible',
  'Jenkins', 'GitHub Actions', 'CI/CD',
  'GraphQL', 'REST', 'gRPC', 'WebSocket',
  'HTML', 'CSS', 'Sass', 'Tailwind CSS', 'Bootstrap',
  'Git', 'Linux', 'Nginx', 'Apache Kafka',
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn',
  'Figma', 'Jira', 'Agile', 'Scrum',
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
  'Blockchain', 'Solidity', 'Web3',
  'React Native', 'Flutter', 'Electron',
  'RabbitMQ', 'Celery', 'Spark',
  '.NET', 'ASP.NET', 'Entity Framework',
  'Power BI', 'Tableau',
  'OAuth', 'JWT',
];

/**
 * Aliases mapping informal / abbreviated names → canonical skill name.
 */
const SKILL_ALIASES: Record<string, string> = {
  'js': 'JavaScript',
  'javascript': 'JavaScript',
  'ts': 'TypeScript',
  'typescript': 'TypeScript',
  'node': 'Node.js',
  'nodejs': 'Node.js',
  'node.js': 'Node.js',
  'react.js': 'React',
  'reactjs': 'React',
  'react': 'React',
  'vue': 'Vue.js',
  'vuejs': 'Vue.js',
  'vue.js': 'Vue.js',
  'angular': 'Angular',
  'angularjs': 'Angular',
  'next': 'Next.js',
  'nextjs': 'Next.js',
  'next.js': 'Next.js',
  'nuxt': 'Nuxt.js',
  'nuxtjs': 'Nuxt.js',
  'nuxt.js': 'Nuxt.js',
  'express': 'Express',
  'expressjs': 'Express',
  'express.js': 'Express',
  'nestjs': 'NestJS',
  'nest.js': 'NestJS',
  'postgres': 'PostgreSQL',
  'postgresql': 'PostgreSQL',
  'pg': 'PostgreSQL',
  'mongo': 'MongoDB',
  'mongodb': 'MongoDB',
  'mysql': 'MySQL',
  'redis': 'Redis',
  'elasticsearch': 'Elasticsearch',
  'elastic': 'Elasticsearch',
  'docker': 'Docker',
  'kubernetes': 'Kubernetes',
  'k8s': 'Kubernetes',
  'aws': 'AWS',
  'azure': 'Azure',
  'gcp': 'GCP',
  'graphql': 'GraphQL',
  'rest': 'REST',
  'grpc': 'gRPC',
  'html': 'HTML',
  'css': 'CSS',
  'sass': 'Sass',
  'tailwind': 'Tailwind CSS',
  'tailwindcss': 'Tailwind CSS',
  'bootstrap': 'Bootstrap',
  'git': 'Git',
  'linux': 'Linux',
  'terraform': 'Terraform',
  'ansible': 'Ansible',
  'jenkins': 'Jenkins',
  'kafka': 'Apache Kafka',
  'rabbitmq': 'RabbitMQ',
  'python': 'Python',
  'java': 'Java',
  'c#': 'C#',
  'csharp': 'C#',
  'c++': 'C++',
  'cpp': 'C++',
  'go': 'Go',
  'golang': 'Go',
  'rust': 'Rust',
  'ruby': 'Ruby',
  'php': 'PHP',
  'swift': 'Swift',
  'kotlin': 'Kotlin',
  'scala': 'Scala',
  'dart': 'Dart',
  'flutter': 'Flutter',
  'react native': 'React Native',
  'fastapi': 'FastAPI',
  'django': 'Django',
  'flask': 'Flask',
  'spring boot': 'Spring Boot',
  'springboot': 'Spring Boot',
  'machine learning': 'Machine Learning',
  'ml': 'Machine Learning',
  'deep learning': 'Deep Learning',
  'dl': 'Deep Learning',
  'nlp': 'NLP',
  'computer vision': 'Computer Vision',
  'cv': 'Computer Vision',
  'tensorflow': 'TensorFlow',
  'pytorch': 'PyTorch',
  'pandas': 'Pandas',
  'numpy': 'NumPy',
  'scikit-learn': 'Scikit-learn',
  'sklearn': 'Scikit-learn',
  'blockchain': 'Blockchain',
  'solidity': 'Solidity',
  'web3': 'Web3',
  'figma': 'Figma',
  'jira': 'Jira',
  'agile': 'Agile',
  'scrum': 'Scrum',
  'power bi': 'Power BI',
  'powerbi': 'Power BI',
  'tableau': 'Tableau',
  '.net': '.NET',
  'dotnet': '.NET',
  'asp.net': 'ASP.NET',
  'jwt': 'JWT',
  'oauth': 'OAuth',
  'ci/cd': 'CI/CD',
  'cicd': 'CI/CD',
  'spark': 'Spark',
  'nginx': 'Nginx',
  'electron': 'Electron',
  'svelte': 'Svelte',
};

// Pre-build a sorted list of alias keys (longest first) so multi-word aliases
// are matched before their single-word sub-strings.
const SORTED_ALIAS_KEYS = Object.keys(SKILL_ALIASES).sort(
  (a, b) => b.length - a.length,
);

// ---------------------------------------------------------------------------
// Noise patterns to strip from titles
// ---------------------------------------------------------------------------

const TITLE_NOISE_PATTERNS: RegExp[] = [
  /\s*-\s*apply\s+now\s*/gi,
  /\s*\(hiring\s*(?:urgently)?\)\s*/gi,
  /\s*\(urgent(?:ly)?\)\s*/gi,
  /\s*\|\s*apply\s+now\s*/gi,
  /\s*-\s*hiring\s*(?:urgently)?\s*/gi,
  /\s*\(new\)\s*/gi,
  /\s*\(hot\)\s*/gi,
  /\s*\*+\s*/g,
];

// ---------------------------------------------------------------------------
// JDParser class
// ---------------------------------------------------------------------------

/**
 * Pure normalisation / parsing utilities for raw scraped job data.
 * All methods are stateless — no external side effects — making them
 * trivially testable.
 */
export class JDParser {
  /**
   * Parse a single RawScrapedJob into a normalized JobListing.
   */
  parseRawJob(raw: RawScrapedJob, source: ScraperSource): JobListing {
    try {
      const salary = this.parseSalary(raw.salaryText);

      return {
        title: this.normalizeTitle(raw.title),
        company: this.normalizeCompany(raw.company),
        location: this.normalizeLocation(raw.location),
        skills: this.extractSkills(raw.descriptionText),
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        postedDate: this.parsePostedDate(raw.postedDateText),
        applyUrl: raw.applyUrl?.trim() ?? '',
        source,
        rawText: raw.descriptionText?.trim() ?? '',
      };
    } catch (error) {
      logger.error('Failed to parse raw job', error);
      // Return a best-effort partial listing
      return {
        title: raw.title?.trim() ?? '',
        company: raw.company?.trim() ?? '',
        location: raw.location?.trim() ?? '',
        skills: [],
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: 'INR',
        postedDate: null,
        applyUrl: raw.applyUrl?.trim() ?? '',
        source,
        rawText: raw.descriptionText?.trim() ?? '',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Title
  // ---------------------------------------------------------------------------

  /**
   * Normalize a raw job title:
   * - Trim whitespace, collapse multiple spaces
   * - Remove common noise phrases ("- Apply Now", "(Hiring Urgently)" etc.)
   * - Preserve legitimate parenthetical info like "(Remote)"
   */
  normalizeTitle(raw: string): string {
    if (!raw) {return '';}

    let title = raw.trim();

    // Remove noise patterns
    for (const pattern of TITLE_NOISE_PATTERNS) {
      title = title.replace(pattern, ' ');
    }

    // Collapse multiple spaces
    title = title.replace(/\s{2,}/g, ' ').trim();

    return title;
  }

  // ---------------------------------------------------------------------------
  // Company
  // ---------------------------------------------------------------------------

  /**
   * Normalize a company name:
   * - Trim, remove trailing dots
   * - Normalize common suffixes (Pvt. Ltd. → Pvt Ltd, Inc. → Inc)
   */
  normalizeCompany(raw: string): string {
    if (!raw) {return '';}

    let company = raw.trim();

    // Remove trailing dots not part of an abbreviation
    company = company.replace(/\.+$/, '');

    // Normalize common suffixes
    company = company.replace(/\bPvt\.\s*Ltd\.?/gi, 'Pvt Ltd');
    company = company.replace(/\bPrivate\s+Limited\b/gi, 'Pvt Ltd');
    company = company.replace(/\bInc\.(?:\s|$)/gi, 'Inc ');
    company = company.replace(/\bLtd\.(?:\s|$)/gi, 'Ltd ');
    company = company.replace(/\bCorp\.(?:\s|$)/gi, 'Corp ');
    company = company.replace(/\bL\.?L\.?C\.?(?:\s|$)/gi, 'LLC ');

    // Collapse spaces and trim
    company = company.replace(/\s{2,}/g, ' ').trim();

    return company;
  }

  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------

  /**
   * Normalize a location string:
   * - "Work from Home" / "WFH" → "Remote"
   * - "Bangalore" → "Bengaluru"
   * - Multi-location strings kept as-is
   */
  normalizeLocation(raw: string): string {
    if (!raw) {return '';}

    let location = raw.trim();

    // Remote variants
    if (/^(work\s*from\s*home|wfh|remote\s*[-–—/]\s*work\s*from\s*home)$/i.test(location)) {
      return 'Remote';
    }
    if (/^remote$/i.test(location)) {
      return 'Remote';
    }

    // Bangalore → Bengaluru (handle as whole word)
    location = location.replace(/\bBangalore\b/gi, 'Bengaluru');

    // Collapse spaces
    location = location.replace(/\s{2,}/g, ' ').trim();

    return location;
  }

  // ---------------------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------------------

  /**
   * Extract technology skills from free-form text.
   * Uses a known-skills dictionary with alias resolution.
   * Returns a sorted, deduplicated array.
   */
  extractSkills(text: string): string[] {
    if (!text || text.trim().length === 0) {return [];}

    const lowerText = text.toLowerCase();
    const found = new Set<string>();

    for (const key of SORTED_ALIAS_KEYS) {
      // Build a word-boundary regex for the alias key
      // Escape regex-special characters in the key
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?:^|[\\s,;/()\\[\\]|•·–—.:-])${escaped}(?:$|[\\s,;/()\\[\\]|•·–—.:-])`, 'i');

      if (regex.test(lowerText)) {
        found.add(SKILL_ALIASES[key]!);
      }
    }

    return [...found].sort();
  }

  // ---------------------------------------------------------------------------
  // Salary
  // ---------------------------------------------------------------------------

  /**
   * Parse a raw salary string into structured min/max/currency.
   *
   * Supported formats:
   * - Indian: "₹10L - ₹15L", "₹10,00,000 - ₹15,00,000", "10-15 LPA"
   * - US:     "$120K - $150K", "$120,000"
   * - Plain:  "1000000 - 1500000"
   */
  parseSalary(raw: string): { min: number | null; max: number | null; currency: string } {
    const defaultResult = { min: null as number | null, max: null as number | null, currency: 'INR' };

    if (!raw || raw.trim().length === 0) {return defaultResult;}

    const text = raw.trim();

    // Detect currency
    let currency = 'INR';
    if (/₹|INR|inr|rupee/i.test(text)) {
      currency = 'INR';
    } else if (/\$|USD|usd|dollar/i.test(text)) {
      currency = 'USD';
    } else if (/€|EUR|eur|euro/i.test(text)) {
      currency = 'EUR';
    } else if (/£|GBP|gbp|pound/i.test(text)) {
      currency = 'GBP';
    }

    // Try "10-15 LPA" without L suffix (check BEFORE the L-suffix pattern
    // so that "10-15 LPA" isn't partially matched by the L-suffix regex)
    const lpaNoSuffix = /^(?:₹?\s*)([\d,.]+)\s*[-–—to]+\s*(?:₹?\s*)([\d,.]+)\s*(?:lpa|l\.?p\.?a\.?)$/i;
    const lpaNoSuffixMatch = text.match(lpaNoSuffix);
    if (lpaNoSuffixMatch) {
      const minVal = parseFloat(lpaNoSuffixMatch[1]!.replace(/,/g, '')) * 100000;
      const maxVal = parseFloat(lpaNoSuffixMatch[2]!.replace(/,/g, '')) * 100000;
      return { min: minVal, max: maxVal, currency };
    }

    // Try LPA pattern: "₹10L - ₹15L" or "10L-15L"
    const lpaPattern = /(?:₹?\s*)([\d,.]+)\s*(?:L|lakh|lac)\s*(?:[-–—to]+\s*₹?\s*([\d,.]+)\s*(?:L|lakh|lac))?\s*(?:per\s*annum|p\.?a\.?|lpa)?/i;
    const lpaMatch = text.match(lpaPattern);
    if (lpaMatch) {
      const minVal = parseFloat(lpaMatch[1]!.replace(/,/g, '')) * 100000;
      const maxVal = lpaMatch[2]
        ? parseFloat(lpaMatch[2].replace(/,/g, '')) * 100000
        : null;
      return { min: minVal, max: maxVal, currency };
    }

    // Try K pattern: "$120K - $150K", "€80K - €120K"
    const kPattern = /(?:[$€£₹]?\s*)([\d,.]+)\s*[Kk]\s*(?:[-–—to]+\s*[$€£₹]?\s*([\d,.]+)\s*[Kk])?/;
    const kMatch = text.match(kPattern);
    if (kMatch) {
      const minVal = parseFloat(kMatch[1]!.replace(/,/g, '')) * 1000;
      const maxVal = kMatch[2]
        ? parseFloat(kMatch[2].replace(/,/g, '')) * 1000
        : null;
      return { min: minVal, max: maxVal, currency };
    }

    // Try Indian comma format: "₹10,00,000 - ₹15,00,000"
    const indianCommaPattern = /(?:₹?\s*)([\d,]+)\s*(?:[-–—to]+\s*(?:₹?\s*)([\d,]+))?/;
    const indianCommaMatch = text.match(indianCommaPattern);
    if (indianCommaMatch) {
      const rawMin = indianCommaMatch[1]!.replace(/,/g, '');
      const parsedMin = parseFloat(rawMin);
      if (!isNaN(parsedMin) && parsedMin > 0) {
        const rawMax = indianCommaMatch[2]?.replace(/,/g, '');
        const parsedMax = rawMax ? parseFloat(rawMax) : null;
        return {
          min: parsedMin,
          max: parsedMax && !isNaN(parsedMax) ? parsedMax : null,
          currency,
        };
      }
    }

    return defaultResult;
  }

  // ---------------------------------------------------------------------------
  // Posted Date
  // ---------------------------------------------------------------------------

  /**
   * Parse a raw "posted date" string into a Date object.
   *
   * Supported formats:
   * - Relative: "Just now", "Today", "X days ago", "X weeks ago", "X months ago"
   * - ISO 8601: "2025-01-15T00:00:00Z"
   * - DD/MM/YYYY, MMM DD, YYYY
   */
  parsePostedDate(raw: string): Date | null {
    if (!raw || raw.trim().length === 0) {return null;}

    const text = raw.trim().toLowerCase();
    const now = new Date();

    // "just now" or "today" or "0 days ago"
    if (/^(just\s*now|today|0\s*days?\s*ago)$/i.test(text)) {
      return this.startOfDay(now);
    }

    // "yesterday"
    if (/^yesterday$/i.test(text)) {
      return this.startOfDay(new Date(now.getTime() - 86400000));
    }

    // "X days ago"
    const daysAgo = text.match(/^(\d+)\s*days?\s*ago$/i);
    if (daysAgo) {
      const days = parseInt(daysAgo[1]!, 10);
      return this.startOfDay(new Date(now.getTime() - days * 86400000));
    }

    // "X weeks ago"
    const weeksAgo = text.match(/^(\d+)\s*weeks?\s*ago$/i);
    if (weeksAgo) {
      const weeks = parseInt(weeksAgo[1]!, 10);
      return this.startOfDay(new Date(now.getTime() - weeks * 7 * 86400000));
    }

    // "X months ago"
    const monthsAgo = text.match(/^(\d+)\s*months?\s*ago$/i);
    if (monthsAgo) {
      const months = parseInt(monthsAgo[1]!, 10);
      const date = new Date(now);
      date.setMonth(date.getMonth() - months);
      return this.startOfDay(date);
    }

    // "X hours ago"
    const hoursAgo = text.match(/^(\d+)\s*hours?\s*ago$/i);
    if (hoursAgo) {
      const hours = parseInt(hoursAgo[1]!, 10);
      return new Date(now.getTime() - hours * 3600000);
    }

    // ISO 8601
    const isoDate = Date.parse(raw.trim());
    if (!isNaN(isoDate)) {
      return new Date(isoDate);
    }

    // DD/MM/YYYY
    const ddmmyyyy = raw.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1]!, 10);
      const month = parseInt(ddmmyyyy[2]!, 10) - 1;
      const year = parseInt(ddmmyyyy[3]!, 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {return date;}
    }

    // "MMM DD, YYYY" (e.g. "Jan 15, 2025")
    const mmmddyyyy = raw.trim().match(/^(\w{3,})\s+(\d{1,2}),?\s*(\d{4})$/);
    if (mmmddyyyy) {
      const date = new Date(`${mmmddyyyy[1]} ${mmmddyyyy[2]}, ${mmmddyyyy[3]}`);
      if (!isNaN(date.getTime())) {return date;}
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Return a Date set to midnight (start of day) in local timezone.
   */
  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
