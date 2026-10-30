---
name: Sovereign Ledger
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#b4c5ff'
  on-secondary: '#002a78'
  secondary-container: '#0053db'
  on-secondary-container: '#cdd7ff'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#1bbd85'
  on-tertiary-container: '#00452e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
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
  mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.02em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: -0.01em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
  label-badge:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an institutional, high-assurance visual language crafted specifically for mission-critical sovereign cryptographic infrastructure, regulatory compliance, and distributed trust anchors (RBB, ICP-Brasil, Hardware Security Modules, and Rekor transparency logs).

The brand targets C-level enterprise stakeholders, compliance officers, security auditors, and cryptographic systems engineers. The visual atmosphere conveys unyielding technical integrity, cryptographic finality, and sovereign legal validity. It rejects playful consumer tropes in favor of an exacting, high-density, mathematical aesthetic: cold obsidian environments, surgical hairline delimiters, clear cryptographic telemetry, and distinct status signifiers that indicate mathematical proof rather than optimistic assumptions.

The aesthetic fuses **Modern Technical Minimalist** and **Cryptographic Console**:
- Obsidian surfaces with layered depth to reduce eye strain during continuous audit operations.
- Ultra-precise 1px micro-borders to maintain structural grid density without visual noise.
- Monospace typographic accents for cryptographic artifacts (hashes, public key fingerprints, digest signatures, merkle roots).
- Crisp chromatic indicators tied strictly to regulatory and verification states: anchored finality, mathematical lemmas, pending consensus, and compliance warnings.

## Colors

The palette is engineered around dark cryptographic substrates, contrasting clinical neutral backgrounds against illuminated functional accents:

- **Surface & Canvas:**
  - `canvas-default`: `#0B0F17` (Deep Obsidian) serves as the primary canvas.
  - `surface-base`: `#111827` (Deep Slate) for structural navigation, sidebars, and panels.
  - `surface-elevated`: `#161F30` for cards, verification manifests, and dialogs.
  - `surface-overlay`: `#1E293B` for hover states and active inspection drawers.
  - `border-subtle`: `#1F2937` (Standard 1px micro-borders).
  - `border-prominent`: `#374151` (Active or highlighted containers).

- **Cryptographic & Institutional Accents:**
  - `primary` (`#06B6D4` / `#0891B2`): Cryptographic Cyan. Denotes telemetry, cryptographic proofs, cryptographic queries, and key state transitions.
  - `secondary` (`#2563EB`): Sovereign Cobalt. Anchors institutional authority, executive controls, root sector selectors, and sovereign identity contexts.
  - `tertiary` / `integrity` (`#10B981`): Audit Emerald. Used exclusively for verified states, immutable merkle receipts, valid ICP-Brasil certificates, and active HSM integrity.
  - `warning` (`#F59E0B`): Regulatory Amber. Highlights pending reconciliations, conjecture states, time-drift notices, and statutory review obligations (BACEN / LGPD flags).
  - `danger` (`#EF4444`): Proof invalidation, hash collisions, signature revoking, or HSM airgap alerts.
  - `neutral-text-primary`: `#F9FAFB` for high-contrast legible data readouts.
  - `neutral-text-secondary`: `#94A3B8` for metadata, labels, and secondary context.
  - `neutral-text-muted`: `#64748B` for disabled states and passive timestamps.

## Typography

The typography couples the institutional neutrality of **Inter** with the rigorous technical precision of **JetBrains Mono**.

- **Inter** handles narrative structure, executive dashboard metrics, section titles, and user inputs. Its neutral geometric proportions maintain balance across data-dense views.
- **JetBrains Mono** governs all cryptographic materials: SHA-256 digests, transaction receipts, RBB block numbers, public-key IDs, Rekor log indices, payload sizes, and verification state badges (`ANCHORED`, `VERIFIED`, `CONJECTURE`).
- **Cryptographic Artifact Display Rule:** Never truncate raw hashes unpredictably. Hash values must use `mono-md` or `mono-sm` alongside middle-ellipsis truncation (e.g., `0x7a4e…b91f`) with complete copy/inspect micro-actions.

## Layout & Spacing

The layout operates on a **Fixed Grid with Fluid Interior Columns**, configured for multi-monitor auditing environments and high-density operator dashboards.

- **Desktop (1280px+):** 12-column layout with fixed 240px utility sidebar, `margin: 2rem`, and `gutter: 1rem`. Content centers within a maximum boundary of `1600px` for ultra-wide displays to maintain rapid visual scanning.
- **Tablet (768px - 1279px):** 8-column layout with collapsable sidebar navigation, `margin: 1.5rem`, and `gutter: 1rem`.
- **Mobile (< 768px):** 4-column layout, `margin: 1rem`, `gutter: 0.75rem`. Complex audit manifests reflow from multi-attribute data tables into linear verification cards.

Vertical rhythm relies strictly on the `space-*` scale. High-frequency telemetry displays leverage `space-xs` (4px) and `space-sm` (8px) gaps to optimize visual density without crowding data points. Section wrappers employ `space-lg` (24px) to `space-xl` (32px).

## Elevation & Depth

