import Stripe from 'stripe'

/**
 * Pinned explicitly so an account-level default change can't silently alter
 * request/response shapes under a running deploy. Bump deliberately, with the
 * changelog open.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia'

let client: Stripe | null | undefined // undefined = not yet checked

/**
 * Lazily-initialized Stripe client. Returns null if STRIPE_SECRET_KEY isn't
 * configured (e.g. local dev before the account is set up) rather than
 * throwing at import time — callers check for null and degrade gracefully,
 * same pattern as lib/email.ts's sendEmail.
 */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    client = null
    return null
  }
  client = new Stripe(key, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })
  return client
}
