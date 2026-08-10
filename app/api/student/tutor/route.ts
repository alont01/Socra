import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

// Tells the student whether they have an assigned tutor yet — so the
// dashboard can show a clear "still finding your tutor" state instead of
// silently showing nothing (matching may take a moment: solo auto-pair is
// instant, but multi-tutor offers can take longer to be accepted).
export async function GET() {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const roster = await prisma.tutorStudent.findFirst({
    where: { studentId: auth.student.id, status: 'active' },
    include: { tutor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ tutor: roster ? { id: roster.tutor.id, name: roster.tutor.name } : null })
}
