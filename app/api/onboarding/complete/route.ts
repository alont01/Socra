import { NextResponse } from 'next/server'
import { requireStudent } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { onboardingCompleteSchema, parseBody } from '@/lib/validations'
import { route } from '@/lib/api-handler'

export const POST = route('onboarding/complete', async (request: Request) => {
  const auth = await requireStudent()
  if (!auth.ok) return auth.response

  const body = await request.json()
  const parsed = parseBody(onboardingCompleteSchema, body)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { name, gradeLevel } = parsed.data

  await prisma.studentProfile.update({
    where: { userId: auth.payload.userId },
    data: {
      name,
      gradeLevel,
      onboardingDone: true,
    },
  })

  return NextResponse.json({ success: true })
})
