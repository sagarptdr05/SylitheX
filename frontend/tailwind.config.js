/** @type {import('tailwindcss').Config} */
// Design tokens live as CSS variables (RGB triples) in src/index.css so every page shares one dark system.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        line: { DEFAULT: v('line'), 2: v('line-2') },
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3') },
        strong: v('strong'),
        // "teal" is the historical name of the primary accent; it is now the cool scientific blue
        teal: { DEFAULT: v('primary'), hover: v('primary-hover'), 50: 'rgb(var(--primary) / 0.08)', 100: 'rgb(var(--primary) / 0.16)' },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover') },
        sky: { DEFAULT: v('cyan') },
        cyan: { DEFAULT: v('cyan') },
        mint: 'rgb(var(--primary) / 0.12)',
        skytint: 'rgb(var(--cyan) / 0.10)',
        sand: 'rgb(var(--warn) / 0.08)',
        pass: { DEFAULT: v('pass'), bg: 'rgb(var(--pass) / 0.14)' },
        warn: { DEFAULT: v('warn'), bg: 'rgb(var(--warn) / 0.14)', ink: v('warn') },
        block: { DEFAULT: v('block'), bg: 'rgb(var(--block) / 0.14)' },
        space: { DEFAULT: '#040810', 2: '#0A1626' },
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 6px 20px -8px rgba(15,23,42,0.10)',
        lift: '0 2px 6px rgba(15,23,42,0.06), 0 24px 48px -16px rgba(15,23,42,0.22)',
        glow: '0 0 0 1px rgb(var(--primary) / 0.35), 0 0 32px -6px rgb(var(--primary) / 0.55)',
      },
      borderRadius: { '2xl': '1rem', '3xl': '1.5rem' },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(0.6)', opacity: '0.9' }, '100%': { transform: 'scale(2.4)', opacity: '0' } },
        scan: { '0%': { transform: 'translateY(-100%)' }, '100%': { transform: 'translateY(100%)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        orbit: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        flow: { '0%': { strokeDashoffset: '24' }, '100%': { strokeDashoffset: '0' } },
      },
      animation: {
        pulseRing: 'pulseRing 2.2s cubic-bezier(0.2,0.6,0.4,1) infinite',
        scan: 'scan 3.5s linear infinite',
        marquee: 'marquee 40s linear infinite',
        orbit: 'orbit 24s linear infinite',
        orbitSlow: 'orbit 60s linear infinite',
        blink: 'blink 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        flow: 'flow 1.2s linear infinite',
      },
    },
  },
  plugins: [],
}
