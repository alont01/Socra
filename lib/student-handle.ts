// Parent-created student accounts have no real email.
//
// A child added by a parent signs in with a username; the `User.email` column
// still has to hold something unique, so account creation stores a synthetic,
// non-deliverable address under this domain. It is an internal key, not a way
// to reach anyone — mailing it bounces — so it must never be shown as if it
// were the student's contact address.

/** Domain used for the synthetic addresses of parent-created student accounts. */
export const INTERNAL_STUDENT_EMAIL_DOMAIN = 'students.socra.internal'

/** True when `email` is a synthetic placeholder rather than a real address. */
export function isInternalStudentEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${INTERNAL_STUDENT_EMAIL_DOMAIN}`)
}

/**
 * What to show a human as this account's identity.
 *
 * Prefers the username for a parent-created child (that IS how they sign in),
 * and falls back to a neutral label rather than the synthetic address if the
 * username is somehow missing. A normal account just gets its email.
 */
export function displayIdentity(
  email: string | null | undefined,
  username: string | null | undefined,
): string {
  if (!isInternalStudentEmail(email)) return email ?? ''
  return username ? `@${username}` : 'Signs in with a username'
}
