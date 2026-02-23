'use client'

import { useEffect, useState } from 'react'

export type WizardEmotion = 'idle' | 'thinking' | 'celebrate' | 'encourage'

interface WizardProps {
  emotion?: WizardEmotion
  size?: 'sm' | 'lg'
}

const MATH_SYMBOLS = ['∑', 'π', '∫', '√', '∞', '±', '△', 'θ']

type Particle = { id: number; symbol: string; x: number; delay: number }

export function Wizard({ emotion = 'idle', size = 'lg' }: WizardProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  const dim = size === 'lg' ? 148 : 66
  const h = Math.round(dim * 1.4)

  // Spawn math symbol particles when celebrating
  useEffect(() => {
    if (emotion !== 'celebrate') return
    const spawned: Particle[] = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      symbol: MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)],
      x: (Math.random() - 0.5) * 80,
      delay: i * 0.14,
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

  // Mouth path changes with emotion
  const mouth =
    emotion === 'celebrate'
      ? 'M 38 82 Q 50 94 62 82'
      : emotion === 'thinking'
      ? 'M 43 85 L 57 85'
      : 'M 42 83 Q 50 90 58 83'

  const fontSize = size === 'lg' ? 18 : 9

  return (
    <div
      className="relative inline-flex items-end justify-center"
      style={{ width: dim, height: h }}
    >
      {/* Floating math symbol particles on celebrate */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute font-bold pointer-events-none select-none animate-float-up text-orange-500"
          style={{
            left: `calc(50% + ${p.x}px)`,
            top: '0',
            fontSize,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.symbol}
        </span>
      ))}

      {/* Wizard body — animated via wrapper class */}
      <div className={wrapperAnim} style={{ width: dim, height: h }}>
        <svg
          viewBox="0 0 100 140"
          xmlns="http://www.w3.org/2000/svg"
          width={dim}
          height={h}
        >
          {/* ── HAT ── */}
          {/* Shadow under brim */}
          <ellipse cx="50" cy="54" rx="32" ry="5" fill="rgba(0,0,0,0.08)" />
          {/* Hat body (dark side) */}
          <polygon points="50,4 19,52 81,52" fill="#4c1d95" />
          {/* Hat body (lit face) */}
          <polygon points="50,6 21,50 79,50" fill="#5b21b6" />
          {/* Tiny sparkle dots on hat */}
          <circle cx="37" cy="28" r="1.8" fill="#c4b5fd">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2.3s" repeatCount="indefinite" />
            <animate attributeName="r" values="1.5;2.2;1.5" dur="2.3s" repeatCount="indefinite" />
          </circle>
          <circle cx="64" cy="33" r="1.2" fill="#e9d5ff">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="54" cy="18" r="1" fill="#ddd6fe">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.9s" repeatCount="indefinite" />
          </circle>
          {/* Hat brim */}
          <rect x="13" y="50" width="74" height="7" rx="3.5" fill="#6d28d9" />
          {/* Star tip */}
          <text x="50" y="35" textAnchor="middle" fontSize="14">⭐</text>

          {/* ── FACE ── */}
          <ellipse cx="50" cy="76" rx="21" ry="19" fill="#fde68a" />
          {/* Subtle blush */}
          <ellipse cx="38" cy="81" rx="5" ry="3" fill="#fca5a5" opacity="0.4" />
          <ellipse cx="62" cy="81" rx="5" ry="3" fill="#fca5a5" opacity="0.4" />

          {/* ── EYES ── */}
          {emotion === 'celebrate' ? (
            <>
              {/* Happy squint arcs */}
              <path
                d="M 37 71 Q 41 66 45 71"
                stroke="#1c1917" strokeWidth="2.3" fill="none" strokeLinecap="round"
              />
              <path
                d="M 55 71 Q 59 66 63 71"
                stroke="#1c1917" strokeWidth="2.3" fill="none" strokeLinecap="round"
              />
            </>
          ) : emotion === 'thinking' ? (
            <>
              {/* Thoughtful eyes looking upward */}
              <circle cx="41" cy="72" r="4.5" fill="#1c1917" />
              <circle cx="59" cy="72" r="4.5" fill="#1c1917" />
              <circle cx="42" cy="70" r="1.8" fill="white" />
              <circle cx="60" cy="70" r="1.8" fill="white" />
              {/* Raised eyebrow */}
              <path
                d="M 36 65 Q 41 61 46 65"
                stroke="#78350f" strokeWidth="1.5" fill="none" strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {/* Normal warm eyes */}
              <circle cx="41" cy="73" r="4.5" fill="#1c1917" />
              <circle cx="59" cy="73" r="4.5" fill="#1c1917" />
              <circle cx="42.5" cy="71.5" r="1.8" fill="white" />
              <circle cx="60.5" cy="71.5" r="1.8" fill="white" />
            </>
          )}

          {/* Thinking bubbles (only when thinking) */}
          {emotion === 'thinking' && (
            <>
              <circle cx="66" cy="62" r="2.8" fill="#7c3aed">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="cy" values="64;57;50" dur="1.3s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="73" cy="56" r="2.8" fill="#6d28d9">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.43s" repeatCount="indefinite" />
                <animate attributeName="cy" values="58;51;44" dur="1.3s" begin="0.43s" repeatCount="indefinite" />
              </circle>
              <circle cx="80" cy="49" r="2.8" fill="#5b21b6">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.86s" repeatCount="indefinite" />
                <animate attributeName="cy" values="51;44;37" dur="1.3s" begin="0.86s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* ── MOUTH ── */}
          <path d={mouth} stroke="#92400e" strokeWidth="1.8" fill="none" strokeLinecap="round" />

          {/* ── ROBE ── */}
          {/* Main body */}
          <path
            d="M 29 93 L 18 134 L 82 134 L 71 93 Q 60 99 50 99 Q 40 99 29 93 Z"
            fill="#6d28d9"
          />
          {/* Robe highlight fold */}
          <path
            d="M 29 93 Q 40 99 50 99 Q 60 99 71 93 Q 65 97 50 97.5 Q 35 97 29 93 Z"
            fill="#7c3aed"
          />
          {/* Robe decorative stars */}
          <circle cx="44" cy="112" r="2.2" fill="#a78bfa">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle cx="57" cy="121" r="2.2" fill="#a78bfa">
            <animate attributeName="opacity" values="1;0.4;1" dur="2.1s" repeatCount="indefinite" />
          </circle>
          <circle cx="38" cy="124" r="1.6" fill="#c4b5fd">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3.1s" repeatCount="indefinite" />
          </circle>
          <circle cx="63" cy="109" r="1.6" fill="#c4b5fd">
            <animate attributeName="opacity" values="1;0.5;1" dur="1.9s" repeatCount="indefinite" />
          </circle>

          {/* ── ARMS ── */}
          {/* Left arm */}
          <path d="M 29 93 Q 13 107 17 121" stroke="#5b21b6" strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M 29 93 Q 13 107 17 121" stroke="#7c3aed" strokeWidth="8.5" strokeLinecap="round" fill="none" />
          {/* Right arm */}
          <path d="M 71 93 Q 87 107 83 121" stroke="#5b21b6" strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M 71 93 Q 87 107 83 121" stroke="#7c3aed" strokeWidth="8.5" strokeLinecap="round" fill="none" />

          {/* ── WAND (right hand) ── */}
          <line x1="83" y1="121" x2="96" y2="134" stroke="#92400e" strokeWidth="3.2" strokeLinecap="round" />
          {/* Wand star */}
          <circle cx="96" cy="134" r="4.5" fill="#fbbf24" />
          {/* Wand glow pulse */}
          <circle cx="96" cy="134" r="7" fill="#fbbf24" opacity="0.25">
            <animate attributeName="r" values="5;9;5" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.1;0.3" dur="1.6s" repeatCount="indefinite" />
          </circle>

          {/* ── FEET ── */}
          <ellipse cx="37" cy="134" rx="9" ry="4.5" fill="#4c1d95" />
          <ellipse cx="63" cy="134" rx="9" ry="4.5" fill="#4c1d95" />
        </svg>
      </div>
    </div>
  )
}
