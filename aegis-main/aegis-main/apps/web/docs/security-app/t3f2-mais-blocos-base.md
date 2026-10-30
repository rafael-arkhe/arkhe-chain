# T3-F2 — Mais blocos-base estilo Google Docs

**Data:** 2026-06-29 · **Tipo:** feature (widgets) · **Escopo:** `security-app` + `ontology-module` + `aegis-python-sdk`

Continua a T3-F: adiciona os blocos de redação que ainda faltavam ao `WIDGET_CATALOG`,
comparando ao Google Docs.

| Widget | Label | O que é |
|---|---|---|
| `checklist` | Lista de tarefas | Uma tarefa por linha; prefixe com `[x]` para concluída |
| `code_block` | Bloco de código | Trecho monoespaçado com rótulo de linguagem |
| `page_break` | Quebra de página | Marca limite de página (`break-after-page` no PDF) |
| `figure` | Figura (imagem + legenda) | Imagem por URL com legenda (par estático do `image`) |

Todos **presentational** (`core_display`, `proposable`, `group: 'content'`).

## Enabler: FieldKind `textarea`

O `config_schema` só tinha input de **uma linha**. Adicionei o FieldKind **`textarea`**
ao `PropFieldEditor` (`components/workshop/prop-field-editor.tsx` + `FieldKind` em
`WorkshopV2Renderer.tsx`) — multilinha reusável. Aplicado em `checklist.items`,
`code_block.code` e migrado `callout.body` / `quote.text` (antes single-line).

## Arquivos

- **Frontend:** `components/workshop/widgets/{checklist,code-block,page-break,figure}.tsx`,
  import no barrel, entrada no `lib/workshop/widget-catalog.json` (105 widgets).
- **Backend:** `aegis/workshop/widget_catalog.py` em `ontology-module` + `aegis-python-sdk`.

## Verificação

- **tsc** limpo.
- **jest** `widget-catalog-parity` 4/4 (105 widgets sync) · `document-widgets` 8/8
  (callout/divider/quote + checklist/code_block/page_break/figure renderizam).
- **backend** carrega (100 entradas únicas; os 4 presentes).
- **e2e** `relatorios-widget-palette`: callout/checklist/code_block/figure/object_table_v2/
  chart_xy visíveis na palette do documento + render ao vivo.

## Próximo

- **T3-E2** — binding de dado ao vivo (`POST /notepad/{id}/evaluate`) para os widgets de
  object-set (tabela/gráficos) sobre a ontologia real.
