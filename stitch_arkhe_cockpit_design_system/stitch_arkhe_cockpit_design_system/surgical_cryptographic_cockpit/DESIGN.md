---
name: Surgical Cryptographic Cockpit
colors:
  surface: '#101419'
  surface-dim: '#101419'
  surface-bright: '#36393f'
  surface-container-lowest: '#0a0e13'
  surface-container-low: '#181c21'
  surface-container: '#121820'
  surface-container-high: '#262a30'
  surface-container-highest: '#31353b'
  on-surface: '#e0e2ea'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#e0e2ea'
  inverse-on-surface: '#2d3136'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#89ceff'
  on-secondary: '#00344d'
  secondary-container: '#00a2e6'
  on-secondary-container: '#00344e'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e29100'
  on-tertiary-container: '#523200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#101419'
  on-background: '#e0e2ea'
  surface-variant: '#31353b'
  surface-base: '#0b0f14'
  surface-elevated: '#182230'
  border-subtle: '#1e293b'
  border-grid: '#1f2937'
  status-verified: '#10b981'
  status-refuted: '#f43f5e'
  status-conjecture: '#f59e0b'
  status-pending: '#0ea5e9'
  text-muted: '#64748b'
  text-subtle: '#475569'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.06em
  code-dense:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

# Arkhe Cockpit Design System

## Brand & Aesthetic Vision
- **Theme:** Surgical Terminal / High-Assurance Cryptographic Cockpit
- **Tone:** Rigorous, mathematically grounded, fail-closed, precise, mission-critical.
- **Visual Style:** Native dark mode with deep obsidian/charcoal canvas (`#0b0f14`), subtle border grids, glowing precision status indicators, dense information architecture without clutter.
- **Typography:**
  - Data / Hashes / Cryptographic Keys / Proof steps: `JetBrains Mono`, `ui-monospace`, monospace.
  - Interface Labels / Prose / Headings: `Inter`, sans-serif.

## Semantic Color Palette (Evidence Semantics)
- **Background / Canvas:** `#0b0f14` (Deep Space / Charcoal Slate)
- **Surface / Card Container:** `#121820` (Subtle border `#1f2937` or `#1e293b`)
- **Surface High / Elevated:** `#182230`
- **Integrity / Verified / Allow (`LEMMA` / `VerifiedRelease`):**
  - Text & Glow: Emerald `#10b981` / `#34d399`
  - Subtle bg: `rgba(16, 185, 129, 0.12)`
  - Border: `rgba(16, 185, 129, 0.3)`
- **Refuted / Error / Breach (`REFUTED` / `Rejected` / `EVIDENCE_DEGRADED`):**
  - Text & Pulse: Crimson / Rose `#f43f5e` / `#ef4444`
  - Subtle bg: `rgba(239, 68, 68, 0.12)`
  - Border: `rgba(239, 68, 68, 0.35)`
- **Conjecture / Pending Review / Incomplete (`CONJECTURE` / `Escalate` / `Incomplete`):**
  - Text: Amber `#f59e0b` / `#fbbf24`
  - Subtle bg: `rgba(245, 158, 11, 0.12)`
  - Border: `rgba(245, 158, 11, 0.3)`
- **Pending / Active Binding (`PENDING` / `IdentityBinding`):**
  - Text: Cyan / Cobalt Blue `#0ea5e9` / `#38bdf8`
  - Subtle bg: `rgba(14, 165, 233, 0.12)`
  - Border: `rgba(14, 165, 233, 0.3)`
- **Muted / Inactive Layer / Locked:**
  - Slate Muted: `#64748b`, `#475569`, borders `#1e293b`

## Core Component Patterns
1. **The Triad Gauges (Integrity, Authority, Availability):**
   - Circular telemetry rings with crisp status, live percentage/quorum metric, and cryptographic guarantee labels.
2. **Fail-Closed Gateways:**
   - Inviolable visual guards. Actions disabled with typed error tags (`Incomplete{diagnóstico}`) when evidence is deficient.
3. **L0–L9 Vertical Layer Stack:**
   - Layer hierarchy display with locked locks on L2/L3, pulsing sync nodes on L8 (Hashtree/Radicle), and failure cascade indicators.
4. **Cryptographic Proof Trees & Checkpoint Logs:**
   - Monospace telemetry log blocks with pass/fail glyphs `[✔]`, `[!]`, and hexadecimal hash representations (`BLAKE3`, `narHash`, `nhash`).
5. **Epistemic Badges (τ Status):**
   - High-contrast micro-chips (`LEMMA`, `CONJECTURE`, `REFUTED`, `PENDING`).
