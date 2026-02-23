'use client'

import { useEffect, useState } from 'react'

export type WizardEmotion = 'idle' | 'thinking' | 'celebrate' | 'encourage'

interface WizardProps {
  emotion?: WizardEmotion
  size?: 'xs' | 'sm' | 'lg'
}

const SPARKLES = ['✦', '★', '✧', '⭐', '✨', '∑', 'π', '∞']

type Particle = { id: number; symbol: string; x: number; delay: number }

// Portrait wizard: viewBox 80×100
export function Wizard({ emotion = 'idle', size = 'lg' }: WizardProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  const w = size === 'lg' ? 80 : size === 'sm' ? 60 : 40
  const h = Math.round(w * (100 / 80))

  useEffect(() => {
    if (emotion !== 'celebrate') return
    const spawned: Particle[] = Array.from({ length: 6 }, (_, i) => ({
      id: Date.now() + i,
      symbol: SPARKLES[Math.floor(Math.random() * SPARKLES.length)],
      x: (Math.random() - 0.5) * 50,
      delay: i * 0.12,
    }))
    setParticles(spawned)
    const t = setTimeout(() => setParticles([]), 1400)
    return () => clearTimeout(t)
  }, [emotion])

  const wrapperAnim = {
    idle: 'animate-wizard-float',
    thinking: 'animate-wizard-tilt',
    celebrate: 'animate-wizard-celebrate',
    encourage: 'animate-wizard-wave',
  }[emotion]

  // Iris position shifts per emotion
  const leftIris =
    emotion === 'thinking'
      ? { cx: 31, cy: 51 }   // looking up
      : emotion === 'encourage'
      ? { cx: 31, cy: 55 }   // soft downward (warm look)
      : { cx: 31, cy: 53 }   // idle / celebrate (celebrate uses arcs instead)

  const rightIris =
    emotion === 'thinking'
      ? { cx: 49, cy: 51 }
      : emotion === 'encourage'
      ? { cx: 49, cy: 55 }
      : { cx: 49, cy: 53 }

  // Eyebrow paths
  const leftBrow =
    emotion === 'thinking'
      ? 'M 23,44 Q 30,39 37,43'   // raised & arched
      : emotion === 'celebrate'
      ? 'M 23,44 Q 30,40 37,44'   // lifted excitement
      : emotion === 'encourage'
      ? 'M 24,47 Q 30,44 36,47'   // gentle & soft
      : 'M 24,46 Q 30,43 36,46'   // idle

  const rightBrow =
    emotion === 'thinking'
      ? 'M 43,43 Q 50,39 57,44'
      : emotion === 'celebrate'
      ? 'M 43,44 Q 50,40 57,44'
      : emotion === 'encourage'
      ? 'M 44,47 Q 50,44 56,47'
      : 'M 44,46 Q 50,43 56,46'

  // Mouth paths
  const mouth =
    emotion === 'celebrate'
      ? 'M 30,67 Q 40,77 50,67'      // big open grin
      : emotion === 'thinking'
      ? 'M 36,68 Q 40,66 44,68'      // flat / barely curved
      : emotion === 'encourage'
      ? 'M 33,67 Q 40,73 47,67'      // warm wide smile
      : 'M 33,67 Q 40,72 47,67'      // idle gentle smile

  return (
    <div
      className="relative inline-flex items-end justify-center"
      style={{ width: w, height: h }}
    >
      {/* Sparkle particles on celebrate */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute font-bold pointer-events-none select-none animate-float-up text-yellow-400"
          style={{
            left: `calc(50% + ${p.x}px)`,
            top: '5%',
            fontSize: size === 'lg' ? 13 : size === 'sm' ? 9 : 6,
            animationDelay: `${p.delay}s`,
          }}
        >
          {p.symbol}
        </span>
      ))}

      <div className={wrapperAnim} style={{ width: w, height: h }}>
        <svg
          viewBox="0 0 80 100"
          xmlns="http://www.w3.org/2000/svg"
          width={w}
          height={h}
        >
          {/* Ground shadow */}
          <ellipse cx="40" cy="98" rx="18" ry="3.5" fill="rgba(0,0,0,0.07)" />

          {/* ── ROBE ── */}
          <path
            d="M 27,72 Q 14,86 11,98 L 69,98 Q 66,86 53,72 Z"
            fill="#5b21b6"
          />
          {/* Robe sheen */}
          <path
            d="M 35,73 Q 30,84 29,98"
            stroke="#7c3aed"
            strokeWidth="1.5"
            fill="none"
            opacity="0.35"
          />
          {/* Robe star decorations */}
          <circle cx="40" cy="84" r="2" fill="#a78bfa" opacity="0.85" />
          <circle cx="29" cy="91" r="1.5" fill="#a78bfa" opacity="0.65" />
          <circle cx="52" cy="89" r="1.5" fill="#a78bfa" opacity="0.65" />
          <circle cx="43" cy="94" r="1" fill="#c4b5fd" opacity="0.6" />

          {/* ── COLLAR / NECK ── */}
          <path d="M 27,72 Q 36,81 40,76 Q 44,81 53,72" fill="#7c3aed" />
          {/* Collar jewel */}
          <circle cx="40" cy="74" r="3.5" fill="#fbbf24" />
          <circle cx="40" cy="74" r="3.5" fill="none" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx="41" cy="73" r="1" fill="white" opacity="0.7" />

          {/* ── HEAD ── */}
          <circle cx="40" cy="53" r="22" fill="#fef3c7" />
          <circle cx="40" cy="53" r="22" fill="none" stroke="#fde68a" strokeWidth="1" />

          {/* ── HAT BRIM ── */}
          <ellipse cx="40" cy="33" rx="28" ry="6" fill="#4c1d95" />
          <ellipse cx="40" cy="33" rx="28" ry="6" fill="none" stroke="#3b0764" strokeWidth="1" />

          {/* ── HAT CONE ── */}
          <path d="M 40,2 L 14,33 L 66,33 Z" fill="#5b21b6" />
          {/* Cone shading */}
          <path d="M 40,2 L 16,30" stroke="#4c1d95" strokeWidth="2" opacity="0.4" />
          {/* Cone highlight */}
          <path d="M 40,2 L 58,26" stroke="#7c3aed" strokeWidth="1.2" opacity="0.3" />

          {/* ── HAT STAR ── */}
          <polygon
            points="40,6 41.8,11.5 47.5,11.5 43,14.8 44.8,20 40,16.8 35.2,20 37,14.8 32.5,11.5 38.2,11.5"
            fill="#fbbf24"
          />
          <polygon
            points="40,6 41.8,11.5 47.5,11.5 43,14.8 44.8,20 40,16.8 35.2,20 37,14.8 32.5,11.5 38.2,11.5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="0.5"
          />

          {/* ── CHEEKS ── */}
          <circle cx="21" cy="58" r="6" fill="#f87171" opacity="0.18" />
          <circle cx="59" cy="58" r="6" fill="#f87171" opacity="0.18" />

          {/* ── EYEBROWS ── */}
          <path
            d={leftBrow}
            stroke="#92400e"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={rightBrow}
            stroke="#92400e"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* ── EYES ── */}
          {emotion === 'celebrate' ? (
            <>
              {/* Happy squint arcs */}
              <path
                d="M 24,51 Q 31,44 38,51"
                stroke="#1c1917"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M 42,51 Q 49,44 56,51"
                stroke="#1c1917"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              {/* Left eye */}
              <circle cx="31" cy="53" r="7.5" fill="white" />
              <circle cx="31" cy="53" r="7.5" fill="none" stroke="#e8c98a" strokeWidth="0.5" />
              <circle cx={leftIris.cx} cy={leftIris.cy} r="4.5" fill="#f59e0b" />
              <circle cx={leftIris.cx} cy={leftIris.cy} r="3" fill="#1c1917" />
              <circle cx={leftIris.cx + 1.5} cy={leftIris.cy - 2} r="1.5" fill="white" />

              {/* Right eye */}
              <circle cx="49" cy="53" r="7.5" fill="white" />
              <circle cx="49" cy="53" r="7.5" fill="none" stroke="#e8c98a" strokeWidth="0.5" />
              <circle cx={rightIris.cx} cy={rightIris.cy} r="4.5" fill="#f59e0b" />
              <circle cx={rightIris.cx} cy={rightIris.cy} r="3" fill="#1c1917" />
              <circle cx={rightIris.cx + 1.5} cy={rightIris.cy - 2} r="1.5" fill="white" />
            </>
          )}

          {/* ── NOSE ── */}
          <ellipse cx="40" cy="60" rx="2" ry="1.5" fill="#e8b48a" />

          {/* ── MOUTH ── */}
          <path
            d={mouth}
            stroke="#92400e"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />

          {/* ── THINKING SPARKLES ── */}
          {emotion === 'thinking' && (
            <>
              <circle cx="60" cy="26" r="3" fill="white" stroke="#a78bfa" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0s" repeatCount="indefinite" />
                <animate attributeName="cy" values="30;22;14" dur="1.2s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="67" cy="18" r="3" fill="white" stroke="#7c3aed" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
                <animate attributeName="cy" values="22;14;6" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="74" cy="10" r="3" fill="white" stroke="#5b21b6" strokeWidth="1">
                <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
                <animate attributeName="cy" values="14;6;-2" dur="1.2s" begin="0.8s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          {/* ── WAND (encourage only) ── */}
          {emotion === 'encourage' && (
            <>
              <line x1="58" y1="72" x2="72" y2="88" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
              <circle cx="72" cy="88" r="3" fill="#fbbf24" />
              <circle cx="72" cy="88" r="3" fill="none" stroke="#f59e0b" strokeWidth="0.8" />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}
