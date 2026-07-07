// Admin / super-admin authorization.
//
// Super admins are hard-coded here so they always have access regardless of the
// ADMIN_EMAILS env var. Regular admins are configured via ADMIN_EMAILS
// (comma-separated). Both are matched case-insensitively.

const SUPER_ADMINS = new Set<string>([
  'alon.trogan@gmail.com',
])

function envAdmins(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMINS.has(email.toLowerCase())
}

/** True if the email is a super admin or in the ADMIN_EMAILS allowlist. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  return SUPER_ADMINS.has(e) || envAdmins().has(e)
}
