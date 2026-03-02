import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value

    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        studentProfile: true,
        parentProfile: {
          include: {
            children: {
              include: {
                sessions: {
                  select: { id: true },
                },
              },
            },
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
          children: user.parentProfile.children.map(child => ({
            id: child.id,
            name: child.name,
            gradeLevel: child.gradeLevel,
            onboardingDone: child.onboardingDone,
            sessionsCount: child.sessions.length,
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
