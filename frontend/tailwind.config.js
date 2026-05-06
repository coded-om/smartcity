/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        surface: {
          950: '#020617',
          900: '#0a0f1e',
          800: '#0d1424',
          700: '#111827',
          600: '#1a2235',
          500: '#1e2a3f',
          400: '#243047',
          300: '#2d3a52',
        },
        danger:  { DEFAULT: '#ef4444', dark: '#b91c1c' },
        warning: { DEFAULT: '#f59e0b', dark: '#b45309' },
        success: { DEFAULT: '#10b981', dark: '#065f46' },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'ping-slow': 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'fade-in':   'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      boxShadow: {
        'glow-cyan':   '0 0 20px rgba(6,182,212,0.25)',
        'glow-red':    '0 0 20px rgba(239,68,68,0.25)',
        'glow-amber':  '0 0 20px rgba(245,158,11,0.25)',
      },
    },
  },
  plugins: [],
};
