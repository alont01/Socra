import { NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { requireTutor } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { trackedMessage, firstText } from '@/lib/ai/client'
import { extractJson } from '@/lib/ai/parse-json'
import { normalizeDrawSpec } from '@/lib/whiteboard-draw'
import { config } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('visualize')

// Tutor-triggered mid-session visualization. Reads the recent conversation +
// notes + current whiteboard, and returns a "draw spec" the client renders onto
// the shared whiteboard to help with what the student is stuck on.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireTutor()
    if (!auth.ok) return auth.response

    const rl = rateLimit(`visualize:${auth.payload.userId}`, { maxRequests: 20, windowMs: 60_000 })
    if (rl.limited) return NextResponse.json({ error: rl.message }, { status: rl.status })

    const body = await request.json().catch(() => ({}))
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(-4000) : ''
    const notes = typeof body.notes === 'string' ? body.notes.slice(-2000) : ''
    const hint = typeof body.hint === 'string' ? body.hint.slice(0, 400) : ''
    const whiteboardImage = typeof body.whiteboardImage === 'string' ? body.whiteboardImage : ''
    // Modify loop: the tutor previews a draft and types a change to refine it.
    const instruction = typeof body.instruction === 'string' ? body.instruction.slice(0, 500) : ''
    const currentSpec = body.currentSpec && typeof body.currentSpec === 'object' ? body.currentSpec : null

    const session = await prisma.tutoringSession.findUnique({
      where: { id },
      include: { tutor: true, student: true },
    })
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.tutor.userId !== auth.payload.userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const prompt = `You are a math tutor's AI assistant. During a live session, help visualize what the student is stuck on by producing a drawing for the shared whiteboard.

## Session
- Topic: ${session.topic}
- Student: ${session.student?.name || 'the student'} (Grade ${session.student?.gradeLevel || '?'})
${hint ? `- The tutor asks you to visualize: ${hint}` : ''}

## Recent conversation (most recent last)
${transcript || '(no transcript captured)'}

## Tutor notes
${notes || '(none)'}
${whiteboardImage ? '\n## Current whiteboard\nThe attached image is the current whiteboard. Build on it; don\'t repeat what\'s already drawn.' : ''}

${currentSpec ? `## Current draft (revise this)\n${JSON.stringify(currentSpec)}\n${instruction ? `The tutor wants this change: "${instruction}". Apply it and return the full updated spec.` : 'Improve or refine this draft.'}\n` : ''}
Decide the ONE or TWO most helpful things to draw, then output ONLY JSON in this shape:
{
  "items": [
    { "kind": "graph", "title": "y = x²", "xDomain": [-4, 4], "series": [{ "expr": "x^2", "label": "y = x²" }], "points": [{ "x": 2, "y": 4, "label": "(2, 4)" }] },
    { "kind": "note", "title": "Solving 3x² − 12 = 0", "lines": ["3(x² − 4) = 0", "x² = 4", "x = ±2"] }
  ]
}
Rules:
- "graph": expr is a formula in x (+ - * / ^, implicit multiplication, pi, e, sin cos tan sqrt abs ln log exp). Give an xDomain. Add labeled "points" for key features.
- "note": short worked steps or a definition, one string per line. Use plain text math (x^2, ±, √), NOT LaTeX.
- "shapes" (optional): { "kind":"shapes", "width":480, "height":320, "primitives":[{"type":"line","x1":..,"y1":..,"x2":..,"y2":..},{"type":"circle","cx":..,"cy":..,"r":..},{"type":"text","x":..,"y":..,"text":".."}] } in a top-left origin pixel space, for geometry/number lines.
- At most 2 items. Keep it focused on the sticking point. Output only the JSON.`

    const content: Anthropic.Messages.ContentBlockParam[] = []
    if (whiteboardImage.startsWith('data:image')) {
      const b64 = whiteboardImage.split(',')[1] || ''
      if (b64) {
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } })
      }
    }
    content.push({ type: 'text', text: prompt })

    const response = await trackedMessage('visualize', {
      model: config.ai.analysisModel,
      max_tokens: 1500,
      messages: [{ role: 'user', content }],
    })

    const spec = normalizeDrawSpec(extractJson(firstText(response)))
    if (!spec) {
      logger.warn('No usable draw spec produced', { sessionId: id })
      return NextResponse.json({ error: 'Could not produce a visualization. Try adding a quick note about the sticking point.' }, { status: 422 })
    }

    return NextResponse.json({ spec })
  } catch (err) {
    logger.error('Visualize failed', err)
    return NextResponse.json({ error: 'Something went wrong generating the visualization.' }, { status: 500 })
  }
}
