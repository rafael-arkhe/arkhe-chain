# Briefings — "Apresentar" vira degraus de DETALHE (Incremento B / #6)

**Data:** 2026-06-29 · **Tipo:** fix+redesign (skill impeccable) · **Escopo:** `security-app`

O operador não entendia os modos "Resumo / Operacional / Analítico" do Apresentar —
nem o que faziam, nem para quê. Pior: havia um **bug** real.

## O bug

`visibleSections` filtrava as seções por `kind === 'narrative'/'markdown'`. Mas as
seções novas (T3-E) são `kind === 'widget'` → no Resumo/Operacional **toda seção de
widget sumia** e a tela mostrava "Sem seções neste modo". Os modos pareciam
quebrados e sem propósito.

## O redesenho (progressive disclosure)

Os três modos viraram **degraus de DETALHE** explícitos e auto-explicativos, e o
filtro passou a classificar TODA seção (incluindo widget) por nível:

- **Resumo** (nível 1) — só o essencial: narrativas + indicadores-chave (callout,
  KPI, status, citação).
- **Operacional** (nível 2) — Resumo + texto, tabelas, listas, checklist, timeline.
- **Completo** (nível 3, era "Analítico") — tudo: gráficos, mapas, vínculos, figuras.

Cada degrau é **cumulativo** (mostra o seu nível para baixo). Núcleo puro e testado:
`lib/briefings/section-level.ts` (`sectionLevel`, `visibleSections`, `modeCounts`).

## A clareza (UX)

- **Rótulo do controle**: "Nível de detalhe" (antes nada dizia o que era).
- **Abas SUBLINHADAS** (regra do DS — a aba ativa nunca é preenchida; antes era
  `bg-primary` cheia, fora do sistema) + **contagem por degrau** em mono
  (`Resumo 2 · Operacional 3 · Completo 4`) para o efeito ser tangível antes do clique.
- **Legenda sempre-visível** sob o título: nome do degrau + uma frase do que ele
  mostra + `N/total seções`. O operador entende sem adivinhar.
- **Vazio que ENSINA**: se o degrau atual esconde tudo, mostra "este documento não
  tem seções neste nível" + botão "Ver tudo (Completo)" — fim do beco sem fim.
- Componentes `ModeBar`/`ModeLegend`/`ModeEmpty` reusados na vista inline E no
  full-bleed "Apresentar" (fim da duplicação das abas). Strings via `useT()`.

## Verificação

- **jest** `section-level` (10): níveis por kind/widget + cumulativo por degrau +
  contagens + o caso "doc só de viz não some no Resumo". `briefings-page` sem regressão.
- **tsc** limpo.
- **e2e** `briefings-modos-detalhe` (2): seções de widget aparecem no nível certo
  (resumo 1 / operacional 2 / completo 3) + legenda + contagem; degrau vazio mostra a
  saída e "Ver tudo" revela a seção. `briefings-apresentacao` (existente) verde.
- **Visual**: inline + Apresentar conferidos (aba sublinhada, contagem mono, legenda,
  banner de classificação no topo).
