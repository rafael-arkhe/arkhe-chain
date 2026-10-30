# T3-G3 (parte 1) — Documento transmitido (/m) renderiza widgets

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `security-app` + `ontology-module`

O `/m/{token}` (documento transmitido, sem login) renderizava as seções como
**texto puro** e não tratava `kind='widget'` → toda seção de widget aparecia como
"(seção sem conteúdo)". Agora renderiza os widgets pela **MESMA engine do operador**,
com dados/mídia resolvidos por endpoints **guest token-scoped**.

## Backend (`app/routers/public/guest.py`)

Espelham os endpoints do operador, mas autorizados pelo TOKEN (o guest principal
tem `clearances=()` → `filter_readable` derruba o classificado; reusa o mesmo
`_query_object_set` / serve MinIO):

- `POST /public/v1/guest/{token}/document/object-sets/query` — object-set de uma
  seção de widget, token-scoped + ABAC. Honra `geo.bindings` do token no filtro.
- `GET /public/v1/guest/{token}/media?key=` — stream do MinIO; a chave precisa
  pertencer ao documento do token (`notepad/{doc_id}/`).

O guest doc endpoint já mandava `sections` completas (widget/props/object_type) —
nenhuma mudança de serialização foi necessária.

## Frontend

- `WidgetSectionView` virou **guest-aware** (`guestToken?` prop): object-set via
  endpoint guest (em vez de `Notepad.queryObjectSet`); mídia reescrita do `object_key`
  para a serve-path pública do token. Operador inalterado (props opcionais).
- `/m/[token]/page.tsx` (`DocSurface`): seções `kind='widget'` renderizam via
  `WidgetSectionView` com `guestToken={token}`.
- Proxies públicos novos: `app/api/public/guest/[token]/document/object-sets/query/route.ts`
  (POST) + `app/api/public/guest/[token]/media/route.ts` (GET binário, relaia Content-Type).

## Verificação

- **tsc** limpo · **jest** 20/20 (sem regressão; operador inalterado).
- **e2e** `m-guest-document-widgets`: cria 2 objetos + sobe imagem + doc com 3 seções
  de widget (callout/object_table_v2/figure) → Transmitir → abre `/m/{token}` em
  **contexto SEM cookies** → callout (presentational), **SP/RJ** (object-set guest),
  figura via guest media (src `/api/public/guest/.../media`) renderizam.

# T3-G3 (parte 2) — Filtro discreto do object-set

Uma seção de conjunto trazia **todos** os objetos do tipo. Agora o operador
restringe o conjunto direto na seção ("cidade = SP", "score ≥ 80"), e o filtro
**viaja no documento transmitido** — o mesmo predicado governa operador e `/m`.

## Frontend (`components/relatorios/widget-section.tsx`)

- **Authoring** (`WidgetSectionEditor`, bloco "Conjunto de objetos", só com tipo
  escolhido): construtor de condições (E lógico) — `FilterConditionsEditor`. Sem
  input técnico cru:
  - **propriedade** = dropdown do contrato do tipo (`Ontology.objectTypeSchema`);
    o caminho vira `properties.<chave>` (top-level só id/name/node_type) — o que o
    backend `_resolve_field` exige p/ JSONB. Degrada p/ campo textual em tipo legado.
  - **operador** = dropdown pt-BR curado pelo tipo da propriedade (`opsForType`):
    texto → igual/diferente/contém/começa-com; numérico/temporal → comparações de
    ordem; booleano → só igualdade. Nunca op cru na UI.
  - **valor** = input adaptado ao tipo (número / data / texto / select booleano).
- **Compilação** (`buildFilterPredicate`, pura/testada): 0 condições → `null`;
  1 → leaf `{op,field,value}`; ≥2 → `{op:'and',operands}`. Persiste em
  `section.filter` (predicado, contrato do backend) + `section.filter_conditions`
  (estado da UI). Trocar o tipo zera o filtro (propriedades mudam).
- **Render** (`WidgetSectionView`): a MESMA `fetchSet` passa `section.filter` nos
  dois ramos (operador `Notepad.queryObjectSet` + guest `…/object-sets/query`).
  `filterKey` serializado entra nas deps p/ re-resolver ao mudar o filtro.

Backend e client **já aceitavam** `filter` (operador e guest) — só faltava a UI e
o threading. Nada mudou no backend.

## Verificação (parte 2)

- **tsc** limpo · **jest** `widget-section-filter` 11/11 (compilador + curadoria de
  operadores) · suíte relatórios sem regressão.
