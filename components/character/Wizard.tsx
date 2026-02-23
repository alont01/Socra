'use client'

import { useEffect, useState } from 'react'

export type WizardEmotion = 'idle' | 'thinking' | 'celebrate' | 'encourage'

interface WizardProps {
  emotion?: WizardEmotion
  size?: 'sm' | 'lg'
}

const MATH_SYMBOLS = ['∑', 'π', '∫', '√', '∞', '△', 'θ', '±']

type Particle = { id: number; symbol: string; x: number; delay: number }

// Clownfish character (Marlin-inspired) — orange body, white stripes, big eyes
export function Wizard({ emotion = 'idle', size = 'lg' }: WizardProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  // viewBox 120×100, aspect ratio 6:5
  const w = size === 'lg' ? 132 : 72
  const h = Math.round(w * (100 / 120))

  useEffect(() => {
    if (emotion !== 'celebrate') return
    const spawned: Particle[] = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      symbol: MATH_SYMBOLS[Math.floor(Math.random() * MATH_SYMBOLS.length)],
      x: (Math.random() - 0.5) * 60,
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

  // Mouth at the right (front) of the fish
  const mouth =
    emotion === 'celebrate'
      ? 'M 97,52 Q 106,60 97,68'
      : emotion === 'thinking'
      ? 'M 100,57 L 100,63'
      : 'M 100,55 Q 106,60 100,65'

  return (
    <div
      className="relative inline-flex items-end justify-center"
      style={{ width: w, height: h }}
    >
      {/* Math bubbles float up on celebrate */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute font-bold pointer-events-none select-none animate-float-up text-orange-400"
          style={{
            left: `calc(50% + ${p.x}px)`,
            top: '0',
            fontSize: size === 'lg' ? 16 : 9,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.symbol}
        </span>
      ))}

      <div className={wrapperAnim} style={{ width: w, height: h }}>
        <svg
          viewBox="0 0 120 100"
          xmlns="http://www.w3.org/2000/svg"
          width={w}
          height={h}
        >
          <defs>
            {/* Clip path to keep stripes inside the body */}
            <clipPath id="archie-body-clip">
              <ellipse cx="57" cy="52" rx="42" ry="28" />
            </clipPath>
          </defs>

          {/* Water shadow */}
          <ellipse cx="58" cy="88" rx="36" ry="6" fill="rgba(0,0,0,0.06)" />

          {/* ── TAIL FIN (behind body) ── */}
          <path
            d="M 16,42 Q 2,34 1,50 Q 2,66 16,58 Q 13,52 16,42 Z"
            fill="#c2410c"
          />
          {/* Tail fin lines */}
          <line x1="16" y1="50" x2="4" y2="42" stroke="#9a3412" strokeWidth="1" opacity="0.5" />
          <line x1="16" y1="50" x2="4" y2="50" stroke="#9a3412" strokeWidth="1" opacity="0.5" />
          <line x1="16" y1="50" x2="4" y2="58" stroke="#9a3412" strokeWidth="1" opacity="0.5" />

          {/* ── BODY ── */}
          <ellipse cx="57" cy="52" rx="42" ry="28" fill="#f97316" />

          {/* ── WHITE STRIPES (clipped to body) ── */}
          <g clipPath="url(#archie-body-clip)">
            {/* Tail-side stripe */}
            <ellipse cx="29" cy="52" rx="6" ry="30" fill="white" />
            <ellipse cx="29" cy="52" rx="6" ry="30" fill="none" stroke="#1c1917" strokeWidth="1.5" />
            {/* Middle stripe */}
            <ellipse cx="49" cy="52" rx="7" ry="30" fill="white" />
            <ellipse cx="49" cy="52" rx="7" ry="30" fill="none" stroke="#1c1917" strokeWidth="1.5" />
            {/* Head stripe (near eye) */}
            <ellipse cx="71" cy="52" rx="7" ry="30" fill="white" />
            <ellipse cx="71" cy="52" rx="7" ry="30" fill="none" stroke="#1c1917" strokeWidth="1.5" />
          </g>

          {/* Body outline */}
          <ellipse cx="57" cy="52" rx="42" ry="28" fill="none" stroke="#c2410c" strokeWidth="2" />

          {/* ── DORSAL FIN (top) ── */}
          <path
            d="M 40,24 Q 52,7 64,24"
            fill="#fb923c"
            stroke="#c2410c"
            strokeWidth="1"
            opacity="0.85"
          />

          {/* ── PECTORAL FIN (small, side) ── */}
          <ellipse
            cx="80"
            cy="68"
            rx="13"
            ry="6"
            fill="#fb923c"
            stroke="#c2410c"
            strokeWidth="1"
            opacity="0.75"
            transform="rotate(-28 80 68)"
          />

          {/* ── EYE (Pixar-large!) ── */}
          {/* White sclera */}
          <circle cx="87" cy="44" r="14" fill="white" />
          <circle cx="87" cy="44" r="14" fill="none" stroke="#c2410c" strokeWidth="1.5" />

          {emotion === 'celebrate' ? (
            <>
              {/* Happy squint arc */}
              <path
                d="M 73,44 Q 87,32 101,44"
                stroke="#1c1917" strokeWidth="3" fill="none" strokeLinecap="round"
              />
            </>
          ) : emotion === 'thinking' ? (
            <>
              {/* Eye looking up */}
              <circle cx="87" cy="41" r="9" fill="#fb923c" />
              <circle cx="87" cy="40" r="6" fill="#1c1917" />
              <circle cx="90" cy="37" r="2.5" fill="white" />
              {/* Raised eyebrow fin */}
              <path
                d="M 77,28 Q 87,24 97,28"
                stroke="#c2410c" strokeWidth="2" fill="none" strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {/* Normal warm eye */}
              <circle cx="87" cy="46" r="9" fill="#fb923c" />
              <circle cx="87" cy="47" r="6" fill="#1c1917" />
              <circle cx="90" cy="43" r="2.5" fill="white" />
            </>
          )}

          {/* Thinking bubbles (float toward top-right) */}
          {emotion === 'thinking' && (
            <>
              <circle cx="102" cy="32" r="3" fill="white" stroke="#fb923c" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="cy" values="35;26;17" dur="1.3s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="108" cy="24" r="3" fill="white" stroke="#f97316" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.43s" repeatCount="indefinite" />
                <animate attributeName="cy" values="27;18;9" dur="1.3s" begin="0.43s" repeatCount="indefinite" />
              </circle>
              <circle cx="114" cy="16" r="3" fill="white" stroke="#ea580c" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.3s" begin="0.86s" repeatCount="indefinite" />
                <animate attributeName="cy" values="19;10;1" dur="1.3s" begin="0.86s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* ── MOUTH ── */}
          <path d={mouth} stroke="#c2410c" strokeWidth="2.5" fill="none" strokeLinecap="round" />

          {/* Gill line */}
          <path
            d="M 72,36 Q 75,52 72,68"
            stroke="#c2410c" strokeWidth="1.2" fill="none" opacity="0.4"
          />

          {/* Animated scale shimmer */}
          <ellipse cx="50" cy="48" rx="8" ry="5" fill="white" opacity="0.08">
            <animate attributeName="opacity" values="0.05;0.12;0.05" dur="2.5s" repeatCount="indefinite" />
          </ellipse>
        </svg>
      </div>
    </div>
  )
}
