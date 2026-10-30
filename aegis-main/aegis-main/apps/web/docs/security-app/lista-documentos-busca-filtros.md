# Lista de Documentos — busca, filtros e categorização (Incremento C / #2)

**Data:** 2026-06-29 · **Tipo:** redesign · **Escopo:** `security-app`

A lista lateral de Documentos (em `/relatorios` e `/briefings`) era uma lista
chapada — título + uma linha de meta em texto — que não escalava. Serão muitos
documentos; precisava de vida e de navegação real.

## O que mudou

**Componente compartilhado** `components/relatorios/document-list.tsx`, usado pelas
duas telas (fim da duplicação das duas `<aside>`):

- **Busca** (`rel-search` / `briefings-search`): casa título, slug, marcações e
  classificação.
- **Filtros** (combobox de busca, mesmo padrão do resto): por **classificação** e
  por **estado** (selado / rascunho).
- **Linhas ricas com categorização DERIVADA** (sem campo novo no backend —
  decisão do operador): **selo de classificação COLORIDO** (cor falante: a cor
  semântica do nível + rótulo — PÚBLICO verde, RESTRITO âmbar, CONFIDENCIAL laranja,
  SIGILOSO vermelho) + **chips de marcação** neutros (até 2 + "+N") + **versão** em
  JetBrains Mono + ícone de **selado**. Fixados primeiro.
- **Rodapé com contagem** (`N` ou `N/M` quando filtrado).
- **Vazio que distingue**: "nenhum documento ainda" vs "nenhum corresponde aos
  filtros" (com botão **Limpar filtros**).

Núcleo puro/testável: `lib/relatorios/doc-filter.ts` (`filterDocs`, `orderDocs`,
`hasActiveFilter`). A única cor da lista é a da classificação (que já é colorida por
direito no DS); todo o resto segue neutro.

## Verificação

- **jest** `doc-filter` (8): busca casa título/marcação/classificação; filtros de
  classificação e estado; combinação (E lógico); ordem fixados-primeiro;
  `hasActiveFilter`. `relatorios-page` + `briefings-page` sem regressão (mesmos
  testids `${prefix}-item-${id}`, `${prefix}-list`, `rel-new`).
- **tsc** limpo.
- **e2e** `relatorios-lista-busca-filtros`: busca estreita; filtro de classificação
  (Restrito esconde o Sigiloso); filtro de estado (Selados → só o assinado); a linha
  rica mostra o selo de classificação. `briefings-apresentacao` +
  `relatorios-secoes-selar` (que usam a lista) verdes.
- **Visual**: lista conferida (selos coloridos por nível, chips de marcação, versão
  mono, fixado no topo, contagem no rodapé).
