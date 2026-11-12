# Atestados

`AttestRegistry` (`src/attest.rs`) registra declarações assinadas e consome aprovações de uso único. O nó o mantém no estado e os atestados viajam nos blocos. O fluxo coberto é pedido, proposta de artefato, avaliação, aprovação, execução assinada e recibo.

As regras de autorização, com o teste de cada uma, estão resumidas em [regras.md](regras.md).

## O que ainda não existe

- Inclusão em bloco não é finalidade. Uma prova de inclusão vale contra a raiz do registro na ponta do nó. A finalidade continua sendo a de `finality` e `committed_height`, com os limites descritos em [consenso.md](consenso.md).
- A raiz do registro não entra na ancoragem nem no journal de prova.
- Os atestados em espera ficam só na memória do nó que os recebeu. Eles não são gravados no arquivo e não são enviados a outros nós. Só chegam aos pares dentro de um bloco. Um selador reiniciado perde os que esperavam.
- O registro confere a soma dos custos contra o orçamento. Ele não mede o que a ação gastou: o custo é o que o aprovador assinou.
- O efeito da execução acontece fora da cadeia. O recibo diz que a execução foi autorizada e consumida, não que a ação foi aplicada corretamente.
- `--show-genesis` não imprime a contagem de concessões. O hash que ele imprime as cobre.
- O registro aceita 4096 folhas na vida da cadeia, somando atestados e recibos. Depois disso devolve `Attest("full")`.
- Não há API nem página de explorador. `--status` não mostra o registro.
- O único esquema aceito é Ed25519 (`ATTEST_SCHEME_ED25519`). EIP-712 e ERC-1271 não estão implementados. Ed25519 não é pós-quântico.

## No nó

O registro faz parte de `ChainState`. O domínio é `CHAIN_ID`, o hash de gênese do nó e a audiência `arkhe-chain/attest`. As chaves da política são as chaves Ed25519 das contas. As concessões entram por `ArkheNode::new_with_grants` e `open_with_grants` e fazem parte do hash de gênese, uma linha `grant <conta> <papel> <concedente> <altura>` por concessão. Sem concessões, o hash de gênese é o mesmo de antes. Um nó aberto sem concessões admite atestados e não executa nenhuma aprovação.

No arquivo de gênese do operador a linha é a mesma: `grant <conta> <papel> <concedente> <altura>`. O papel é `requester`, `author`, `evaluator`, `approver` ou `executor`, em minúsculas. A altura é a última em que a concessão vale, só com os dígitos que um `u64` imprime; `0500` e `+5` são `Malformed`. `parse_genesis` confere essas linhas e `parse_genesis_grants` as devolve. O hash cobre validadores, depois contas, depois concessões, cada grupo na ordem do arquivo. Uma concessão que cita conta ausente do gênese devolve `BadAccount` na abertura e não cria o arquivo. Um arquivo criado com certas concessões só abre com as mesmas; outras devolvem `Genesis`.

Um bloco carrega, depois das transações, uma lista de até 64 atestados. Um bloco sem atestados tem os mesmos bytes que tinha antes. Um bloco pode ter atestados e nenhuma transação; sem as duas coisas é `Malformed`. A assinatura do proposer cobre os atestados.

Os atestados são aplicados depois das transações, na altura do bloco. Na importação, qualquer atestado recusado recusa o bloco. `state_root` cobre a raiz e a contagem do registro a partir da primeira folha, sob `AKG:CHAIN:STATE:v2`. Enquanto o MMR de transações está vazio, a v2 escreve 32 bytes zero no lugar da raiz dele.

`submit_attestation` testa o atestado contra o estado da próxima altura, depois dos que já esperam, e o põe numa fila de 256. `propose_and_seal_block` tira até 64 da fila. Um atestado que falha na montagem fica fora do bloco e aparece em `rejected`. Depois de cada bloco, a fila guarda só o que ainda se aplica.

