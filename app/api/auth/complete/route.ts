import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { route } from '@/lib/api-handler'
import { setAuthCookie } from '@/lib/auth-cookie'

export const GET = route('auth/complete', async (request: Request) => {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/auth')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      studentProfile: true,
      parentProfile: true,
      tutorProfile: true,
    },
  })

  if (!user) {
    redirect('/auth')
  }

  // New user — no profile yet, needs role selection
  if (!user.studentProfile && !user.parentProfile && !user.tutorProfile) {
    redirect('/onboarding/role')
  }

  // Issue custom JWT cookie
  const token = await signToken({ userId: user.id, email: user.email, role: user.role })

  const onboardingDone = user.studentProfile?.onboardingDone ?? true

  const destination = onboardingDone ? '/dashboard' : '/onboarding'

  const base = process.env.AUTH_URL || new URL(request.url).origin
  const response = NextResponse.redirect(new URL(destination, base))
  setAuthCookie(response, token)

  return response
})
