# PassportStatus local — snapshot assinado

Após a consolidação do workspace, o núcleo está em
`crates/arkhe-kya-status/src/lib.rs`; `src/status.rs` é um reexport. O comando
`cargo test -p arkhe-kya-status --locked` executa os cinco gates independentes.
Criptografia/JCS compartilhadas ficam em `arkhe-kya-primitives`. Os relatos
abaixo sobre o caminho anterior preservam o histórico da implementação.

Os quatro gates pedidos de bit 0/bit 1/indisponibilidade/staleness foram
[reproduzidos com saídas e hashes registados](../../docs/evidence/2026-10-23-kya-status-gates/README.md).
O estado dos restantes pilares está em [PILLAR-GATES.md](PILLAR-GATES.md).

Implementado em `src/status.rs`: perfil `arkhe-kya-status-local@1`, somente
`synthetic-poc`. O codec segue a **Bitstring Status List v1.0 Recommendation**:
GZIP, multibase `u` + base64url sem padding, mínimo de 16 KiB descomprimidos,
índice zero no bit mais significativo do primeiro byte. A v1.1 draft não foi
adotada. O envelope é próprio do experimento, **não uma VC W3C interoperável**.
Não há JSON-LD/Data Integrity, fetch HTTP, cache, certificados, CRL ou consultas
cadastrais. Nenhum serviço KYA Brasil foi integrado.

## Separação posterior do núcleo

`status.rs` agora expõe `check_status(&StatusEnvelope, &StatusTrust)` sem
referências aos tipos `Passport`, `Context`, mandato, modelo ou prova MMR.
O digest esperado é uma entrada independente. O nome de wire
`passport_digest` fica preservado; o núcleo não interpreta o seu artefacto.
Não foi criado nem ligado um schema `AgentPassport` agregado.

O adaptador já existente que verifica o recibo KYA e depois o status passou
para `status_composition.rs`, separado do núcleo. O nome do export WASM foi
preservado; consumidores Rust desse adaptador usam agora
`status_composition::verify_with_status` e `status_composition::passport_digest`.
Esta compatibilidade não decide contêiner versus dois artefactos de produto.

`StatusTrust` fixa issuer, digest, propósito, relógio, piso de sequência e
`max_snapshot_age_seconds` (1–3600). A idade é calculada desde o **valid_from
assinado**, não é apresentada como instante de observação de cadastro ou da
última alteração do bit. O núcleo devolve `snapshot_valid_from`,
`snapshot_valid_until` e `evaluated_at` separados. Pode rejeitar `STATUS_STALE`
mesmo antes da expiração. O adaptador de compatibilidade usa teto de 3600 s;
políticas mais estritas usam diretamente o núcleo.

Cinco testes isolados adicionais, sem fixture de passaporte, cobrem bit 0,
bit 1, indisponibilidade, idade máxima/limiar e pins de digest/propósito.
Nessa etapa foram **23 testes Rust**; a evidência de 18 abaixo descreve a etapa
anterior. Totais e layout atuais estão em [MATURITY](docs/MATURITY.md).
A decisão de integração de principal está no
[ADR-010](../../docs/adr/ADR-010-kya-brasil-consume-or-mirror.md).

## Vínculo e confiança

`PassportStatus` inclui `profile`, `label`, `issuer`, `passport_digest`,
`status_list_credential`, `status_list_index`, `status_purpose`. O principal
assina essa associação. O digest é BLAKE3 da folha KYA completa já assinada,
incluindo domínio, mandato, registo e assinaturas, mas não o caminho MMR.
Trocar passaporte, índice, lista ou propósito sem reassinatura é rejeitado.
É um sidecar: não modifica nem entra retroativamente na root do passaporte.

A lista tem `profile`, `label`, `id`, `issuer`, `status_purpose`, `sequence`,
`valid_from`, `valid_until`, `encoded_list`, mais assinatura separada. O issuer
deve ser o principal fixado pelo consumidor e corresponder ao da associação.
IDs e propósitos devem coincidir. O identificador é uma string opaca estável,
não uma instrução para obter conteúdo da rede.

Assinaturas Ed25519 sobre domínio ASCII + NUL + JCS: associação usa
`ARKHE:KYA:STATUS-BINDING:v1`; lista usa `ARKHE:KYA:STATUS-LIST:v1`.
Os bytes comprimidos e tempos são assinados. A autenticação ocorre antes de
descomprimir. Campos desconhecidos ou duplicados são rejeitados.

## API e política externa

```javascript
const report = JSON.parse(wasm.verify_agent_integrity_record_with_status(
  passportJson, contextJson, statusEnvelopeJson, minimumSequence, 'revocation'
));
```

