import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const VISUAL_KEYWORDS = [
  'graph', 'plot', 'draw', 'diagram', 'parabola', 'line', 'circle', 'triangle',
  'rectangle', 'polygon', 'function', 'coordinate', 'axis', 'axes', 'slope',
  'intercept', 'geometry', 'geometric', 'shape', 'angle', 'vertex', 'tangent',
  'curve', 'ellipse', 'hyperbola', 'vector', 'transformation', 'reflect',
  'rotate', 'translate', 'scale', 'visualize', 'show me', 'illustrate',
]

export function mightBenefitFromVisual(message: string, topic: string): boolean {
  const combined = (message + ' ' + topic).toLowerCase()
  return VISUAL_KEYWORDS.some((kw) => combined.includes(kw))
}

interface GenerateSVGOptions {
  userMessage: string
  topic: string
  assistantTextSoFar: string
}

export async function generateSVG({ userMessage, topic, assistantTextSoFar }: GenerateSVGOptions): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: `You generate SVG diagrams for math tutoring.

STRICT REQUIREMENTS:
- Output ONLY the SVG element — no markdown, no explanation, no code fences
- Use viewBox="0 0 400 300" exactly
- Use stroke="#1c1917" for lines and text
- Use fill="#f97316" for highlighted elements (dots, areas of interest)
- Use fill="#fff7ed" for backgrounds where needed
- Use fill="none" for shapes that should not be filled
- No external references (no images, no hrefs to external URLs)
- No <script> tags
- No embedded CSS with external fonts
- Keep it clean, educational, and accurate
- Start with <svg and end with </svg>`,
      messages: [
        {
          role: 'user',
          content: `Create a mathematical diagram to help explain this concept.

Topic: ${topic}
Student question: ${userMessage}
Explanation so far: ${assistantTextSoFar.slice(0, 500)}

Generate an SVG diagram that visually illustrates the key mathematical concept.`,
        },
      ],
    })

    const raw = (response.content[0] as { type: 'text'; text: string }).text.trim()
    const start = raw.indexOf('<svg')
    const end = raw.lastIndexOf('</svg>')
    if (start === -1 || end === -1) return null

    const svg = raw.slice(start, end + 6)
    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) return null
    return svg
  } catch (err) {
    console.error('SVG generation failed:', err)
    return null
  }
}

export async function interpretHandwrittenImage(base64: string, mimeType: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `This is a photo of handwritten math work from a student. Please:
1. Transcribe any mathematical expressions to LaTeX (inline $...$ or block $$...$$)
2. Describe what you see (equations, diagrams, work shown)
3. Note if there are any errors or areas that need attention

Be precise and thorough in your transcription.`,
            },
          ],
        },
      ],
    })

    return (response.content[0] as { type: 'text'; text: string }).text
  } catch (err) {
    console.error('Image interpretation failed:', err)
    return 'I had trouble reading the image. Could you describe what you wrote?'
  }
}
