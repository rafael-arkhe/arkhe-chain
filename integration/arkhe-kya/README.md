# Passaporte KYA experimental — principal de teste

Release pública de código: [arkhe-kya-poc-v0.1.1](docs/PUBLICATION.md), com
dependências locais resolvidas e clone público reproduzido. A v0.1.0 incompleta
foi substituída por nova tag, preservando o histórico.

Estado atual: [MATURITY](docs/MATURITY.md), [decisão sobre VERIFIED](docs/adr/ADR-006-verified-path.md)
e [apresentação com estado persistente](docs/adr/ADR-007-presentation-and-state.md).
O novo contêiner agrupa recibo e status; contexto e policy ficam separados.
[Migração e comandos](docs/MIGRATION.md).

Entrada atual: [workspace, política, CLI e limites de implementação](IMPLEMENTATION-REVIEW.md).
A crate `arkhe-kya-status` já existe e `cargo test -p arkhe-kya-status --locked`
funciona dentro deste diretório. A CLI `verify` e a policy usam verificações
recalculadas, não declarações do ficheiro recebido.

Implementado: `AgentIntegrityRecord`, mandato de teste, assinaturas Ed25519,
canonicalização JCS, vínculo entre ambos e inclusão MMR indexada. Verificação
nativa e export WASM `verify_agent_integrity_record`. Perfil próprio
`arkhe-kya-experimental@1`, exclusivamente `synthetic-poc`.

Evolução: [adaptador de ancoragem e quórum de witnesses](anchor/README.md),
composto com este WASM. Tem testes locais de formato Sigstore/C2SP; não foi
publicado no Rekor nem validado com witnesses independentes. A API WASM básica
continua a exigir root externa e a declarar `anchor_authenticity = NOT_VERIFIED`.

Evolução posterior: [PassportStatus local assinado](STATUS.md), com propósitos
separados de revogação/suspensão, vínculo ao passaporte e novo export WASM
`verify_agent_integrity_record_with_status`. Não altera a API básica nem
constitui integração VC W3C/KYA Brasil.

Não foi alterado `arkhe-verify-wasm` congelado: os seus fontes e binários fazem
parte do manifest E02. Esta crate é um workspace separado com Cargo.lock próprio
e reutiliza o MMR de `arkhe-verify-core` como dependência local de leitura.
O algoritmo MMR é reutilizado; isto **não é um novo recibo ou selo E02**.

## Afirmação que o resultado permite

As chaves indicadas assinaram o mandato e o registo; estes são compatíveis com
o principal, audiência, ação, desafio, tempo e root fornecidos pelo chamador.
O hash do modelo é uma **declaração assinada**, opcionalmente comparada com um
digest esperado pelo chamador. O verificador não recebe os pesos nem observa
um processo de inferência. Não prova que esse modelo estava em execução.

O mandato é um formato próprio de teste, **não uma VC W3C**, documento ICP-Brasil
ou demonstração de responsabilidade legal. `did:key` identifica material de
chave; não identifica por si só uma pessoa ou empresa. Integrações com KYA Brasil,
APIS, e-CPF/e-CNPJ e `did:web` não foram implementadas nem presumidas existentes
ou compatíveis a partir do texto recebido.

## Formato e assinatura

Os tipos Rust e `agent-integrity-record.schema.json` descrevem o envelope:

- `mandate`: perfil, label, principal Ed25519 `did:key`, agente Ed25519 `did:key`,
  audiência, ações explícitas, início e expiração (segundos Unix).
- `record`: mesmo perfil/label/agente/principal, `declared_model_blake3`,
  `mandate_digest`, audiência, desafio da contraparte e `issued_at`.
- Assinaturas Ed25519 separadas do principal e do agente, hex lowercase.
- `inclusion`: número de folhas, índice e passos do MMR. O envelope não fornece
  uma root que se autoautorize: a root e o número esperado vêm do contexto externo.

JCS é aplicado por `serde_jcs = 0.2.0`, não por um serializador JSON presumido
canónico. Os bytes assinados são prefixo ASCII, NUL e JCS do objeto:

| Objeto | Prefixo |
|---|---|
| Mandato | `ARKHE:KYA:MANDATE:v1\0` |
| Registo | `ARKHE:KYA:RECORD:v1\0` |
| Folha MMR do conjunto assinado | `ARKHE:KYA:LEAF:v1\0` |

