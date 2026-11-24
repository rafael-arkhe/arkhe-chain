# Piloto Offline Arkhe × 0x Solana Swap (`POST /solana/swap-instructions`)

Ensaio determinístico e offline de autorização de swaps Solana propostos por um agente a partir de instruções retornadas pela API 0x, com **zero assinaturas reais** e **zero transmissões em rede**.

## Status atual

- **Proveniência oficial da 0x demonstrada offline (`provenance: "0x-official"`)**: captura sanitizada (sem `0x-api-key`) de uma resposta real `HTTP 200` de `POST https://api.0x.org/solana/swap-instructions` (`0.1 SOL → USDC`, `zid: 0x2aa3c060be30ef0ae6d00945`) promovida para a fixture versionada [fixtures/zerox-official-solana-swap-instructions.json](fixtures/zerox-official-solana-swap-instructions.json).
  - Assinatura RFC 9421 Ed25519 verificada contra a chave pública de produção publicada pela 0x (`0x-signing-key-prod-24092026`): **`VALID_0X_SIGNATURE`** cobrindo `@status`, `content-type`, `content-digest`, `@method;req`, `@authority;req`, `@path;req`, `@query;req` e `content-digest;req`.
  - Núcleo Rust/WASM (`arkhe-verify-core/solana_swap/v1`) avaliou os bytes compilados da `MessageV0` real e retornou **`BLOQUEADO`** com múltiplas violações prováveis diretamente nos bytes de fio: **`UNAUTHORIZED_ATA_CREATION`** na instrução #1 (criação de ATA USDC para carteira de terceiro `EPLJ3CRxz887UcMPwJL9GSnYPmg42TZSBVvAJ2tzqd44` paga pelo `taker`), **`INPUT_ASSET_CAP_EXCEEDED`** (`100_000_000 > 50_000_000`) e **`TOTAL_SOL_CAP_EXCEEDED`** decodificados diretamente do cabeçalho de 29 bytes da instrução #2 do Settler 0x (`Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m`: `zid: 0x2aa3c060be30ef0ae6d00945`, `declaredAmountIn: 100000000`, `declaredMinAmountOut: 7217315`, `ZeroXSettler.UnverifiedCpiRoute`, `cpiAuditStatus: UNVERIFIED_EXTERNAL_CPI`), mantendo sempre `UNINTERPRETED_PROGRAM` em `indeterminateFactors` (fail-closed — mesmo dentro do teto, nunca recebe `ELEGÍVEL`) além de `MISSING_ADDRESS_LOOKUP_TABLE` para as 2 ALTs de mainnet.
  - Todas as 4 regressões negativas sobre a assinatura oficial da 0x (`RESPONSE_REPLAY_DETECTED`, `RESPONSE_SIGNATURE_EXPIRED`, `INVALID_0X_ED25519_SIGNATURE` com pedido trocado e digest recalculado, e `RESPONSE_BODY_DIGEST_MISMATCH`) bloqueiam com `0` chamadas à chave e são reproduzidas offline em bundle MMR assinado (`5/5` recibos verificados via `arkhe-verify-wasm`).
