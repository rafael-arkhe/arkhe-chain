# T3-F — Widgets-base de editor de documento (callout/divider/quote)

**Data:** 2026-06-29 · **Tipo:** feature (widgets) · **Escopo:** `security-app` + `ontology-module` + `aegis-python-sdk`

Adiciona ao `WIDGET_CATALOG` os blocos foundation que faltavam para um editor de
documento/relatório/briefing (o catálogo era forte em data-viz, mas não tinha os
blocos básicos de redação):

| Widget | Label | O que é |
|---|---|---|
| `callout` | Aviso / Destaque | Caixa destacada por tom (info/atenção/perigo/sucesso) + título + texto |
| `divider` | Separador | Linha divisória entre seções, com rótulo opcional |
| `quote` | Citação | Bloco de citação com texto + fonte (sem side-stripe banido) |

Todos **presentational** (config-driven, sem ontologia), categoria `core_display`,
`proposable: true`, `group: 'content'` (junto de markdown_v2/handlebars_text).

## Arquivos (contrato sincronizado nos 3 repos)

- **Frontend (`security-app`):** `components/workshop/widgets/{callout,divider,quote}.tsx`
  (componente + `registerWidget` com `config_schema` + `mockConfig`), import no barrel
  `components/workshop/widgets/index.ts`, entrada no espelho `lib/workshop/widget-catalog.json`.
- **Backend (`ontology-module`):** `aegis/workshop/widget_catalog.py` (`_GENERIC` core_display).
- **SDK (`aegis-python-sdk`):** `aegis/workshop/widget_catalog.py` (mesma edição — fonte canônica).

## Verificação

- **tsc** `--noEmit` limpo.
- **jest** `widget-catalog-parity` — **4/4** (frontend registry ↔ json em sync; 101 widgets).
- **jest** `document-widgets` — **4/4** (callout/divider/quote renderizam pelo registry com mockConfig).
- **backend** carrega o catálogo (96 entradas únicas; os 3 presentes).

## Notas

- Drift pré-existente (não introduzido aqui): o `widget-catalog.json`/frontend tinham 5
  widgets a mais que o catálogo backend; **não** regenerei o json do backend (isso
  derrubaria esses 5 e quebraria a parity) — adicionei só os 3 ao json existente.
- Os 3 já aparecem na palette do Workshop/Páginas. Para aparecerem como seção no
  compositor de documento, falta **T3-E** (expor a palette plena na seção do /relatorios).
