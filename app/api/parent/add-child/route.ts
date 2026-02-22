import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload || payload.role !== 'PARENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, email, gradeLevel } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get parent profile
    const parentProfile = await prisma.parentProfile.findUnique({
      where: { userId: payload.userId },
    })

    if (!parentProfile) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 })
    }

    // Check email not taken
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    // Create child user + student profile linked to parent
    const childUser = await prisma.user.create({
      data: {
        email,
        passwordHash: null,
        role: 'STUDENT',
        studentProfile: {
          create: {
            name,
            gradeLevel: gradeLevel || '',
            parentId: parentProfile.id,
          },
        },
      },
      include: {
        studentProfile: true,
      },
    })

    return NextResponse.json({ child: childUser.studentProfile })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
