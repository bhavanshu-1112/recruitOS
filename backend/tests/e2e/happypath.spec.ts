import { test, expect } from '@playwright/test';

test.describe('RecruiterOS Happy Path E2E Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // ── SSE Mock ───────────────────────────────────────────────────────────
    await page.route('/api/sse/activity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        body: 'data: {"id":"init","type":"completed","message":"Connected to AI stream","timestamp":"2026-06-03T17:00:00Z"}\n\n',
      });
    });

    // ── Stats Mock ──────────────────────────────────────────────────────────
    await page.route('/api/dashboard/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobsFound: 12, analyzed: 1, applied: 0, responseRate: 0 }),
      });
    });

    // ── Pipeline Mock ───────────────────────────────────────────────────────
    await page.route('/api/dashboard/pipeline', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ discover: 10, analyze: 1, optimize: 1, outreach: 0, applied: 0 }),
      });
    });

    // ── Jobs Mock ───────────────────────────────────────────────────────────
    await page.route('/api/dashboard/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'job-123',
            title: 'Full Stack Developer',
            company: 'Google',
            companyDomain: 'google.com',
            location: 'Mountain View, CA',
            atsScore: 0,
            pipelineStage: 'discover',
            lastAction: 'Discovered via Google Search',
            lastActionAt: new Date().toISOString(),
          },
        ]),
      });
    });

    // ── Discovery Mock ──────────────────────────────────────────────────────
    await page.route('/api/jobs/discover', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, count: 1 }),
      });
    });

    // ── Resume Analyses List Mock ──────────────────────────────────────────
    await page.route('/api/resume/analyses', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'analysis-123',
              resumeFileName: 'john-doe-resume.pdf',
              overallScore: 88,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // ── Resume Analysis Detail Mock ─────────────────────────────────────────
    await page.route('/api/resume/analyses/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'analysis-123',
            overallScore: 88,
            resumeFileName: 'john-doe-resume.pdf',
            result: {
              overallScore: 88,
              scoreBreakdown: { keywordMatch: 85, experienceAlignment: 90, skillRelevance: 85, formatting: 92 },
              reasoning: 'Good match on Node.js and SQL.',
              missingKeywords: [{ keyword: 'Docker', importance: 'high', suggestion: 'Add Docker' }],
              bulletRewrites: [{ original: 'Wrote code.', rewritten: 'Optimized APIs.', improvement: 'Better action verbs.' }],
              redFlags: [],
            },
          },
        }),
      });
    });

    // ── Resume Analyze Submission Mock ──────────────────────────────────────
    await page.route('/api/resume/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'analysis-123',
            overallScore: 88,
            resumeFileName: 'john-doe-resume.pdf',
            result: {
              overallScore: 88,
              scoreBreakdown: { keywordMatch: 20, experienceAlignment: 22, skillRelevance: 21, formatting: 25 },
              reasoning: 'Good match on Node.js and SQL.',
              missingKeywords: [{ keyword: 'Docker', importance: 'high', suggestion: 'Add Docker' }],
              bulletRewrites: [{ original: 'Wrote code.', rewritten: 'Optimized APIs.', improvement: 'Better action verbs.' }],
              redFlags: [],
            },
          },
        }),
      });
    });

    // ── Outreach Generation Mock ────────────────────────────────────────────
    await page.route('/api/outreach/generate', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'draft-123',
            coverLetter: {
              subject: 'Application for Full Stack Developer - Google',
              body: 'Dear Recruiter,\n\nI am excited to apply for the Full Stack Developer position at Google. My experience with Node.js and PostgreSQL matches your requirements perfectly.',
              wordCount: 220,
              personalizedElements: ['Google', 'Node.js', 'PostgreSQL'],
            },
            outreachMessage: {
              subject: 'Full Stack Role @ Google',
              body: 'Hi Jane Smith, noticed Google is expanding its Cloud Run teams and hiring a Full Stack Developer. I have strong experience in Node.js and would love to chat!',
              wordCount: 75,
              personalizedElements: ['Google', 'Jane Smith', 'Cloud Run'],
            },
            metadata: {
              targetCompany: 'Google',
              targetRole: 'Full Stack Developer',
              keySkillsHighlighted: ['Node.js', 'PostgreSQL'],
              toneNotes: 'Professional cover letter and casual LinkedIn message',
            },
            version: 1,
          },
        }),
      });
    });
  });

  test('should execute full workflow journey successfully', async ({ page }) => {
    // 1. Visit dashboard
    await page.goto('/');
    await expect(page.locator('h1:has-text("AI Workflow Dashboard")')).toBeVisible({ timeout: 10000 });

    // 2. Click "Discover Jobs" and trigger scraping
    const discoverBtn = page.locator('button[aria-label="Launch Job Intelligence Engine"]');
    await expect(discoverBtn).toBeVisible();
    await discoverBtn.click();

    // Fill discovery form
    await page.fill('input#discover-role', 'Full Stack Developer');
    await page.fill('input#discover-location', 'Mountain View');
    await page.click('button[type="submit"]:has-text("Run Discovery")');

    // Check listing card appears
    await expect(page.locator('h3:has-text("Full Stack Developer")')).toBeVisible({ timeout: 5000 });

    // 3. Navigate to Resume Optimizer & Analyze Resume
    const resumeLink = page.locator('nav[aria-label="Main Navigation"] >> text=Resume Optimizer');
    await resumeLink.click();
    await expect(page.locator('h1:has-text("Resume ATS Optimizer")')).toBeVisible({ timeout: 5000 });

    // Setup input values
    await page.fill('textarea#jd-input', 'Must have strong experience in Node.js, React, SQL databases, and Cloud Run deployments.');

    // Upload mock file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#resume-upload-zone');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'mock-resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock PDF content'),
    });

    // Verify upload status change
    await expect(page.locator('text=mock-resume.pdf')).toBeVisible();

    // Trigger analysis
    await page.click('button:has-text("Analyze Resume")');

    // Verify score gauge renders
    await expect(page.locator('text=ATS Score')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.score-gauge__label >> text=88')).toBeVisible();

    // 4. Navigate to Outreach Builder & Generate Outreach
    const outreachLink = page.locator('nav[aria-label="Main Navigation"] >> text=Outreach Builder');
    await outreachLink.click();
    await expect(page.locator('h1:has-text("AI Outreach Generator")')).toBeVisible({ timeout: 5000 });

    // Choose the resume analysis in select dropdown
    const selectEl = page.locator('select#analysis-select');
    await selectEl.selectOption({ label: 'john-doe-resume.pdf — Score: 88/100' });

    // Fill notes
    await page.fill('input#recipient-name', 'Jane Smith');
    await page.fill('input#company-notes', 'Google is expanding its Cloud Run teams.');

    // Generate Outreach
    await page.click('button:has-text("Generate Outreach")');

    // Confirm resulting Cover Letter cards render
    await expect(page.locator('h3:has-text("Cover Letter")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Dear Recruiter')).toBeVisible();
    await expect(page.locator('.metadata-pill >> text=Jane Smith')).toBeVisible();
  });
});
