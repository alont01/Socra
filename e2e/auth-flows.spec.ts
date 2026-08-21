import { test, expect } from '@playwright/test'

// Authenticated-flow smoke tests against a LIVE deployment, using a real but
// clearly-tagged synthetic account (a `+e2e-<run id>` alias of a real mailbox,
// not a fake domain that would just bounce and skew delivery signals).
//
// These stop deliberately short of completing email verification: the
// verification code is stored only as a SHA-256 hash (lib/email-verification.ts)
// and is never written to a production log, by design — there is no legitimate
// way for a test to recover it, and adding one would be a real security
// regression for the sake of a test. So this suite covers everything reachable
// without the code: signup, duplicate-signup rejection, and both login
// branches (wrong password vs. correct-password-but-unverified).
//
// Every run leaves one User row (STUDENT or PARENT, unverified) in the
// production database, tagged by the `+e2e-` local-part so it's trivially
// identifiable for cleanup.

// .serial: each test builds on the account state the previous one left behind
// (created → duplicate-checked → logged into while unverified), so they must
// run in order on one worker regardless of the file's parallel settings.
test.describe.serial('Socra auth flows (live, synthetic account)', () => {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `alon.trogan+e2e-${runId}@gmail.com`
  const password = 'E2eSynthetic!2026'

  test('signup creates an account and routes to email verification', async ({ page }) => {
    await page.goto('/auth')
    await page.getByRole('button', { name: 'Sign Up' }).click()

    // Note: the form's <label> elements aren't programmatically associated
    // with their inputs (no htmlFor/id, no aria-labelledby) — getByLabel()
    // can't find them. Falling back to placeholder text; flagged separately
    // as an accessibility gap worth fixing in components/ui/Input.tsx.
    await page.getByPlaceholder('Your name').fill('E2E Synthetic Parent')
    await page.getByRole('radio', { name: 'Parent' }).click()
    await page.getByPlaceholder('you@example.com').fill(email)
    await page.getByPlaceholder('At least 8 characters').fill(password)
    await page.getByPlaceholder('Repeat your password').fill(password)
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page).toHaveURL(new RegExp(`/auth/verify\\?email=${encodeURIComponent(email)}`))
    await expect(page.getByText(email)).toBeVisible()
  })

  test('signing up again with the same email is rejected', async ({ page }) => {
    // Depends on the previous test having already created the account.
    const res = await page.request.post('/api/auth/signup', {
      data: { email, password, role: 'PARENT', name: 'E2E Synthetic Parent (dup)' },
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already in use/i)
  })

  test('login with the wrong password is rejected without revealing verification state', async ({ page }) => {
    await page.goto('/auth')
    await page.getByPlaceholder('you@example.com or username').fill(email)
    await page.getByPlaceholder('Your password').fill('DefinitelyWrongPassword!')
    await page.locator('form').getByRole('button', { name: 'Log In' }).click()

    // Must be the generic invalid-credentials message, not a hint that the
    // account exists but is unverified — password is checked before
    // verification status (lib/auth login route).
    await expect(page.getByText(/invalid email\/username or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/auth$/)
  })

  test('login with the correct password on an unverified account routes to verification', async ({ page }) => {
    await page.goto('/auth')
    await page.getByPlaceholder('you@example.com or username').fill(email)
    await page.getByPlaceholder('Your password').fill(password)
    await page.locator('form').getByRole('button', { name: 'Log In' }).click()

    await expect(page).toHaveURL(new RegExp(`/auth/verify\\?email=${encodeURIComponent(email)}`))
  })

  test('verifying with a wrong code is rejected', async ({ page }) => {
    await page.goto(`/auth/verify?email=${encodeURIComponent(email)}`)
    await page.locator('input').first().fill('000000')
    await page.getByRole('button', { name: /verify/i }).click()

    await expect(page.getByText(/could not verify|invalid|incorrect/i)).toBeVisible()
  })
})
