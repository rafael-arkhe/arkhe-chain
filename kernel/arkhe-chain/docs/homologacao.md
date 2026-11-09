# Registro do gate

Este arquivo registra o que o crate faz e o que ainda impede a homologação. O crate não está homologado.

Um dossiê anterior, no commit publicado `5b2d1750`, marcou o crate como homologado, contou 54 testes e assinalou uma reexecução por uma segunda pessoa. Essa contagem não é a suíte atual, e essa reexecução não está neste log. Essas marcas ficam retiradas.

## Gate

O comando no monorepo é `cargo test -p arkhe-chain`. O log de 9 de novembro de 2026 está em [gate-2026-11-09.log](gate-2026-11-09.log): código 0, 79 testes aprovados, 0 falhas, diretório `D:\arkhe`. O arquivo do log foi escrito depois dessa execução.

O commit publicado `105101c0` tem a execução anterior na raiz, com 77 testes e 0 falhas, antes do identificador `arkhe-chain` na assinatura. O log desse commit nomeia `D:\arkhe-chain-pub`. Esta execução local ainda não está nesse commit.

No mesmo dia, o usuário `arkhen` (uid 1000) do Ubuntu em WSL2, no host `DESKTOP-G1BRFD4`, rodou `cargo test -p arkhe-chain --no-fail-fast` em `/home/arkhen/arkhe-chain-rerun`. A árvore era a de trabalho, com o identificador `arkhe-chain` e `HttpExecutionRpc`, sobre o `vendor/` publicado. Não era o commit `105101c0`. O log está em [gate-wsl-arkhen-2026-11-09.log](gate-wsl-arkhen-2026-11-09.log): código 101, 78 aprovados, 1 falha, 1 ignorado. A falha é `sync_keeps_the_cursor_past_1024_headers`, com `P2p("timeout")`: o prazo de 30 segundos não importou 1.025 blocos nessa execução em debug. Uma tentativa anterior, enquanto as imagens Docker baixavam, falhou no mesmo teste e parou nesse binário. A conta `arkhen` está nesta mesma máquina. Não é outra pessoa.

Uma máquina virtual não fecha reorg, `CanonicalVote`, o guest Groth16 nem custódia em HSM.

## O que o código mantém

- A admissão é `ArkheNode::ingest`. Não há `ArkheChain` nem `ingest_transaction`.
- Todo envio exige Ed25519 e ML-DSA-65. O arquivo escrito é `AKGCHNS7`. `AKGCHNS6` abre e trata o precommit antigo como rodada 0. `AKGCHNS5` abre com as citações de execução vazias. `AKGCHNS1` a `AKGCHNS4` devolvem `Snapshot`.
- Um irmão de outro proposer fica `Fork` e não troca a ponta. O mesmo proposer na mesma altura é `Equivocation`. `bft_commit` conta só a rodada mais alta e passa só com mais de dois terços dos validadores no hash canônico. A assinatura `v4` exige um único part igual ao hash do bloco e o identificador `arkhe-chain`. Não há `CanonicalVote`. A ponta não se move.
- `submit_proof_and_bridge_assets` devolve `VerifierAbsent`. `verifyProof` devolve falso. A âncora aceita tem 37 bytes e `broadcast` fica falso.
- `cite_ethereum_execution` guarda o número e o hash informados pelo chamador. `confirm_ethereum_execution` confirma quando o cliente devolve o mesmo hash. Sem cliente, a resposta é `RpcAbsent`. `HttpExecutionRpc` abre um HTTP simples, sem TLS. `AbsentExecutionRpc` não abre socket. `settled` fica falso. A confirmação não entra no arquivo.
- Um nó regtest local aceitou um OP_RETURN de 37 bytes com o prefixo `ARKHE` e 32 bytes zero. O crate não enviou essa transação. Não é mainnet.

## Pendências

| ID | O que falta |
| --- | --- |
| A3 | Outra pessoa executa `cargo test -p arkhe-chain` no workspace, no commit que publicar este registro. A conta `arkhen` reexecutou a árvore de trabalho nesta máquina e o sync de 1.025 blocos estourou o prazo. |
| A4 | Fechado de novo em `105101c0`: `vendor/` e 77 testes na raiz. `75b1ef73` foi a execução anterior de 75. A reexecução em WSL não foi desse commit. Falta outra pessoa repetir o comando na raiz publicada. |
| C1 | Um irmão continua `Fork`. O limiar de precommit não troca a ponta. |
| C2 | `CanonicalVote`. A assinatura `v4` liga um único part e o identificador `arkhe-chain`. O bloco não é dividido. A ponta não se move. |
| F1 | ELF do guest, image id de 32 bytes e chave de verificação. Um `image_id` preenchido continua sem carregar. |
| F2 | Uma transação Bitcoin paga na rede que o crate declare. O regtest local aceitou `925b5f276408c0b8442e1a247e48228843dd144416d4561edab3a29950578a0f`, um OP_RETURN de 37 bytes (`ARKHE` e 32 bytes zero), com 1 confirmação no bloco 102. `broadcast` continua falso. |
| F3 | Um nó de execução que não seja a cadeia de desenvolvimento local. `geth` v1.17.10 em `--dev`, na mesma WSL, respondeu o bloco 1 `c6f3353e6a18a0d8a849530218478f38a0cdcb5357fa8a4accf56ff88d75bcec`. O teste ignorado `a_live_execution_client_confirms_without_settling` passou para o usuário `arkhen`: a cópia devolvida ficou confirmada e `settled` ficou falso. A confirmação não entrou no arquivo. O teste ignorado não entra nos 79. |
| KMS | `docs/seguranca_chaves.md` lista requisitos de custódia. Este crate não guarda chave em HSM, não tem roster k-de-n e não está imune a intervenção. |
