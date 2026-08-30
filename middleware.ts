import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { verifyToken } from '@/lib/auth'

const protectedRoutes = ['/onboarding', '/dashboard', '/session', '/student', '/tutor', '/admin', '/parent', '/settings']
const authRoutes = ['/auth']

/**
 * Route trees restricted to one role, same idea as the `/admin` check below:
 * a signed-in user of the wrong role could still reach the page and render a
 * shell that then 403s on every API call it makes, instead of being turned
 * away at the edge. `/tutor` and `/parent` each carry pages with their own
 * client-side role redirect already (dashboard, billing, availability), but
 * that was never applied consistently — `/student/chat`, `/parent/children`,
 * and any future page in these trees got no protection at all.
 *
 * `/tutor/join` is deliberately exempt: redeeming a tutor invite is how a
 * STUDENT or PARENT becomes a tutor, so gating it to TUTOR-only would lock
 * out exactly the people who need it.
 */
const ROLE_ROUTES: Array<{ prefix: string; role: string; exempt?: string[] }> = [
  { prefix: '/tutor', role: 'TUTOR', exempt: ['/tutor/join'] },
  { prefix: '/student', role: 'STUDENT' },
  { prefix: '/parent', role: 'PARENT' },
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('token')?.value

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  ) && !pathname.startsWith('/onboarding/role')
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route))

  if (isProtected) {
    // Preserve where the user was headed so we can return them after login
    // (e.g. a parent following an invite link /parent/join?code=…).
    const loginUrl = new URL('/auth', request.url)
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)

    if (!token) {
      return NextResponse.redirect(loginUrl)
    }
    const payload = await verifyToken(token)
    if (!payload) {
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('token')
      return response
    }

    // /admin needs more than a valid session. The admin API routes each enforce
    // this themselves (requireAdmin), so no data was ever exposed — but without
    // a check here a signed-in non-admin still rendered the whole admin shell
    // and was left staring at a dashboard of failed requests. Turn it away at
    // the edge instead.
    if (pathname.startsWith('/admin') && !isAdmin(payload.email)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    for (const r of ROLE_ROUTES) {
      if (!pathname.startsWith(r.prefix)) continue
      if (r.exempt?.some((e) => pathname.startsWith(e))) break
      if (payload.role !== r.role) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      break
    }
  }

  if (isAuthRoute && token) {
    const payload = await verifyToken(token)
    if (payload) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