Visual hierarchy uses a **Tonal Layering and Micro-Border Architecture** rather than heavy blurred drop shadows. This preserves clarity across dark surfaces:

- **Tier 0 (Root Bedrock):** `#0B0F17`. Deepest background plane. Flat, unlit.
- **Tier 1 (Surface Module):** `#111827` framed with a 1px border of `#1F2937`. Used for primary dashboard cards, ledger feed containers, and tabular wrappers.
- **Tier 2 (Elevated Inspection):** `#161F30` framed with 1px `#374151`. Used for active drawers, modal dialogs, and expanded transaction inspector panels.
- **Tier 3 (State Glow / Focus Context):** Controlled 0px 0px 12px ambient light halos tinting the respective semantic channel:
  - Cyan proof halo: `rgba(6, 182, 212, 0.15)`
  - Emerald validation glow: `rgba(16, 185, 129, 0.15)`
  - Amber pending aura: `rgba(245, 158, 11, 0.15)`
- **Glass Transparency Rule:** Restrict backdrop-blur strictly to persistent top header rails and contextual HUD strips using `rgba(11, 15, 23, 0.85)` with `backdrop-filter: blur(8px)`.

## Shapes

The design uses **Soft (Level 1)** geometry, employing precise 4px corners (`0.25rem`) for base controls and 8px corners (`0.5rem`) for structural containers. 

This restrained rounding conveys architectural stability, technical rigour, and terminal precision, deliberately avoiding the playfulness of pill-shaped or bubbly interfaces. Circular or pill geometries are reserved exclusively for compliance guarantee indicators and micro-status badges to maximize distinction against structural cards.

## Components

### 1. Header Navigation & Context Selectors
- **Sector & Persona Switcher:** Top-bar anchored, dual segmented dropdown framed with 1px `#1F2937`. Accommodates organizational context (e.g., `Financial Services / BACEN Tier 1`) and operational persona (e.g., `Auditor-General`, `Security Operator`, `Compliance Officer`). Active selection displays a subtle `#2563EB` left-border accent.
- **Compliance Guarantee Badges:** Compact institutional capsules located at the top right:
  - `ICP-Brasil`: Cobalt border, `#161F30` fill, monospace label, accompanied by an authentic cryptographic shield glyph.
  - `BACEN`: Amber-toned compliance check indicator.
  - `LGPD`: Emerald data privacy assurance indicator.

### 2. State & Proof Badges (Verification Tags)
Badges use `label-badge` typography in uppercase, with uppercase track spacing (`0.05em`) and high-density padding (`2px 6px`):
- `LEMMA`: Cyan border (`#0891B2`), background `rgba(6, 182, 212, 0.10)`, text `#06B6D4`. Indicates formal cryptographic claim.
- `CONJECTURE`: Indigo border (`#4F46E5`), background `rgba(79, 70, 229, 0.10)`, text `#818CF8`. Indicates unverified computation.
- `PENDING`: Amber border (`#D97706`), background `rgba(245, 158, 11, 0.10)`, text `#F59E0B`. Indicates awaiting inclusion in RBB or HSM queue.
- `ANCHORED`: Cobalt border (`#2563EB`), background `rgba(37, 99, 235, 0.12)`, text `#60A5FA`. Indicates proof locked to RBB block/Rekor index.
- `VERIFIED`: Emerald border (`#059669`), background `rgba(16, 185, 129, 0.12)`, text `#34D399`. Indicates complete cryptographic validation across all anchors.

### 3. Buttons & Action Anchors
- **Primary Sovereign Action:** Solid `#06B6D4` background, text `#0B0F17` in medium-weight Inter, transitioning to `#22D3EE` on hover. Used for final verification runs, key-signing invocations, and ledger commitments.
- **Secondary Institutional Action:** Surface `#111827`, border 1px `#374151`, text `#F9FAFB`. Border transitions to `#06B6D4` on hover.
- **Destructive Action:** Border 1px `#EF4444`, background `rgba(239, 68, 68, 0.10)`, text `#FCA5A5`. Used for root-key revocation or ledger dispute filing.

### 4. Input Fields & Cryptographic Parameter Controls
- Background `#0B0F17`, border 1px `#1F2937`, text `#F9FAFB`.
- Focus state triggers an immediate crisp border color change to `#06B6D4` alongside an ambient cyan ring (`0 0 0 1px #06B6D4`).
- Monospace inputs (for hashes, public keys, and Merkle tree roots) feature embedded instant-validation checks and dedicated one-click copy tokens.

### 5. Cards & Ledger Manifest Containers
- Built on `#111827` surface with 1px `#1F2937` borders and 8px border radius.
- Cards feature a structural metadata header divided by a 1px inner hairline, containing the proof timestamp, ledger sequence number, and verified status badge.
- Interactive cards exhibit a 1px border highlight shift to `#374151` and an elevated surface tint of `#161F30` on hover.

### 6. Verification Timeline & Merkle Tree Visualizers
- Vertical or horizontal pipeline nodes rendered with 2px connecting lines in `#1F2937` (unverified) or `#10B981` (anchored).
- Nodes contain micro-indicators reflecting real-time state: HSM signature generation -> RBB consensus anchor -> Rekor transparency log recording.