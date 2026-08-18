import { ImageResponse } from 'next/og'

// Icon used when a user adds socratutoring.com to their iOS/Android home
// screen. Apple's standard size; same brand mark as icon.tsx (see that file
// for why the sigma is an SVG path, not the Unicode "∑" character).
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
        }}
      >
        <svg width="104" height="104" viewBox="0 0 24 24" fill="none">
          <path
            d="M17 6 L7 6 L14 12 L7 18 L17 18"
            stroke="#fff"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
