# T3-C — /relatorios rico (compositor de seções)

**Data:** 2026-06-29 · **Tipo:** feature (frontend) · **Escopo:** `security-app/app/relatorios`

Evolui o `/relatorios` de um editor markdown único para um **compositor de
SEÇÕES** sobre o motor T3-A — o documento materializa ontologia + AIP.

## O que mudou

- **Editor = compositor de seções** (`components/relatorios/section-composer.tsx`).
  O body_md legado **migra** para uma seção markdown ao abrir (nada se perde —
  ADD-alongside). Tipos de seção:
  - **Narrativa (IA)** — prompt + **Gerar com IA** (`Notepad.generate` por seção,
    auditado no InferenceLog) → corpo gerado + citações. Ícone AudioLines.
  - **Texto** — markdown manual (render via o SimpleMd da página).
  - **Objeto** — ObjectPicker (node_id nunca digitado) + widget do catálogo →
    `ReportNodeEmbed` ao vivo (reflexo da ontologia).
  - Por seção: cabeçalho, mover ↑/↓, remover. Adicionar seção (picker de tipo).
- **Toolbar:** **PDF** (abre `/api/platform/v23/notepad/{id}/pdf` — o proxy genérico
  relaya o binário) + **Selar** (gated `relatorios.close`, confirma → `Notepad.sign`)
  + Transmitir/Salvar/Preview existentes. O selo aparece no preview.
- **Salvar** envia `sections` (não mais só `body_md`). **Preview** renderiza as
  seções (`SectionsPreview`). Governança (classificação + marcações) preservada.
- **Contexto da geração:** as outras seções (markdown + objetos + narrativas já
  geradas) viram `context_items` — a IA narra o que o documento reúne.

## Separação de funções (RBAC)

- **Analyst** (`relatorios.edit`): edita seções + gera com IA. Vê o compositor.
- **Supervisor** (`relatorios.close`): vê as seções read-only (fallback do
  compositor) + **Sela** + Transmite. Não edita.
- Quem só tem `view`: preview read-only.

## Verificação

- **jest** `__tests__/relatorios-page.test.tsx` — **8/8**: abre/edita/salva (sections),
  banner, criar defaults, preview markdown, seção de objeto (picker→widget ao vivo),
  **geração-via-UI** (Gerar → Notepad.generate → corpo renderiza), preview de embed.
- **tsc** `--noEmit` limpo.
- **e2e** `e2e/relatorios-secoes-selar.spec.ts` — passa em browser real: supervisor
  abre doc de seções → vê read-only → **Sela** → "Selado".
- **Endpoints** generate/sign/pdf provados ao vivo na T3-A (LLM real auditado).

## Notas

- A geração-via-UI ao vivo precisa de um login **analyst** (separação de funções); o
  fluxo é coberto por jest + o endpoint provado na T3-A. Para certificar o gesto vivo
  do analyst, criar/usar um login com `relatorios.edit`.
- Falta da T3: **T3-D** (`/briefings` apresentação do mesmo Document).
