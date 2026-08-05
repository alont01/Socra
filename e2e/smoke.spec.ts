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

  test('the primary CTA navigates to the auth page', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /get started/i }).first().click()
    await expect(page).toHaveURL(/\/auth$/)
  })

  test('auth page exposes email + password fields and OAuth sign-in', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
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
