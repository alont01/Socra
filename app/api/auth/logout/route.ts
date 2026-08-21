import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { route } from '@/lib/api-handler'
import { AUTH_COOKIE, clearAuthCookie } from '@/lib/auth-cookie'
import { verifyToken } from '@/lib/auth'
import { recordAudit, auditContext } from '@/lib/audit'

export const POST = route('auth/logout', async (request: Request) => {
  // Best-effort actor: read the token before we clear it.
  const token = (await cookies()).get(AUTH_COOKIE)?.value
  const payload = token ? await verifyToken(token) : null
  recordAudit({
    action: 'auth.logout',
    actor: payload ? { id: payload.userId, email: payload.email, role: payload.role } : null,
    ...auditContext(request),
  })

  const response = NextResponse.json({ success: true })
  clearAuthCookie(response)
  return response
})
