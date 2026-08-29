import type { NextConfig } from 'next'
import path from 'path'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Content-Security-Policy, sent in Report-Only mode.
 *
 * Deliberately not enforced yet. The live tutoring call is a cross-origin
 * Daily.co iframe that opens its own WebSocket, TURN, and media connections,
 * and a CSP that misses one of those hosts breaks video with no visible error
 * — it would take out the core product to harden a page. Report-Only gets the
 * policy in front of real traffic first: violations surface in the browser
 * console without blocking anything.
 *
 * To promote it: run a real tutoring session end to end (join, whiteboard,
 * visualize, end), collect the `[Report Only]` violations from the console,
 * fold the missing hosts in here, then rename the header to
 * `Content-Security-Policy`.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts, and dev additionally needs eval.
  // Tightening this to a nonce is the natural follow-up once the policy is
  // enforced at all.
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  // KaTeX and Tailwind both emit inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Whiteboard snapshots and captured notes are base64 data URIs; Daily serves
  // participant imagery from blob URLs.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.daily.co wss://*.daily.co",
  "frame-src 'self' https://*.daily.co",
  "media-src 'self' blob: https://*.daily.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Features the app does not use. Camera, microphone, and display-capture are
 * deliberately absent: the video call runs in a cross-origin *.daily.co
 * iframe, Permissions-Policy allowlists cannot express a wildcard origin, and
 * restricting them here would revoke the iframe's device access and kill the
 * call.
 */
const permissionsPolicy = [
  'geolocation=()',
  'payment=()',
  'usb=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'interest-cohort=()',
].join(', ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: permissionsPolicy },
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
  // Only meaningful over HTTPS, and actively harmful on a local http origin
  // (the browser pins the host to HTTPS for the max-age, including localhost).
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],

  // Don't advertise the framework and version on every response.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },

  // Define the `@/` alias directly in webpack. The tsconfig `paths` alias is not
  // reliably applied to the App Router page-entry layer on clean production
  // builds (pages failed with "Module not found: Can't resolve '@/...'" while
  // every other module resolved fine). Aliasing here covers all webpack layers.
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(process.cwd()),
    }
    return config
  },
}

export default nextConfig
