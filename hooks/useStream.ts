import { useState, useCallback, useRef } from 'react'

interface UseStreamOptions {
  onChunk?: (chunk: string) => void
  onDone?: (fullText: string) => void
  onError?: (error: Error) => void
}

export function useStream(options: UseStreamOptions = {}) {
  const [streaming, setStreaming] = useState(false)
  const [text, setText] = useState('')

  // Store callbacks in refs to avoid recreating `stream` when they change
  const onChunkRef = useRef(options.onChunk)
  const onDoneRef = useRef(options.onDone)
  const onErrorRef = useRef(options.onError)
  onChunkRef.current = options.onChunk
  onDoneRef.current = options.onDone
  onErrorRef.current = options.onError

  const stream = useCallback(
    async (url: string, body: object) => {
      setStreaming(true)
      setText('')
      let fullText = ''

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (!res.body) throw new Error('No body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.text) {
                  fullText += parsed.text
                  setText(fullText)
                  onChunkRef.current?.(parsed.text)
                }
              } catch {
                // skip malformed
              }
            }
          }
        }

        onDoneRef.current?.(fullText)
      } catch (err) {
        onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setStreaming(false)
      }
    },
    []
  )

  return { stream, streaming, text }
}
