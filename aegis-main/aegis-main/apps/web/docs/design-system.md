# Design system

## Princípios

- **Dual-surface**: superfícies analíticas claras (Buscar, Ficha, Relatórios, Briefings, Geo) e superfícies operacionais escuras (Rede, Explorador, Câmeras, Início)
- **Cantos retos sempre** — 0px de border-radius em **tudo** (sem `rounded-*`)
- **Sem ícones decorativos** — proibido `Sparkles` ou similares; ícones lineares mono-cor (lucide stroke 1.5)
- **Tipografia técnica**: Inter 400/500/600 (texto), JetBrains Mono 400/500 (dados, IDs, hashes)
- **Densidade alta**: linhas de tabela 28px, padding interno 8/12/16/24, espaçamento vertical reduzido
- **Banner de classificação sempre visível** no topo, cor dinâmica

## Tokens de cor

### Superfícies escuras (operacional)

| Token | Hex | Uso |
|---|---|---|
| `bg-deep` | `#0A0E14` | Canvas (Rede, Câmeras, Explorador) |
| `bg-panel-dark` | `#14181E` | Painéis flutuantes, cabeçalhos |
| `bg-raised-dark` | `#1A1F2A` | Abas ativas, linhas hover |
| `border-dark` | `#262B33` | Divisores em tema escuro |
| `text-on-dark` | `#E6E9EE` | Texto principal escuro |
| `text-muted-dark` | `#8A93A0` | Texto secundário escuro |

### Superfícies claras (analítico)

| Token | Hex | Uso |
|---|---|---|
| `bg-canvas-light` | `#FFFFFF` | Editor de relatório, briefing, mapa |
| `bg-panel-light` | `#F4F6F8` | Listas e laterais claras |
| `bg-raised-light` | `#ECEFF2` | Linha selecionada, hover |
| `border-light` | `#D7DBDF` | Divisores em tema claro |
| `text-on-light` | `#14181E` | Texto principal claro |
| `text-muted-light` | `#5C6470` | Texto secundário claro |

### Acentos (universais)

| Token | Hex | Uso |
|---|---|---|
| `primary` | `#2D77BE` | Botões primários, links, seleção |
| `primary-hover` | `#4A8FD1` | Hover do primary |
| `focus-ring` | `#3F8DDA` | Anel de foco em inputs |

### Classificação (banner de topo + selos)

| Nível | Hex | Texto |
|---|---|---|
| Sigiloso | `#C8341F` | branco |
| Confidencial | `#E97D2A` | branco |
| Restrito | `#E8B33B` | preto |
| Público | `#3D9F58` | branco |

### Status operacional

| Token | Hex | Uso |
|---|---|---|
| `success` | `#3D9F58` | Operação concluída, viatura ativa |
| `warning` | `#E8B33B` | Atenção, divergência |
| `danger` | `#C8341F` | Crítico, mandado em aberto, alerta alta |
| `info` | `#2D77BE` | Informativo |
| `neutral` | `#8A93A0` | Inativo / offline |

## Tipografia

| Token | Família | Peso | Tamanho |
|---|---|---|---|
| `display` | Inter | 600 | 24/28/32 |
| `heading-1` | Inter | 600 | 20 |
| `heading-2` | Inter | 600 | 16 |
| `heading-3` | Inter | 500 | 14 |
| `body` | Inter | 400 | 14 |
| `body-strong` | Inter | 500 | 14 |
| `small` | Inter | 400 | 12 |
| `caption` | Inter | 400 | 11 |
| `mono` | JetBrains Mono | 400 | 13 |
| `mono-strong` | JetBrains Mono | 500 | 13 |

## Espaçamento

Escala 4px: `0, 2, 4, 8, 12, 16, 24, 32, 48, 64`.

## Elevação

Sem sombras dramáticas. Apenas `border-bottom` sutil de `border-dark` / `border-light` separa camadas. Painéis flutuantes (popovers, menus de contexto) ganham `box-shadow: 0 4px 12px rgba(0,0,0,0.18)` no tema escuro e `0 4px 12px rgba(20,24,30,0.06)` no tema claro.

## Componentes-base obrigatórios

- **Botão** primário / secundário / fantasma / destrutivo — todos retos
- **Input** com label flutuante, mensagem de erro inline, status (válido/inválido)
- **Select** com busca embutida
- **Tabela** densa (28px), cabeçalho fixo, colunas reordenáveis, multi-seleção
- **Cartão** de objeto (ícone + título + 3 propriedades + classificação)
- **Selo de classificação** (4 variantes de cor)
- **Pílula de objeto** (usada em relatórios e chat) — link vivo
- **Tab bar** com aba ativa sublinhada (não preenchida)
- **Menu de contexto** (right-click) — usado em Rede, Geo, Câmeras
- **Toolbar ribbon** (Rede, Relatórios) — agrupa ações por categoria
- **Banner de classificação** (topo global)
- **Toast** discreto, sempre no rodapé direito, sem ícones decorativos

## Modo dual

A maioria das rotas tem **tema fixo** (sem toggle de operador):

| Rota | Tema |
|---|---|
| `/` Início | Escuro |
| `/buscar` | Claro |
| `/ficha` | Claro |
| `/explorador` | Escuro |
| `/rede` | Escuro |
| `/geo` | Claro (mapa) com painéis sobrepostos escuros |
| `/cameras` | Escuro |
| `/alertas` | Claro |
| `/briefings` | Claro (com slide preview) |
| `/relatorios` | Claro (editor) |
| `/admin` | Claro |

## Regras invioláveis

1. **0px de border-radius** em qualquer elemento — botão, input, cartão, painel, modal
2. **Nenhum** ícone `Sparkles`, `Wand`, `Rocket` ou similar de "magia"
3. **Toda** string em pt-BR, hardcoded direto no JSX (override de [[i18n-locales]] para este painel)
4. **Nenhuma** menção a marcas/produtos de terceiros nas strings visíveis
5. Banner de classificação **sempre visível** no topo, refletindo o maior nível em tela
