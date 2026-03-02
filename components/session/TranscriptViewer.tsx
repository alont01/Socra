'use client'

interface TranscriptViewerProps {
  content: string
  speakers: string[]
}

export function TranscriptViewer({ content }: TranscriptViewerProps) {
  if (!content) {
    return (
      <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5 text-center">
        <p className="text-sm text-stone-400">No transcript available for this session.</p>
      </div>
    )
  }

  // Split transcript by lines, try to detect speaker labels
  const lines = content.split('\n').filter((l) => l.trim())

  return (
    <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-5">
      <h3 className="font-semibold text-stone-900 mb-3">Transcript</h3>
      <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
        {lines.map((line, i) => {
          // Try to detect "Speaker: text" format
          const match = line.match(/^([^:]+):\s*(.+)$/)
          if (match) {
            return (
              <div key={i} className="text-sm">
                <span className="font-medium text-orange-600">{match[1]}:</span>{' '}
                <span className="text-stone-600">{match[2]}</span>
              </div>
            )
          }
          return (
            <p key={i} className="text-sm text-stone-600">{line}</p>
          )
        })}
      </div>
    </div>
  )
}
