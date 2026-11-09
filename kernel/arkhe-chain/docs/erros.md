# Erros

Todo variante de `ChainError` é fail-closed. O texto estável começa por `FAIL_CLOSED:`.

| Variante | Quando aparece |
| --- | --- |
| `MempoolEmpty` | Selo sem transação na fila |
| `MempoolFull` | Fila em 1000 |
| `EmptyValidators` | Conjunto de validadores vazio |
| `NotProposer` | Identidade fora do conjunto |
| `BadProposerKey` | Chave do proposer ilegível |
| `BadProposerSignature` | Assinatura Ed25519 do bloco ou do precommit não confere |
| `BadAccount` | Identificador de conta recusado |
| `BadTimestamp` | Timestamp zero ou que não avança |
| `BadSignatureLength` | `signature_mldsa` com tamanho diferente de 3309 e não vazio |
| `UnverifiedSignature` | Campo ML-DSA vazio, assinatura inválida ou chave ausente |
| `Admission` | Veredito, payload ou subject recusado |
| `BadNonce` | Nonce que não é o próximo |
| `SelfTransfer` | Envio para a mesma conta |
| `InsufficientBalance` | Débito maior que o saldo |
| `Overflow` | Soma que não cabe em `u64` |
| `Mmr` | A fronteira não aceita a folha |
| `Malformed` | Bytes que não são o bloco canônico |
| `ParentMismatch` | Pai ou altura que não estende a ponta |
| `Fork` | Irmão válido que não substitui a ponta |
| `QuorumAbsent` | `bft_commit` sem poder de voto |
| `Equivocation` | Dois blocos do mesmo proposer na mesma altura |
| `StateMismatch` | Raiz ou contagem MMR diferente do cabeçalho |
| `UnknownBlock` | Altura ou hash que esta cadeia não tem |
| `LockPoisoned` | Trava envenenada |
| `AnchorAddress` | Endereço EVM que não tem `0x` e 40 hexadecimais |
| `CircuitConfig` | Pino do circuito diferente do arquivo embarcado, ou `image_id` preenchido |
| `ProofRejected` | Journal, seletor ou selo que não liga o bloco |
| `InvalidSelector` | Seletor diferente de `73c457ba` |
| `InvalidSealLength` | Selo diferente de 260 bytes |
| `InvalidAnchorPrefix` | Buffer diferente de `ARKHE` mais `state_root` |
| `VerifierAbsent` | Verificador Groth16 não implantado |
| `RpcAbsent` | Cliente de liquidação ausente |
| `RpcTimeout` | Liquidação sem resposta no prazo |
| `RpcUnavailable` | Liquidação indisponível |
| `EmergencyHalt` | Parada de emergência ligada |
| `HaltConfig` | Arquivo de parada ilegível |
| `P2p` | Peer, fork de sync, hash, limite ou tempo |
| `Snapshot` | Arquivo que não reproduz o estado |
