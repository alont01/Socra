'use client'

import { useToastContext } from '@/contexts/ToastContext'
import { cn } from '@/lib/utils'

const variantStyles = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-stone-700 text-white',
}

export function ToastContainer() {
  const { toasts, dismiss } = useToastContext()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'px-4 py-3 rounded-2xl shadow-lg text-sm font-medium animate-fade-in-up cursor-pointer max-w-sm',
            variantStyles[t.variant]
          )}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
