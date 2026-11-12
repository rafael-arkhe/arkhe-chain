# Atestados

`AttestRegistry` (`src/attest.rs`) registra declarações assinadas e consome aprovações de uso único. O nó o mantém no estado e as operações viajam nos blocos. O fluxo coberto é pedido, proposta de artefato, avaliação, aprovação do hash exato, execução única e recibo.

## O que ainda não existe

- Inclusão em bloco não é finalidade. Uma prova de inclusão vale contra a raiz do registro na ponta do nó. A finalidade continua sendo a de `finality` e `committed_height`, com os limites descritos em [consenso.md](consenso.md).
- A raiz do registro não entra na ancoragem nem no journal de prova.
- As operações em espera ficam só na memória do nó que as recebeu. Elas não são gravadas no arquivo e não são enviadas a outros nós. Só chegam aos pares dentro de um bloco.
- `Execute` não tem assinatura própria. Quem a cobre é a assinatura do proposer do bloco, então qualquer validador que sela pode consumir uma aprovação válida. O recibo não nomeia um executor.
- O operador lê as concessões do gênese e abre a cadeia com elas, mas não tem opção de linha de comando para enviar atestados ou execuções. `submit_attestation` e `submit_execution` só existem na biblioteca.
- `--show-genesis` não imprime a contagem de concessões. O hash que ele imprime as cobre.
- O registro aceita 4096 folhas na vida da cadeia, somando atestados e recibos. Depois disso devolve `Attest("full")`.
- Não há API nem página de explorador.
- O único esquema aceito é Ed25519 (`ATTEST_SCHEME_ED25519`). EIP-712 e ERC-1271 não estão implementados. Ed25519 não é pós-quântico.
- `budget` do pedido é assinado e não é cobrado em lugar nenhum.

## No nó

O registro faz parte de `ChainState`. O domínio é `CHAIN_ID`, o hash de gênese do nó e a audiência `arkhe-chain/attest`. As chaves da política são as chaves Ed25519 das contas. As concessões entram por `ArkheNode::new_with_grants` e `open_with_grants` e fazem parte do hash de gênese, uma linha `grant <conta> <papel> <concedente> <altura>` por concessão. Sem concessões, o hash de gênese é o mesmo de antes. Um nó aberto sem concessões admite atestados e não executa nenhuma aprovação.

No arquivo de gênese do operador a linha é a mesma: `grant <conta> <papel> <concedente> <altura>`. O papel é `requester`, `author`, `evaluator` ou `approver`, em minúsculas. A altura é a última em que a concessão vale, só com os dígitos que um `u64` imprime; `0500` e `+5` são `Malformed`. `parse_genesis` confere essas linhas e `parse_genesis_grants` as devolve. O hash cobre validadores, depois contas, depois concessões, cada grupo na ordem do arquivo. Uma concessão que cita conta ausente do gênese devolve `BadAccount` na abertura e não cria o arquivo. Um arquivo criado com certas concessões só abre com as mesmas; outras devolvem `Genesis`.

Um bloco carrega, depois das transações, uma lista de até 64 operações: `Admit` com o atestado ou `Execute` com `approval`, `action` e `artifact`. Um bloco sem operações tem os mesmos bytes que tinha antes. Um bloco pode ter operações e nenhuma transação; sem as duas coisas é `Malformed`. A assinatura do proposer cobre as operações.

As operações são aplicadas depois das transações, na altura do bloco. Na importação, qualquer operação recusada recusa o bloco. `state_root` cobre a raiz e a contagem do registro a partir da primeira folha, sob `AKG:CHAIN:STATE:v2`. Enquanto o MMR de transações está vazio, a v2 escreve 32 bytes zero no lugar da raiz dele.

`submit_attestation` e `submit_execution` testam a operação contra o estado da próxima altura, depois das que já esperam, e a põem numa fila de 256. `propose_and_seal_block` tira até 64 da fila. Uma operação que falha na montagem fica fora do bloco e aparece em `rejected`. Depois de cada bloco, a fila guarda só o que ainda se aplica.

O arquivo do nó não guarda o registro à parte. `open_with_grants` reexecuta os blocos e cada cabeçalho confere a raiz. Abrir com outras concessões devolve `Genesis`.

`attest_status`, `attest_receipt`, `attest_root`, `attest_count`, `attest_policy_digest` e `attest_inclusion_proof` leem o registro na ponta.

## Atestado

Campos: `version` (1), `scheme` (1), `chain_id`, `genesis`, `audience`, `signer`, `nonce` de 32 bytes, `not_before`, `expires` (alturas, inclusivas), `claim` e `signature`.

`Attestation::id` é BLAKE3 com domínio `AKG:CHAIN:ATTEST:v1` sobre todos os campos menos a assinatura. A assinatura é Ed25519 sobre `AKG:CHAIN:ATTEST:SIG:v1` seguido do id.

