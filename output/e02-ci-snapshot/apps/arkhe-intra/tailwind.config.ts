import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: {
  colors: { primary: { DEFAULT: '#1E40AF', dark: '#1E3A8A', light: '#DBEAFE' }, accent: '#7C3AED', background: '#F8FAFC', surface: '#FFFFFF', ink: '#0F172A', muted: '#475569', border: '#E2E8F0' },
  fontFamily: { sans: ['Inter', 'Segoe UI', 'sans-serif'], display: ['Poppins', 'Inter', 'Segoe UI', 'sans-serif'], mono: ['IBM Plex Mono', 'Consolas', 'monospace'] }
} }, plugins: [] } satisfies Config;