- **Exercitado offline com fixtures locais (`provenance: "test-fixture"`)**: autoridade Rust/WASM (`arkhe-verify-core/solana_swap/v1`) verificada com `11/11` testes unitários Rust em `arkhe-verify-core` (`solana_swap` + inspetor estrutural do Settler 0x + compilador nativo `MessageV0` + reconciliação on-chain + `rfc9421` + `release`), `2/2` em `arkhe-verify-wasm` (exportando `evaluate_solana_swap_message_v0`, `compile_solana_swap_message_v0` e `reconcile_solana_swap_confirmation` nos pacotes Node e Web), `44/44` testes Node em `integrations/solana-proof` e `12/12` recibos assinados em MMR reproduzidos offline.
- **Backend HTTP Rust completo e durável (`arkhe-solana-swap-gateway` + montagem opcional no `arkhe-runtime` principal)**: implementado em `orchestration/arkhe-runtime` sobre `arkhe-verify-core` e `arkhe-kernel` (feature `sqlite-activation`), fechando as **3 evidências** da proposta (1. RFC 9421 Ed25519 + anti-replay SQLite WAL; 2. compilação nativa `MessageV0` em Rust + política + fronteira de assinatura + recibo MMR; 3. reconciliação pós-execução / confirmação on-chain vinculada ao hash exato da `MessageV0` e aos tetos da política), clientes upstream read-only para `api.0x.org` (*shadow read-only*, sem nunca persistir/vazar `0x-api-key`) e Solana JSON-RPC, além de hardening operacional (graceful shutdown `Ctrl+C`/`SIGTERM`, headers defensivos + `x-request-id`, métricas Prometheus `/metrics`, OpenAPI 3.1 `/openapi.json`, `validate-policy` e `print-openapi`) e montagem opcional das 17 rotas `/v1/solana/swap/*` diretamente no servidor principal `arkhe-runtime` (via `ARKHE_SOLANA_SWAP_POLICY` + `ARKHE_SOLANA_SWAP_DB`). Validado com `9/9` testes de integração HTTP/CLI/TCP/mock-upstream/concorrência-paralela/mount em `solana_swap_gateway_http` e `5/5` em `governed_gateway_http`.
- **Pendente**: interpretação de ponta a ponta de uma rota real da Mainnet Beta da 0x (ex.: decodificador e modelo de garantias explícito para `Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m` + CPIs em Meteora DLMM / Deriverse) e ancoragem de snapshots de ALT a observadores independentes do estado finalizado da Solana. Enquanto isso não existir, qualquer rota real da 0x que chame programas não cobertos nunca recebe autorização (`BLOQUEADO` ou `INCONCLUSIVO`).

## Separação de papéis (JS monta, Rust decide)

- **Node/JS (`@solana/web3.js`)**: normaliza instruções da API 0x (tanto arrays de bytes reais `number[]` quanto strings base58/base64), monta a `MessageV0` real a partir das instruções e ALTs e serializa os bytes de fio (`messageV0.serialize()`). Não realiza avaliação de política duplicada.
- **Núcleo Rust (`arkhe-verify-core::solana_swap` via `arkhe-verify-wasm`)**: é a **única autoridade de interpretação e política** (`arkhe-verify-core/solana_swap/v1`). Recebe diretamente os bytes brutos da `MessageV0`, verifica a origem/atestação Ed25519 e o contexto (`network`, `genesisHash`, `slot`, `deactivationSlot`) de cada snapshot de ALT referenciado, resolve cada conta por índice e emite `ELEGÍVEL`, `BLOQUEADO` ou `INCONCLUSIVO`. Nenhum resumo pré-interpretado do JS é confiado pelo Rust.

## Invariantes implementados

| Invariante | Módulo | Garantia verificada |
|---|---|---|
| **1. Origem, vigência e vínculo da resposta HTTP** | `src/zerox-rfc9421.mjs` | Verifica RFC 9421 Ed25519 contra chaves confiáveis externas à fixture (incluindo JWK oficial `0x-signing-key-prod-24092026`), recalcula SHA-256 exato do pedido (`"content-digest";req`) e da resposta (`"content-digest"`), impõe janela de 60s com relógio fixo injetável e registra consumo no `SingleUseReplayStore` **somente após** a autenticação criptográfica passar. |
| **2. Mensagem final compilada, origem dos snapshots de ALT e política (Rust)** | `verification/crates/arkhe-verify-core/src/solana_swap.rs` + `arkhe-verify-wasm` | Deserializa os bytes reais da `MessageV0`, verifica atestação Ed25519 e contexto de estado (`network`/`genesisHash`/`slot`) dos snapshots de ALT (`BLOQUEADO` em divergência comprovada; `INCONCLUSIVO` se faltar evidência de origem), resolve contas por índice, decodifica cada instrução e verifica tetos separados (`maxInputAssetDebit`, `maxSolAncillaryDebit`, `maxTotalSolDebit` quando entrada = SOL, `minOutputNetCredit`). |
| **3. Fronteira de assinatura vinculada ao hash exato** | `src/zerox-pilot.mjs` | Emite autorização de teste Ed25519 de uso único **apenas** quando o núcleo Rust retorna `ELEGÍVEL`. `DryRunSigningBoundary` recalcula SHA-256 e BLAKE3 dos bytes recebidos antes de chamar a chave de teste (`realSignaturesProduced: 0`, `broadcastCalls: 0`). O recibo registra juntos `policyVerdict`, `signingBoundaryOutcome` e `finalOutcome`. |

## Execução e verificação offline

