import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const entry = await prisma.tutorStudent.findUnique({
      where: { tutorId_studentId: { tutorId: auth.tutor.id, studentId } },
    })
    if (!entry) return NextResponse.json({ error: 'Student not in roster' }, { status: 404 })

    await prisma.tutorStudent.delete({
      where: { id: entry.id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
