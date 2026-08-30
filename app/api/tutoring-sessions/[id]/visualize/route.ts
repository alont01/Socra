import { NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { trackedMessage, firstText } from '@/lib/ai/client'
import { extractJson } from '@/lib/ai/parse-json'
import { normalizeDrawSpec } from '@/lib/whiteboard-draw'
import { WHITEBOARD_SPEC_PROMPT } from '@/lib/ai/visual-prompt'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'
import { route } from '@/lib/api-handler'

const logger = createLogger('visualize')

// Tutor-triggered mid-session visualization. Reads the recent conversation +
// notes + current whiteboard, and returns a "draw spec" the client renders onto
// the shared whiteboard to help with what the student is stuck on.
export const POST = route(
  'tutoring-sessions/[id]/visualize',
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`visualize:${auth.payload.userId}`, { maxRequests: 20, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => ({}))
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(-4000) : ''
    const notes = typeof body.notes === 'string' ? body.notes.slice(-2000) : ''
    const hint = typeof body.hint === 'string' ? body.hint.slice(0, 400) : ''
    // Guard against an oversized image blowing up the AI payload — drop it if
    // it's implausibly large (the client already downscales).
    const rawImage = typeof body.whiteboardImage === 'string' ? body.whiteboardImage : ''
    const whiteboardImage = rawImage.length <= 1_500_000 ? rawImage : ''
    // Modify loop: the tutor previews a draft and types a change to refine it.
    const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 500) : ''
    // Every other field on this body is bounded before it reaches the prompt;
    // this one wasn't — an arbitrarily large object serialized straight in at
    // line 64 below, unlike its siblings. It's normally a spec this same route
    // just returned, so it's small in practice; cap it defensively rather than
    // trusting that always holds.
    const rawCurrentSpec = body.currentSpec && typeof body.currentSpec === 'object' ? body.currentSpec : null
    const currentSpec = rawCurrentSpec && JSON.stringify(rawCurrentSpec).length <= 20_000 ? rawCurrentSpec : null

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: { tutor: true, student: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Only session-specific context goes in the message; the instructions live
    // in the cached system block above it.
    const context = `## Session
- Topic: ${session.topic}
- Student: ${session.student?.name || 'the student'} (Grade ${session.student?.gradeLevel || '?'})
${hint ? `- The tutor asks you to visualize: ${hint}` : ''}

## Recent conversation (most recent last)
${transcript || '(no transcript captured)'}

## Tutor notes
${notes || '(none)'}
${whiteboardImage ? '\n## Current whiteboard\nThe attached image is the current whiteboard. Build on it; don\'t repeat what\'s already drawn.' : ''}

${currentSpec ? `## Current draft (revise this)\n${JSON.stringify(currentSpec)}\n${instruction ? `The tutor wants this change: "${instruction}". Apply it and return the full updated spec.` : 'Improve or refine this draft.'}\n` : ''}`

    const content: Anthropic.Messages.ContentBlockParam[] = []
    if (whiteboardImage.startsWith('data:image')) {
      const b64 = whiteboardImage.split(',')[1] || ''
      if (b64) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } })
      }
    }
    content.push({ type: 'text', text: context })

    const response = await trackedMessage('visualize', {
      model: config.ai.visualizeModel,
      max_tokens: config.ai.visualizeMaxTokens,
      // Static instructions first, with the cache breakpoint at the end of them:
      // the tutor's refine loop re-sends this block on every "Update", and a
      // prefix hit is ~90% cheaper and noticeably faster.
      system: [{ type: 'text', text: WHITEBOARD_SPEC_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    })

    const spec = normalizeDrawSpec(extractJson(firstText(response)))
    if (!spec) {
      logger.warn('No usable draw spec produced', { sessionId: id })
      return NextResponse.json({ error: 'Could not produce a visualization. Try adding a quick note about the sticking point.' }, { status: 422 })
    }

    return NextResponse.json({ spec })
  },
  { errorMessage: 'Something went wrong generating the visualization.' },
)
