import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import type { LessonObjective } from './types'

const anthropic = new Anthropic()

export async function generateObjectives(
  sessionId: string,
  topic: string,
  gradeLevel: string,
  goals: string
): Promise<LessonObjective[]> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: `You generate lesson objectives for math tutoring sessions.
Return ONLY valid JSON — no markdown, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Generate 3-5 lesson objectives for this tutoring session.

Topic: ${topic}
Grade level: ${gradeLevel}
Student goals: ${goals}

Return a JSON array of objectives. Each must have:
- title: short objective title (e.g., "Understand slope-intercept form")
- description: one sentence expanding on the objective
- order: integer starting at 1

Make objectives specific, measurable, and achievable in a single session.`,
        },
      ],
    })

    const raw = (response.content[0] as { type: 'text'; text: string }).text.trim()
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) return []

    const parsed: Array<{ title: string; description: string; order: number }> = JSON.parse(
      raw.slice(start, end + 1)
    )

    // Save to DB
    const created = await prisma.$transaction(
      parsed.slice(0, 5).map((obj) =>
        prisma.lessonObjective.create({
          data: {
            sessionId,
            title: obj.title,
            description: obj.description,
            order: obj.order,
          },
        })
      )
    )

    return created.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      order: o.order,
      completed: o.completed,
      completedAt: o.completedAt?.toISOString() ?? null,
    }))
  } catch (err) {
    console.error('Objective generation failed:', err)
    return []
  }
}

export async function detectCompletedObjectives(
  assistantResponse: string,
  objectives: LessonObjective[],
  sessionId: string
): Promise<string[]> {
  const pending = objectives.filter((o) => !o.completed)
  if (pending.length === 0) return []

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `You detect which lesson objectives were addressed in a tutor's response.
Return ONLY a JSON array of completed objective IDs — no markdown, no explanation.
Return [] if none were completed.`,
      messages: [
        {
          role: 'user',
          content: `Which of these objectives were addressed or completed in the tutor's response?

Pending objectives:
${pending.map((o) => `- ID: ${o.id} | ${o.title}: ${o.description}`).join('\n')}

Tutor's response:
${assistantResponse.slice(0, 1000)}

Return a JSON array of IDs of objectives that were clearly addressed/completed. Be conservative — only mark complete if the response substantially covered the objective.`,
        },
      ],
    })

    const raw = (response.content[0] as { type: 'text'; text: string }).text.trim()
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) return []

    const completedIds: string[] = JSON.parse(raw.slice(start, end + 1))

    // Update DB
    if (completedIds.length > 0) {
      await prisma.lessonObjective.updateMany({
        where: { id: { in: completedIds }, sessionId },
        data: { completed: true, completedAt: new Date() },
      })
    }

    return completedIds
  } catch (err) {
    console.error('Objective completion detection failed:', err)
    return []
  }
}

export async function getSessionObjectives(sessionId: string): Promise<LessonObjective[]> {
  const objectives = await prisma.lessonObjective.findMany({
    where: { sessionId },
    orderBy: { order: 'asc' },
  })

  return objectives.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    order: o.order,
    completed: o.completed,
    completedAt: o.completedAt?.toISOString() ?? null,
  }))
}

export function buildObjectivesSystemPromptSection(objectives: LessonObjective[]): string {
  if (objectives.length === 0) return ''

  const lines = objectives.map((o) => {
    const status = o.completed ? '✓ COMPLETED' : '○ PENDING'
    return `  ${o.order}. [${status}] ${o.title}: ${o.description}`
  })

  return `
Lesson Objectives for this session:
${lines.join('\n')}

Guide the student toward the pending objectives through Socratic questioning.`
}
