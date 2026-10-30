---
name: Arkhe Synthetics
colors:
  surface: '#0f131b'
  surface-dim: '#0f131b'
  surface-bright: '#353941'
  surface-container-lowest: '#0a0e15'
  surface-container-low: '#181c23'
  surface-container: '#1c2027'
  surface-container-high: '#262a32'
  surface-container-highest: '#31353d'
  on-surface: '#dfe2ed'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dfe2ed'
  inverse-on-surface: '#2d3038'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#7bd0ff'
  on-secondary: '#00354a'
  secondary-container: '#00a6e0'
  on-secondary-container: '#00374d'
  tertiary: '#d8ffe7'
  on-tertiary: '#003824'
  tertiary-container: '#65f2b5'
  on-tertiary-container: '#006d4a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131b'
  on-background: '#dfe2ed'
  surface-variant: '#31353d'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style
The design system establishes a high-integrity, mission-critical operational workspace engineered for cryptographic verification, formal methods tooling, and deterministic proof pipelines. Its aesthetic is grounded in **Technical Cybernetic Brutalism paired with Precision High-Density Telemetry**.

The target audience comprises cryptographers, security research engineers, and formal verification architects who interact with complex AST trees, zero-knowledge constraint circuits, and automated theorem provers. The interface avoids frivolous decorative flair, prioritizing low eye-strain, surgical information hierarchy, deterministic status recognition, and immediate visual feedback. 

Visual signatures include structural void surfaces, calibrated 1px technical divider grids, crisp monospace telemetry readouts, status glows with disciplined luminescence, and compact layout density that treats screen space with zero waste.

## Colors
The color architecture relies on high-contrast tactical dark surfaces, deep void planes, and luminous signal colors that convey verified cryptographic states.

### Palette Architecture
- **Obsidian Voids (Canvas & Foundation):** 
  - Base canvas: `#090D14` (absolute low-luminescence base)
  - Surface Tier 1 (Panels, Nav): `#0D1322`
  - Surface Tier 2 (Cards, Interactive Drawers): `#0F172A`
  - Surface Elevated (Popovers, Modals): `#151E34`
- **Structural Dividers & Outlines:**
  - Ghost border: `#1E293B`
  - Active/Focused border: `#334155`
  - Accent focus ring: `rgba(0, 240, 255, 0.45)`
- **Core Signal Vectors:**
  - **Terminal Cyan / Electric Pulse (`#00F0FF`):** Primary interactive focus, active AST nodes, active trace states, primary buttons.
  - **Sub-Zero Blue (`#38BDF8`):** Secondary interactive components, hovered items, telemetry metrics, metadata links.
  - **Integrity Emerald (`#10B981`):** Formally proven gates, passing constraint sets, verified zero-knowledge circuits, invariant matches.
  - **Telemetry Amber (`#F59E0B`):** Unresolved lemmas, solver timeouts, structural warnings, unoptimized constraint weights.
  - **Fail-Closed Crimson (`#EF4444`):** Verification rejections, proof disproofs, invalid circuit constraints, integrity breaches.

Color is strictly functional: no colored glow or hue appears unless indicating state, structural verification, or direct user focus.

## Typography
The typographic system pairs the cold geometric structure of **Space Grotesk** for structural section titles and system headers, the dense legibility of **Geist** for documentation and operational parameters, and the mathematical precision of **JetBrains Mono** for all code blocks, telemetry feeds, mathematical assertions, hashes, and gate statuses.

- All hashes, public keys, memory addresses, and proof constraints render exclusively in `JetBrains Mono` with tabular numerals (`tnum`) activated by default.
- Structural status badges and micro-telemetry utilize uppercase `label-caps` for optimal legibility at micro scales.

## Layout & Spacing
The layout model employs an ultra-compact, high-efficiency pane architecture configured as a split-workbench. It utilizes a fluid CSS grid framework anchored to strict 4px grid intervals:

- **Desktop (>=1280px):** Multi-column workbench with a collapsible tree-explorer panel (260px fixed), primary interactive verification pipeline / canvas (fluid, spans remaining width), and a context-sensitive telemetry inspector sidebar (320px fixed).
- **Tablet (768px - 1279px):** Two-pane view with collapsible secondary telemetry drawers, overlay inspector, and fixed 12px gutters.
- **Mobile (<768px):** Single-column stacked mode with tabbed pane switching (`Explorer`, `Pipeline`, `Inspector`) and 8px compact edge margins.

