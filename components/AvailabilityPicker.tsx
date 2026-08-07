'use client'

import { DAY_LABELS, type AvailabilityBlock } from '@/lib/availability'

// Weekly recurring availability editor. Each day can hold one or more time
// ranges; native <input type="time"> keeps entry simple and returns "HH:MM".
export function AvailabilityPicker({
  value,
  onChange,
}: {
  value: AvailabilityBlock[]
  onChange: (blocks: AvailabilityBlock[]) => void
}) {
  const byDay = (day: number) =>
    value
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b.day === day)

  const add = (day: number) => onChange([...value, { day, start: '15:00', end: '16:00' }])
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const edit = (idx: number, patch: Partial<AvailabilityBlock>) =>
    onChange(value.map((b, i) => (i === idx ? { ...b, ...patch } : b)))

  return (
    <div className="rounded-2xl ring-1 ring-stone-200 divide-y divide-stone-100">
      {DAY_LABELS.map((label, day) => {
        const rows = byDay(day)
        return (
          <div key={day} className="flex items-start gap-3 px-3 py-2.5">
            <div className="w-10 shrink-0 pt-1.5 text-sm font-medium text-stone-600">{label}</div>
            <div className="flex-1 flex flex-col gap-2">
              {rows.length === 0 && <span className="text-sm text-stone-400 pt-1.5">Unavailable</span>}
              {rows.map(({ b, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time" value={b.start} onChange={(e) => edit(i, { start: e.target.value })}
                    className="rounded-lg ring-1 ring-inset ring-stone-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    aria-label={`${label} start`}
                  />
                  <span className="text-stone-400 text-sm">to</span>
                  <input
                    type="time" value={b.end} onChange={(e) => edit(i, { end: e.target.value })}
                    className="rounded-lg ring-1 ring-inset ring-stone-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    aria-label={`${label} end`}
                  />
                  <button type="button" onClick={() => remove(i)} className="text-stone-400 hover:text-red-500 text-sm px-1" aria-label={`Remove ${label} block`}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => add(day)} className="self-start text-xs font-medium text-orange-600 hover:text-orange-700">
                + Add time
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
