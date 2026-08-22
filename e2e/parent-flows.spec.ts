import { test, expect, type Page } from '@playwright/test'

// Authenticated PARENT flows against a live deployment.
//
// Requires a pre-seeded, already-verified synthetic parent (see
// scripts/_seed-e2e-parent.mjs) passed in via env, because email verification
// depends on a code that is stored only as a hash and never logged — a test
// cannot legitimately complete it.
//
//   E2E_PARENT_EMAIL=... E2E_PARENT_PASSWORD=... npx playwright test e2e/parent-flows.spec.ts

const EMAIL = process.env.E2E_PARENT_EMAIL
const PASSWORD = process.env.E2E_PARENT_PASSWORD

test.skip(!EMAIL || !PASSWORD, 'Set E2E_PARENT_EMAIL and E2E_PARENT_PASSWORD to run parent flows')

async function login(page: Page) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  })
  expect(res.status(), 'seeded parent should log in').toBe(200)
}

test.describe.serial('Socra parent experience (live, synthetic account)', () => {
  test('parent lands on the parent dashboard with an empty state', async ({ page }) => {
    await login(page)
    await page.goto('/parent/dashboard')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(/hi /i)
    // A brand-new parent has no children — the empty state must invite the
    // next action rather than render a blank grid.
    await expect(page.getByRole('heading', { name: /add your first child/i })).toBeVisible()
  })

  test('the add-child page loads for a parent', async ({ page }) => {
    await login(page)
    await page.goto('/parent/children/new')

    await expect(page.getByRole('heading', { name: /add your child/i })).toBeVisible()
    await expect(page.getByLabel("Child's name")).toBeVisible()
    await expect(page.getByLabel('Username')).toBeVisible()
  })

  test('adding a child returns credentials the parent can hand over', async ({ page }) => {
    await login(page)
    await page.goto('/parent/children/new')

    await page.getByLabel("Child's name").fill('E2E Synthetic Child')
    await page.getByLabel('Grade (optional)').fill('9th grade')
    // Blur triggers the username/password auto-suggest.
    await page.getByLabel("Child's name").blur()

    await page.getByRole('button', { name: /create child account/i }).click()

    await expect(page.getByRole('heading', { name: /account is ready/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Username', { exact: true })).toBeVisible()
    await expect(page.getByText('Password', { exact: true })).toBeVisible()
  })

  test('the new child appears on the dashboard and opens a detail page', async ({ page }) => {
    await login(page)
    await page.goto('/parent/dashboard')

    const card = page.getByRole('link', { name: /E2E Synthetic Child/i })
    await expect(card).toBeVisible()
    await card.click()

    await expect(page).toHaveURL(/\/parent\/children\/[^/]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/E2E Synthetic Child/i)
  })

  test('"Add another child" does not carry over the previous child\'s schedule', async ({ page }) => {
    await login(page)
    await page.goto('/parent/children/new')

    await page.getByLabel("Child's name").fill('First Child')
    await page.getByLabel('Hours per week').fill('7')
    await page.getByLabel("Child's name").blur()
    await page.getByRole('button', { name: /create child account/i }).click()
    await expect(page.getByRole('heading', { name: /account is ready/i })).toBeVisible({ timeout: 20_000 })

    await page.getByRole('button', { name: /add another child/i }).click()

    // The form is back — hours must be reset to the default, not still 7 from
    // the child that was just created, or the second child silently inherits
    // the first one's schedule.
    await expect(page.getByLabel('Hours per week')).toHaveValue('1')
  })
})
