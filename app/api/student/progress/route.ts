import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const auth = await requireStudent()
    if (!auth.ok) return auth.response

    const progress = await prisma.studentProgress.findMany({
      where: { studentId: auth.student.id },
      orderBy: { mastery: 'desc' },
    })

    return NextResponse.json({
      progress: progress.map((p) => ({
        topic: p.topic,
        mastery: p.mastery,
        updatedAt: p.updatedAt,
      })),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
