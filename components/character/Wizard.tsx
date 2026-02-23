'use client'

import { useEffect, useState } from 'react'

export type WizardEmotion = 'idle' | 'thinking' | 'celebrate' | 'encourage'

interface WizardProps {
  emotion?: WizardEmotion
  size?: 'sm' | 'lg'
}

const MATH_SYMBOLS = ['∑', 'π', '∫', '√', '∞', '±', 'θ', '△']

type Particle = { id: number; symbol: string; x: number; delay: number }

export function Wizard({ emotion = 'idle', size = 'lg' }: WizardProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  // viewBox is 100×110, aspect ratio 10:11
  const w = size === 'lg' ? 130 : 58
  const h = Math.round(w * 1.1)

  useEffect(() => {
    if (emotion !== 'celebrate') return
    const spawned: Particle[] = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      symbol: MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)],
      x: (Math.random() - 0.5) * 70,
      delay: i * 0.13,
    }))
    setParticles(spawned)
    const t = setTimeout(() => setParticles([]), 1300)
    return () => clearTimeout(t)
  }, [emotion])

  const wrapperAnim = {
    idle: 'animate-wizard-float',
    thinking: 'animate-wizard-tilt',
    celebrate: 'animate-wizard-celebrate',
    encourage: 'animate-wizard-wave',
  }[emotion]

  const mouth =
    emotion === 'celebrate'
      ? 'M 39 87 Q 50 96 61 87'
      : emotion === 'thinking'
      ? 'M 44 90 L 56 90'
      : 'M 42 88 Q 50 95 58 88'

  return (
    <div
      className="relative inline-flex items-end justify-center"
      style={{ width: w, height: h }}
    >
      {/* Math symbol particles on celebrate */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute font-bold pointer-events-none select-none animate-float-up text-violet-500"
          style={{
            left: `calc(50% + ${p.x}px)`,
            top: '0',
            fontSize: size === 'lg' ? 17 : 9,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.symbol}
        </span>
      ))}

      <div className={wrapperAnim} style={{ width: w, height: h }}>
        <svg
          viewBox="0 0 100 110"
          xmlns="http://www.w3.org/2000/svg"
          width={w}
          height={h}
        >
          {/* ── HAT SHADOW (depth) ── */}
          <ellipse cx="50" cy="61" rx="35" ry="5" fill="rgba(0,0,0,0.07)" />

          {/* ── HAT BODY ── */}
          {/* Dark side */}
          <polygon points="50,4 11,59 89,59" fill="#4c1d95" />
          {/* Lit face */}
          <polygon points="50,7 14,57 86,57" fill="#6d28d9" />

          {/* Hat sparkle dots */}
          <circle cx="35" cy="32" r="2" fill="#c4b5fd">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;2.5;1.5" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="62" cy="24" r="1.5" fill="#e9d5ff">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.7s" repeatCount="indefinite" />
          </circle>
          <circle cx="44" cy="17" r="1.2" fill="#ddd6fe">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="68" cy="42" r="1" fill="#c4b5fd">
            <animate attributeName="opacity" values="1;0.4;1" dur="2.6s" repeatCount="indefinite" />
          </circle>

          {/* Star at hat tip */}
          <text x="50" y="36" textAnchor="middle" fontSize="16">⭐</text>

          {/* ── HAT BRIM ── */}
          <rect x="7" y="57" width="86" height="10" rx="5" fill="#5b21b6" />
          {/* Brim highlight */}
          <rect x="9" y="57" width="82" height="5" rx="4" fill="#7c3aed" opacity="0.6" />

          {/* ── FACE (peeks under brim) ── */}
          <ellipse cx="50" cy="82" rx="26" ry="21" fill="#fde68a" />
          {/* Subtle bottom shadow */}
          <ellipse cx="50" cy="97" rx="18" ry="6" fill="#fbbf24" opacity="0.25" />
          {/* Blush */}
          <ellipse cx="35" cy="87" rx="6" ry="3.5" fill="#fca5a5" opacity="0.4" />
          <ellipse cx="65" cy="87" rx="6" ry="3.5" fill="#fca5a5" opacity="0.4" />

          {/* ── EYES ── */}
          {emotion === 'celebrate' ? (
            <>
              {/* Happy squint arcs */}
              <path d="M 36 77 Q 41 72 46 77" stroke="#1c1917" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M 54 77 Q 59 72 64 77" stroke="#1c1917" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : emotion === 'thinking' ? (
            <>
              {/* Eyes looking up */}
              <circle cx="41" cy="77" r="7.5" fill="white" />
              <circle cx="59" cy="77" r="7.5" fill="white" />
              <circle cx="41" cy="74" r="5" fill="#1c1917" />
              <circle cx="59" cy="74" r="5" fill="#1c1917" />
              <circle cx="43" cy="72.5" r="2" fill="white" />
              <circle cx="61" cy="72.5" r="2" fill="white" />
              {/* Raised eyebrow */}
              <path d="M 35 68 Q 41 64 47 68" stroke="#78350f" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              {/* Big warm eyes */}
              <circle cx="41" cy="77" r="7.5" fill="white" />
              <circle cx="59" cy="77" r="7.5" fill="white" />
              <circle cx="41" cy="78" r="5" fill="#1c1917" />
              <circle cx="59" cy="78" r="5" fill="#1c1917" />
              <circle cx="43" cy="76" r="2" fill="white" />
              <circle cx="61" cy="76" r="2" fill="white" />
            </>
          )}

          {/* Thinking bubbles (float up above hat) */}
          {emotion === 'thinking' && (
            <>
              <circle cx="69" cy="52" r="3" fill="#7c3aed">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="cy" values="54;46;38" dur="1.2s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="76" cy="44" r="3" fill="#6d28d9">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
                <animate attributeName="cy" values="46;38;30" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="83" cy="36" r="3" fill="#5b21b6">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
                <animate attributeName="cy" values="38;30;22" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* ── MOUTH ── */}
          <path d={mouth} stroke="#92400e" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* ── FLOATING HANDS ── */}
          {/* Left hand */}
          <circle cx="13" cy="83" r="9" fill="#fde68a" />
          <circle cx="13" cy="83" r="9" stroke="#fbbf24" strokeWidth="1.5" fill="none" opacity="0.5" />
          {/* Knuckle dots */}
          <circle cx="10" cy="80" r="1.2" fill="#fbbf24" opacity="0.8" />
          <circle cx="13" cy="79" r="1.2" fill="#fbbf24" opacity="0.8" />
          <circle cx="16" cy="80" r="1.2" fill="#fbbf24" opacity="0.8" />

          {/* Right hand */}
          <circle cx="87" cy="83" r="9" fill="#fde68a" />
          <circle cx="87" cy="83" r="9" stroke="#fbbf24" strokeWidth="1.5" fill="none" opacity="0.5" />
          {/* Knuckle dots */}
          <circle cx="84" cy="80" r="1.2" fill="#fbbf24" opacity="0.8" />
          <circle cx="87" cy="79" r="1.2" fill="#fbbf24" opacity="0.8" />
          <circle cx="90" cy="80" r="1.2" fill="#fbbf24" opacity="0.8" />

          {/* ── WAND (from right hand) ── */}
          <line x1="93" y1="76" x2="100" y2="64" stroke="#92400e" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="100" cy="64" r="4" fill="#fbbf24" />
          {/* Wand glow */}
          <circle cx="100" cy="64" r="7" fill="#fbbf24" opacity="0.2">
            <animate attributeName="r" values="5;9;5" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.25;0.08;0.25" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </div>
  )
}
