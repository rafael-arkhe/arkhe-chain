# Arkhe QA — Semana 1: auditoria do estado e mapa de CFC

**Data:** 2026-10-29. **Escopo:** primeiro entregável do plano de QA de 3 meses
(auditoria do estado atual e mapa de fluxos críticos). Tudo aqui foi medido
neste tree (`D:\arkhe`); nada foi inferido do texto do plano.
Mapa legível por máquina: [cfc-map.json](cfc-map.json).

## 1. Resumo

| Medida | Valor |
|---|---|
| Fluxos críticos mapeados | 20 |
| **CFC** (teste automatizado do caminho negativo **e** ligado a CI) | **9 / 20 = 45 %** |
| Parciais (parte no CI, parte só local) | 2 |
| Automatizados mas fora de CI | 3 |
| Sem teste automatizado | 5 |
| Gate de CI que falha hoje | 1 (`check_architecture.py`) |
| Baseline `cargo test --workspace` | 511 aprovados, 0 falhas, 20 ignorados |
| Última execução de CI remota com evidência | 2026-10-17 (run 39054969626), antes das mudanças atuais |

A meta do plano (CFC ≥ 90 % em 3 meses) exige fechar 9 fluxos. Cinco deles
dependem de código que ainda não existe (D3, D4, keyset de release, gate SDD,
descoberta); não são trabalho de QA.

## 2. Achados que bloqueiam o resto

1. **O tree local não é um repositório git.** Nenhum workflow corre sobre ele;
   a "cobertura em CI" abaixo significa "ligado a um workflow que existiria se
   este tree fosse publicado". A última evidência remota (repo
   `rafael-arkhe/arkhe-os`, 2026-10-17) testou 8 migrações; hoje há 18 (17
travadas e uma por registar — corrigido na semana 2).
2. **`scripts/check_architecture.py` falha** — e é o segundo gate de
   `kernel-and-contracts`. Falhas: workspace ≠ registro
   (`config/architecture.json`), `apps/arkhe-ask` sem `rerun-if-changed` para
   `./migrations`, crate ativa fora do workspace, identidades de migração
   publicadas divergentes. Com isto, o job ficaria vermelho na primeira
   execução. Anterior às mudanças D0–D2.
3. **`integration/arkhe-p2p` não tem testes em CI.** O workflow
   `arkhe-p2p-dependencies.yml` só corre `cargo-deny`. Os 26 testes de
   integração (Hashtree, Bao, Blossom, Nostr, IDBIND) só correm à mão.
4. **Referências Python novas não estão no CI**:
   `generate_release_manifest_vectors.py --check`,
   `generate_identity_binding_vectors.py --check`,
   `idbind-vectors --check`, `generate_expected.py --check` (este exige o
   checkout E02).

## 3. Correções τ ao plano

O plano classifica como demonstradas várias coisas que o código não sustenta.

