import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
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
        email: user.email,
        role: user.role,
        studentProfile: user.studentProfile,
        parentProfile: user.parentProfile ? {
          id: user.parentProfile.id,
          name: user.parentProfile.name,
          children: user.parentProfile.children.map((child) => ({
            id: child.id,
            name: child.name,
            gradeLevel: child.gradeLevel,
            onboardingDone: child.onboardingDone,
            mathTopics: child.mathTopics,
          })),
        } : null,
        tutorProfile: user.tutorProfile ? {
          id: user.tutorProfile.id,
          name: user.tutorProfile.name,
          specialties: user.tutorProfile.specialties,
          bio: user.tutorProfile.bio,
        } : null,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ user: null }, { status: 500 })
  }
}
