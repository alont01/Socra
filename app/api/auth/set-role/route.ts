import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'
import { setRoleSchema, parseBody } from '@/lib/validations'

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = parseBody(setRoleSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { role, name } = parsed.data

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { studentProfile: true, parentProfile: true, tutorProfile: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.studentProfile || user.parentProfile || user.tutorProfile) {
    return NextResponse.json({ error: 'Profile already exists' }, { status: 409 })
  }

  // Atomic: update role + create profile in a single transaction
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role },
    })

    if (role === 'STUDENT') {
      await tx.studentProfile.create({
        data: { userId: user.id, name },
      })
    } else {
      await tx.tutorProfile.create({
        data: { userId: user.id, name },
      })
    }
  })

  const token = await signToken({ userId: user.id, email: user.email, role })

  const response = NextResponse.json({ success: true })
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  return response
}
