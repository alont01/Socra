import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.response

    const { name, gradeLevel } = await request.json()
    if (!name || !gradeLevel) {
      return NextResponse.json({ error: 'Name and grade level required' }, { status: 400 })
    }

    await prisma.studentProfile.update({
      where: { userId: auth.payload.userId },
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
