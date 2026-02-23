'use client'

import { useEffect, useRef, useState } from 'react'
import { Wizard, type WizardEmotion } from './Wizard'

interface CharacterBubbleProps {
  emotion: WizardEmotion
  message?: string
}

export function CharacterBubble({ emotion, message }: CharacterBubbleProps) {
  const [visibleMsg, setVisibleMsg] = useState<string | undefined>()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!message) return
    setVisibleMsg(message)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisibleMsg(undefined), 4500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [message])

  return (
    <div className="flex flex-col items-start gap-1.5 pointer-events-none select-none">
      {visibleMsg && (
        <div className="animate-fade-in-up bg-white border border-orange-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-md max-w-[190px] text-xs text-stone-700 leading-relaxed">
          {visibleMsg}
        </div>
      )}
      <div className="drop-shadow-lg">
        <Wizard emotion={emotion} size="sm" />
      </div>
    </div>
  )
}
