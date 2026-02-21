import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { signToken } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, password, role, name } = await request.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)
    const userRole = role === 'PARENT' ? 'PARENT' : 'STUDENT'

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: userRole,
        ...(userRole === 'STUDENT'
          ? { studentProfile: { create: { name } } }
          : { parentProfile: { create: { name } } }),
      },
      include: {
        studentProfile: true,
        parentProfile: true,
      },
    })

    const token = await signToken({ userId: user.id, email: user.email, role: user.role })

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studentProfile: user.studentProfile,
        parentProfile: user.parentProfile,
      },
    })

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })

    return response
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
