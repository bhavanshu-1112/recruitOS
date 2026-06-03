import { test, expect } from '@playwright/test';

test.describe('RecruiterOS AI Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Server-Sent Events endpoint
    await page.route('/api/sse/activity', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: 'data: {"id":"welcome","type":"completed","message":"Connected to AI activity stream","timestamp":"2026-06-03T17:00:00Z"}\n\n',
      });
    });

    // Mock stats REST endpoint
    await page.route('/api/dashboard/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobsFound: 142,
          analyzed: 38,
          applied: 5,
          responseRate: 12.5,
        }),
      });
    });

    // Mock pipeline REST endpoint
    await page.route('/api/dashboard/pipeline', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          discover: 80,
          analyze: 30,
          optimize: 20,
          outreach: 7,
          applied: 5,
        }),
      });
    });

    // Mock jobs REST endpoint with query filters
    await page.route('/api/dashboard/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'job-1',
            title: 'Senior Node.js Engineer',
            company: 'Google',
            companyDomain: 'google.com',
            location: 'Bangalore',
            atsScore: 85,
            pipelineStage: 'optimize',
            lastAction: 'Scraped listing',
            lastActionAt: new Date().toISOString(),
          },
          {
            id: 'job-2',
            title: 'Frontend React Developer',
            company: 'Vercel',
            companyDomain: 'vercel.com',
            location: 'Remote',
            atsScore: 92,
            pipelineStage: 'outreach',
            lastAction: 'Generated cover letter',
            lastActionAt: new Date().toISOString(),
          },
        ]),
      });
    });

    // Navigate to the root URL
    await page.goto('/');
  });

  test('should load the dashboard and display the main heading', async ({ page }) => {
    // Check main heading
    const heading = page.locator('h1:has-text("AI Workflow Dashboard")');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('should display sidebar navigation and support navigation to placeholders', async ({ page }) => {
    // Verify sidebar logo
    await expect(page.locator('aside >> text=RecruiterOS')).toBeVisible();

    // Verify main nav links exist
    const dashboardLink = page.locator('nav[aria-label="Main Navigation"] >> text=Dashboard');
    const resumeLink = page.locator('nav[aria-label="Main Navigation"] >> text=Resume Optimizer');
    const outreachLink = page.locator('nav[aria-label="Main Navigation"] >> text=Outreach Builder');

    await expect(dashboardLink).toBeVisible();
    await expect(resumeLink).toBeVisible();
    await expect(outreachLink).toBeVisible();

    // Test navigating to Resume Optimizer
    await resumeLink.click();
    await expect(page.locator('h1:has-text("Resume ATS Optimizer")')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('/resume');

    // Test navigating back to Dashboard
    await dashboardLink.click();
    await expect(page.locator('h1:has-text("AI Workflow Dashboard")')).toBeVisible({ timeout: 5000 });
  });

  test('should display pipeline bar filters and stats cards with correct values', async ({ page }) => {
    // Check that pipeline stages are rendered
    await expect(page.locator('nav[aria-label="Pipeline stages"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Pipeline stages"] >> text=Discover')).toBeVisible();
    await expect(page.locator('nav[aria-label="Pipeline stages"] >> text=Analyze')).toBeVisible();

    // Verify stats cards are mounted and mock values match
    await expect(page.locator('text=Jobs Found')).toBeVisible();
    await expect(page.locator('text=142')).toBeVisible();
    await expect(page.locator('text=13%')).toBeVisible();
  });

  test('should open the Job Intelligence Discovery modal when clicking Discover Jobs', async ({ page }) => {
    const discoverBtn = page.locator('button[aria-label="Launch Job Intelligence Engine"]');
    await expect(discoverBtn).toBeVisible();
    await discoverBtn.click();

    // Verify modal overlay opens
    const modalTitle = page.locator('#modal-title:has-text("Job Intelligence Discovery")');
    await expect(modalTitle).toBeVisible();

    // Check form input fields exist
    await expect(page.locator('label:has-text("Target Role / Job Title")')).toBeVisible();
    await expect(page.locator('input#discover-role')).toBeVisible();

    // Click cancel to close
    const cancelBtn = page.locator('button:has-text("Cancel")');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(modalTitle).not.toBeVisible();
  });
});
