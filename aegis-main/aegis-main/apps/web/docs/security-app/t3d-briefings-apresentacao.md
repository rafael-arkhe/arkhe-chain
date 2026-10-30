# T3-D — /briefings como apresentação de Document

**Data:** 2026-06-29 · **Tipo:** feature (frontend) · **Escopo:** `security-app/app/briefings`

Fecha a T3: `/briefings` deixa de renderizar um app Workshop genérico (Modo A/B/C
cosmético, Transmitir morto, Export=window.print) e passa a **apresentar o MESMO
Document** do /relatorios. **/relatorios autora, /briefings apresenta** — unificados
sobre o `NotepadDoc`.

## O que mudou

- **Lista de documentos** (esq) + **apresentação** do selecionado (centro): banner
  de classificação do nível ARMAZENADO + título + seções (narrativa IA / texto /
  objeto) via `SectionsPreview` (reusa o render do T3-C).
- **Modo A/B/C com EFEITO REAL** (não cosmético): **Resumo** = só narrativas;
  **Operacional** = narrativas + texto; **Analítico** = tudo (incl. objetos/dados).
  Filtra as seções por tipo antes de renderizar.
- **Apresentar** = full-bleed (banner de classificação no topo + Modo + Sair/ESC).
- **PDF** = endpoint `/pdf` (burn-in), não `window.print`.
- **Transmitir** = `Notepad.transmit` → link `/m/{token}` (T3-B), **fim do
  broadcast-stub morto**. Gated `security.briefings.broadcast`.

## Removido (ADD-ou-DELETE)

A resolução Workshop (surface='briefing' → registered page → BRIEFING_FALLBACK_SEED),
o `WorkshopV2Renderer`, o `window.print`, o `WorkshopApi.briefings.broadcast` (stub).
O seed `lib/workshop/seeds/briefings.ts` fica órfão (não deletado — pode servir de
referência); o broadcast-stub backend segue para apps de workshop.

## Verificação

- **jest** `__tests__/briefings-page.test.tsx` — **4/4**: lista+apresenta, Modo Resumo
  (efeito real), Transmitir chama Notepad.transmit, Apresentar full-bleed.
- **tsc** `--noEmit` limpo. Nenhum e2e referenciava os testids antigos.
- **e2e** `e2e/briefings-apresentacao.spec.ts` — passa em browser real (admin):
  apresenta doc → Modo Resumo filtra (markdown sai) → Apresentar → Transmitir
  (link `/m/guest_`).

## T3 completa

A+B+C+D: motor neutro de Document (geração AIP auditada + PDF burn-in + sign),
Transmitir via guest-token, /relatorios compositor, /briefings apresentação. Os dois
materializam ontologia + agentes + dados em documentos/apresentações formais.
