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
        parentProfile: true,
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
        parentProfile: user.parentProfile,
      },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ user: null }, { status: 500 })
  }
}
