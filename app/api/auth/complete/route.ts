import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/auth')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      studentProfile: true,
      parentProfile: true,
    },
  })

  if (!user) {
    redirect('/auth')
  }

  // New user — no profile yet, needs role selection
  if (!user.studentProfile && !user.parentProfile) {
    redirect('/onboarding/role')
  }

  // Issue custom JWT cookie
  const token = await signToken({ userId: user.id, email: user.email, role: user.role })

  const profile = user.studentProfile ?? user.parentProfile
  const onboardingDone = user.studentProfile?.onboardingDone ?? true

  const destination = onboardingDone ? '/dashboard' : '/onboarding'

  const base = process.env.AUTH_URL || new URL(request.url).origin
  const response = NextResponse.redirect(new URL(destination, base))
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}