| Afirmação do plano | τ no plano | τ medido | Evidência |
|---|---|---|---|
| Separação de domínio: nenhum digest colide | LEMMA | **CONJECTURE** (semana 1) | 191 literais `AKG:*` nos membros do workspace (203 contando snapshots); os registros cobrem 16. Nenhum teste de unicidade. *Correção da semana 2:* os dois usos de `AKG:CHECKPOINT:v1` têm o mesmo esquema de checkpoint, não são payloads diferentes; o gate `scripts/check_domains.py` passou a cobrir isto |
| `EVIDENCE_DEGRADED` → `Deny` | LEMMA | **REFUTED como formulado** | O estado não existe no código (vem da proposta Arkhe Linux). O que existe: `CoreError::EvidenceUnavailable` e o teste de queda do PostgreSQL no job `persistent-runtime` |
| Trust-registry resolve por `org_id` e timestamp | LEMMA | **REFUTED** | `governance/trust-registry/public-keys.json` tem `keys: []`, intencionalmente não provisionado; não há `org_id` em `governance/` nem `kernel/` |
| Limiar k-de-n | PENDING | PENDING para release; **LEMMA** para o roster | `GovernanceRoster` já testa quórum e sucessão |
| Append-only SQL com 13 migrações | LEMMA | **CONJECTURE hoje** | Há 18 migrações, não 13; CI remoto testou 8; a 18.ª não estava no lock (QA-002) |
| Rollback (`prev_release_digest`) rejeitado | LEMMA | **PENDING** | O campo existe e está no digest; nenhuma verificação de cadeia foi implementada |
| Transporte adversário: Hashtree, Blossom, Radicle, GitHub | LEMMA | **LEMMA só para Hashtree/Blossom/Nostr**; Radicle e GitHub PENDING | `integration/arkhe-p2p/tests/` |
| IdentityBinding | PENDING (mês 3) | **LEMMA com chaves de teste** | Feito (D2): `evidence/arkhe-wormgraph/tests/binding.rs`, verificação cruzada com o crate `nostr` |
| `proptest` para CBOR | — | **ausente** | `proptest` só em 2 ficheiros de `arkhe-verify-core`; nenhum em `arkhe-core` |
| `tests/golden/`, `test-keys/` com ML-DSA, "26 fixtures do piloto" | — | **não existem** | Vetores estão em `tests/*.json`; não há chaves ML-DSA no tree |
| Pipelines `pr-checks`, `integration`, `e2e-release`, `supply-chain` | — | **não existem com esses nomes** | Jobs reais: `kernel-and-contracts`, `surfaces-and-wasm`, `persistent-runtime`, `cognition-*`, `ai-security`; `security.yml` |
| Zephyr "é a ferramenta certa" | LEMMA | **decisão, não lema** | Nenhuma integração Jira/Zephyr no tree |

## 4. Baseline medido

Inventário de testes por crate (anotações `#[test]`/`#[tokio::test]`):

| Crate | Testes | Ignorados | Kani |
|---|---:|---:|---:|
| `kernel/arkhe-core` | 16 | 0 | 0 |
| `kernel/arkhe-kernel` | 54 | 1 | 0 |
| `governance/arkhe-governance` | 56 | 0 | 1 |
| `governance/arkhe-sdd-parser` | 12 | 0 | 0 |
| `evidence/arkhe-wormgraph` | 62 | 3 | 4 |
| `evidence/arkhe-memory` | 0 | 0 | 0 |
| `storage/sql/crates/arkhe-sql` | 4 | 0 | 0 |
| `verification/crates/arkhe-verify-core` | 86 | 0 | 0 |
| `verification/crates/arkhe-verify-cli` | 0 | 0 | 0 |
| `verification/crates/arkhe-verify-wasm` | 0 (coberto por `pnpm verify:wasm`) | 0 | 0 |
| `orchestration/arkhe-runtime` | 43 | 1 | 0 |
| `work/arkhe-work` | 0 | 0 | 0 |
| `cognition/arkhe-agent` | 0 | 0 | 0 |
| `integration/arkhe-p2p` (fora do workspace) | 26 | 0 | 0 |

Execução local de `cargo test --offline --workspace --no-fail-fast`:
**511 aprovados, 0 falhas, 20 ignorados**, em 160 binários de teste
(Windows, Rust 1.96.0, offline, sem PostgreSQL). Os 20 ignorados incluem os
testes que só correm com PostgreSQL no CI (`--ignored`); sem a base de dados,
CF-01, CF-03 e CF-15 não foram re-exercitados nesta auditoria. Somam-se os 27
testes de `arkhe-p2p` (26 de integração e 1 doctest), executados à parte.

Lacunas visíveis no inventário: `arkhe-verify-cli`, `arkhe-memory`,
`arkhe-work` e `arkhe-agent` sem testes próprios.

## 5. Mapa de CFC

