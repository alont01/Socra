import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { route } from '@/lib/api-handler'
import { prisma } from '@/lib/prisma'
import { isInternalStudentEmail } from '@/lib/student-handle'

export const GET = route('auth/me', async () => {
  const auth = await requireAuth()
  if (!auth.ok) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.payload.userId },
    include: {
      studentProfile: true,
      parentProfile: {
        include: {
          children: true,
        },
      },
      tutorProfile: true,
    },
  })

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      // A parent-created child's stored `email` is a synthetic, non-deliverable
      // @students.socra.internal placeholder (see lib/student-handle.ts) — an
      // internal key, not a contact address. /api/profile and
      // /api/tutor/students already mask it; this endpoint is on the same auth
      // path and must not be the one place that leaks it to the client.
      email: isInternalStudentEmail(user.email) ? null : user.email,
      role: user.role,
      studentProfile: user.studentProfile,
      parentProfile: user.parentProfile
        ? {
            id: user.parentProfile.id,
            name: user.parentProfile.name,
            children: user.parentProfile.children.map((child) => ({
              id: child.id,
              name: child.name,
              gradeLevel: child.gradeLevel,
              onboardingDone: child.onboardingDone,
              mathTopics: child.mathTopics,
            })),
          }
        : null,
      tutorProfile: user.tutorProfile
        ? {
            id: user.tutorProfile.id,
            name: user.tutorProfile.name,
            specialties: user.tutorProfile.specialties,
            bio: user.tutorProfile.bio,
          }
        : null,
    },
  })
})
