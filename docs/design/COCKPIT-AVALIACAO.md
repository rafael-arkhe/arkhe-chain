# Arkhe Cockpit — avaliação estética e funcional para integração fullstack

**Data:** 2026-10-30. **Objeto:** `stitch_arkhe_cockpit_design_system/` (17 ecrãs
Stitch com `code.html` + `screen.png`, `design.md`, `surgical_cryptographic_cockpit/DESIGN.md`).
**Alvo de integração:** `apps/arkhe-intra` (Next.js 15, React 18, Tailwind 3.4,
React Query, Zustand), que já tem `/verificar` com o verificador WASM.

## Veredito

| Eixo | Nota | Resumo |
|---|---|---|
| Estética e coerência visual | **Forte** | Linguagem "terminal cirúrgico" consistente nos 17 ecrãs; tokens completos; semântica de estado bem pensada |
| Fidelidade à arquitetura | **Fraca** | Os ecrãs afirmam garantias, certificações, organizações e algoritmos que o Arkhe não tem |
| Acessibilidade | **Média** | Paleta de estado passa AA; `text-subtle` falha; muito texto a 10–11 px |
| Prontidão funcional | **Baixa (esperado)** | Maquetas estáticas: zero chamadas de dados, Tailwind por CDN em runtime |
| Integrável no Intra | **Sim, com reescrita** | Aproveitar tokens e padrões; não aproveitar o HTML |

Recomendação: **adotar o design system, não os ecrãs.** Levar os tokens e cinco
padrões de componente para o Intra, e reconstruir cada ecrã só quando houver
backend real que o alimente, com o texto corrigido contra a arquitetura.

## 1. Estética

**O que funciona**

- **A tríade Integridade / Autoridade / Disponibilidade como três medidores
  separados** é a melhor ideia do conjunto: traduz diretamente o princípio 2 da
  arquitetura e nunca mistura os três.
- **Semântica de cor = semântica epistémica**: verde `LEMMA`/Allow, vermelho
  `REFUTED`, âmbar `CONJECTURE`/`Incomplete`, azul `PENDING`/binding. Aplicada de
  forma consistente, e os estados levam **rótulo textual além da cor**.
- **Mono para dados, Inter para prosa**: hashes, digests e provas ficam legíveis e
  copiáveis; a hierarquia lê-se bem.
- **Estados de falha como primeira classe**: o ecrã de *split view* (vermelho
  total, motivo tipado `Refuted{SplitViewEquivocation…}`, ações bloqueadas até
  m-de-n) comunica fail-closed sem ambiguidade. O selo `EVIDENCE, NOT APPROVAL`
  sobre o parecer de L6 está exatamente certo.
- Tokens de `DESIGN.md` estão completos (superfícies, on-colors, estados,
  tipografia com tamanhos/line-height, raios, espaçamentos): importáveis quase
  diretamente para `tailwind.config.ts`.

**O que piora a leitura**

- **Densidade excessiva**: o ecrã do maintainer tem ~15 painéis e 4 barras de
  estado simultâneas. Num cockpit de risco, o alerta principal compete com
  telemetria decorativa ("Entropy pool: 256-bit constant", "Ring integrity").
- **Cabeçalhos sobrepostos** em larguras médias (ecrã de governança: o evento
  "Revocation event emitted" sobrepõe a navegação). As capturas foram geradas a
  ~1100–1600 px; não há variante móvel/estreita.
- **Vocabulário inflacionado** ("Sealed Vaults", "Consensus Beacon",
  "Outer Boundary", "Surgical", "Epistemic Lag") que diverge dos nomes reais das
  camadas e dificulta mapear UI → componente.

## 2. Fidelidade à arquitetura (o problema principal)

Contagem por ecrã (`code.html`, 17 no total):

| Afirmação nos ecrãs | Ecrãs | Realidade | Ação |
|---|---:|---|---|
| "ISO/IEC 29128 CAT-4 compliant/auditado" | 15 | Nenhuma certificação | **Remover** — alegação de conformidade falsa |
| Testemunhas "Interlegis", "Senado Federal", "Universidade X" | 12 / 2 / 10 | Nenhum acordo; testemunhas são D4 (pendente) | **Substituir por placeholders neutros** — usar nomes de instituições reais como participantes é impersonação |
| "Consensus" / "L8 Consensus Beacon" / "consenso bizantino" | 16 | O Arkhe não tem consenso; L8 é distribuição não confiável | Renomear L8 "Distribuição" |
| ML-DSA-87, "Proteção PQC ativa" | 8 | Perfil RBB usa ML-DSA-44; PoC e D0–D2 são Ed25519 | Mostrar o algoritmo real do perfil |
| Enclave de hardware, YubiHSM, NitroKey, "L1–L2 Sealed Vaults" | 11 / 5 | L1 = primitivas canónicas, L2 = kernel; HSM está fora de escopo | Remover o ecrã L1/L2 de enclave |
| Identidade "purged", "permanently excluded", quórum "2-of-2 restored" | 2 | Revogação **acrescenta** uma folha (append-only); nada é purgado. Remover um delegado altera o quórum: é sucessão do roster, não revogação | Mostrar "revogado a partir de t", binding histórico intacto |
| Botão "Bypass Consensus Quorum" (mesmo desativado) | 5 | Não existe nem deve existir | Remover — um controlo de bypass, mesmo bloqueado, contradiz o modelo |
| V1–V4 = "Isolation / No-regress / Mem-strict / Pure-fn" | pipeline | No `arkhe-sdd`, V1–V4 = Spec↔Task, Task↔Diff, Diff↔Invariantes, Evidência↔Gate | Usar as definições reais |
| "Verificação formal", "6 lemas provados", "85,7 % completo" | auditor | Os passos são verificações criptográficas, não provas formais | Não apresentar verificação como prova formal |
| Datas 2025 | 8 | Inconsistentes com 2026 | Dados de exemplo coerentes |

