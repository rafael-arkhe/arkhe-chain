# "Templates de fábrica" — como foram construídos e por que foram removidos

**Data:** 2026-06-28 · **Tipo:** remoção (com documentação) · **Escopo:** `security-app` · `app/workshop`

Este documento registra **como** a seção "Templates de fábrica" do `/workshop` foi
construída (a pedido, para preservar o conhecimento) e o que exatamente foi removido.

---

## 1. O que era

No topo da página **`/workshop`** ("Biblioteca de aplicativos") havia uma primeira
seção, "**Templates de fábrica · Comece a partir de um modelo**", com uma grade de
cards clicáveis. Cada card era um *modelo pronto*; ao clicar, abria o modal
"Novo aplicativo" já pré-preenchido (surface/kind/seed) seguindo a filosofia
**"duplicate-and-customize"**. Era uma feature **100% frontend** — sem endpoint
dedicado, sem migração, sem testes.

A grade tinha 8 modelos: Dashboard operacional, Ficha de pessoa, Ficha de
parlamentar, Ficha de placa LPR, Ficha de câmera CCTV, Ficha genérica, Detalhe de
busca e "Demo · Eventos + Overlay".

## 2. Como foi construído (arquitetura)

Toda a máquina vivia em `app/workshop/page.tsx` + um componente de wireframe:

### 2.1. Catálogo de modelos — constante em código (`TEMPLATES`)

A fonte de dados **não** era backend nem seed em DB: era um array literal
`const TEMPLATES: Template[]` (≈ linhas 128-210). Cada item (`type Template`)
carregava só metadados de apresentação + alvo:

```ts
type Template = {
  title: string;          // título do card
  blurb: string;          // descrição curta
  Icon: React.ComponentType; // ícone lucide
  schematic: 'dashboard' | 'ficha-pessoa' | 'ficha-parlamentar'
           | 'ficha-lpr' | 'ficha-cctv' | 'ficha-generica' | 'detalhe-busca';
  surface: 'standalone' | 'entity_ficha' | 'search_result';
  target_kind: string | null;   // p/ entity_ficha
  target_source: string | null; // p/ search_result
  suggestedDisplay: string;     // nome sugerido do app
  seed_id?: string;             // override do seed inicial (só o demo usava)
};
```

### 2.2. Os cards — `TemplateCard` + `TemplateSchematic`

- `TemplateCard` (componente inline em `page.tsx`, ≈ 782-843): renderizava o
  wireframe no topo, ícone + título + blurb, um chip da surface
  (`SURFACE_LABEL`/`SURFACE_STYLE`) e o CTA "usar →". Era acionável por clique e
  por teclado (`Enter`/`Space`), com `data-testid="template-card-{suggestedDisplay}"`.
- `components/workshop/template-schematic.tsx` (arquivo dedicado, ~295 linhas):
  os "thumbnails" eram **wireframes em CSS/Tailwind puro** (sem imagem baixada),
  com 7 sub-variantes (`Dashboard`, `FichaPessoa`, `FichaParlamentar`, `FichaLpr`,
  `FichaCctv`, `FichaGenerica`, `DetalheBusca`). Comunicavam a estrutura do painel
  "em 1 segundo, sem ler texto". Esse arquivo era usado **somente** pelo `/workshop`.

### 2.3. O fluxo de clique (cadeia completa)

```
clique no card
  → onUse → openFromTemplate(t)        // page.tsx
      setModalInitial({ display, surface, target_kind, target_source, seed_id })
      setNovoOpen(true)
  → <NovoAppModal initial={…}>          // components/workshop/novo-app-modal.tsx
      pré-preenche nome/surface/alvo; operador ajusta; submete
  → onCreate(payload) → createNew(payload)   // page.tsx
      // Resolução do seed (layout inicial), por prioridade:
      //   1) payload.seed_id  → SEED_REGISTRY[seed_id]   (só o template Demo)
      //   2) surface=entity_ficha → pickFichaSeed(target_kind)
      //      surface=search_result → pickSearchResultSeed(target_source)
      //   3) blank → { columns: 20, root: [] }
      → Workshop.create({ … layout, variables, overlays … })  // POST /workshop/apps
      → router.push(`/workshop/edit/{id}`)
```

### 2.4. De onde vinha o conteúdo real (os seeds)

Os modelos **não** continham layout; apontavam para o **registry de seeds**
(`lib/workshop/seeds/`), que é **compartilhado** com outras features (ficha,
"personalizar", widget embarcado):

- `SEED_REGISTRY` / `getSeed` — `lib/workshop/seeds/index.ts`
- `FICHA_SEEDS` + `pickFichaSeed` — `lib/workshop/seeds/ficha.ts`
- `SEARCH_RESULT_SEEDS` + `pickSearchResultSeed` — `lib/workshop/seeds/search-result.ts`
- `EVENTS_DEMO_SEED` (id `seed.security.demo.events`) — `lib/workshop/seeds/events-demo.ts`
  (o layout por trás do card "Demo · Eventos + Overlay"; doc em
  `docs/workshop/19-sprint2-events-overlays.md`).

### 2.5. Backend

Nenhuma mudança de backend estava envolvida. Os cards **nunca** enviavam
`template_id`; caíam no CRUD genérico `POST /workshop/apps`
(`ontology-module/app/routers/workshop.py`). O conceito de "templates default
AEGIS" por slug `template.security.*` (`docs/workshop/28-templates-default-aegis.md`)
é **outra feature**, não wirada a estes cards, e segue intacto.

## 3. Por que foi removido

A seção criava um caminho paralelo ao fluxo canônico ("Novo painel" +
"Construir com Arquiteto") e empurrava um catálogo estático de modelos que
competia com o Workshop/Soluções como caminho de criação. Foi removida para
simplificar a entrada do `/workshop` e concentrar a criação no fluxo principal.

## 4. O que foi removido vs. mantido

**Removido:**
- `components/workshop/template-schematic.tsx` (arquivo inteiro — usado só aqui).
- Em `app/workshop/page.tsx`: a `<section>` "Templates de fábrica", o componente
  `TemplateCard`, o `type Template`, a constante `TEMPLATES`, o handler
  `openFromTemplate`, o estado `modalInitial` (artefato exclusivo do pré-fill de
  template), o ramo `payload.seed_id` em `createNew` (morto após a remoção), e os
  imports de ícones que só os modelos usavam: `Car`, `IdCard`, `MousePointerClick`,
  `User`, `UserSquare2`, `Video`.

**Mantido (compartilhado / ainda em uso):**
- O modal `NovoAppModal` e o fluxo **"Novo painel"** (toolbar). A prop opcional
  `initial`/`seed_id` do modal foi preservada na API (compatível, inofensiva).
- `createNew`, `Workshop.create`, e a resolução por surface
  (`pickFichaSeed`/`pickSearchResultSeed`) — usados pelo fluxo em branco quando o
  operador escolhe "Ficha de entidade" / "Detalhe da busca".
- Todo o `lib/workshop/seeds/*` (usado por ficha, personalizar, widget embarcado).
- `SURFACE_LABEL`/`SURFACE_STYLE` e `LayoutDashboard`/`Search` (usados na seção
  "Meus painéis").
- O backend `/workshop/apps` e o conceito separado `template.security.*`.

## 5. Verificação

```bash
cd security-app
npx tsc --noEmit          # sem erros de tipo (imports órfãos removidos)
npm test -- workshop      # suites do workshop continuam verdes
```
