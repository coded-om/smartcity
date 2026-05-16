/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1565C0',
          light:   '#5E92F3',
          dark:    '#003C8F',
          container: '#D3E4FF',
          on:        '#001C3D',
        },
        secondary: {
          DEFAULT: '#006495',
          light:   '#4B93C8',
          dark:    '#003865',
          container: '#CAE7FF',
        },
        tertiary: {
          DEFAULT: '#5B5EA6',
          container: '#E2DFFF',
        },
        error: {
          DEFAULT: '#BA1A1A',
          container: '#FFDAD6',
        },
        surface: {
          DEFAULT:  'rgb(var(--s-900) / <alpha-value>)',
          950: 'rgb(var(--s-950) / <alpha-value>)',
          900: 'rgb(var(--s-900) / <alpha-value>)',
          800: 'rgb(var(--s-800) / <alpha-value>)',
          700: 'rgb(var(--s-700) / <alpha-value>)',
          600: 'rgb(var(--s-600) / <alpha-value>)',
          500: 'rgb(var(--s-500) / <alpha-value>)',
          400: 'rgb(var(--s-400) / <alpha-value>)',
          300: 'rgb(var(--s-300) / <alpha-value>)',
          variant: '#DDE3EA',
        },
        success: { DEFAULT: '#006E2C', container: '#98F5A0' },
        warning: { DEFAULT: '#7D5700', container: '#FFDEA6' },
        danger:  { DEFAULT: '#BA1A1A', dark: '#93000A' },
        info:    { DEFAULT: '#006493', container: '#CAE7FF' },
        accent:  { DEFAULT: '#BA1A1A', '300': '#ff5449', '400': '#e53935', '500': '#BA1A1A' },
        outline:           '#72787E',
        'outline-variant': '#C1C7CE',
      },
      fontFamily: {
        sans: ['Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xs:   '4px',
        sm:   '8px',
        md:   '12px',
        lg:   '16px',
        xl:   '28px',
        full: '9999px',
      },
      animation: {
        'ping-slow':     'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-in-left': 'slideInLeft 0.2s ease-out',
      },
      keyframes: {
        fadeIn:      { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { '0%': { opacity: '0', transform: 'translateX(-12px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
      },
      boxShadow: {
        'md3-1': '0 1px 2px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.06)',
        'md3-2': '0 2px 4px rgba(0,0,0,.1), 0 1px 6px rgba(0,0,0,.08)',
        'md3-3': '0 4px 8px rgba(0,0,0,.1), 0 2px 8px rgba(0,0,0,.08)',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
};
