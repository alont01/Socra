import React from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    // Labels were visually present but not programmatically linked to their
    // input (no htmlFor/id), so screen readers and testing-library's
    // getByLabel() couldn't associate them. useId() gives every instance a
    // stable, collision-free id without callers having to pass one.
    const generatedId = React.useId()
    const inputId = id ?? (label ? generatedId : undefined)
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-stone-700">{label}</label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 placeholder-stone-400 ring-1 ring-inset ring-stone-200',
            'focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-0',
            'transition-shadow duration-200',
            error && 'ring-red-400 focus:ring-red-400',
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