O arquivo do nó não guarda o registro à parte. `open_with_grants` reexecuta os blocos e cada cabeçalho confere a raiz. Abrir com outras concessões devolve `Genesis`.

`attest_status`, `attest_receipt`, `attest_root`, `attest_count`, `attest_policy_digest` e `attest_inclusion_proof` leem o registro na ponta.

## No operador

O processo que sela aceita, no diretório de `--inbox`, arquivos `*.ops` além de `*.txs`. Um `*.ops` é uma lista de `encode_attestation_list`: cada item é um `u32` com o tamanho, seguido do atestado na mesma codificação que o bloco carrega. Cada item passa por `submit_attestation`. Um item recusado não deixa entrar os seguintes; os anteriores ficam na fila. O arquivo vira `<nome>.done` ou `<nome>.rejected`.

O selador sela quando há transação ou atestado esperando. `examples/devnet_attest.rs` escreve um fluxo completo assinado pelas contas `devnet-*` do gênese da devnet, e `scripts/send_attest.sh` o põe na caixa. A avaliação desse fluxo diz `passed` porque a ferramenta a escreve; nada é avaliado.

## Atestado

Campos: `version` (1), `scheme` (1), `chain_id`, `genesis`, `audience`, `signer`, `nonce` de 32 bytes, `not_before`, `expires` (alturas, inclusivas), `claim` e `signature`.

`Attestation::id` é BLAKE3 com domínio `AKG:CHAIN:ATTEST:v1` sobre todos os campos menos a assinatura. A assinatura é Ed25519 sobre `AKG:CHAIN:ATTEST:SIG:v1` seguido do id.

| `Claim` | Campos | Papel do signatário |
| --- | --- | --- |
| `Request` | `task`, `budget` | `Requester` |
| `Artifact` | `request` (id do pedido), `artifact` | `Author` |
| `Evaluation` | `artifact`, `suite`, `environment`, `evidence`, `passed` | `Evaluator` |
| `Approval` | `action`, `artifact`, `proposal` (id da proposta), `evaluation` (id da avaliação), `policy`, `cost` | `Approver` |
| `Revocation` | `delegate`, `role` | quem concedeu |
| `Execution` | `approval` (id da aprovação), `action`, `artifact` | `Executor` |

## Política

`AttestPolicy` tem as chaves Ed25519 por conta e as concessões (`delegate`, `role`, `grantor`, `expires`). Cada par conta e papel aparece no máximo uma vez. `AttestPolicy::digest` cobre chaves e concessões. Revogações são estado do registro e ficam fora do digest.

## Admissão

`admit(att, height)` verifica, nesta ordem: versão e esquema (`Attest("version")`), `chain_id`, `genesis` e `audience` iguais aos do registro (`Attest("domain")`), forma das contas, janela de alturas (`Attest("window")`), chave conhecida e assinatura (`UnverifiedSignature`), par signatário e nonce ainda não usado (`Attest("replay")`), 4096 folhas no registro (`Attest("full")`) e 64 atestados por signatário (`Attest("quota")`).

Uma revogação só é admitida quando o signatário é o `grantor` da concessão (`Attest("authority")`). Ela vale a partir da altura em que foi admitida.

Para pedido, proposta, avaliação e aprovação, a admissão não exige papel e não verifica os vínculos nem o conteúdo. Uma avaliação falsa assinada por uma conta com chave é admitida. Os papéis e os vínculos são conferidos na execução.

Um atestado `Execution` é diferente: admiti-lo é executar. Ele só entra se tudo o que a seção seguinte lista vale, e entra junto com o recibo.

## Execução

`execute(execution, height, effect)` recebe o atestado `Execution` assinado. `admit` chama o mesmo caminho com um efeito vazio. `effect` roda depois de todas as verificações. Se `effect` falha, a aprovação continua sem uso e o registro não muda. Se passa, o atestado de execução e o recibo entram no MMR, a aprovação é consumida e o custo é debitado do pedido, na mesma chamada. A exclusão entre chamadas simultâneas é o `&mut self`.

