import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { recordAudit, auditContext } from '@/lib/audit'

export async function POST(request: Request) {
  // Best-effort actor: read the token before we clear it.
  const token = (await cookies()).get('token')?.value
  const payload = token ? await verifyToken(token) : null
  recordAudit({
    action: 'auth.logout',
    actor: payload ? { id: payload.userId, email: payload.email, role: payload.role } : null,
    ...auditContext(request),
  })

  const response = NextResponse.json({ success: true })
  response.cookies.delete('token')
  response.cookies.delete('next-auth.session-token')
  response.cookies.delete('__Secure-next-auth.session-token')
  return response
}
