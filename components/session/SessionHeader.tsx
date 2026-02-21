'use client'

import { useRouter } from 'next/navigation'

interface SessionHeaderProps {
  title: string
  topic: string
}

export function SessionHeader({ title, topic }: SessionHeaderProps) {
  const router = useRouter()

  return (
    <header className="bg-white border-b border-orange-100 px-4 h-14 flex items-center gap-4 shrink-0">
      <button
        onClick={() => router.push('/dashboard')}
        className="text-stone-500 hover:text-stone-900 transition-colors text-sm flex items-center gap-1.5"
      >
        ← Dashboard
      </button>

      <div className="flex-1 min-w-0 text-center">
        <h1 className="font-semibold text-stone-900 text-sm truncate">{title}</h1>
        {topic && (
          <p className="text-xs text-stone-500 truncate">{topic}</p>
        )}
      </div>

      <div className="w-24" /> {/* Balance the back button */}
    </header>
  )
}
