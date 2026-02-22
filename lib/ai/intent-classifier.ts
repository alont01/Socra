import Anthropic from '@anthropic-ai/sdk'
import type { MessageIntent } from './types'

const anthropic = new Anthropic()

export async function classifyIntent(userMessage: string): Promise<MessageIntent> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      system: `Classify the user's math tutoring message into exactly one of these categories:
- explain: asking for an explanation of a concept
- practice: wants to practice problems or exercises
- solve-hard: a complex/hard math problem requiring deep computation (proofs, multi-step algebra, calculus, etc.)
- visual: something geometric or graphical that would benefit from a diagram (graphs, shapes, transformations)
- general: general conversation, greetings, or unclear intent

Respond with only the category word, nothing else.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = (response.content[0] as { type: 'text'; text: string }).text.trim().toLowerCase()
    const validIntents: MessageIntent[] = ['explain', 'practice', 'solve-hard', 'visual', 'general']
    if (validIntents.includes(text as MessageIntent)) {
      return text as MessageIntent
    }
    return 'general'
  } catch (err) {
    console.error('Intent classification failed, falling back to general:', err)
    return 'general'
  }
}
