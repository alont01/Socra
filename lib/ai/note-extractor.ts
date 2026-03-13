import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function extractHandwrittenNotes(imageBase64: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Transcribe the handwritten math content in this image as faithfully as possible.
Use standard mathematical notation. Do NOT solve, simplify, or correct any expressions.
If there are diagrams or graphs, describe them briefly.
If the image is unclear or contains no math content, say so.
Output only the transcribed content, nothing else.`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.trim()
}
