# DESIGN.md — Arkhe-Intra
```yaml
---
name: Arkhe-Intra
version: 1.0.0
description: >
  Sistema de design para a intranet empresarial verificável Arkhe-Intra.
  Combina princípios de digital workplace corporativo com a camada
  fiduciária Arkhe: verificação criptográfica, evidência causal e
  fail-closed por construção.
theme:
  mode: light
  default: true
tokens:
  colors:
    # ── Marca ──────────────────────────────────────────────────────
    primary:
      value: "#1E40AF"
      role: "Ações primárias, links, navegação ativa, CTAs"
      description: >
        Azul corporativo profundo. Transmite confiança, estabilidade
        e autoridade institucional. Usado em botões primários, links
        e estados de navegação ativa.
    primary-dark:
      value: "#1E3A8A"
      role: "Hover/pressed states de primary"
      description: "Variação escura de primary para estados interativos."
    primary-light:
      value: "#DBEAFE"
      role: "Backgrounds de seleção, badges informativos"
      description: "Variação clara de primary para superfícies de destaque."
    accent:
      value: "#7C3AED"
      role: "Destaques secundários, badges, indicadores de IA"
      description: >
        Violeta de acento. Usado para destacar funcionalidades de IA,
        badges de verificação e elementos premium.
    # ── Semânticas de status (Arkhe) ─────────────────────────────
    success:
      value: "#059669"
      role: "Verdict PASS, verificações aprovadas, evidência válida"
      description: "Verde esmeralda para resultados de verificação positivos."
    warning:
      value: "#D97706"
      role: "Verdict INCONCLUSIVE, avisos de política"
      description: "Âmbar para estados que requerem atenção."
    danger:
      value: "#DC2626"
      role: "Verdict FAIL, erros, bloqueios de política"
      description: "Vermelho para falhas de verificação e bloqueios."
    info:
      value: "#0284C7"
      role: "Informações contextuais, dicas"
      description: "Azul ciano para mensagens informativas."
    # ── Superfícies ────────────────────────────────────────────────
    background:
      value: "#F8FAFC"
      role: "Background da página"
      description: "Cinza muito claro para o fundo geral da aplicação."
    surface:
      value: "#FFFFFF"
      role: "Cards, modais, superfícies elevadas"
      description: "Branco puro para superfícies de conteúdo."
    surface-raised:
      value: "#FFFFFF"
      role: "Superfícies com elevação"
      description: "Branco com sombra para elementos elevados."
    surface-sunken:
      value: "#F1F5F9"
      role: "Áreas rebaixadas, code blocks"
      description: "Cinza claro para áreas de conteúdo secundário."
    # ── Texto ──────────────────────────────────────────────────────
    text-primary:
      value: "#0F172A"
      role: "Texto principal, headings"
      description: "Quase-preto para máxima legibilidade."
    text-secondary:
      value: "#475569"
      role: "Texto secundário, metadata, captions"
      description: "Cinza médio para hierarquia secundária."
    text-tertiary:
      value: "#94A3B8"
      role: "Placeholders, texto desabilitado"
      description: "Cinza claro para conteúdo de baixa prioridade."
    text-inverse:
      value: "#FFFFFF"
      role: "Texto sobre superfícies escuras"
      description: "Branco para texto sobre primary ou danger."
    # ── Bordas ────────────────────────────────────────────────────
    border:
      value: "#E2E8F0"
      role: "Bordas padrão, divisores"
      description: "Cinza claro para separação de conteúdo."
    border-strong:
      value: "#CBD5E1"
      role: "Bordas de destaque"
      description: "Cinza médio para bordas com maior contraste."
    # ── Arkhe ──────────────────────────────────────────────────────
    arkhe-pass:
      value: "#059669"
      role: "Status de verificação PASS"
      description: "Verde para verificações aprovadas."
    arkhe-fail:
      value: "#DC2626"
      role: "Status de verificação FAIL"
      description: "Vermelho para falhas de verificação."
    arkhe-inconclusive:
      value: "#D97706"
      role: "Status de verificação INCONCLUSIVE"
      description: "Âmbar para verificações inconclusivas."
    arkhe-digest:
      value: "#6366F1"
      role: "Indicadores de digest, hashes, evidência"
      description: "Índigo para elementos relacionados a criptografia."
  typography:
    fontFamily:
      sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      display: "Poppins, Inter, sans-serif"
      mono: "'IBM Plex Mono', 'Fira Code', monospace"
    scale:
      display-lg:
        fontFamily: "{typography.fontFamily.display}"
        fontSize: "48px"
        lineHeight: "1.1"
        fontWeight: 700
        letterSpacing: "-0.02em"
      display-md:
        fontFamily: "{typography.fontFamily.display}"
        fontSize: "36px"
        lineHeight: "1.2"
        fontWeight: 700
        letterSpacing: "-0.02em"
      heading-1:
        fontFamily: "{typography.fontFamily.display}"
        fontSize: "30px"
        lineHeight: "1.25"
        fontWeight: 600
      heading-2:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "24px"
        lineHeight: "1.3"
        fontWeight: 600
      heading-3:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "20px"
        lineHeight: "1.4"
        fontWeight: 600
      heading-4:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "18px"
        lineHeight: "1.4"
        fontWeight: 600
      body-lg:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "18px"
        lineHeight: "1.6"
        fontWeight: 400
      body-md:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "16px"
        lineHeight: "1.6"
        fontWeight: 400
      body-sm:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "14px"
        lineHeight: "1.5"
        fontWeight: 400
      caption:
        fontFamily: "{typography.fontFamily.sans}"
        fontSize: "12px"
        lineHeight: "1.4"
        fontWeight: 500
        letterSpacing: "0.01em"
      code:
        fontFamily: "{typography.fontFamily.mono}"
        fontSize: "14px"
        lineHeight: "1.5"
        fontWeight: 400
  spacing:
    scale:
      "0": "0px"
      "1": "4px"
      "2": "8px"
      "3": "12px"
      "4": "16px"
      "5": "20px"
      "6": "24px"
      "8": "32px"
      "10": "40px"
      "12": "48px"
      "16": "64px"
      "20": "80px"
      "24": "96px"
  borderRadius:
    none: "0px"
    sm: "4px"
    md: "8px"
    lg: "12px"
    xl: "16px"
    full: "9999px"
  elevation:
    "0":
      shadow: "none"
      role: "Flat surfaces"
    "1":
      shadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
      role: "Cards, subtle elevation"
    "2":
      shadow: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)"
      role: "Raised cards, dropdowns"
    "3":
      shadow: "0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)"
      role: "Modals, popovers"
    "4":
      shadow: "0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)"
      role: "Drawers, floating panels"
    "5":
      shadow: "0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.04)"
      role: "Full-screen overlays, command palette"
  motion:
    duration:
      instant: "0ms"
      fast: "150ms"
      normal: "250ms"
      slow: "350ms"
      deliberate: "500ms"
    easing:
      default: "cubic-bezier(0.4, 0, 0.2, 1)"
      enter: "cubic-bezier(0, 0, 0.2, 1)"
      exit: "cubic-bezier(0.4, 0, 1, 1)"
      spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  breakpoints:
    sm: "640px"
    md: "768px"
    lg: "1024px"
    xl: "1280px"
    "2xl": "1536px"
  zIndex:
    base: "0"
    dropdown: "1000"
    sticky: "1100"
    overlay: "1200"
    modal: "1300"
    popover: "1400"
    toast: "1500"
    commandPalette: "1600"
---
```
---
## Overview
Arkhe-Intra é a intranet empresarial verificável da sua organização. Não é apenas um portal — é o **digital workplace fiduciário** onde cada comunicação, documento, aprovação e transição de estado é criptograficamente verificável, content-addressed e fail-closed.
### Filosofia de Design
**1. Autoridade visível, nunca implícita.**
Cada elemento que representa uma decisão de política, verificação ou evidência carrega um indicador visual claro do seu estado (PASS / FAIL / INCONCLUSIVE). O usuário nunca precisa adivinhar se uma informação foi verificada.
**2. Hierarquia informacional sobre densidade.**
A intranet prioriza scannability e clareza. Espaçamento generoso, tipografia hierárquica e agrupamento lógico de conteúdo. O usuário encontra o que precisa em até 2 cliques a partir da home.
**3. Confiança através da transparência.**
Elementos de verificação Arkhe são exibidos de forma acessível: digests truncados, status de verificação com cores semânticas e links para provas de inclusão Rekor. A complexidade criptográfica é encapsulada, mas nunca ocultada.
**4. Personalização com propósito.**
Conteúdo direcionado por papel, departamento e localização. Navegação dinâmica adaptada ao perfil do usuário, sem sacrificar a previsibilidade estrutural.
---
## Colors
### Paleta Principal
| Token | Valor | Uso |
|-------|-------|-----|
| `primary` | `#1E40AF` | Botões primários, links, navegação ativa, CTAs |
| `primary-dark` | `#1E3A8A` | Hover/pressed states |
| `primary-light` | `#DBEAFE` | Backgrounds de seleção, badges informativos |
| `accent` | `#7C3AED` | Destaques de IA, badges premium, indicadores de verificação |
### Semânticas de Status (Arkhe)
| Token | Valor | Uso |
|-------|-------|-----|
| `success` / `arkhe-pass` | `#059669` | Verdict PASS, verificações aprovadas |
| `warning` / `arkhe-inconclusive` | `#D97706` | Verdict INCONCLUSIVE, avisos de política |
| `danger` / `arkhe-fail` | `#DC2626` | Verdict FAIL, erros, bloqueios |
| `info` | `#0284C7` | Informações contextuais |
| `arkhe-digest` | `#6366F1` | Indicadores de digest, hashes, evidência |
### Superfícies
| Token | Valor | Uso |
|-------|-------|-----|
| `background` | `#F8FAFC` | Fundo geral da aplicação |
| `surface` | `#FFFFFF` | Cards, modais, superfícies elevadas |
| `surface-sunken` | `#F1F5F9` | Áreas rebaixadas, code blocks |
### Acessibilidade
Todas as combinações texto-fundo devem atender WCAG 2.2 AA (contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande).
| Combinação | Contraste | Nível |
|-----------|-----------|-------|
| `text-primary` sobre `surface` | 15.8:1 | AAA |
| `text-secondary` sobre `surface` | 6.9:1 | AA+ |
| `text-tertiary` sobre `surface` | 3.2:1 | A (apenas texto grande) |
| `text-inverse` sobre `primary` | 8.4:1 | AAA |
| `success` sobre `surface` | 4.8:1 | AA |
| `danger` sobre `surface` | 4.9:1 | AA |
**Nunca** use `text-tertiary` para texto de corpo. Use `text-secondary` ou `text-primary`.
---
## Typography
### Famílias
| Papel | Família | Fallback |
|-------|---------|----------|
| **Sans** | Inter | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| **Display** | Poppins | `Inter, sans-serif` |
| **Mono** | IBM Plex Mono | `'Fira Code', monospace` |
### Escala Tipográfica
| Token | Tamanho | Line-height | Peso | Uso |
|-------|---------|-------------|------|-----|
| `display-lg` | 48px | 1.1 | 700 | Hero da home, títulos de destaque |
| `display-md` | 36px | 1.2 | 700 | Títulos de seção |
| `heading-1` | 30px | 1.25 | 600 | Título principal de página |
| `heading-2` | 24px | 1.3 | 600 | Título de seção |
| `heading-3` | 20px | 1.4 | 600 | Título de card, subtítulo |
| `heading-4` | 18px | 1.4 | 600 | Título de widget |
| `body-lg` | 18px | 1.6 | 400 | Corpo de destaque |
| `body-md` | 16px | 1.6 | 400 | Corpo padrão |
| `body-sm` | 14px | 1.5 | 400 | Metadata, texto secundário |
| `caption` | 12px | 1.4 | 500 | Labels, badges, legendas |
| `code` | 14px | 1.5 | 400 | Digests, hashes, código inline |
### Regras
- **Headings** usam `display` ou `sans` conforme a hierarquia. Nunca use `mono` para headings.
- **Digests e hashes** sempre em `code`. Trunque para 8 caracteres em listas: `a1b2c3d4…`.
- **Line-height** nunca inferior a 1.4 para texto de corpo.
- **Letter-spacing** negativo apenas em `display` sizes.
---
## Layout
### Grid
Sistema de 12 colunas com gap variável por breakpoint:
| Breakpoint | Colunas | Gap | Margin |
|-----------|---------|-----|--------|
| `sm` (≥640px) | 4 | 16px | 16px |
| `md` (≥768px) | 8 | 20px | 24px |
| `lg` (≥1024px) | 12 | 24px | 32px |
| `xl` (≥1280px) | 12 | 24px | 48px |
| `2xl` (≥1536px) | 12 | 32px | 64px |
### Container
| Token | Largura Máxima |
|-------|----------------|
| `container-narrow` | 720px |
| `container-default` | 1200px |
| `container-wide` | 1440px |
| `container-full` | 100% |
### Estrutura de Página
```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (sticky)                                            │
│  Logo · Navegação principal · Busca · Notificações · Avatar │
├─────────────────────────────────────────────────────────────┤
│  ARKHE STATUS BANNER (condicional)                          │
│  Verificação PASS/FAIL/INCONCLUSIVE do tenant               │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  SIDEBAR     │  CONTEÚDO PRINCIPAL                          │
│  (navegação  │                                              │
│   contextual)│  ┌──────────────────────────────────────┐    │
│              │  │  Page Header (título + ações)        │    │
│  · Hub atual │  ├──────────────────────────────────────┤    │
│  · Sub-páginas│ │  Conteúdo                            │    │
│  · Favoritos │  │                                      │    │
│              │  └──────────────────────────────────────┘    │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  FOOTER                                                     │
│  Links úteis · Status Arkhe · Versão · Ajuda                │
└─────────────────────────────────────────────────────────────┘
```
### Espaçamento entre Seções
| Contexto | Token |
|----------|-------|
| Entre seções de página | `spacing.12` (48px) |
| Entre cards de grid | `spacing.6` (24px) |
| Entre campos de formulário | `spacing.4` (16px) |
| Padding interno de card | `spacing.6` (24px) |
| Padding de página (mobile) | `spacing.4` (16px) |
| Padding de página (desktop) | `spacing.8` (32px) |
---
## Elevation & Depth
| Nível | Token | Uso |
|-------|-------|-----|
| 0 | `elevation.0` | Superfícies flat, backgrounds |
| 1 | `elevation.1` | Cards padrão, list items |
| 2 | `elevation.2` | Cards elevados, dropdowns |
| 3 | `elevation.3` | Modais, popovers |
| 4 | `elevation.4` | Drawers, painéis laterais |
| 5 | `elevation.5` | Overlays full-screen, command palette |
**Regra:** Nunca combine borda e sombra no mesmo elemento para indicar elevação. Use um ou outro.
---
## Shapes
| Token | Valor | Uso |
|-------|-------|-----|
| `radius.none` | 0px | Tabelas, code blocks |
| `radius.sm` | 4px | Badges, tags, inputs |
| `radius.md` | 8px | Botões, cards, modais |
| `radius.lg` | 12px | Cards grandes, painéis |
| `radius.xl` | 16px | Hero sections, empty states |
| `radius.full` | 9999px | Avatares, pills, botões circulares |
---
## Components
### Button
```yaml
button-primary:
  backgroundColor: "{colors.primary}"
  textColor: "{colors.text-inverse}"
  borderRadius: "{borderRadius.md}"
  padding: "{spacing.3} {spacing.6}"
  fontFamily: "{typography.scale.body-md.fontFamily}"
  fontSize: "{typography.scale.body-md.fontSize}"
  fontWeight: 600
  transition: "background-color {motion.duration.fast} {motion.easing.default}"
  states:
    hover: { backgroundColor: "{colors.primary-dark}" }
    active: { backgroundColor: "{colors.primary-dark}", transform: "scale(0.98)" }
    focus: { outline: "2px solid {colors.primary}", outlineOffset: "2px" }
    disabled: { opacity: 0.5, cursor: "not-allowed" }
button-secondary:
  backgroundColor: "{colors.surface}"
  textColor: "{colors.text-primary}"
  border: "1px solid {colors.border}"
  borderRadius: "{borderRadius.md}"
  padding: "{spacing.3} {spacing.6}"
  states:
    hover: { backgroundColor: "{colors.surface-sunken}" }
button-ghost:
  backgroundColor: "transparent"
  textColor: "{colors.primary}"
  border: "none"
  borderRadius: "{borderRadius.md}"
  padding: "{spacing.2} {spacing.4}"
  states:
    hover: { backgroundColor: "{colors.primary-light}" }
button-danger:
  backgroundColor: "{colors.danger}"
  textColor: "{colors.text-inverse}"
  borderRadius: "{borderRadius.md}"
  padding: "{spacing.3} {spacing.6}"
```
### Card
```yaml
card:
  backgroundColor: "{colors.surface}"
  borderRadius: "{borderRadius.lg}"
  padding: "{spacing.6}"
  boxShadow: "{elevation.1.shadow}"
  border: "1px solid {colors.border}"
  transition: "box-shadow {motion.duration.fast} {motion.easing.default}"
  states:
    hover: { boxShadow: "{elevation.2.shadow}" }
card-arkhe-verified:
  extends: "card"
  borderLeft: "3px solid {colors.success}"
  description: "Card com indicador de verificação Arkhe PASS"
```
### Arkhe Verification Badge
```yaml
arkhe-badge:
  display: "inline-flex"
  alignItems: "center"
  gap: "{spacing.1}"
  padding: "{spacing.1} {spacing.3}"
  borderRadius: "{borderRadius.full}"
  fontFamily: "{typography.scale.caption.fontFamily}"
  fontSize: "{typography.scale.caption.fontSize}"
  fontWeight: 600
arkhe-badge-pass:
  extends: "arkhe-badge"
  backgroundColor: "#ECFDF5"
  textColor: "{colors.success}"
  border: "1px solid #A7F3D0"
arkhe-badge-fail:
  extends: "arkhe-badge"
  backgroundColor: "#FEF2F2"
  textColor: "{colors.danger}"
  border: "1px solid #FECACA"
arkhe-badge-inconclusive:
  extends: "arkhe-badge"
  backgroundColor: "#FFFBEB"
  textColor: "{colors.warning}"
  border: "1px solid #FDE68A"
arkhe-digest:
  fontFamily: "{typography.scale.code.fontFamily}"
  fontSize: "{typography.scale.code.fontSize}"
  color: "{colors.arkhe-digest}"
  backgroundColor: "{colors.surface-sunken}"
  padding: "{spacing.1} {spacing.2}"
  borderRadius: "{borderRadius.sm}"
  cursor: "pointer"
  description: "Digest truncado com tooltip para hash completo"
```
### Navigation
```yaml
nav-item:
  display: "flex"
  alignItems: "center"
  gap: "{spacing.3}"
  padding: "{spacing.3} {spacing.4}"
  borderRadius: "{borderRadius.md}"
  fontFamily: "{typography.scale.body-sm.fontFamily}"
  fontSize: "{typography.scale.body-sm.fontSize}"
  fontWeight: 500
  color: "{colors.text-secondary}"
  transition: "all {motion.duration.fast} {motion.easing.default}"
  states:
    hover: { backgroundColor: "{colors.surface-sunken}", color: "{colors.text-primary}" }
    active: { backgroundColor: "{colors.primary-light}", color: "{colors.primary}", fontWeight: 600 }
nav-group:
  padding: "{spacing.2} 0"
  borderBottom: "1px solid {colors.border}"
mega-menu:
  backgroundColor: "{colors.surface}"
  borderRadius: "{borderRadius.lg}"
  boxShadow: "{elevation.3.shadow}"
  padding: "{spacing.6}"
  minWidth: "600px"
  display: "grid"
  gridTemplateColumns: "repeat(3, 1fr)"
  gap: "{spacing.6}"
```
### Search
```yaml
search-input:
  width: "100%"
  maxWidth: "480px"
  padding: "{spacing.3} {spacing.4}"
  paddingLeft: "40px"  # ícone de busca
  borderRadius: "{borderRadius.md}"
  border: "1px solid {colors.border}"
  backgroundColor: "{colors.surface}"
  fontFamily: "{typography.scale.body-md.fontFamily}"
  fontSize: "{typography.scale.body-md.fontSize}"
  states:
    focus: { borderColor: "{colors.primary}", boxShadow: "0 0 0 3px {colors.primary-light}" }
search-results:
  backgroundColor: "{colors.surface}"
  borderRadius: "{borderRadius.lg}"
  boxShadow: "{elevation.3.shadow}"
  maxHeight: "480px"
  overflowY: "auto"
search-result-item:
  padding: "{spacing.3} {spacing.4}"
  borderRadius: "{borderRadius.md}"
  cursor: "pointer"
  states:
    hover: { backgroundColor: "{colors.surface-sunken}" }
```
### Arkhe Status Banner
```yaml
arkhe-status-banner:
  width: "100%"
  padding: "{spacing.2} {spacing.6}"
  fontFamily: "{typography.scale.body-sm.fontFamily}"
  fontSize: "{typography.scale.body-sm.fontSize}"
  fontWeight: 500
  borderBottom: "1px solid"
arkhe-status-banner-pass:
  extends: "arkhe-status-banner"
  backgroundColor: "#ECFDF5"
  textColor: "#065F46"
  borderColor: "#A7F3D0"
arkhe-status-banner-fail:
  extends: "arkhe-status-banner"
  backgroundColor: "#FEF2F2"
  textColor: "#991B1B"
  borderColor: "#FECACA"
arkhe-status-banner-inconclusive:
  extends: "arkhe-status-banner"
  backgroundColor: "#FFFBEB"
  textColor: "#92400E"
  borderColor: "#FDE68A"
```
---
## Patterns
### Hub-Site Architecture
A navegação segue o modelo **hub-site**:
| Nível | Componente | Descrição |
|-------|-----------|-----------|
| **Site Raiz** | Home | Página de destino global, notícias corporativas, links universais |
| **Hubs** | `/hubs/[slug]` | Agrupamento por departamento ou iniciativa |
| **Sites** | `/hubs/[hub]/[site]` | Páginas departamentais e de projetos |
| **Páginas** | `/hubs/[hub]/[site]/[page]` | Conteúdo granular |
**Regra:** O usuário deve alcançar qualquer página em ≤ 2 cliques a partir da home.
### Personalized Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  BOM DIA, [Nome]                         [Avatar] [Notif.]   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  MINHAS TAREFAS     │  │  NOTÍCIAS PARA VOCÊ         │   │
│  │  · Aprovar despesa  │  │  · [Dept] Nova política...  │   │
│  │  · Revisar política │  │  · [Role] Treinamento...    │   │
│  │  · Assinar documento│  │  · [Local] Evento...        │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  ACESSO RÁPIDO      │  │  STATUS ARKHE               │   │
│  │  · RH · TI · Docs   │  │  ✅ PASS — último: 2min     │   │
│  │  · Férias · Helpdesk│  │  📋 1.247 evidências        │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
### Document Publishing Flow
```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Draft   │───▶│  Review  │───▶│ Approved │───▶│ Published│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
  Autor cria     Content Mgr      Site Owner      Sistema
  assina com     valida contra    aprova e        canonicaliza,
  Ed25519        PolicyCore       assina          digere, ancora
                                                    em Rekor
```
Cada transição de estado produz um `EvidenceNode` no WormGraph e é ancorada no Rekor.
---
## Do's and Don'ts
### Cores
| ✅ Faça | ❌ Não faça |
|---------|------------|
| Use `primary` para ações primárias | Introduza cores fora da paleta sem justificativa |
| Use `success`/`warning`/`danger` apenas para status de verificação | Use cores semânticas como decoração |
| Documente contraste WCAG ao lado de cada token | Ignore contraste em favor de estética |
| Use `surface-sunken` para áreas de conteúdo secundário | Misture `surface` e `background` sem hierarquia clara |
### Tipografia
| ✅ Faça | ❌ Não faça |
|---------|------------|
| Mantenha no máximo 3 tamanhos por página | Use mais de 4 pesos diferentes numa página |
| Use `code` para digests e hashes | Use `mono` para texto de corpo |
| Trunque digests para 8 chars em listas | Exiba hashes completos de 64 chars sem tooltip |
| Use `display` apenas para hero e títulos de seção | Use `display` em cards ou widgets |
### Layout
| ✅ Faça | ❌ Não faça |
|---------|------------|
| Limite a home a 5–7 widgets | Encha a home com 15+ widgets |
| Priorize scannability sobre densidade | Compacte conteúdo para "caber mais" |
| Use whitespace generoso entre seções | Use bordas para separar tudo |
| Garanta que qualquer página seja alcançável em ≤ 2 cliques | Crie hierarquias profundas (5+ níveis) |
### Componentes
| ✅ Faça | ❌ Não faça |
|---------|------------|
| Use `arkhe-badge` para status de verificação | Invente novos indicadores de verificação |
| Exiba digests truncados com tooltip | Mostre hashes completos inline |
| Use `elevation` OU `border` para separação, nunca ambos | Combine sombra e borda no mesmo elemento |
| Garanta estados de hover, focus e disabled | Deixe estados interativos implícitos |
### Arkhe
| ✅ Faça | ❌ Não faça |
|---------|------------|
| Exiba status de verificação de forma proeminente | Oculte falhas de verificação |
| Vincule digests a provas de inclusão Rekor | Exiba evidência sem link para verificação |
| Use `arkhe-digest` para elementos criptográficos | Use cores arbitrárias para hashes |
| Trate `INCONCLUSIVE` como estado válido | Force `PASS` ou `FAIL` quando inconclusivo |
---
## Design Principles
### 1. Scannability over Density
A intranet é usada em rajadas curtas entre tarefas. O usuário precisa encontrar informação rapidamente. Priorize:
- **Hierarquia visual clara:** headline → support text → action
- **Whitespace generoso:** nunca compacte para "caber mais"
- **Agrupamento lógico:** cards, seções, widgets com separação clara
- **Limite de widgets na home:** máximo 5–7
### 2. Personalization with Purpose
Conteúdo direcionado por papel, departamento e localização. Navegação dinâmica adaptada ao perfil. Mas:
- **Nunca** esconda navegação estrutural essencial
- **Sempre** permita que o usuário veja o conteúdo "padrão"
- **Subscrições** são opt-in, não opt-out forçado
### 3. Verification Transparency
Elementos Arkhe são exibidos de forma acessível:
- **Status banner** no topo de cada página
- **Badges** em documentos verificados
- **Digests** truncados com tooltip para hash completo
- **Links para Rekor** para prova de inclusão
- **Nunca** oculte falhas de verificação
### 4. Mobile-First
A intranet é usada em dispositivos móveis por trabalhadores de linha de frente. Design mobile-first:
- **Touch targets** mínimo 44×44px
- **Navegação** adaptada para polegar
- **Viva Connections** como porta de entrada mobile
- **Offline-first** para conteúdo crítico
### 5. Accessibility by Default
WCAG 2.2 AA é o mínimo:
- **Contraste** mínimo 4.5:1 para texto normal
- **Foco visível** em todos os elementos interativos
- **Navegação por teclado** completa
- **Screen reader** compatível
- **Sem dependência de cor** para transmitir informação
---
## Implementation Notes
### Stack
| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18, Next.js 15, TypeScript |
| **Styling** | Tailwind CSS 3.4, CSS Variables |
| **Components** | Radix UI, shadcn/ui |
| **State** | TanStack Query, Zustand |
| **Icons** | Lucide React |
| **Fonts** | Inter, Poppins, IBM Plex Mono (via next/font) |
### Tailwind Configuration
```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#1E40AF", dark: "#1E3A8A", light: "#DBEAFE" },
        accent: "#7C3AED",
        success: "#059669",
        warning: "#D97706",
        danger: "#DC2626",
        info: "#0284C7",
        surface: { DEFAULT: "#FFFFFF", raised: "#FFFFFF", sunken: "#F1F5F9" },
        background: "#F8FAFC",
        "text-primary": "#0F172A",
        "text-secondary": "#475569",
        "text-tertiary": "#94A3B8",
        border: { DEFAULT: "#E2E8F0", strong: "#CBD5E1" },
        arkhe: {
          pass: "#059669",
          fail: "#DC2626",
          inconclusive: "#D97706",
          digest: "#6366F1",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-poppins)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        "elevation-1": "0 1px 2px rgba(0,0,0,0.05)",
        "elevation-2": "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
        "elevation-3": "0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
        "elevation-4": "0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)",
        "elevation-5": "0 20px 25px rgba(0,0,0,0.15), 0 10px 10px rgba(0,0,0,0.04)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "350ms",
      },
    },
  },
};
export default config;
```
### CSS Variables
```css
/* globals.css */
:root {
  --color-primary: #1E40AF;
  --color-primary-dark: #1E3A8A;
  --color-primary-light: #DBEAFE;
  --color-accent: #7C3AED;
  --color-success: #059669;
  --color-warning: #D97706;
  --color-danger: #DC2626;
  --color-info: #0284C7;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-sunken: #F1F5F9;
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-text-tertiary: #94A3B8;
  --color-border: #E2E8F0;
  --color-arkhe-pass: #059669;
  --color-arkhe-fail: #DC2626;
  --color-arkhe-inconclusive: #D97706;
  --color-arkhe-digest: #6366F1;
}
```
---
## Content Guidelines
### Microcopy
| Contexto | Diretriz | Exemplo |
|----------|----------|---------|
| **Botões primários** | Verbo imperativo, específico | "Publicar documento" (não "Enviar") |
| **Mensagens de erro** | O que aconteceu + o que fazer | "Documento bloqueado pela política de PII. Remova dados pessoais e tente novamente." |
| **Mensagens de sucesso** | Confirmação + próximo passo | "Documento publicado. Ver prova de inclusão." |
| **Empty states** | Explicação + ação sugerida | "Nenhum documento pendente. Você está em dia." |
| **Tooltips de digest** | Hash completo + botão copiar | "a1b2c3d4e5f6... [Copiar]" |
| **Badges Arkhe** | Status + tooltip explicativo | "✅ PASS — Verificação concluída em 2026-10-16 14:32 UTC" |
### Voice & Tone
A voz da intranet é **institucional, mas acessível**:
- **Clara:** frases curtas, voz ativa
- **Profissional:** sem gírias, sem excesso de informalidade
- **Direta:** sem rodeios, sem "clique aqui"
- **Inclusiva:** linguagem neutra, sem jargão técnico desnecessário
### Anti-patterns de Conteúdo
| ❌ Evite | ✅ Prefira |
|---------|-----------|
| "Clique aqui para acessar" | "Acessar política de férias" |
| "Erro inesperado" | "Não foi possível publicar. Verifique sua conexão." |
| "Seu documento foi salvo com sucesso" | "Documento salvo como rascunho." |
| "Nenhum resultado encontrado" | "Nenhum resultado para 'férias'. Tente termos mais amplos." |
---
## File Location
Este arquivo deve residir em:
```
arkhe-intra/
└── DESIGN.md
```
Qualquer agente de codificação (Claude Code, Cursor, Antigravity) que suporte o formato **DESIGN.md** lerá automaticamente este arquivo e gerará UI consistente com o sistema.
### Skills Recomendadas
Para agentes compatíveis, instale as skills:
```bash
# Claude Code
cp -r designkit.md/packages/skills/designmd-author ~/.claude/skills/
# Cursor
# Configurar MCP server: npx designmd-mcp
```
---
## Referências
| Fonte | Descrição |
|-------|-----------|
| [DESIGN.md Spec](https://github.com/google-labs-code/design.md) | Formato oficial do Google Labs |
| [zeroheight Design System Structure](https://zeroheight.com/learn/how-to-structure-your-design-system-documentation/) | Estrutura de documentação de design systems |
| [SharePoint Intranet Best Practices 2026](https://www.epcgroup.net/sharepoint-modern-intranet-design-best-practices-2026) | Arquitetura hub-site e mega menu |
| [Compass365 Intranet Design](https://compass365.com/sharepoint-intranet-design/) | Navegação e homepage |
| [Omnia Intranet Design](https://www.omniaintranet.com/insights/blog/top-intranet-design-ideas-principles-for-good-company-intranet-design/) | Personalização e engagement |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Acessibilidade |
| Arkhe Core | Invariantes de verificação e evidência |
---
**Versão:** 1.0.0
**Última atualização:** 2026-10-16
**Status:** FROZEN