```powershell
# Recompilar Rust + WASM (se alterar arkhe-verify-core ou arkhe-verify-wasm)
cargo test -p arkhe-verify-core --lib solana_swap --locked
cargo test -p arkhe-verify-wasm --locked
python scripts/build_verifier.py

# Executar testes, piloto de 12 casos (test-fixture) e verificação da captura oficial 0x
cd D:\arkhe\integrations\solana-proof
npm test
npm run pilot:zerox
npm run verify:zerox
npm run verify:zerox-official
```

Para capturar uma nova resposta *shadow read-only* da 0x sem persistir a chave em disco:

```powershell
$env:ZEROX_API_KEY = '<sua-chave-0x>'
node src/zerox-shadow-probe.mjs
```

## Backend HTTP Rust (`arkhe-solana-swap-gateway`)

O backend HTTP standalone em Rust combina `arkhe-verify-core` (`rfc9421` + `solana_swap` + `rbb::mmr`), persistência durável em SQLite WAL (`kernel/arkhe-kernel/src/solana_swap_sqlite.rs`) e gateway Axum (`orchestration/arkhe-runtime/src/solana_swap_gateway.rs`), sempre com `realSignaturesProduced == 0` e `broadcastCalls == 0`.

### Endpoints HTTP (17 rotas — todas autenticadas por `Authorization: Bearer <ARKHE_SOLANA_SWAP_TOKEN>` em tempo constante, limite de corpo `1 MiB`, headers defensivos `nosniff`/`no-store`/`DENY` + `x-request-id`)

- `GET /v1/solana/swap/health` — integridade SQLite WAL, raiz MMR atual, contadores duráveis (`receiptCount`, `consumed0xResponses`, `issuedAuthorizations`, `consumedAuthorizations`, `signingBoundaryEvents`, `onchainConfirmations`), flags `upstream` e contadores de segurança (`realSignaturesProduced`, `broadcastCalls`).
- `GET /v1/solana/swap/metrics` — exposição de métricas em formato Prometheus (`text/plain; version=0.0.4`).
- `GET /v1/solana/swap/openapi.json` — especificação OpenAPI 3.1.0 (também versionada em `orchestration/arkhe-runtime/config/solana-swap-openapi.json`).
- `GET /v1/solana/swap/public-keys` — documento JSON com chaves públicas Ed25519 (`auth`, `receipt`, `checkpoint`), `policyDigest` e `trusted0xKeyIds` fixadas no servidor (nunca expõe segredos).
- `GET /v1/solana/swap/policy` — retorna a `SolanaSwapPolicy` ativa fixada no servidor e seu `policyDigest`.
- `GET /v1/solana/swap/checkpoint` — retorna o checkpoint MMR Ed25519 assinado mais recente (`404` se ainda não houver recibos).
- `POST /v1/solana/swap/compile` — compila `MessageV0` nativamente em Rust puro (suportando contas estáticas e compressão via ALTs) a partir do payload 0x + `recentBlockhash`, sem depender de Node/`@solana/web3.js`.
- `POST /v1/solana/swap/evaluate` — verifica RFC 9421 Ed25519 + anti-replay durável em SQLite WAL (registrado **somente após** autenticação criptográfica válida), decodifica `compiledMessageBase64` (ou compila nativamente em Rust via `recentBlockhash`) + snapshots de ALT no motor Rust e emite recibo assinado + prova MMR (e autorização de teste de uso único **apenas** se `ELEGÍVEL`).
- `POST /v1/solana/swap/shadow-quote-and-evaluate` — chama `POST <zerox-base-url>/solana/swap-instructions` em modo *shadow read-only* (injetando `ZEROX_API_KEY` apenas no header de saída, nunca no recibo), busca `recentBlockhash` e ALTs finalizadas na Solana RPC (decodificação binária nativa de `AddressLookupTable`, mantendo `attestation: None` se nenhum `AltObserverSigner` estiver configurado) e executa o pipeline completo de `evaluate` (`503` fail-closed se 0x não configurado).
- `POST /v1/solana/swap/signing-boundary` — verifica assinatura Ed25519 e validade da autorização, confere SHA-256 + BLAKE3 exatos da `MessageV0`, consome a autorização atomicamente em SQLite WAL e registra cada tentativa (aceita ou rejeitada) em `signing_boundary_events`.
- `GET /v1/solana/swap/signing-boundary/events[?authId=...]` — consulta o log durável de eventos da fronteira de assinatura.
- `GET /v1/solana/swap/receipts[?limit=50&offset=0]` — listagem paginada de recibos e raiz MMR atual.
- `GET /v1/solana/swap/receipts/{receipt_id}/bundle` — exporta `SolanaSwapOfflineBundle` autocontido (recibo canônico, assinatura Ed25519, prova de inclusão `rbb::mmr` e checkpoint assinado).
- `POST /v1/solana/swap/receipts/{receipt_id}/confirm` — **Evidência #3 (reconciliação pós-execução)**: valida que a transação confirmada atingiu `finalized`, casa exatamente com SHA-256/BLAKE3 da `MessageV0` autorizada e compara os valores efetivamente movimentados on-chain contra os tetos da política (`CONFIRMED_WITHIN_POLICY` / `CONFIRMED_POLICY_BREACH` / `FAILED_ON_CHAIN` / `MESSAGE_MISMATCH` / `INSUFFICIENT_CONFIRMATION`), persistindo o recibo assinado de forma imutável em `onchain_confirmations`.
- `POST /v1/solana/swap/receipts/{receipt_id}/reconcile-rpc` — consulta `getTransaction` (`encoding: "base64"`, `commitment: "finalized"`, `maxSupportedTransactionVersion: 0`) na Solana RPC read-only configurada, extrai os bytes brutos da `MessageV0` da transação serializada e executa a reconciliação completa da Evidência #3 (`503` fail-closed se Solana RPC não configurada).
- `GET /v1/solana/swap/receipts/{receipt_id}/confirmation` — recupera o recibo assinado de confirmação on-chain.
- `POST /v1/solana/swap/verify-bundle` — valida um bundle exportado contra as chaves públicas do servidor (`200 OK` válido / `422` adulterado).