Dense information packing is maintained across all views: gap allowances prioritize maximum code and node visibility over open void padding.

## Elevation & Depth
Elevation in this system eschews soft, diffuse skeuomorphic drop shadows. Instead, it relies on **Tonal Stratification with Crisp Low-Contrast Outlines and Selective Photonic Back-Glows**:

- **Ground Zero (Canvas):** Pure `#090D14` back-surface.
- **Tier 1 (Base Panels & Code Viewers):** `#0D1322` bounded by 1px solid `#1E293B`.
- **Tier 2 (Cards, Gates & Nodes):** `#0F172A` with 1px border `#334155`.
- **Active Node Accent Elevation:** When a verification gate, pipeline node, or telemetry block is actively focused, its border switches to `#00F0FF` with a tightly bounded linear photonic outline: `0 0 12px rgba(0, 240, 255, 0.25)`.
- **Floating Overlays & Context Menus:** Layered at `#151E34` with a 1px border of `#38BDF8` (at 40% alpha) and a deep directional drop shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.8)`.

## Shapes
A constrained roundedness level of `1` (Soft: 0.25rem / 4px default) enforces an engineered, machine-tooled profile across the entire workspace.

- **Panels, Windows, & Cards:** 4px radius (`0.25rem`) to preserve strict architectural alignment.
- **Interactive Badges & Status Chips:** 2px to 4px radius for a technical hardware tag look (avoiding soft organic capsules).
- **Code Highlights & Inline Variables:** 2px radius.
- **Pipeline Gate Connectors:** Square or chamfered terminals to preserve mechanical feel.

## Components

### 1. Buttons
- **Primary Cybernetic Action:** Background `#00F0FF`, text `#090D14` (semi-bold monospace), 4px border radius. On hover: background `#38BDF8`, subtle glow `0 0 8px rgba(0,240,255,0.4)`.
- **Secondary Ghost Action:** Transparent background, 1px solid `#334155`, text `#F8FAFC`. On hover: border-color `#38BDF8`, background `rgba(56, 189, 248, 0.08)`.
- **Destructive Fail-Closed Action:** Background `rgba(239, 68, 68, 0.1)`, 1px solid `#EF4444`, text `#EF4444`.

### 2. Status Pill Badges
- Compact inline components formatted with `label-caps`.
- **Verified:** Background `rgba(16, 185, 129, 0.12)`, border `1px solid rgba(16, 185, 129, 0.3)`, text `#10B981`, leading pulse dot in solid `#10B981`.
- **Warning / Lemma:** Background `rgba(245, 158, 11, 0.12)`, border `1px solid rgba(245, 158, 11, 0.3)`, text `#F59E0B`.
- **Rejected / Invalid:** Background `rgba(239, 68, 68, 0.12)`, border `1px solid rgba(239, 68, 68, 0.3)`, text `#EF4444`.

### 3. Verification Gate Pipeline Visualizer
- Horizontal linked node sequence.
- **Node Structure:** Rectangular 4px card containing gate title (`Space Grotesk`), proof duration in ms (`JetBrains Mono`), and pass/fail icon.
- **Connecting Traces:** 2px lines in `#1E293B` when pending, animated luminous `#00F0FF` trace when executing, and solid `#10B981` when verified.

### 4. Interactive Tabs & Navigation
- Flat, industrial tabs bordered at the bottom by `#1E293B`.
- Active tab features an underline of `#00F0FF` with a height of 2px and a text color of `#00F0FF`, while inactive tabs remain `#94A3B8`.

### 5. Code & Tree Explorer
- Vertical hierarchical file and invariant tree.
- Indent guides: 1px continuous hairline `#1E293B`.
- Active file/symbol node features a subtle `#00F0FF` left border notch (2px width) and background `rgba(0, 240, 255, 0.06)`.

### 6. Inputs & Telemetry Fields
- Dark input fields: `#090D14` background, `#1E293B` border, text `#F8FAFC` in `JetBrains Mono`.
- Active focus state: Border `#00F0FF` with immediate box-shadow ring `0 0 0 1px #00F0FF`.
- Integrated telemetry labels pinned inside the upper-right or upper-left corner using `label-caps` in `#64748B`.