import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * A same-origin relative path, safe to redirect to — or null if `next` isn't
 * one. Used to validate a `?next=` query param (an invite link, a post-login
 * destination) before navigating to it.
 *
 * Rejects anything not starting with a single `/` (so no `//host`, which
 * browsers resolve as protocol-relative) and anything containing a
 * backslash: the WHATWG URL parser normalizes `\` to `/` when resolving an
 * http(s) URL, so `/\evil.com` passes a naive `startsWith('/') &&
 * !startsWith('//')` check but resolves to `https://evil.com`.
 */
export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  if (next.includes('\\')) return null
  return next
}
