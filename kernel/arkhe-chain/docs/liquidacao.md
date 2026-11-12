# Prova e âncora

`submit_proof_and_bridge_assets` lê o journal e compara com o cabeçalho selado. Em seguida chama `UndeployedVerifier`, que devolve `VerifierAbsent`. Um `Ok` de um verificador é mapeado para `ProofRejected`. O método não devolve sucesso e não devolve um hash de liquidação inventado.

O journal da fase 0 é `u64be || bytes32 || bytes32`: número do bloco, `claimed_root` e `parent_hash`. O arquivo `circuits/validity_slash.json` fixa o perfil `arkhe-validity-slash-v1`, fase 0, sistema `risc0-groth16`, seletor `73c457ba`, selo de 260 bytes e gás máximo 276000. `image_id` está nulo. Um valor preenchido, inclusive 32 bytes em hexadecimal, faz `load_circuit` devolver `CircuitConfig`. Não há image id de guest, chave de verificação nem ELF.

O layout conferido na forma da prova é seletor de 4 bytes, journal e selo de 260 bytes. Bloco 0, raiz zero ou selo todo zero é `ProofRejected`.

`contracts/Groth16Verifier.sol` não embute chave de verificação. `verifyProof` devolve falso. `contracts/ArkheValidityBridge.sol` reverte `VerifierAbsent` quando `zkVerifier` é o endereço zero. Não há pairing e não há envio para a Base Sepolia.

## Âncora

`btc_op_return` são os 5 bytes `ARKHE` seguidos dos 32 bytes de `state_root`. `check_btc_op_return` aceita só esses 37 bytes. Prefixo errado, raiz errada ou outro tamanho, inclusive um buffer de 77 bytes, é `InvalidAnchorPrefix`.

`AnchorPlan.broadcast` é falso. Este crate não publica uma transação Bitcoin.

## Citação de um bloco de execução

`cite_ethereum_execution` liga um bloco Arkhe já selado a um número e a um hash de bloco de execução que o chamador informa. O compromisso é BLAKE3 de `AKG:ETH:LINK:v1\0`, altura, hash do bloco Arkhe, `state_root`, número de execução e hash de execução. Número zero ou hash de execução todo zero é `EthereumHeader`. Altura ausente é `UnknownBlock`.

A citação fica no snapshot `AKGCHNS7`. A mesma citação pode ser repetida. Outro hash, outro número, ou um número que não avança com a altura é `EthereumConflict` e não substitui a citação guardada. Uma escrita que falha não deixa a citação na memória. `settled` fica falso. `confirm_ethereum_execution` pede o hash ao cliente de execução. `https` usa o depósito de certificados do sistema e não leva autenticação. Sem cliente, a resposta é `RpcAbsent`. Um hash diferente é `EthereumConflict` e a citação guardada fica. A confirmação não entra no arquivo: ao reabrir, `confirmed` volta a falso. `settleBlockWithProof` continua a reverter sem verificador. As duas cadeias não passam a ser uma.
