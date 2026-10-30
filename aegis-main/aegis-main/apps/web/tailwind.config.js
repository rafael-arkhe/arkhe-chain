/** @type {import('tailwindcss').Config} */
module.exports = {
  // Wave D.2 (2026-05-23): dark-mode por classe `dark` no <html>.
  // Permite o Carbon `theme: 'light' | 'dark' | 'auto'` aplicar superfícies
  // operacionais (bg-deep + bg-panel-dark) sem refatorar todas as
  // páginas — o sala viewer aplica/remove a classe via efeito.
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces (operacional / escuro)
        deep: '#0A0E14',
        'panel-dark': '#14181E',
        'raised-dark': '#1A1F2A',
        'border-dark': '#262B33',
        'text-on-dark': '#E6E9EE',
        'muted-on-dark': '#8A93A0',
        // Surfaces (analítico / claro)
        'canvas-light': '#FFFFFF',
        'panel-light': '#F4F6F8',
        'raised-light': '#ECEFF2',
        'border-light': '#D7DBDF',
        'text-on-light': '#14181E',
        'muted-on-light': '#5C6470',
        // Acentos
        primary: { DEFAULT: '#2D77BE', foreground: '#FFFFFF' },
        'primary-hover': '#4A8FD1',
        focus: '#3F8DDA',
        // Classificação
        'cls-sigiloso': '#C8341F',
        'cls-confidencial': '#E97D2A',
        'cls-restrito': '#E8B33B',
        'cls-publico': '#3D9F58',
        // Status
        success: '#3D9F58',
        warning: '#E8B33B',
        danger: '#C8341F',
        info: '#2D77BE',
        neutral: '#8A93A0',
        // Destaque premium — tag "topo de linha AIP" (roxo sóbrio, não infantil).
        featured: '#7C5CBF',
        // ─── shadcn semantic tokens (mapeiam pros tokens existentes) ─────
        background: '#FFFFFF',
        foreground: '#14181E',
        card: { DEFAULT: '#FFFFFF', foreground: '#14181E' },
        popover: { DEFAULT: '#FFFFFF', foreground: '#14181E' },
        secondary: { DEFAULT: '#F4F6F8', foreground: '#14181E' },
        muted: { DEFAULT: '#F4F6F8', foreground: '#5C6470' },
        accent: { DEFAULT: '#ECEFF2', foreground: '#14181E' },
        destructive: { DEFAULT: '#C8341F', foreground: '#FFFFFF' },
        border: '#D7DBDF',
        input: '#D7DBDF',
        ring: '#3F8DDA',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      fontSize: {
        caption: ['11px', '14px'],
        small: ['12px', '16px'],
        body: ['14px', '20px'],
        h3: ['14px', '20px'],
        h2: ['16px', '22px'],
        h1: ['20px', '28px'],
        display: ['24px', '32px'],
      },
      // Zera TODOS os rounded-* — UI sharp Palantir-style
      // (feedback_no_rounded_no_sparkles).
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
      boxShadow: {
        'panel-dark': '0 4px 12px rgba(0,0,0,0.18)',
        'panel-light': '0 4px 12px rgba(20,24,30,0.06)',
      },
    },
  },
  plugins: [],
};