Nada disto é cosmético: um cockpit cuja função é **não dizer mais do que a
evidência suporta** não pode exibir conformidade, parceiros e algoritmos que não
existem. Os ecrãs devem ser tratados como maquetas visuais com texto de
preenchimento, nunca publicados como estão.

## 3. Acessibilidade

Contraste WCAG medido sobre o canvas `#0b0f14` / cartão `#121820` / elevado `#182230`:

| Token | Canvas | Cartão | Elevado |
|---|---:|---:|---:|
| `on-surface` `#e0e2ea` | 14,9 AA | 13,8 AA | 12,4 AA |
| `outline` `#86948a` | 6,1 AA | 5,6 AA | 5,1 AA |
| `text-muted` `#64748b` | 4,0 só texto grande | 3,8 só grande | 3,4 só grande |
| `text-subtle` `#475569` | **2,5 falha** | **2,4 falha** | **2,1 falha** |
| verified `#10b981` | 7,6 AA | 7,0 AA | 6,3 AA |
| refuted `#f43f5e` | 5,2 AA | 4,9 AA | 4,4 só grande |
| conjecture `#f59e0b` | 9,0 AA | 8,3 AA | 7,5 AA |
| pending `#0ea5e9` | 6,9 AA | 6,4 AA | 5,8 AA |

- `text-subtle` não pode levar informação; `text-muted` só em ≥ 18 px ou
  ≥ 14 px bold. Na prática, ambos aparecem em rótulos de 10–11 px.
- `code-dense` (10 px) e `label-mono-sm` (11 px) são usados para conteúdo, não só
  para metadados: subir o mínimo de conteúdo para 12 px.
- Refuted sobre superfície elevada fica abaixo de AA: usar `#fb7185` nesse contexto.
- Pulsação/piscar (L8, alertas) precisa de `prefers-reduced-motion`.
- Os ecrãs dependem de ícones Material sem texto alternativo; a navegação não tem
  ordem de foco nem estados de foco visíveis.

## 4. Funcionalidade

Todos os 17 `code.html`:

- carregam Tailwind por CDN (`cdn.tailwindcss.com`, JIT em runtime), Google Fonts e
  Material Symbols — inadequado para produção e para o perfil offline/air-gapped
  que o próprio cockpit anuncia;
- **0 chamadas de dados** (`fetch`/WebSocket); 0–5 `onclick` decorativos por ecrã;
- valores, hashes e logs são estáticos e inventados;
- não há componentes partilhados: a mesma barra lateral e cabeçalho repetem-se
  em cada ficheiro, com divergências entre ecrãs (rótulos, ordem, estados).

Isto é o esperado de uma exportação Stitch. O HTML não deve ser portado: deve
ser reconstruído em componentes React do Intra.

## 5. Mapa ecrã → backend real

| Ecrã | O que já existe | O que falta | Pronto para integrar? |
|---|---|---|---|
| Auditor L5 (verificação) | `arkhe-verify-wasm` (MMR, artefactos) já no `/verificar`; `ReleaseManifest::verify_bytes` (Rust); `HashtreeVerifier` (nativo) | Binding WASM do `ReleaseManifest`; assinaturas k-de-n; testemunhas | **Parcial — primeiro candidato** |
| Grafo de governança L3 | `GovernanceRoster`, `IdentityBinding`, `BindingRevocation` (Rust, testados) | API de leitura (runtime) e assinatura **fora do browser** | Parcial (só leitura) |
| Revogação de delegado | `BindingRevocation::sign` | O browser não pode ter a chave; fluxo de assinatura externa | Não, até haver fluxo de assinatura |
| Release pipeline L7→L8 | `arkhe-sdd-parser`; `htree-mirror`; narHash registados | Gate SDD, envelope k-de-n, testemunhas, âncora | Não (só a etapa de distribuição) |
| L0 reprodutibilidade / divergência | narHash publicados em `nixpkgs-arkhe` | Serviço que compare builders independentes | Só leitura estática |
| L8 distribuição | Hashtree/Blossom/Nostr (`arkhe-p2p`) | Radicle (bloqueado até iroh) | Parcial |
| Split view / equivocação | — | D4 (testemunhas) | **Não** — não há detetor |
| L1/L2 enclave | — | Fora da arquitetura | **Descartar** |
| L9 observador público | `/verificar`, `verify-mcp` | Cartão de descoberta assinado (D7) | Parcial |
| Visão do maintainer (tríade) | Integridade (verificação local), Autoridade (roster) | Disponibilidade com observação k-de-n | Parcial |

