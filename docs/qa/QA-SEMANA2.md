# Arkhe QA — Semana 2: gate de arquitetura e CI do que já existia

**Data:** 2026-10-29. Continua [a auditoria da semana 1](QA-SEMANA1-AUDITORIA.md).
Objetivo: subir o CFC sem escrever código de produto. Mapa atualizado em
[cfc-map.json](cfc-map.json).

## Resultado

| Medida | Semana 1 | Semana 2 |
|---|---|---|
| CFC (fluxos com caminho negativo testado **e** ligado a CI) | 9/20 = 45 % | **14/20 = 70 %** |
| Gate `check_architecture.py` | falha | passa (31 crates, 9 pacotes Node, 18 migrações) |
| `cargo fmt --all --check` | falha (8 ficheiros) | passa |
| `cargo clippy --workspace --all-targets -D warnings` | falha (3 erros) | passa |
| `cargo test --workspace` | 511 / 0 falhas / 20 ignorados | 511 / 0 / 20 (inalterado) |

"Ligado a CI" continua a significar: o workflow existe e o gate passa quando
reexecutado localmente. O tree ainda não é um repositório git, por isso nenhuma
execução remota sustenta estes estados (ver pendências).

## Gate de arquitetura (CF-20)

| Falha | Correção |
|---|---|
| 4 crates do workspace fora do registro | `config/architecture.json` `rust_members` = membros do `Cargo.toml` |
| 9 crates com workspace próprio tratadas como "fora do workspace" | Nova lista `independent_workspaces` (caminho + razão). O gate exige `[workspace]` e `Cargo.lock` próprios e recusa sobreposição com membros; crates não registadas continuam a falhar. `apps/` passou a ser varrido |
| `20261026000018_wormgraph_fencing.sql` fora do lock (achado QA-002 de 28/10) | Revista (aditiva: tabela de fencing, colunas `writer_epoch` com CHECK) e registada. As 17 identidades anteriores foram re-verificadas antes; nenhuma mudou |
| `apps/arkhe-ask` usa `sqlx::migrate!` sem `rerun-if-changed` | `apps/arkhe-ask/build.rs` |

Testes negativos novos: `scripts/tests/test_architecture_independent.py`
(registo sem lockfile, sem `[workspace]`, sobreposto a membro, inexistente,
fora da raiz ou sem razão → `ValueError`).

## CI do que só corria à mão (CF-05, CF-10, CF-11, CF-12)

Em `.github/workflows/ci.yml`:

- job `kernel-and-contracts`: gates `release-vectors`, `idbind-vectors`,
  `idbind-fixtures`, `domain-registry`;
- novo job `p2p-acquisition`: fmt, clippy e os 27 testes de
  `integration/arkhe-p2p` (offline; só fixtures).

`generate_expected.py --check` (E02) continua fora: precisa do checkout E02.

## Separação de domínios

`scripts/check_domains.py` (gate `domain-registry`) varre os membros do
workspace e falha se um literal `AKG:*` é usado por mais de uma crate sem
declaração em `config/domain-sharing.json`, se uma declaração ficou obsoleta,
se um registro tem hex/comprimento errado ou um literal para dois objetos, ou
se um domínio registado como implementado não aparece no código.
Estado: 191 literais, 16 registados, 4 partilhas declaradas (todas o mesmo
objeto re-derivado). Testes: `scripts/tests/test_check_domains.py`.

Correção à semana 1: os dois usos de `AKG:CHECKPOINT:v1` têm o mesmo esquema de
checkpoint; não havia colisão.

## Correções de lint/formatação anteriores

- `cargo fmt` em 8 ficheiros já existentes (só formatação).
- `arkhe-rag` `ConstrainedDecoder`: `#[allow(clippy::large_enum_variant)]`
  justificado, para não mudar o tipo público que os testes desestruturam.
- `arkhe-governance` `sign_policy_bundle`: `#[allow(clippy::too_many_arguments)]`,
  mesmo padrão do kernel.
- `arkhe-kernel` teste de suporte: `&vec![..]` → `&[..]`.

## Pendências para a semana 3

1. **Pôr o tree num repositório git e executar o CI remoto.** Sem isto, o CFC
   de 70 % é "ligado e verde localmente", não "verde no CI". É uma decisão do
   dono do repositório (remoto, visibilidade, histórico).
2. CF-17 (reprodutibilidade Nix) continua só local: o workflow vive em
   `work/nixpkgs-arkhe-integration`.
3. Os 5 fluxos sem teste (CF-09, 13, 14, 18, 19) precisam de código: envelope
   k-de-n, verificação de cadeia `prev_release_digest` (com D3), testemunhas
   (D4), gate SDD e descoberta (D7).
4. 181 domínios `AKG:*` ainda por registar.

## Nota de honestidade (τ)

| Afirmação | τ | Nota |
|---|---|---|
| Os 12 gates tocados passam localmente | LEMMA | reexecução completa em 2026-10-29 |
| CFC = 70 % | LEMMA sob a definição do mapa | `cfc-map.json` |
| O CI remoto ficará verde | CONJECTURE | não executado; ambiente Linux difere do Windows local |
| Nenhuma mudança de comportamento | LEMMA para testes | 511/0/20 antes e depois; as mudanças são fmt, lint e configuração |
