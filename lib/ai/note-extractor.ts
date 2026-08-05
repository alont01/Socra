import { trackedMessage, firstText } from './client'
import { config } from '@/lib/config'

export async function extractHandwrittenNotes(imageBase64: string): Promise<string> {
  const response = await trackedMessage('note_extract', {
    model: config.ai.noteExtractorModel,
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

  return firstText(response).trim()
}