- **e2e** `relatorios-widget-filter`: 3 objetos (2 SP, 1 RJ) → seção com
  `filter eq properties.cidade=SP`. Prova backend operador (sem filtro = 3, com = 2),
  UI operador (mostra SP, RJ ausente), e **guest** (query token-scoped = 2 + `/m`
  mostra só SP) — sem cookies.

# T3-G3 (parte 3) — Render estático dos widgets no PDF

O PDF do documento mostrava **"(secao sem conteudo)"** em toda seção de widget.
Agora cada seção de widget renderiza de forma **estática** no PDF (fpdf2), com o
mesmo burn-in de classificação/assinatura. Nada de chart engine — gráficos
degradam para a **tabela do dado real** (honesto e útil).

## Backend

- `app/services/documents/pdf.py` (`render_document_pdf` segue **puro**: dict→bytes):
  - presentational direto das props — **callout** (título+texto), **quote**
    (texto+fonte), **divider** (linha+rótulo), **checklist** (itens linha-a-linha),
    **code_block** (Courier), **markdown/markdown_v2** (título+conteúdo),
    **heading/text**, **figure/image** (embarca a imagem).
  - object-set (**object_table_v2/object_table/pivot/data_grid**) → **tabela**
    (`fpdf2.table`) com as colunas das props; `_row_field` espelha o `getField` do
    front (top-level → `properties.<chave>`).
  - gráfico/rede/mapa com conjunto → degrada p/ a tabela do dado (`Dados da
    visualizacao:`); sem conjunto nem forma estática → nota honesta.
  - cap 40 linhas / 6 colunas (overflow anotado); uma seção problemática não
    derruba o PDF.
- `app/routers/platform_v23/notepad.py` (`doc_pdf`): como o renderer é puro,
  `_resolve_widget_sections_for_pdf` **pré-resolve** cada seção de widget antes de
  renderizar — injeta `_rows` (object-set GOVERNADO: honra `object_type`+`filter`,
  mesma engine/escopo do operador) e `_image` (bytes do MinIO escopados ao doc).

## Verificação (parte 3)

- **pytest** `test_documents_generator` (container): presentational + tabela
  (cresce com nº de linhas) + chart→tabela + fallback honesto — todos `%PDF-`.
- **e2e** `relatorios-widget-pdf`: doc com callout + tabela (filtrada a SP) + figura
  → `GET /pdf` 200 `application/pdf`, magic `%PDF-`, e **maior** que o mesmo doc com
  seções vazias (prova que tabela+imagem entraram no PDF).

# T3-G3 (parte 4) — ObjectReference (objeto único) no guest · **T3-G3 COMPLETO**

O último débito: widgets de objeto único (property_list/object_view/object_card)
caíam na pré-visualização no `/m` porque `getNode` é operador-only. Agora resolvem
o dado real via endpoint guest token-scoped, **escopado ao documento**.

## Backend (`app/routers/public/guest.py`)

- `GET /public/v1/guest/{token}/document/node?node_id=` — resolve UM nó:
  - **escopo**: o `node_id` PRECISA estar referenciado nas seções do doc do token
    (`section.node_id`); senão 404. O token autoriza ESTE documento, não a
    ontologia inteira (sem enumeração por id).
  - **ABAC**: `build_guest_principal` (clearances=()) + `_apply_rls_context` +
    `assert_readable` + `row_matches` + `mask_node_properties` — classificado além
    das clearances do guest → 404 (cai p/ preview, igual ao filter_readable que
    derruba linhas classificadas no set). Mesma resposta do operador
    (`OntologyNodeResponse`).

## Frontend

- `useResolvedRef` virou **guest-aware**: com `guestToken`, resolve o nó pelo
  endpoint guest (em vez de `Ontology.getNode`). Operador inalterado.
- Proxy público novo: `app/api/public/guest/[token]/document/node/route.ts`.

## Verificação (parte 4)

- **tsc** limpo · **jest** relatórios 34/34 (sem regressão).
- **e2e** `m-guest-object-reference`: doc com property_list bindado a um objeto →
  Transmitir → `/m` resolve o nome REAL (não "Sem dados"); nó **não** referenciado
  pelo doc → 404 (escopo); tudo sem cookies.

**T3-G3 fechado** — /m guest renderiza todas as seções de widget (presentational,
object-set com filtro, mídia, objeto único) e o PDF renderiza widgets estáticos.