| `Claim` | Campos | Papel do signatário |
| --- | --- | --- |
| `Request` | `task`, `budget` | `Requester` |
| `Artifact` | `request` (id do pedido), `artifact` | `Author` |
| `Evaluation` | `artifact`, `suite`, `environment`, `evidence`, `passed` | `Evaluator` |
| `Approval` | `action`, `artifact`, `evaluation` (id da avaliação), `policy` | `Approver` |
| `Revocation` | `delegate`, `role` | quem concedeu |

## Política

`AttestPolicy` tem as chaves Ed25519 por conta e as concessões (`delegate`, `role`, `grantor`, `expires`). Cada par conta e papel aparece no máximo uma vez. `AttestPolicy::digest` cobre chaves e concessões. Revogações são estado do registro e ficam fora do digest.

## Admissão

`admit(att, height)` verifica, nesta ordem: versão e esquema (`Attest("version")`), `chain_id`, `genesis` e `audience` iguais aos do registro (`Attest("domain")`), forma das contas, janela de alturas (`Attest("window")`), chave conhecida e assinatura (`UnverifiedSignature`), par signatário e nonce ainda não usado (`Attest("replay")`), 4096 folhas no registro (`Attest("full")`) e 64 atestados por signatário (`Attest("quota")`).

Uma revogação só é admitida quando o signatário é o `grantor` da concessão (`Attest("authority")`). Ela vale a partir da altura em que foi admitida.

A admissão não exige papel e não verifica os vínculos nem o conteúdo. Uma avaliação falsa assinada por uma conta com chave é admitida.

## Execução

`execute(approval, action, artifact, height, effect)` roda `effect` depois de todas as verificações. Se `effect` falha, a aprovação continua sem uso e o registro não muda. Se passa, a aprovação é consumida e o recibo entra no MMR na mesma chamada. A exclusão entre chamadas simultâneas é o `&mut self`.

| Verificação | Erro |
| --- | --- |
| id desconhecido | `Attest("unknown")` |
| o atestado não é `Approval` | `Attest("kind")` |
| aprovação já consumida | `Attest("consumed")` |
| altura fora da janela da aprovação ou da avaliação | `Attest("window")` |
| aprovador ou avaliador sem papel vigente | `Attest("authority")` |
| `policy` diferente do digest do registro | `Attest("policy")` |
| `action` diferente da pedida | `Attest("action")` |
| `artifact` diferente do pedido | `Attest("artifact")` |
| avaliação ausente, de outro tipo ou de outro artefato | `Attest("link")` |
| avaliação com `passed = false` | `Attest("evaluation")` |
| avaliador igual ao aprovador, ou autor igual a um dos dois | `Attest("separation")` |
| nenhuma proposta do artefato por autor vigente para pedido de solicitante vigente | `Attest("link")` |

## Estados

`status(id, height)` devolve campos separados. Nenhum deles afirma que a declaração é verdadeira.

| Campo | Significado |
| --- | --- |
| `signature_valid` | a assinatura conferiu na admissão |
| `authority_confirmed` | o signatário tem o papel do tipo de declaração na altura pedida |
| `included` | índice da folha no MMR do registro |
| `execution_recorded` | índice da folha do recibo, quando a aprovação foi executada |
| `evidence_referenced` | a declaração cita um hash de evidência; o registro não guarda a evidência nem verifica se ela pode ser obtida |

`inclusion_proof(leaf)` devolve a prova, a folha e a raiz. A conferência é `arkhe_verify_core::rbb::mmr::verify`.

## Testes

`cargo test -p arkhe-chain --test attest` roda 14 testes. Cada invariante tem ao menos uma rejeição: campo alterado depois da assinatura, assinatura de outro domínio, segunda execução, 16 execuções simultâneas com um único efeito, chave sem papel, concessão expirada, concessão revogada, aprovação de A usada em B, e declaração falsa que recebe só os estados comprovados.

`cargo test -p arkhe-chain --test attest_chain` roda 5 testes com dois nós: o segundo nó reexecuta as operações e chega à mesma raiz e ao mesmo recibo; um bloco reassinado com uma operação a menos, fora de ordem, com outro artefato ou com a execução repetida é recusado; transferência e operação dividem um bloco; o arquivo reaberto reconstrói o registro e recusa outras concessões.

`cargo test -p arkhe-chain --test operator a_genesis_grant` cobre a linha `grant`: leitura, sete formas recusadas, hash igual ao de `new_with_grants`, e o binário, que não cria o arquivo para conta ausente e não abre o arquivo com concessões diferentes.

Não há teste de fork, de sincronização P2P nem de precommit com blocos que carregam operações.

O caso em que o autor da proposta é também o aprovador ou o avaliador está no código e não tem teste.
