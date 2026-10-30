# /explorador — verificação em camadas + "Criar alerta deste conjunto"

**Data:** 2026-06-29 · **Tipo:** rework (UI/UX + backend) · **Escopo:** `security-app/app/explorador` + `ontology-module` (entities, alert feeds)

Revisão completa do `/explorador` (skill `impeccable`, norte "A Sala de Situação
Clara"). Endereça 4 dores do operador e torna o fluxo **100% integrado** (sem botão
morto, sem teto silencioso de objetos).

## Dores → correções

### 1. Scrollbar aparecendo nas abas
A barra de abas e os 4 contêineres roláveis ganharam `.scrollbar-hide` (convenção do
chrome). A timeline trocou o **side-stripe** `border-l-2 border-l-primary` (proibido
pelo design system) por um marcador quadrado de 6px + texto.

### 2. Objetos limitados (travava em 50)
- **Backend** `GET /entities` ganhou `offset` (paginação) e um endpoint novo
  `GET /entities/count` (total do tenant que casa com `kind`/`q`). Ambos sem
  migração. `find()` ganhou **desempate estável por `id`** — sem ele, timestamps
  iguais (seed em lote) tornavam o `offset` não-determinístico (páginas se
  sobrepunham).
- **Frontend** carrega em páginas de 500 com **"Carregar mais"** e mostra honesto
  **"N de M"** (`Entities.list({limit,offset})` + `Entities.count()`).
- O total é limite **superior pré-ABAC** (RowPolicy/máscara podem reduzir o que cada
  operador vê); a paginação deduplica por `id` por garantia.

### 3. Sem filtragem dinâmica integrada
- Novo **construtor de camada** no painel direito: campo (Tipo / Classificação /
  Texto livre / qualquer propriedade) + operador (é / contém) + valor → "Camada".
- O campo de busca textual da aba **Buscar** agora **vira uma camada** do pipeline
  (antes era display-only, desconectado).
- Cada camada mostra `antes → depois` real (a "verificação em camadas").

### 4. "Criar alerta deste conjunto" era botão morto
Agora cria uma **busca monitorada** real:
- O botão abre um modal (nome + cadência por dropdown: 5min…24h) e chama
  `POST /alerts/feeds` com as camadas serializadas.
- **Backend**: o worker `tick_feeds` passou a honrar **TODAS as camadas**
  (tipo/texto/marcação/propriedade), não só `filters.query`. Antes, qualquer filtro
  além do texto era salvo e **ignorado** — alerta meia-boca. Agora pré-filtra no DB
  (kind + 1 termo) e avalia o predicado completo em Python (`entity_matches_filters`,
  reusa `matches_predicate` do ObjectSet). Feeds antigos `{query}` seguem funcionando
  (retrocompatível).

### 5. Clareza
- Switch de visão no centro: **Distribuição · Tabela · Lista**. A Tabela é um
  object_table real do conjunto (Nome → ficha, Tipo com rótulo humano, Classificação
  em pílula com rótulo+ícone, Atualizado em mono). Antes só havia barras + heatmap.

## Contrato de serialização (`filters`)

O `/explorador` serializa as camadas e o `tick_feeds` avalia o mesmo shape:

```jsonc
{
  "stages": [
    { "kind": "tipo",     "value": "<entity_type>" },
    { "kind": "texto",    "value": "<substring em canonical/display>" },
    { "kind": "marcacao", "markings": ["OPERACIONAL", "restrito"] },  // de "classificacao"
    { "kind": "prop", "path": "a.b", "op": "contains", "value": "<v>" }
  ]
}
```

A camada de **classificação** é convertida para `marcacao` no frontend
(`LEVEL_TO_MARKINGS`), porque a `Entity` não tem coluna `classification` — o nível é
derivado das marcações (espelha `_MARK_TO_CLASS` de `normalizeEntity`). Camadas de
`kind` desconhecido são ignoradas (forward-compat); `filters` vazio casa tudo.

## Arquivos

**Frontend (`security-app`)**
- `app/explorador/page.tsx` — reescrita: paginação, switch de visão, construtor de
  camada, `CriarAlertaModal`, `ConjuntoTable`, `ClassPill`, `FilterBuilder`. Exporta
  as funções puras `estagiosToFilters` / `estagioLabel`.
- `lib/api/index.ts` — `Entities.count()`.

**Backend (`ontology-module`)**
- `app/routers/entities.py` — `offset` em `GET /entities` + `GET /entities/count`
  (declarado antes de `/{entity_id}`).
- `app/services/entity_service.py` — `find(offset)` com desempate por `id` + `count()`.
- `app/services/alerts/feeds.py` — `entity_matches_filters`, `feed_prefilter_hints`,
  `feed_has_selector`.
- `app/agents_platform/scheduler.py` — `tick_feeds` honra todas as camadas.

## Verificação

- **Backend ao vivo:** `GET /entities/count` → `{total:271}`; `offset` determinístico
  (páginas não se sobrepõem) após o desempate por `id`.
- **pytest** `tests/unit/test_explorador_feed_match.py` — 10/10 (matcher puro).
- **jest** `__tests__/explorador-serialize.test.tsx` — 10/10 (serialização).
- **tsc** `--noEmit` limpo; Next compila `/explorador` (200).
- **e2e** `e2e/explorador-camadas-alerta.spec.ts` — passa em browser real: 3-pane →
  Tabela → construtor adiciona camada → "Criar alerta" cria a busca monitorada
  (toast de sucesso).

## Notas / débitos

- Strings da página seguem hardcoded em pt-BR (padrão pré-existente do arquivo); a
  migração para `useT()` fica fora do escopo deste rework e é débito conhecido.
- O total "M" é pré-ABAC (limite superior). Um total ABAC-exato exigiria avaliar todas
  as linhas — caro; o "Carregar mais" + dedupe por `id` cobrem o caso na prática.
