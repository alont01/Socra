import Stripe from 'stripe'

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
  client = new Stripe(key)
  return client
}
