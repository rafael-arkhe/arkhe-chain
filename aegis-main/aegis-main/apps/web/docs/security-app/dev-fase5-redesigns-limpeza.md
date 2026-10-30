# Fase 5 - Redesigns e limpeza (2026-06-30)

Incremento do overhaul DAG nivel n8n: limpeza de ruido legado, seletor de modelo no no IA (Gap A), e i18n do MediaWorkspace.

## O que fechou

### Gap A — Seletor de modelo LLM por no

- `ModelSelect` (de `components/aip/model-select.tsx`) integrado ao `TransformConfig` quando `op === 'llm'`.
- Catalogo de modelos carregado via `AIPModels.catalog()` sob demanda.
- Modelo/saída salvos em `args.model` e `args.provider` (backend ja suporta via `_apply_step_llm`).
- i18n: `pbw.llmModelLabel`, `pbw.llmModelTip`.

### Legado v22 oculto por padrao

- `BoardsList` agora tem toggle `pb-v22-toggle` para expandir/colapsar a seção "Básico (legado)".
- Por padrao, a seção esta colapsada (showV22=false), reduzindo ruido visual.
- Testes atualizados para clicar no toggle antes de acessar itens v22.

### MediaWorkspace i18n

- Todas as strings hardcoded em portugues substituídas por chamadas `useT()`.
- 25+ novas chaves i18n (`media.*`) em `dict-tela-dados.ts`.
- `MEDIA_LABEL` dict substituído por `MEDIA_LABEL_KEY` com chaves de tradução.

## Certificacao

### Frontend

- `npx jest --testPathPattern="pipeline" --no-coverage` - 59 passed (14 suites).
- `npx jest --testPathPattern="webhook" --no-coverage` - 8 passed.
- `npx tsc --noEmit` - clean.

## Proximo

- Fase 5 remaining: redesign completo de Arquivos (drag-drop, preview), Conexoes (monolitico→modular), Datasets (proposito + integracao com canvas).
