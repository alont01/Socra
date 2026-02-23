import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { verifyToken } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const anthropic = new Anthropic()

// Archie's character system prompt
const ARCHIE_SYSTEM = `You are Archie, a friendly and enthusiastic magical math wizard who tutors students! You have a warm, playful personality — occasionally use magic-themed language and emoji like ✨ 🪄 ⭐ 🌟.

Your task is to get to know a new student through a warm, natural conversation. You need to learn:
1. Their name
2. Their grade level (e.g. "7th grade", "10th grade")
3. What math topics they're currently studying
4. What they find tricky or challenging in math
5. How they prefer to learn (visual examples? step-by-step? lots of practice? talking it through?)
6. Their math goal (e.g. pass a test, improve grades, understand a specific topic)

CONVERSATION RULES:
- Keep every response SHORT: 2–4 sentences maximum
- Ask only ONE question at a time — have a real, natural back-and-forth
- Be warm, encouraging, and fun
- Use the student's name once you know it (but not every message)
- React genuinely to what they say before asking the next question

DIAGNOSTIC PHASE:
After you have learned all 6 things above, smoothly transition to a short math check-in.
Say something like "Now let me give you a few quick math challenges to see what you know! ✨"
Then pose exactly 3 practice problems, one at a time:
- Start at a level appropriate for their grade
- Keep the problem embedded naturally in conversation (not a formal test)
- After they answer, give a brief 1-sentence reaction (correct or not), then move to the next problem
- After the 3rd problem and their answer, wrap up warmly

COMPLETION:
After the student has answered all 3 problems, include this EXACT block at the very end of your final message — it will be stripped before the student sees it:

[PROFILE_COMPLETE]
{
  "name": "student's name",
  "gradeLevel": "e.g. 7th grade",
  "mathTopics": ["topic1", "topic2"],
  "challenges": ["challenge1", "challenge2"],
  "learningStyle": "their preferred learning style",
  "goals": "their stated goal"
}
[/PROFILE_COMPLETE]`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

async function saveProfile(userId: string, profileData: {
  name: string
  gradeLevel: string
  mathTopics: string[]
  challenges: string[]
  learningStyle: string
  goals: string
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true },
  })
  if (!user?.studentProfile) return

  await prisma.studentProfile.update({
    where: { userId },
    data: {
      name: profileData.name || user.studentProfile.name,
      gradeLevel: profileData.gradeLevel || '',
      mathTopics: JSON.stringify(profileData.mathTopics || []),
      weaknessAreas: JSON.stringify(profileData.challenges || []),
      learningStyle: profileData.learningStyle || '',
      goals: profileData.goals || '',
      onboardingDone: true,
    },
  })
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages }: { messages: ChatMessage[] } = await request.json()

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // Call Claude Haiku — fast enough for conversational back-and-forth
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: ARCHIE_SYSTEM,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })

    let reply =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Check for profile completion signal
    const profileMatch = reply.match(
      /\[PROFILE_COMPLETE\]([\s\S]*?)\[\/PROFILE_COMPLETE\]/
    )

    if (profileMatch) {
      // Strip the signal block from the visible reply
      reply = reply
        .replace(/\[PROFILE_COMPLETE\][\s\S]*?\[\/PROFILE_COMPLETE\]/, '')
        .trim()

      try {
        const profileData = JSON.parse(profileMatch[1].trim())
        await saveProfile(payload.userId, profileData)
      } catch (err) {
        console.error('[onboarding/chat] Profile parse/save error:', err)
      }

      return NextResponse.json({ reply, phase: 'complete' })
    }

    return NextResponse.json({ reply, phase: 'interview' })
  } catch (err) {
    console.error('[onboarding/chat]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
