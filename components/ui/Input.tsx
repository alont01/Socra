import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-stone-700">{label}</label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-900 placeholder-stone-400',
            'focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent',
            'transition-all duration-200',
            error && 'border-red-400 focus:ring-red-400',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
