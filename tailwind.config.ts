import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        cream: '#FFFBF5',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s ease-out forwards',
        'wizard-float': 'wizardFloat 3s ease-in-out infinite',
        'wizard-tilt': 'wizardTilt 1.4s ease-in-out infinite',
        'wizard-celebrate': 'wizardCelebrate 0.7s ease-out forwards',
        'wizard-wave': 'wizardWave 1.8s ease-in-out infinite',
        'float-up': 'floatUp 1s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        wizardFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        wizardTilt: {
          '0%, 100%': { transform: 'rotate(-7deg)' },
          '50%': { transform: 'rotate(7deg)' },
        },
        wizardCelebrate: {
          '0%': { transform: 'scale(1) translateY(0)' },
          '35%': { transform: 'scale(1.22) translateY(-18px)' },
          '65%': { transform: 'scale(0.95) translateY(-4px)' },
          '100%': { transform: 'scale(1) translateY(0)' },
        },
        wizardWave: {
          '0%, 100%': { transform: 'rotate(0deg) translateX(0)' },
          '50%': { transform: 'rotate(6deg) translateX(3px)' },
        },
        floatUp: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-52px) scale(0.5)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
