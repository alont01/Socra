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
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, gradeLevel } = await request.json()
    if (!name || !gradeLevel) {
      return NextResponse.json({ error: 'Name and grade level required' }, { status: 400 })
    }

    await prisma.studentProfile.update({
      where: { userId: payload.userId },
      data: {
        name,
        gradeLevel,
        onboardingDone: true,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
