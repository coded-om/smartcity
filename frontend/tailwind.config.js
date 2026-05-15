/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dusk Blue — primary actions, active nav, links
        primary: {
          50:  '#edf1f6',
          100: '#d0dbe8',
          200: '#a9c0d4',
          300: '#7fa3be',
          400: '#5685a9',
          500: '#355070',   // Dusk Blue base
          600: '#2c4460',
          700: '#233650',
          800: '#1a2940',
          900: '#111c30',
          950: '#090f1e',
        },
        // Dusty Lavender — secondary buttons, tags, sub-nav
        secondary: {
          50:  '#f3f0f5',
          100: '#e2dce7',
          200: '#c8bad2',
          300: '#ad97bb',
          400: '#9174a4',
          500: '#6d597a',   // Dusty Lavender base
          600: '#5c4a67',
          700: '#4b3b54',
          800: '#3a2d41',
          900: '#291e2e',
        },
        // Rosewood — critical/danger badges
        accent: {
          50:  '#faf0f2',
          100: '#f3dce1',
          200: '#e8b9c2',
          300: '#d995a3',
          400: '#c97285',
          500: '#b56576',   // Rosewood base
          600: '#9a5463',
          700: '#7f4351',
          800: '#643240',
          900: '#49212f',
        },
        // Light Coral — HIGH alerts, warnings
        coral: {
          50:  '#fdf3f3',
          100: '#fae4e4',
          200: '#f5c8c9',
          300: '#efaaac',
          400: '#e98b8e',
          500: '#e56b6f',   // Light Coral base
          600: '#c25a5e',
          700: '#9f494c',
          800: '#7c383b',
          900: '#59272a',
        },
        // Light Bronze — info highlights, sensor data
        bronze: {
          50:  '#fdf8f4',
          100: '#faede3',
          200: '#f5d9c5',
          300: '#f0c4a6',
          400: '#eab891',
          500: '#eaac8b',   // Light Bronze base
          600: '#c79074',
          700: '#a3735d',
          800: '#805746',
          900: '#5d3a2f',
        },
        // Surface tones — driven by CSS variables for dark/light theming
        surface: {
          950: 'rgb(var(--s-950) / <alpha-value>)',
          900: 'rgb(var(--s-900) / <alpha-value>)',
          800: 'rgb(var(--s-800) / <alpha-value>)',
          700: 'rgb(var(--s-700) / <alpha-value>)',
          600: 'rgb(var(--s-600) / <alpha-value>)',
          500: 'rgb(var(--s-500) / <alpha-value>)',
          400: 'rgb(var(--s-400) / <alpha-value>)',
          300: 'rgb(var(--s-300) / <alpha-value>)',
        },
        danger:  { DEFAULT: '#e56b6f', dark: '#b56576' },
        warning: { DEFAULT: '#eaac8b', dark: '#c79074' },
        success: { DEFAULT: '#10b981', dark: '#065f46' },
        info:    { DEFAULT: '#6d597a', dark: '#4b3b54' },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      animation: {
        'ping-slow':       'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'fade-in':         'fadeIn 0.3s ease-in-out',
        'slide-in-left':   'slideInLeft 0.25s ease-out',
        'slide-in-right':  'slideInRight 0.25s ease-out',
        'accordion-down':  'accordionDown 0.2s ease-out',
        'accordion-up':    'accordionUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn:        { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft:   { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight:  { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        accordionDown: { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        accordionUp:   { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      boxShadow: {
        'glow-primary':  '0 0 20px rgba(0,150,199,0.45)',
        'glow-accent':   '0 0 20px rgba(181,101,118,0.35)',
        'glow-coral':    '0 0 20px rgba(229,107,111,0.35)',
        'glow-bronze':   '0 0 20px rgba(0,180,216,0.4)',
        'card':          '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover':    '0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
};