`mandate_digest` é BLAKE3 dos bytes do mandato com domínio. A folha MMR inclui
mandato, registo e ambas as assinaturas, sem incluir a própria prova. Os dois
signers não são intercambiáveis. `did:key:z` aceita apenas multicodec Ed25519
`ed 01`, 32 bytes, base58btc e chave não fraca; a verificação usa `verify_strict`.

O parser tipado recusa campos desconhecidos e duplicados. Limites: envelope
32 KiB, contexto 4 KiB, 16 ações, 32 passos, 1 milhão de folhas; mandato de até
24 horas; registo com idade máxima de 300 s. Tempos são inteiros seguros para JS.
O schema JSON descreve a forma; a lógica Rust aplica também as relações,
assinaturas, política e limites em bytes. Schema não valida uma assinatura.

## Contexto de confiança

O chamador fornece separadamente `trusted_principal_did`, `audience`, `action`,
`challenge`, `now`, `expected_root`, `expected_leaf_count` e
`expected_model_blake3` (digest ou null). Copiar estes valores do recibo recebido
elimina os pins de confiança e não é um modo seguro de utilizar a API.

O resultado é `CRYPTOGRAPHIC_CHECKS_PASSED` ou `NOT_VERIFIABLE`. Mesmo no positivo:

- `runtime_model = NOT_ATTESTED`;
- `principal_legal_identity = NOT_VERIFIED`;
- `credential_revocation = NOT_CHECKED`;
- `anchor_authenticity = NOT_VERIFIED`;
- `replay_protection = CALLER_MUST_CONSUME_CHALLENGE`.

O verificador é sem estado. O chamador deve gerar desafio imprevisível, vincular
à sessão e consumi-lo uma vez, consultar revogação/estado apropriados e aplicar
a sua autorização. Verificar assinatura não concede autoridade. A fixture usa
um desafio fixo apenas para reprodução, não para implantação.

MMR demonstra inclusão contra a root fornecida, não publicação, data de
anterioridade ou autenticidade de blockchain. `issued_at` é assinado mas não
é carimbo do tempo independente. Não se fizeram transações ou publicações.

## Reproduzir

Na raiz do workspace, Rust 1.96.0 e Node compatível com o SDK Sigstore
(^22.22.2, ^24.15.0 ou >=26.0.0; release validada com 24.22.1):

```powershell
cargo test --manifest-path integration/arkhe-kya/Cargo.toml --locked --workspace
cargo clippy --manifest-path integration/arkhe-kya/Cargo.toml --locked --workspace --all-targets -- -D warnings
cargo fmt --manifest-path integration/arkhe-kya/Cargo.toml --all --check
cargo run --manifest-path integration/arkhe-kya/Cargo.toml --locked --example fixture
```

A fixture imprime passaporte/contexto de teste e casos de paridade. Usa seeds
Ed25519 determinísticas públicas **só de teste**, bytes sintéticos que não são um
GGUF real e root MMR local sem ancoragem externa. Não cria chaves operacionais.

WASM separado (CLI `wasm-bindgen 0.2.126` deve corresponder à dependência):

```powershell
rustup target add wasm32-unknown-unknown
node integration/arkhe-kya/scripts/build-wasm.mjs
node --test integration/arkhe-kya/wasm-parity.test.mjs
cargo audit --file integration/arkhe-kya/Cargo.lock
node specs/e02/verify_manifest.mjs
```

Validação executada em 2026-10-23: 9 testes Rust; 3 casos de paridade
nativo/WASM em Node; build WASM release; Clippy e rustfmt aprovados. Schema
2020-12 validado e aplicado ao passaporte da fixture com Python `jsonschema`
(ferramenta de validação local, não dependência do runtime). `cargo audit`:
69 dependências, zero vulnerabilidades e zero avisos na base de 1351 advisories,
commit `84d943a6deeb8cc6c6f632531aaf4f1c62275239`. Isto não é auditoria externa.
Manifest E02: os 101 ficheiros continuam iguais.

Pendentes: ligação a principal real e cadeia de confiança, política de revogação,
VC com mecanismo de segurança e interoperabilidade definidos, medição/atestado
de runtime, integração GGUF real, emissão operacional e ancoragem externa
autenticada. Não há CLI de emissão de credencial de produção nem dashboard KYA.

Referências de escopo: [W3C VC Data Model 2.0 — confiança](https://www.w3.org/TR/vc-data-model-2.0/#trust-model),
[did:key](https://w3c-ccg.github.io/did-key-spec/).
