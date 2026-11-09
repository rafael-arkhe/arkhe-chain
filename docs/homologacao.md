# Registro do gate

Este arquivo registra o que o crate faz e o que ainda impede a homologação. O crate não está homologado.

Um dossiê anterior, no commit publicado `5b2d1750`, marcou o crate como homologado, contou 54 testes e assinalou uma reexecução por uma segunda pessoa. Essa contagem não é a suíte atual, e essa reexecução não está neste log. Essas marcas ficam retiradas.

## Gate

O comando na raiz deste checkout é `cargo test -p arkhe-chain`. O log de 9 de novembro de 2026 está em [gate-2026-11-09.log](gate-2026-11-09.log): código 0, 77 testes aprovados, 0 falhas, diretório `D:\arkhe-chain-pub`. O arquivo do log foi escrito depois dessa execução. Os fontes testados não incluem este parágrafo.

O commit `75b1ef73` foi a execução anterior na raiz, com 75 testes e 0 falhas, antes do part set na assinatura. As execuções foram nesta máquina. Não são a reexecução de outra pessoa.

## O que o código mantém

- A admissão é `ArkheNode::ingest`. Não há `ArkheChain` nem `ingest_transaction`.
- Todo envio exige Ed25519 e ML-DSA-65. O arquivo escrito é `AKGCHNS7`. `AKGCHNS6` abre e trata o precommit antigo como rodada 0. `AKGCHNS5` abre com as citações de execução vazias. `AKGCHNS1` a `AKGCHNS4` devolvem `Snapshot`.
- Um irmão de outro proposer fica `Fork` e não troca a ponta. O mesmo proposer na mesma altura é `Equivocation`. `bft_commit` conta só a rodada mais alta e passa só com mais de dois terços dos validadores no hash canônico. A assinatura `v3` exige um único part igual ao hash do bloco. Não há `CanonicalVote`. A ponta não se move.
- `submit_proof_and_bridge_assets` devolve `VerifierAbsent`. `verifyProof` devolve falso. A âncora aceita tem 37 bytes e `broadcast` fica falso.
- `cite_ethereum_execution` guarda o número e o hash informados pelo chamador. `confirm_ethereum_execution` confirma quando o cliente devolve o mesmo hash. Sem cliente, a resposta é `RpcAbsent`. `settled` fica falso. A confirmação não entra no arquivo.

## Pendências

| ID | O que falta |
| --- | --- |
| A3 | Outra pessoa executa `cargo test -p arkhe-chain` no workspace, no commit que publicar este registro. |
| A4 | Fechado de novo neste checkout: `vendor/` e 77 testes na raiz. `75b1ef73` foi a execução anterior de 75. Falta outra pessoa repetir o comando. |
| C1 | Um irmão continua `Fork`. O limiar de precommit não troca a ponta. |
| C2 | `CanonicalVote`. O part set local é um único part, o hash do bloco, na assinatura `v3`. O bloco não é dividido. A ponta não se move. |
| F1 | ELF do guest, image id de 32 bytes e chave de verificação. Um `image_id` preenchido continua sem carregar. |
| F2 | Uma transação Bitcoin paga que um nó aceite. |
| F3 | Um nó de execução Ethereum confirma o par número e hash. O cliente do teste é simulado. |
| KMS | `docs/seguranca_chaves.md` lista requisitos de custódia. Este crate não guarda chave em HSM, não tem roster k-de-n e não está imune a intervenção. |
