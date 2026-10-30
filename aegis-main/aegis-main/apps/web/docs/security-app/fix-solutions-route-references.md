# Fix — referências de UI à rota antiga de "Soluções" (`/painel-de-controle/solutions`)

**Data:** 2026-06-28 · **Tipo:** fix · **Escopo:** `security-app`

## Contexto

Na consolidação W8 (2026-06-28), a página "Soluções" (Desenho da Operação / AIP
Arquiteto) saiu do Painel de Controle e passou a ser servida pela rota modular
canônica **`/paginas/solutions/view`** (dynamic route `app/paginas/[slug]/view/page.tsx`
resolvendo o componente registrado `SolutionsApp`).

A rota antiga `app/painel-de-controle/solutions/page.tsx` virou apenas uma **casca de
redirect** que encaminha para a rota nova preservando a query (`?diagram=&app=`).

Apesar do redirect cobrir links perdidos, vários pontos da UI ainda apontavam
diretamente para o caminho antigo — gerando um "pulo" de navegação e referência
obsoleta. O botão **"Construir com Arquiteto"** em `/workshop` era o caso mais visível.

> Observação: o botão "Construir com Arquiteto" **não** depende de `?cp=1`. Sua
> visibilidade é controlada apenas pela permissão `solution.diagram.read`
> (`useCan('solution.diagram.read')`).

## Referências corrigidas

| Arquivo | O que era | Agora |
|---|---|---|
| `app/workshop/page.tsx:531` | `href="/painel-de-controle/solutions"` (botão **Construir com Arquiteto**) | `href="/paginas/solutions/view"` |
| `app/workshop/view/[id]/page.tsx:95` | link **Editar no AIP** (preserva `?diagram=&app=`) | `/paginas/solutions/view?...` |
| `components/solution-designer/ArquitetoChat.tsx:1014` | deep-link markdown no chat (preserva query) | `/paginas/solutions/view?...` |
| `components/solution-designer/SolutionsApp.tsx:128` | `route` no `SOLUTIONS_FALLBACK_PAGE` | `/paginas/solutions/view` |

### Testes e e2e alinhados

- `__tests__/arquiteto-chat.test.tsx:269` — asserção do deep-link (passaria a falhar; corrigida).
- `__tests__/solutions-page.test.tsx:240` e `__tests__/solutions-experience-editor.test.tsx:77` — `route` dos fixtures de `Pages.get`.
- `e2e-record/_helpers.ts:23`, `e2e-record/aip-s1.spec.ts:8`, `e2e/l14-l15-audio-mobile-kiosk.spec.ts:82` — `goto(...)` passam a navegar direto à rota canônica.
- Comentários atualizados em `lib/solutions/experience-defaults.ts:5` e `ArquitetoChat.tsx:645`.

## Referências mantidas de propósito

São referências legítimas ao caminho antigo e **não** devem ser trocadas:

- `app/painel-de-controle/solutions/page.tsx` — é a própria casca de redirect.
- `components/solution-designer/SolutionsApp.tsx:145` — comentário histórico ("Extraído de …").
- `__tests__/solutions-page.test.tsx:15` — comentário descrevendo o redirect W8.
- `__tests__/w8-paginas-modulares.test.tsx:98` — importa a casca de redirect para testá-la.

## Verificação

```bash
cd security-app
npm test -- "(arquiteto-chat|solutions-page|solutions-experience-editor|w8-paginas-modulares)"
# 5 suites, 111 testes — todos passam
```
