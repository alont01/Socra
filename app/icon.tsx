import { ImageResponse } from 'next/og'

// Next.js auto-detects this file and serves it as the favicon (all the
// <link rel="icon"> tags are generated for us) — same brand mark as the
// Navbar logo (bg-gradient-to-br from-orange-400 to-orange-600, "∑").
//
// The sigma is drawn as an SVG path rather than the Unicode "∑" character:
// Satori (the renderer behind ImageResponse) never loads real fonts unless
// you explicitly supply font file bytes, and its default font has no glyph
// for U+2211 — it silently renders a "tofu" placeholder box instead. A path
// has no font dependency, so it renders correctly every time.
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #fb923c, #ea580c)',
          borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M17 6 L7 6 L14 12 L7 18 L17 18"
            stroke="#fff"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