`minimumSequence` é u32 de política/estado externo, nunca aprendido do bundle
que se verifica. Conservar o maior valor aceito por issuer/lista/propósito em
armazenamento confiável. O piso recusa rollback conhecido, mas não prova que
um snapshot é o último disponível. Um antigo pode passar dentro da validade
se o piso não for atualizado. Não há garantia de tempo real ou não-equivocação.
O contexto fornece `now`; não há relógio ambiente oculto.

O propósito requerido é externo: `revocation` ou `suspension`. Uma lista de
suspensão limpa não satisfaz uma consulta de revogação. Se a política exigir
ambos, executar as duas verificações e aceitar apenas se ambas passarem.

| Situação | Resultado |
|---|---|
| Bit 0 de revogação válido | `CRYPTOGRAPHIC_CHECKS_PASSED`, `credential_revocation = CHECKED_NOT_REVOKED` |
| Bit 1 de revogação | `NOT_VERIFIABLE`, `CredentialRevoked`, eixo `REVOKED` |
| Lista ausente (`status_list: null`) | `NOT_VERIFIABLE`, `STATUS_UNAVAILABLE`, eixo `NOT_CHECKED` |
| Bit 0 de suspensão válido | `credential_suspension = CHECKED_NOT_SUSPENDED`; revogação continua `NOT_CHECKED` |
| Bit 1 de suspensão | `NOT_VERIFIABLE`, `CredentialSuspended`, eixo `SUSPENDED` |
| Lista inválida, expirada ou assinatura inválida | `NOT_VERIFIABLE` com razão; estado não confirmado |

Bit 0 não prova identidade legal, runtime, autorização ou validade jurídica.
Os demais eixos e avisos são preservados. Nunca reduzir o resultado a um selo
genérico “verificado”. A API básica e o adaptador de ancoragem não consultam
este sidecar automaticamente: selecionar a nova API explicitamente quando
o estado for requisito. As duas composições ainda não têm um endpoint unificado.

## Limites

- Entrada status: 100.000 bytes; comprimido: 64 KiB; saída GZIP: 1 MiB.
- Mínimo descomprimido: 16 KiB; índice dentro dos bits disponíveis.
- Um membro GZIP, sem trailing data; CRC/truncamento inválidos falham.
- Base64url canónica, sem padding, multibase `u` obrigatório.
- Validade de até uma hora, rejeição de lista futura, expiração em
  `now == valid_until`. É política local, não uma regra imposta pela W3C.
- Tempos seguros para JavaScript; sequência u32 e propósito tipado.

Novas dependências diretas: `base64 = 0.22.1`, `flate2 = 1.1.10`, esta última
com backend Rust compatível com WASM. Seis pacotes adicionais no lockfile local.

## Evidência executada em 2026-10-23

18 testes Rust (9 anteriores + 9 de status), 6 casos de paridade nativo/WASM
(3 anteriores + 3 de status), build WASM release, Clippy e formatação aprovados.
Os 13 testes de ancoragem continuam a passar sem sockets. Os casos cobrem 0/1,
indisponibilidade, MSB e fronteiras de bytes, suspensão, assinatura/vínculo,
tempos, piso de sequência, índice fora da lista, encoding inválido, descompressão
excessiva, GZIP com trailing data e campos duplicados.

Reprodução: os comandos Rust/WASM no README principal, incluindo a regeneração
do `pkg` com wasm-bindgen, executam também estes novos testes e casos de paridade.

Audit do lockfile Rust: 75 dependências, zero vulnerabilidades e avisos, base
de 1351 advisories, commit `84d943a6deeb8cc6c6f632531aaf4f1c62275239`.
Não é auditoria externa nem das dependências Node Sigstore.
Os 101 ficheiros do manifest E02 continuam iguais.

## Maturidade: referência externa, implementação, evidência

| Tema | Referência externa | Arkhe executado / limite |
|---|---|---|
| Bitstring | W3C Recommendation v1.0 | Codec e snapshot assinado local; sem VC interoperável |
| ICP-Brasil/KYA Brasil | Alegações do anexo não verificadas nesta etapa | Sem dependência, API, certificados ou dados pessoais integrados |
| SafeTensors/ONNX | Formatos propostos | Não implementados ou avaliados nesta etapa |
| TEE/EAT | Proposta de evidência de runtime | Nenhuma quote/plataforma real validada |
| Consumidores de pagamentos | Anúncios citados não validados nesta etapa | Nenhum consumidor Arkhe integrado ou cliente pagante demonstrado |

Um anúncio externo não demonstra demanda pelo Arkhe. Os próximos gates exigem
evidência real de integração, interoperabilidade e operação.

Fonte do codec: [W3C Bitstring Status List v1.0](https://www.w3.org/TR/2025/REC-vc-bitstring-status-list-20250515/).
