// Resolves the consultation scheduler URL used by /get-started and the parent
// confirmation email.
//
// Prefers a runtime env override (BOOKING_URL, or the legacy
// NEXT_PUBLIC_BOOKING_URL) and falls back to the team's Calendly link so the
// calendar works out of the box. This URL is public — it's printed on the flyer
// and QR code — so committing it as the default is intentional, not a secret.
const DEFAULT_BOOKING_URL = 'https://calendly.com/alon-trogan/30min'

export function bookingUrl(): string {
  return process.env.BOOKING_URL || process.env.NEXT_PUBLIC_BOOKING_URL || DEFAULT_BOOKING_URL
}

/**
 * Booking URL with embed-friendly params appended (hide Calendly's GDPR banner,
 * match the brand accent). Unknown params are harmlessly ignored by other
 * providers, and we merge with any query string already on the URL.
 */
export function bookingEmbedUrl(): string {
  const url = bookingUrl()
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}hide_gdpr_banner=1&primary_color=ea580c`
}