Nenhum outro caminho consome uma aprovação. O proposer de um bloco não fabrica uma execução: ele carrega a que o executor assinou.

| Verificação | Erro |
| --- | --- |
| o atestado passado não é `Execution`, ou o id citado não é `Approval` | `Attest("kind")` |
| aprovação desconhecida | `Attest("unknown")` |
| aprovação já consumida | `Attest("consumed")` |
| altura fora da janela da execução, da aprovação, da avaliação, da proposta ou do pedido | `Attest("window")` |
| executor, aprovador ou avaliador sem papel vigente | `Attest("authority")` |
| `policy` diferente do digest do registro | `Attest("policy")` |
| `action` da execução diferente da aprovada | `Attest("action")` |
| `artifact` da execução diferente do aprovado | `Attest("artifact")` |
| avaliação ausente, de outro tipo ou de outro artefato | `Attest("link")` |
| avaliação com `passed = false` | `Attest("evaluation")` |
| proposta ausente, de outro tipo, de outro artefato ou de autor sem papel vigente | `Attest("link")` |
| pedido da proposta ausente, de outro tipo ou de solicitante sem papel vigente | `Attest("link")` |
| avaliador, aprovador e executor não são três contas diferentes, ou o autor é o avaliador ou o aprovador | `Attest("separation")` |
| custo já executado do pedido mais o `cost` passa do `budget` | `Attest("budget")` |

O autor da proposta pode ser o executor.

## Recibo

`Receipt` tem `execution` (id do atestado de execução), `executor` (a conta que o assinou), `approval`, `evaluation`, `request`, `artifact`, `action`, `cost`, `height` e `leaf`. A folha do recibo é BLAKE3 com domínio `AKG:CHAIN:ATTEST:RECEIPT:v1` sobre todos esses campos menos `leaf`. `spent(request)` devolve o custo já debitado de um pedido.

## Estados

`status(id, height)` devolve campos separados. Nenhum deles afirma que a declaração é verdadeira.

| Campo | Significado |
| --- | --- |
| `signature_valid` | a assinatura conferiu na admissão |
| `authority_confirmed` | o signatário tem o papel do tipo de declaração na altura pedida |
| `included` | índice da folha no MMR do registro |
| `execution_recorded` | índice da folha do recibo, para a aprovação executada e para a execução que a consumiu |
| `evidence_referenced` | a declaração cita um hash de evidência; o registro não guarda a evidência nem verifica se ela pode ser obtida |

`inclusion_proof(leaf)` devolve a prova, a folha e a raiz. A conferência é `arkhe_verify_core::rbb::mmr::verify`.

## Testes

`cargo test --test attest` roda 15 testes do registro. Cada invariante tem ao menos uma rejeição: campo alterado depois da assinatura, assinatura de outro domínio, segunda execução, 16 execuções simultâneas com um único efeito, chave sem papel aprovando ou executando, concessão expirada, concessão revogada, aprovação de A usada em B, uma conta em dois assentos, orçamento estourado e declaração falsa que recebe só os estados comprovados.

`cargo test --test attest_chain` roda 5 testes com dois nós: o segundo nó reexecuta os atestados e chega à mesma raiz e ao mesmo recibo; um bloco reassinado com um atestado a menos, fora de ordem, com a execução alterada, assinada pelo proposer, assinada pelo aprovador ou repetida é recusado; transferência e atestado dividem um bloco; o arquivo reaberto reconstrói o registro e recusa outras concessões.

`cargo test --test operator a_genesis_grant` cobre a linha `grant`: leitura, sete formas recusadas, hash igual ao de `new_with_grants`, e o binário, que não cria o arquivo para conta ausente e não abre o arquivo com concessões diferentes.

`bash scripts/devnet_smoke.sh` passa um fluxo completo pela caixa do selador com quatro processos e confere que os quatro adotam o bloco.

Não há teste de fork, de sincronização P2P de um nó atrasado nem de precommit para blocos que carregam atestados além do que o smoke exercita.
