import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { role, name } = await request.json()

  if (!role || !name || !['STUDENT', 'PARENT'].includes(role)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { studentProfile: true, parentProfile: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (user.studentProfile || user.parentProfile) {
    return NextResponse.json({ error: 'Profile already exists' }, { status: 409 })
  }

  // Update role + create profile
  await prisma.user.update({
    where: { id: user.id },
    data: { role },
  })

  if (role === 'STUDENT') {
    await prisma.studentProfile.create({
      data: { userId: user.id, name },
    })
  } else {
    await prisma.parentProfile.create({
      data: { userId: user.id, name },
    })
  }

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