## 6. Plano de integração no Intra

**Fase A — design system (sem backend novo)**

1. Tokens de `DESIGN.md` → `apps/arkhe-intra/tailwind.config.ts` (`theme.extend`
   cores, tipografia, raios, espaçamentos), com `text-subtle` restrito a
   decoração e `refuted` ajustado para superfícies elevadas.
2. Fontes Inter e JetBrains Mono **self-hosted** (`next/font/local`), sem CDN.
   Ícones via `lucide-react`, que o Intra já usa, em vez de Material Symbols.
3. Cinco componentes: `TauBadge` (LEMMA/CONJECTURE/REFUTED/PENDING),
   `TriadGauge`, `LayerStack` (L0–L9 com nomes reais), `ProofStepTree`
   (`[✔] [!] [✗]` + motivo tipado), `FailClosedGate` (ação desativada com
   `Incomplete{…}`/`Refuted{…}` visível).

**Estado da fase A (2026-10-30): implementada.**

| Peça | Ficheiro |
|---|---|
| Regras puras (camadas reais, cascata de bloqueio, veredito de passos, gate, tríade) | `apps/arkhe-intra/lib/cockpit.mjs` (+ `.d.mts`), 8 testes em `tests/cockpit.test.mjs` |
| Tokens `ck-*` no Tailwind, ativos só dentro de `.cockpit` | `tailwind.config.ts`, `app/cockpit.css` |
| Componentes `TauBadge`, `TriadGauge`, `LayerStack`, `ProofStepTree`, `FailClosedGate` | `components/cockpit.tsx` |
| Catálogo com exemplos fictícios marcados como tal | `/cockpit` (`app/cockpit/page.tsx`) |

Decisões: as fontes usam só stacks locais (Inter ou JetBrains Mono quando
instaladas, senão Segoe UI e Cascadia Mono/Consolas), sem CDN; a CSP do Intra
(`font-src 'self'`) já bloqueava fontes externas. Vendorizar os ficheiros
woff2 (licença OFL) fica para quando se decidir descarregá-los. `muted` passou
a `#94a3b8` e `refuted` a `#fb7185`; ambos ficam ≥ 5,9:1 em todas as
superfícies. `FailClosedGate` não tem propriedade de bypass, e a tríade rebaixa
um `LEMMA` que os números não sustentam. Typecheck limpo; a rota compila
sem erros.

Verificação no browser (2026-10-30, sessão autenticada): os cinco componentes
renderizam a 1440 px e a 375 px, sem transbordo horizontal; com três cliques só
o gate habilitado executou a ação, e os dois bloqueados ficaram `disabled`, com o
motivo ligado por `aria-describedby`; os medidores expõem `aria-label` com valor
e τ; a fonte mono resolve para Cascadia Mono quando JetBrains Mono não está
instalada. Corrigido durante a verificação: rótulos longos no medidor
(`108/108`) passaram a 12 px para caber no anel. Fora do cockpit, a faixa da
Intra mostra "null eventos registrados" (defeito anterior).

**Fase B — primeiro ecrã real: Auditor L5**

4. Exportar `ReleaseManifest::verify_bytes` e o `HashtreeVerifier` (ou a sua parte
   pura) para WASM, ao lado do verificador atual; correr no browser, offline.
5. Ecrã: upload de `.cbor` + keyset; árvore de passos onde cada passo **não
   implementado** aparece como `PENDING`, nunca como verde.

**Fase C — leitura de governança**

6. Endpoints só de leitura no `arkhe-runtime` para roster, bindings e revogações;
   grafo L3 sem ações de escrita. Assinaturas (revogar, assinar manifesto)
   ficam em CLI/hardware; a UI apenas submete objetos já assinados.

**Fora de escopo até existir backend:** pipeline completo, split view, enclave L1/L2.

Regras para cada ecrã reconstruído: só mostra valores vindos de um verificador
ou endpoint; o que não existe aparece como `PENDING`; nenhuma certificação,
organização real ou algoritmo que o perfil não use; nenhum controlo de bypass.

## Nota de honestidade (τ)

| Afirmação | τ | Nota |
|---|---|---|
| O design system é visualmente coerente e reutilizável | LEMMA | 17 ecrãs com os mesmos tokens e padrões |
| Os ecrãs afirmam garantias inexistentes | LEMMA | contagens da §2 sobre `code.html` |
| `text-subtle` falha WCAG AA em todas as superfícies | LEMMA | §3, cálculo de contraste |
| O Auditor L5 é integrável primeiro | CONJECTURE | depende de exportar `release.rs` para WASM |
| A UI comunica fail-closed sem ambiguidade a utilizadores reais | CONJECTURE | não testado com utilizadores |
