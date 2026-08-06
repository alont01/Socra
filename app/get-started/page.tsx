import GetStartedClient from './GetStartedClient'

// Force runtime rendering so BOOKING_URL is read from the environment on each
// request — not inlined at build time. This lets the scheduler be configured
// (or changed) in the host dashboard without a rebuild.
export const dynamic = 'force-dynamic'

export default function GetStartedPage() {
  // Accept either name; BOOKING_URL is the runtime var, NEXT_PUBLIC_BOOKING_URL
  // kept for backward-compat with anything already set.
  const bookingUrl = process.env.BOOKING_URL || process.env.NEXT_PUBLIC_BOOKING_URL || ''
  return <GetStartedClient bookingUrl={bookingUrl} />
}