### Compilação, testes e execução do binário

```powershell
# Testes de núcleo, gateway HTTP/CLI/TCP/upstream e regressão do gateway existente
cargo test -p arkhe-verify-core --lib --locked
cargo test -p arkhe-runtime --features sqlite-activation --test solana_swap_gateway_http --locked
cargo test -p arkhe-runtime --features sqlite-activation --test governed_gateway_http --locked

# Compilar binário standalone
cargo build -p arkhe-runtime --features sqlite-activation --bin arkhe-solana-swap-gateway --locked

# Iniciar servidor HTTP (fail-closed sem ARKHE_SOLANA_SWAP_TOKEN; ZEROX_API_KEY e --solana-rpc-url opcionais)
$env:ARKHE_SOLANA_SWAP_TOKEN = '<token-forte>'
$env:ZEROX_API_KEY = '<chave-0x-opcional>'
.\target\debug\arkhe-solana-swap-gateway.exe serve `
  --bind 127.0.0.1:8090 `
  --db ops/local/solana-swap/state.sqlite `
  --policy <caminho-da-politica.json> `
  --keys-dir ops/local/solana-swap/keys `
  --zerox-base-url https://api.0x.org `
  --solana-rpc-url https://api.mainnet-beta.solana.com

# Verificar bundle de decisão ou recibo de confirmação on-chain 100% offline via CLI
.\target\debug\arkhe-solana-swap-gateway.exe verify-bundle `
  --bundle <receipt-bundle.json> `
  --public-keys <public-keys.json>
.\target\debug\arkhe-solana-swap-gateway.exe verify-confirmation `
  --confirmation <confirmation-receipt.json> `
  --public-keys <public-keys.json>
```

## Limites explícitos registrados

- **Separação de proveniência**: cada recibo declara explicitamente `provenance: "0x-official"` (fixture oficial sanitizada de `api.0x.org` verificada contra `0x-signing-key-prod-24092026`) ou `provenance: "test-fixture"` (chave Ed25519 local determinística).
- **Origem das ALTs em produção**: o piloto demonstra a verificação criptográfica de snapshots de ALT assinados por um observador de estado fixado na política (`trustedAltAttesterKeys`); na captura oficial de mainnet sem snapshots atestados, o Rust registra `MISSING_ADDRESS_LOOKUP_TABLE` e impede qualquer autorização.
- **Cobertura de rotas**: o caso positivo (`case-5-covered-route-eligible`) cobre explicitamente o perfil `CoveredDirectAmmV1` (`provenance: "test-fixture"`). A capacidade de emitir `ELEGÍVEL` para uma rota real da 0x via `Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m` permanece pendente de decodificador, modelo explícito de garantias CPI e observador de ALTs.
