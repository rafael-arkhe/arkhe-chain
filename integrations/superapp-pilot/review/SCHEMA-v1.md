# Schema e codificação — Arkhe SuperApp Pilot v1

Este documento descreve o código entregue, sem alterar o contrato de aceitação.
É um formato de laboratório próprio, não AKG-CBOR nem um novo perfil MMR.

## Envelope JSON

`version` é 1. Bytes são arrays JSON de inteiros 0..255; hashes/chaves têm 32
bytes e assinaturas Ed25519 têm 64. O verificador Python rejeita chaves JSON
duplicadas, campos desconhecidos, booleanos no lugar de inteiros e entradas
maiores que 8 MiB. O JSON não é a mensagem assinada: ambos os implementadores
reconstroem a codificação binária abaixo, sem ordenar listas nem normalizar texto.

| Objeto | Campos obrigatórios |
|---|---|
| Pacote | `version`, `artifact`, `policy`, `policy_digest`, `evaluated_at`, `decision`, `consent`, `events`, `gate_pubkey`, `gate_signature` |
| Artifact | `manifest`, `bundle`, `checkpoint`, `leaf_index`, `proof` |
| Manifest | `publisher`, `bundle_digest`, `imports`, `permissions`, `signature` |
| Checkpoint | `root`, `count`, `epoch`, `signature` |
| ProofStep | `kind`, `direction`, `hash` |
| Policy | `max_age_seconds`, `fuel`, `memory_bytes`, `allowed_apis` |
| Event | `epoch`, `api`, `allowed`, `reason` |
| TrustRoot externo | `publisher_keys`, `checkpoint_keys`, `gate_keys`, `policy` |

`epoch` e `evaluated_at` são segundos Unix. `count` é o número de folhas, não
o número de nós MMR. `leaf_index` começa em zero. `decision` aceito pelo
verificador deste piloto é `Allow`. `allowed` é booleano. As listas de chaves
pertencem exclusivamente à entrada externa de confiança; não são aceitas como
campos de confiança dentro do pacote.

## Primitivas binárias

- `U32(x)` / `U64(x)`: inteiro sem sinal, big-endian, 4 / 8 bytes.
- `B(x)`: `U32(len(x)) || x`; comprimento em bytes, máximo de 1 MiB por campo.
- `S(s)`: `B(UTF8(s))`; sem separadores interpretáveis ou normalização Unicode.
- `L(v)`: `U32(count(v)) || S(v[0]) || ...`; máximo de 64 strings.
- `||`: concatenação; `H`: SHA-256. Nenhuma assinatura Ed25519 deste piloto
  usa pré-hash implícito: assina diretamente a mensagem especificada abaixo.

## Manifesto

```
M = ASCII("ARKHE:PILOT:MANIFEST:1") || 00
    || B(publisher) || B(bundle_digest) || L(imports) || L(permissions)
manifest.signature = Ed25519(publisher_key, M)
bundle_digest = H(bundle)
```

`["camera,contacts"]` difere de `["camera", "contacts"]`. Lista, ordem e
duplicatas são preservadas na mensagem: alterações mudam a mensagem assinada.
Não há campo `manifest_bytes`: `M` é derivado dos campos estruturados, e a
implementação Python o reconstitui sem chamar código Rust. Isso é diferente
de assinar a serialização JSON.

## Checkpoint e MMR

```
C = ASCII("ARKHE:PILOT:CHECKPOINT:1") || 00
    || root[32] || U64(count) || U64(epoch)
checkpoint.signature = Ed25519(checkpoint_key, C)
```

Folha: **M**, não SHA-256(M), nem o bundle. O perfil congelado `arkhe-mmr` v1
usa BLAKE3: folha `BLAKE3(00 || M)`, nó `BLAKE3(01 || left || right)`,
bag `BLAKE3(02 || U64(2*count-popcount(count)) || left || right)`.
Picos são as potências de dois da decomposição de `count`, em ordem decrescente;
o bagging é da direita para a esquerda. A prova identifica tipo `node`/`bag`
e direção `left`/`right` de cada irmão. Índice, número de folhas e formato
esperado da prova são conferidos. Limites: 1..1.000.000 folhas e até 64 passos.

O Rust reutiliza `verification/crates/arkhe-verify-core/src/mmr/`; o Python
reimplementa a verificação. O gerador produz todas as posições para contagens
1, 2, 3, 5, 7 e 8: 26 pacotes em `demo/mmr-packages.json`.

## Política e envelope do gate

```
P = ASCII("ARKHE:PILOT:POLICY:1") || 00
    || U64(max_age_seconds) || U64(fuel) || U64(memory_bytes) || L(allowed_apis)
policy_digest = H(P)

E = ASCII("ARKHE:PILOT:PACKAGE:1") || 00 || U32(version)
    || B(M) || B(manifest.signature) || B(bundle)
    || B(C) || B(checkpoint.signature) || U64(leaf_index)
    || U32(proof_count)
    || [S(kind) || S(direction) || B(hash) para cada passo]
    || B(H(P)) || B(policy_digest)
    || U64(evaluated_at) || S(decision) || L(consent)
    || U32(event_count)
    || [U64(epoch) || S(api) || flag[1] || S(reason) para cada evento]
    || B(gate_pubkey)
gate_signature = Ed25519(gate_key, E)
```

`flag` é 00/01. Máximo de 1.024 eventos. A assinatura externa não integra sua
própria mensagem. Campos opcionais/extensões não estão definidos nesta versão.
O verificador exige que o digest de política coincida com o calculado da política
do pacote **e** da política pinada externamente. Eventos permitidos precisam
respeitar manifesto, consentimento e política, além da janela de admissão.

## Frescor e confiança

Verificação atual exige `checkpoint.epoch <= evaluated_at <= now <= expiry`,
com `expiry = checkpoint.epoch + max_age_seconds`. Auditoria histórica exige
`--historical-at SEGUNDOS_UNIX` explicitamente; não confere validade atual.
O arquivo de confiança DEMO é uma fixture pública. Não demonstra cerimônia
independente de confiança nem identidade real de publisher, gate ou signatário.

O envelope autentica declarações do gate; não prova execução fiel, completude
dos eventos, resistência ao administrador do host ou quorum de witnesses.