| ID | Camadas | Fluxo | Estado |
|---|---|---|---|
| CF-01 | L1–L4, L7 | Admissão WorkIntent+WER → política → gate → commit atómico | ✅ CI (evidência de 10-17) |
| CF-02 | L2 | Gate rejeita sem política/evidência | ✅ CI |
| CF-03 | L4, L7 | Fail-closed com PostgreSQL em baixo; replay exato | ✅ CI (evidência de 10-17) |
| CF-04 | L1 | Paridade CBOR WorkIntent/WER Rust = Python | ✅ CI |
| CF-05 | L1, L8 | Paridade e decodificação estrita do ReleaseManifest | ◐ Rust no CI, Python fora |
| CF-06 | L4, L5 | Inclusão MMR offline; folha alterada rejeitada | ✅ CI |
| CF-07 | L5 | WASM = nativo nos vetores READY | ✅ CI |
| CF-08 | L3 | Quórum, sucessão e janelas do roster | ✅ CI (Kani por executar) |
| CF-09 | L3, L8 | Assinaturas k-de-n sobre o ReleaseManifest | ✗ envelope não especificado |
| CF-10 | L3, L8 | IdentityBinding: duas assinaturas, roster, revogação | ◐ Rust no CI; Python e `nostr` fora |
| CF-11 | L8 | Árvore Hashtree contra digests independentes | ▢ só local |
| CF-12 | L8 | Transporte Blossom/Nostr adversário e limitado | ▢ só local |
| CF-13 | L8 | Rollback por `prev_release_digest` | ✗ |
| CF-14 | L4, L8 | Split view rejeitado por testemunhas | ✗ (D4) |
| CF-15 | L7 | Admissão de preview, leases, fencing | ✅ CI (PostgreSQL) |
| CF-16 | L6, L9 | Recuperação adversária / prompt injection | ✅ CI |
| CF-17 | L0 | `narHash` idêntico entre builders independentes | ▢ local, workflow noutro checkout |
| CF-18 | L7 | Gate SDD V1–V4 | ✗ só o parser existe |
| CF-19 | L9 | Assinatura do cartão de descoberta | ✗ (D7) |
| CF-20 | L0, L1 | Gate de arquitetura | ✗ **falha hoje** |

Legenda: ✅ coberto · ◐ parcial · ▢ automatizado sem CI · ✗ ausente ou a falhar.

## 6. Semana 2 — prioridades por custo/benefício

Ordenado pelo que sobe o CFC sem escrever produto novo:

1. **Repor o gate de arquitetura (CF-20)**: reconciliar `config/architecture.json`
   com o workspace e decidir as identidades de migração. Sem isso nenhum PR passa.
2. **Ligar ao CI** os testes de `arkhe-p2p` e os quatro `--check` novos
   (CF-05, CF-10, CF-11, CF-12): +4 fluxos, só YAML.
3. **Pôr o tree num repositório git e reexecutar o CI remoto**, para que
   "coberto" volte a significar "verde agora" (CF-01, CF-03).
4. **Teste de unicidade de domínios** sobre todos os literais `AKG:*` e registo
   dos 193 em falta; decidir `AKG:CHECKPOINT:v1` duplicado.
5. Verificação de cadeia `prev_release_digest` (CF-13) — pequena, entra com D3.

Com 1–2 feitos, o CFC passa a 13/20 = 65 % sem código de produto.

## 7. Nota de honestidade (τ)

| Afirmação | τ | Nota |
|---|---|---|
| CFC atual é 45 % sob a definição estrita deste documento | LEMMA | contagem em `cfc-map.json` |
| "Coberto em CI" implica verde hoje | REFUTED | o tree não é git; última execução remota 2026-10-17 |
| Os gates 1–2 da semana 2 elevam o CFC a 65 % | CONJECTURE | depende de o CI correr verde após a reconciliação |
| CFC ≥ 90 % em 3 meses | CONJECTURE | 5 fluxos dependem de D3, D4, keyset, gate SDD e D7 |
