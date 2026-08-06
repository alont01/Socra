import GetStartedClient from './GetStartedClient'
import { bookingEmbedUrl } from '@/lib/booking'

// Force runtime rendering so the booking URL is resolved from the environment on
// each request — not inlined at build time. This lets the scheduler be changed
// in the host dashboard without a rebuild.
export const dynamic = 'force-dynamic'

export default function GetStartedPage() {
  return <GetStartedClient bookingUrl={bookingEmbedUrl()} />
}
