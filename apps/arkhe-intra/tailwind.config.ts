import type { Config } from 'tailwindcss';

// Cockpit tokens (stitch_arkhe_cockpit_design_system/surgical_cryptographic_cockpit/DESIGN.md)
// live under `ck` and resolve to CSS variables set only inside `.cockpit`
// (app/cockpit.css), so the light Intra theme is unaffected.
const ck = (name: string) => `rgb(var(--ck-${name}) / <alpha-value>)`;

export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: {
  colors: {
    primary: { DEFAULT: '#1E40AF', dark: '#1E3A8A', light: '#DBEAFE' }, accent: '#7C3AED', background: '#F8FAFC', surface: '#FFFFFF', ink: '#0F172A', muted: '#475569', border: '#E2E8F0',
    ck: {
      canvas: ck('canvas'), surface: ck('surface'), elevated: ck('elevated'), border: ck('border'),
      text: ck('text'), 'text-2': ck('text-2'), muted: ck('muted'), faint: ck('faint'),
      lemma: ck('lemma'), refuted: ck('refuted'), conjecture: ck('conjecture'), pending: ck('pending'),
    },
  },
  fontFamily: {
    sans: ['Inter', 'Segoe UI', 'sans-serif'], display: ['Poppins', 'Inter', 'Segoe UI', 'sans-serif'], mono: ['IBM Plex Mono', 'Consolas', 'monospace'],
    'ck-sans': ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
    'ck-mono': ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'ui-monospace', 'monospace'],
  },
  fontSize: {
    // Content never goes below 12px (DESIGN.md code-dense 10px / label-mono-sm 11px are metadata-only).
    'ck-headline': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
    'ck-title': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '500' }],
    'ck-body': ['14px', { lineHeight: '20px' }],
    'ck-label': ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '500' }],
    'ck-meta': ['11px', { lineHeight: '14px', letterSpacing: '0.06em', fontWeight: '500' }],
  },
} }, plugins: [] } satisfies Config;
