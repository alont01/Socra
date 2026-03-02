import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tutor = await prisma.tutorProfile.findUnique({
      where: { userId: payload.userId },
    })
    if (!tutor) return NextResponse.json({ error: 'Not a tutor' }, { status: 403 })

    const entry = await prisma.tutorStudent.findUnique({
      where: { tutorId_studentId: { tutorId: tutor.id, studentId } },
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
