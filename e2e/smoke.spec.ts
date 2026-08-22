import { test, expect } from '@playwright/test'

// Public-flow smoke tests that run against a live deployment. They avoid
// authenticated paths (no test credentials) and assert only what a signed-out
// visitor sees, so they are safe to run against production on a schedule.

test.describe('Socra public smoke (live)', () => {
  test('landing page renders the hero and a primary CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/smarter/i)
    await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible()
  })

  test('the hero CTA opens the consultation funnel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /book a free consultation/i }).first().click()
    // This CTA books an intake consultation, not an account — it must land on
    // /get-started, whose heading makes the same promise the button did.
    await expect(page).toHaveURL(/\/get-started$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/free consultation/i)
  })

  test('the nav Get Started button opens the consultation funnel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /get started/i }).first().click()
    await expect(page).toHaveURL(/\/get-started$/)
  })

  test('auth page exposes credential fields and OAuth sign-in', async ({ page }) => {
    await page.goto('/auth')
    // The login tab accepts an email OR a username (parent-created student
    // accounts), so this field is type="text" — asserting input[type="email"]
    // here silently fails even though the form is perfectly healthy.
    await expect(page.getByLabel('Email or username')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  })

  test('health probe reports ok and the database is up', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('up')
  })
})
