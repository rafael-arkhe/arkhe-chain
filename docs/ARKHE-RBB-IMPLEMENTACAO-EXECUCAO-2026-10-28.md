# Arkhe-RBB — implementação e execução local

Data: 28/10/2026. Estado: núcleo e anchor experimental implementados; integração operacional completa pendente.

## Resultado observado

O runner [run-tests.ps1](../integration/arkhe-rbb/run-tests.ps1) terminou com sucesso e preservou os logs em [results.json](../output/arkhe-rbb-execution/results.json).

| Verificação executada | Resultado |
|---|---|
| Regressão completa de `arkhe-verify-core` com `rbb-pqc` | 82 testes aprovados, nenhum falhou |
| Testes novos de protocolo/MMR incluídos na regressão | 7 aprovados, incluindo property test de decoder |
| Testes novos de confiança e assinatura híbrida incluídos na regressão | 8 aprovados com Ed25519 e ML-DSA-44 reais |
| Solidity compilado e executado em EVM local | 9 testes aprovados, nenhum ignorado |
| Oráculo Python independente | ABI/Keccak e 8 raízes MMR conferidas contra vetores versionados |
| Clippy, lib/testes/exemplos, com `-D warnings` | Aprovado |
| `cargo check` do núcleo com `rbb-pqc` em `wasm32-unknown-unknown` | Aprovado; não é execução no navegador |

Os 15 testes novos Rust são parte dos 82, não contagem adicional. A suíte local EVM inclui comparação Python/ethers/Solidity e um checkpoint assinado de verdade no exemplo Rust cujo ID/commitment é recalculado pelo contrato e emitido no registro. As sementes do exemplo são públicas e exclusivas de teste. A biblioteca criptográfica utilizada no teste não foi certificada por esta execução; não foram executados vetores oficiais de certificação do NIST.

## Código entregue

| Componente | Local | Comportamento implementado |
|---|---|---|
| Codec do protocolo | `verification/crates/arkhe-verify-core/src/rbb/header.rs` | Header/envelope canônicos, digest, validação estrutural e limites |
| MMR v3 separado | `verification/crates/arkhe-verify-core/src/rbb/mmr.rs` | Append, inclusão geométrica, extensão e perfil distinto |
| Confiança offline | `verification/crates/arkhe-verify-core/src/rbb/trust.rs` | Assinatura híbrida AND, snapshot atestado, quórum 3/4, tempo e frescura |
| Anchor experimental | `integration/arkhe-rbb/contracts/ArkheCheckpointAnchor.sol` | Identidade de rede, stream/keyset, sequência, predecessor, idempotência e pausa |
| Oráculo | `integration/arkhe-rbb/python/reference_vectors.py` | Encoding independente por eth-abi, hashes Keccak e MMR |
| Execução EVM | `integration/arkhe-rbb/tests/evm.test.mjs` | Deploy local, admissão/rejeição, eventos e comparação entre linguagens |
| Assinatura de teste | `verification/crates/arkhe-verify-core/examples/rbb_sign_fixture.rs` | Checkpoint realmente assinado e verificado em Rust, consumido pela suíte EVM |

O módulo antigo de MMR não foi alterado. O recurso `rbb-pqc` é opt-in: consumidores existentes não passam a depender implicitamente da verificação PQ.

## Casos adversariais executados

- Pacote com chaves do próprio atacante e votos autodeclarados não substitui o trust context externo.
- Dois votos, votos repetidos, testemunha desconhecida ou chaves duplicadas não formam o quórum.
- Snapshot, época, órgão ou transcript adulterados são rejeitados.
- A assinatura exige as duas famílias e o contexto correto; assinatura corrompida não é aceita.
- Evidência posterior à revogação ou anterior ao cadastro autenticado não ganha validade retroativa pela data declarada.
- Falta de relógio ou expiração não produz alegação de frescura atual.
- Prova MMR com contador, irmãos, picos, posição ou conteúdo incorretos é rejeitada.
- ABI com padding/offsets, tamanho ou trailing data incorretos é rejeitada pelo decoder Rust.
- Conta sem autorização, rede/endereço/keyset/perfil divergentes, timestamp zero, overflow, sequência/predecessor incorretos e manifesto Fabric ausente são rejeitados pelo contrato.
- Retry exato não duplica evento; conteúdo divergente na sequência existente falha. Suspensão bloqueia escrita nova sem apagar registro histórico.

## Comandos reproduzíveis

Instalação das dependências e ambiente isolado estão no [README de execução](../integration/arkhe-rbb/README.md). Com dependências disponíveis:

```powershell
pwsh -NoProfile -File integration/arkhe-rbb/run-tests.ps1
cargo clippy -p arkhe-verify-core --features rbb-pqc --lib --tests --examples --locked -- -D warnings
cargo check -p arkhe-verify-core --features rbb-pqc --target wasm32-unknown-unknown --locked
```

O runner usa vetores existentes e falha em divergência; não os regenera. Contrato compilado com solc 0.8.30, otimização 200, via IR e alvo Shanghai; Ganache é local com chain ID 1337. Isso não confirma a configuração de uma rede RBB real.

## Limites que permanecem abertos

1. O registro usado na execução é `RegistryFixture.sol`, com setters públicos e rotulagem de teste. Cadastro institucional, prova de posse, rotação/revogação governada e autorizações EIP-712 ainda exigem implementação completa.
2. O anchor tem administração única no protótipo e verifica autorização da conta/estrutura, não assinaturas PQ dentro da EVM. Ele registra `RECORDED`; a evidência só pode receber aceitação adicional pelas verificações externas previstas.
3. O verificador offline autentica um checkpoint sob testemunhas fornecidas pelo host. Não executa testemunhas operacionais, não deriva sua própria raiz confiável de um bundle, nem implementa consenso QBFT. Não há infraestrutura real de quórum criada nesta entrega.
4. Persistência PostgreSQL/outbox, locks, crash recovery e reconciliação de fonte não foram implementados nem ensaiados aqui. Os testes de MMR em memória não demonstram durabilidade.
5. Não foram conectados SAPL, canal Fabric, HSM ou nó RBB de homologação; não houve deploy externo ou teste no navegador.
6. Os schemas setoriais completos e a operação do gate regimental continuam pendentes. O relatório de checkpoint não certifica legalidade nem automaticamente inclusão de um WER.

O resultado é uma implementação executável das partes de protocolo, verificação e ancoragem local, com evidência de execução. Não fecha todos os achados da revisão nem demonstra prontidão de produção.
