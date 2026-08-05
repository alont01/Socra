import { defineConfig, devices } from '@playwright/test'

// E2E runs against a LIVE, already-running deployment (no local server is
// started). Point it anywhere with E2E_BASE_URL; defaults to production.
//   npm run e2e
//   E2E_BASE_URL=http://localhost:3000 npm run e2e
const baseURL = process.env.E2E_BASE_URL || 'https://www.socratutoring.com'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
