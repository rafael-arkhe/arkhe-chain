# Admissão

`ArkheNode::ingest` recebe uma `Transaction`. Não existe uma segunda função que receba a transação e o veredito separados.

O payload é o CBOR canônico de `arkhe_core::decision::DecisionVerdict`, domínio `AKG:VERDICT:v1`. O mapa tem as chaves `version`, `subject`, `event_type`, `policy_id`, `policy_digest`, `rule_id`, `decision` (`ALLOW` ou `REJECT`) e `reason` (`RULE_ALLOWED`, `RULE_REJECTED`, `NO_RULE_MATCHED`, `POLICY_UNAVAILABLE` ou `EMERGENCY_STOP`). Só `RULE_ALLOWED` produz `Allow`. O `subject` do veredito tem de ser igual a `Transaction::subject`.

`subject` inclui `signature_mldsa` e exclui o payload e `sender_signature`.

## Assinaturas

Cada envio carrega os dois campos:

| Campo | Tamanho | Domínio | Mensagem |
| --- | --- | --- | --- |
| `signature_mldsa` | 3309 bytes, ML-DSA-65 (`fips204`, feature `ml-dsa-65`) | `AKG:CHAIN:MLDSA65:v1` | nonce, sender, recipient e value |
| `sender_signature` | 64 bytes, Ed25519 | `AKG:CHAIN:SENDER:v1` | subject da transação |

A chave pública ML-DSA-65 tem 1952 bytes. Um campo `signature_mldsa` vazio devolve `UnverifiedSignature`. Qualquer outro tamanho que não seja 3309 devolve `BadSignatureLength`. Assinatura inválida ou chave ausente devolve `UnverifiedSignature` antes de mover saldo.

A ordem de `apply_tx` é forma, chave Ed25519, verificação Ed25519, chave ML-DSA, verificação ML-DSA, veredito, nonce, transferência e MMR.

## Nonce, valor e fila

O nonce tem de ser o próximo da conta. Outro valor é `BadNonce`. Um veredito que não é allow não consome nonce, mas a transação ainda precisa das assinaturas válidas para chegar a `Admission("not-allow")`.

Valor zero não altera saldos e ainda acrescenta a folha ao MMR. Transferência para a mesma conta é `SelfTransfer`. Saldo insuficiente é `InsufficientBalance` e a transação não entra na mempool.

A mempool cabe 1000 transações. O payload cabe 4096 bytes. Um bloco sela no máximo 250 transações. `propose_and_seal_block` só estende a ponta deste nó em um. O timestamp tem de ser maior que zero e maior que o do pai.

`emergency.halt=true` em `arkhe-chain.properties` impede ingest, selo e importação. Um texto que não seja exatamente `true` ou `false` é `HaltConfig` e o nó permanece parado.
