# T3-E2 — Binding de dado ao vivo nas seções de widget

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `security-app` + `ontology-module`

Fecha a T3-E: os widgets de **object-set** (tabela, gráfico, rede) numa seção de
documento agora resolvem dado **REAL da ontologia**, governado, em vez de
pré-visualização/mock.

## Backend — endpoint governado

`POST /platform/v23/notepad/{doc_id}/object-sets/query` (`app/routers/platform_v23/notepad.py`).
Reusa a engine EXATA do Workshop (`_query_object_set`) — espelho de
`/workshop/apps/{id}/object-sets/query`, mas escopado por um documento:

- `_load()` → `ensure_visible()` gateia por tenant + markings + project do doc.
- `_query_object_set(spec)` aplica: escopo de tenant → **RowPolicy** → filtro do
  ObjectSet → **ABAC por marking** (`filter_readable`) → **masking de propriedade**.
- Devolve rows no formato dos widgets: `{id, name, node_type, properties, markings}`.

## Frontend — runner injetável (retrocompatível)

`object_table_v2` busca via `useObjectSet` (não lê `variables`). Adicionado um
**`ObjectSetRunnerContext`** (`lib/workshop/runtime.ts`) — par do `evaluator` do
`useEvaluatedApp`. Sem provider → `Workshop.queryObjectSet` (comportamento atual,
zero regressão). A seção de widget injeta um runner que bate no endpoint do
documento.

`WidgetSectionView` (`components/relatorios/widget-section.tsx`):
- **ObjectReference** (object_view/card/property_list…) → `Ontology.getNode` client-side.
- **ObjectSet** (object_table_v2/chart_xy/network_graph…) → `Notepad.queryObjectSet(docId, {object_type})`:
  - provê o runner via `ObjectSetRunnerContext` (consumido por `object_table_v2`);
  - resolve as rows em `variables[chave]` (consumido por `chart_xy` etc.).
- Autoria: tipo de objeto via picker `node-type` (dropdown governado), nunca texto livre.

`docId` é threaded: /relatorios + /briefings → `SectionComposer`/`SectionsPreview` →
`WidgetSection*`.

## Verificação

- **tsc** `--noEmit` limpo.
- **jest** 20/20 (relatorios 8 + briefings 4 + document-widgets 8) — sem regressão
  (props `docId` opcionais; runner default inalterado).
- **e2e** `relatorios-widget-binding` (admin, dev real): `bulkCreate` 2 objetos →
  endpoint resolve 2 rows (properties.cidade = SP/RJ) → `object_table_v2` renderiza
  **SP e RJ reais** no documento.

## Limites / próximo

- v1: filtro do conjunto = tipo de objeto (todos do tipo, governado). Filtro
  discreto (pills/predicado) por cima do conjunto = incremento futuro.
- `/m` (guest) não resolve object-set ao vivo (endpoint exige auth) — superfície
  pública é leitura; binding ao vivo p/ guest = futuro (token-scoped query).
