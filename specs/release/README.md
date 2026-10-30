# ReleaseManifest v1 — `AKG:RELEASE:v1`

**Status:** candidato (D0 da [arquitetura completa](../../docs/ARKHE-ARQUITETURA-COMPLETA.md)).
Não altera o registry B.0.2 de `specs/akg/registry`, que continua freeze-candidate.
O domínio está em [domain-registry.json](domain-registry.json).

## Objeto

Núcleo não assinado que liga os identificadores de uma release. Assinaturas
k-de-n do keyset de release são um envelope separado sobre `object_digest`
(ainda não especificado).

```text
object_digest = BLAKE3-256("AKG:RELEASE:v1\0" || CanonicalBytes(ReleaseManifest))
```

| Campo | Tipo CBOR | Regra |
|---|---|---|
| `version` | uint | `1` |
| `release_id` | text | 1–128 bytes `[A-Za-z0-9._@+-/]` |
| `prev_release_digest` | bytes(32) \| null | `null` só na primeira release |
| `git.commit_oid`, `git.tag` | text, text \| null | oid hex minúsculo de 40 ou 64 |
| `radicle` | map \| null | `rid` = `rad:z` + base58btc; `canonical_refs_digest` bytes(32) |
| `hashtree` | map \| null | `root_hash` (SHA-256 do bloco raiz), `decrypt_key` bytes(32) \| null |
| `artifacts` | array(1..4096) | `path`, `size`, `blake3`, `sha256`; ordem estritamente crescente por bytes de `path` |
| `sdd` | map \| null | `gate_decision_digest`, `constitution_digest` |
| `build` | map \| null | `system`, `flake_lock_digest` |
| `policy_digest` | bytes(32) | |

Codificação: AKG-CBOR-v1 com tipos explícitos (`Cbor` em
`kernel/arkhe-core/src/canonical.rs`). Todas as chaves estão sempre presentes;
`null` não é ausência. Caminhos são relativos, separados por `/`, sem segmentos
vazios, `.` ou `..`, sem `\` nem NUL.

`ReleaseManifest::from_canonical_bytes` só aceita a forma canônica:
rejeita chaves fora de ordem ou duplicadas, inteiros não mínimos, comprimentos
indefinidos, tags, floats, negativos, bytes finais, chaves ausentes ou
desconhecidas. `verify_bytes` exige também o digest esperado, obtido de uma
fonte independente (checkpoint, envelope assinado).

## O que não faz

Não autoriza, não assina e não prova disponibilidade. `hashtree.root_hash` e
`artifacts[*].blake3` são verificados cada um no seu protocolo
(`integration/arkhe-p2p::hashtree`); nunca se comparam entre si.

## Reproduzir

```powershell
python scripts/generate_release_manifest_vectors.py --check
cargo test --offline --locked -p arkhe-core --test release_manifest
```

23 vetores: 2 ACCEPT (E02 retroativo e todos os campos), 14 REJECT de esquema
e 7 REJECT de bytes, entre eles uma alteração de 1 byte com digest esperado. O teste
Rust também altera cada byte do manifesto E02 com duas máscaras e exige rejeição.

O vetor E02 usa digests calculados do commit Git `18ec972d…`, não do Hashtree.
O `policy_digest` desse vetor é sintético (BLAKE3 de um rótulo), porque a E02
antecede a política de release.
