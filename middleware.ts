import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/auth'

const protectedRoutes = ['/onboarding', '/dashboard', '/session', '/student', '/tutor', '/admin', '/parent', '/settings']
const authRoutes = ['/auth']

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
