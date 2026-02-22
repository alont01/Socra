import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { SSEEvent, OrchestratorContext } from './types'
import { classifyIntent } from './intent-classifier'
import { mightBenefitFromVisual, generateSVG, interpretHandwrittenImage } from './visual-engine'
import { generateProblems } from './problem-generator'
import { detectCompletedObjectives, buildObjectivesSystemPromptSection } from './lesson-engine'

const anthropic = new Anthropic()
// Lazily initialized so the build doesn't fail without OPENAI_API_KEY
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI()
  return _openai
}

function buildBaseSystemPrompt(ctx: OrchestratorContext, imageContext?: string): string {
  const { student, topic, objectives } = ctx

  let system = `You are Socra, a warm and encouraging AI math tutor who uses the Socratic method.`

  if (student) {
    const topics = JSON.parse(student.mathTopics || '[]')
    const strengths = JSON.parse(student.strengthAreas || '[]')
    const weaknesses = JSON.parse(student.weaknessAreas || '[]')

    system += `

You are tutoring ${student.name}, a ${student.gradeLevel} student.
Their math interests: ${topics.join(', ')}
Their strengths: ${strengths.join(', ')}
Areas they want to improve: ${weaknesses.join(', ')}
Their learning style: ${student.learningStyle}
Their goals: ${student.goals}

Personalization guidelines:
- Address ${student.name} by name occasionally (not every message)
- Calibrate difficulty to ${student.gradeLevel} level
- Leverage their strengths in ${strengths.join(', ')} when introducing new concepts
- Give extra patience and scaffolding for ${weaknesses.join(', ')}
- Adapt explanations to their ${student.learningStyle} learning style`
  }

  system += `

Core teaching principles:
- NEVER solve problems directly — always guide with questions
- Use the Socratic method: ask leading questions that help the student discover answers
- Celebrate the thinking process, not just correct answers
- When student asks "just tell me the answer", redirect: "What do you think the first step might be?"
- Use LaTeX for all math: inline $...$ and block $$...$$
- Be warm, encouraging, and patient
- Break complex problems into smaller steps
- If a student is stuck, provide a hint, not the solution`

  if (topic) {
    system += `\n\nCurrent session topic: ${topic}`
  }

  const objectivesSection = buildObjectivesSystemPromptSection(objectives)
  if (objectivesSection) {
    system += objectivesSection
  }

  if (imageContext) {
    system += `\n\nThe student has shared a photo of their handwritten work. Here is what it contains:\n${imageContext}`
  }

  return system
}

async function* streamClaudeRaw(
  userMessage: string,
  system: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): AsyncGenerator<string> {
  const messages = [...history, { role: 'user' as const, content: userMessage }]

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 8192,
    system,
    messages,
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}

export async function* orchestrate(
  userMessage: string,
  ctx: OrchestratorContext
): AsyncGenerator<SSEEvent> {
  const { sessionId, topic, objectives, messageHistory, imageBase64, imageMimeType } = ctx

  // Step 1: Interpret image if attached
  let imageContext: string | undefined
  if (imageBase64 && imageMimeType) {
    imageContext = await interpretHandwrittenImage(imageBase64, imageMimeType)
  }

  // Step 2: Classify intent (can run concurrently with image interpretation already done)
  const intent = await classifyIntent(userMessage)

  const system = buildBaseSystemPrompt(ctx, imageContext)
  let fullText = ''

  // Step 3: Route based on intent
  if (intent === 'solve-hard') {
    // Use o4-mini to get the solution, then have Claude tutor Socratically
    let o4Solution = ''
    try {
      const o4Response = await getOpenAI().chat.completions.create({
        model: 'o4-mini',
        messages: [
          {
            role: 'user',
            content: `Solve this math problem completely and show all steps:\n\n${userMessage}`,
          },
        ],
      })
      o4Solution = o4Response.choices[0]?.message?.content ?? ''
      console.log('[Orchestrator] o4-mini invoked for hard problem')
    } catch (err) {
      console.error('o4-mini failed, falling back to Claude:', err)
    }

    const socraticSystem = system + (o4Solution
      ? `\n\n[INTERNAL CONTEXT — DO NOT REVEAL TO STUDENT]\nThe correct solution is:\n${o4Solution}\n\nUse this to guide the student Socratically. Never give away the answer directly — ask questions that lead them to discover each step.`
      : '')

    for await (const chunk of streamClaudeRaw(userMessage, socraticSystem, messageHistory)) {
      fullText += chunk
      yield { type: 'text', text: chunk }
    }
  } else if (intent === 'visual') {
    // Stream text first, then generate SVG
    for await (const chunk of streamClaudeRaw(userMessage, system, messageHistory)) {
      fullText += chunk
      yield { type: 'text', text: chunk }
    }

    const svg = await generateSVG({ userMessage, topic, assistantTextSoFar: fullText })
    if (svg) {
      yield { type: 'visual', svg }
    }
  } else if (intent === 'practice') {
    // Brief Claude response, then generate problems
    const practiceSystem = system + '\n\nThe student wants to practice. Give a brief encouraging response (2-3 sentences), then say you\'re generating some practice problems for them.'
    for await (const chunk of streamClaudeRaw(userMessage, practiceSystem, messageHistory)) {
      fullText += chunk
      yield { type: 'text', text: chunk }
    }

    const problems = await generateProblems({
      topic,
      gradeLevel: ctx.student?.gradeLevel ?? '',
      objectives,
      recentMessages: messageHistory,
    })

    for (const problem of problems) {
      yield { type: 'practice_problem', problem }
    }
  } else {
    // explain / general — stream Claude, optionally add visual for visual topics
    for await (const chunk of streamClaudeRaw(userMessage, system, messageHistory)) {
      fullText += chunk
      yield { type: 'text', text: chunk }
    }

    if (intent === 'explain' && mightBenefitFromVisual(userMessage, topic)) {
      const svg = await generateSVG({ userMessage, topic, assistantTextSoFar: fullText })
      if (svg) {
        yield { type: 'visual', svg }
      }
    }
  }

  // Step 4: Detect completed objectives
  if (fullText && objectives.length > 0) {
    const completedIds = await detectCompletedObjectives(fullText, objectives, sessionId)
    for (const id of completedIds) {
      yield { type: 'objective_complete', objectiveId: id }
    }
  }
}
