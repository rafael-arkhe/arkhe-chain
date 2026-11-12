# Regras de acordo, progresso e recuperação

Este documento enuncia as regras que o código impõe hoje e diz, para cada uma, onde ela está e que teste a exercita. Onde a regra é fraca, o texto diz que é fraca. Nada aqui é uma prova formal: a verificação é por teste, com os cenários listados.

O cenário é o da devnet: quatro validadores, cada um com peso 1, e um único processo que sela. O crate não está homologado.

## Modelo

- **Validador honesto:** roda este código sem alteração. Assina no máximo um precommit por altura, para o bloco que é canônico no próprio nó.
- **Validador faltoso:** pode assinar blocos diferentes na mesma altura, selar fora de hora ou ficar calado.
- **Rede:** os pares são os endereços nomeados. Uma mensagem pode atrasar ou se perder. Não há descoberta.

## Acordo

**A1. Confirmação exige mais de dois terços.** Um nó registra a altura `h` como confirmada quando os votos da rodada mais alta, no hash canônico dele em `h`, satisfazem `votos × 3 > validadores × 2`. Com quatro validadores são três votos. A confirmação é sequencial: `h` só confirma depois de `h − 1`. Confirmar não move a ponta.
Onde: `ArkheNode::bft_commit`. Teste: `a1_a_height_commits_only_with_more_than_two_thirds_of_the_validators`.

**A2. Um nó só conta votos para o próprio bloco canônico.** Voto para um irmão é `Fork`. Voto para um bloco desconhecido é `UnknownBlock`. Voto de quem não é validador é `NotProposer`. Assinatura que não é da chave do validador é `BadProposerSignature`. Voto para outro identificador de cadeia é `ChainId`. O mesmo voto repetido conta uma vez.
Onde: `ArkheNode::note_precommit`. Teste: `a2_a_node_counts_votes_only_for_its_own_canonical_block`.

**A3. Dois blocos na mesma altura não confirmam os dois com até um validador faltoso.** Confirmar exige três de quatro votos. Dois conjuntos de três têm ao menos dois validadores em comum, e um validador honesto assina um só bloco por altura. Com zero faltosos e a rede dividida dois a dois, nenhum lado confirma. Com um faltoso que assina os dois blocos, no máximo um lado confirma.
Onde: A1 e A2 juntas. Teste: `a3_two_blocks_at_one_height_cannot_both_commit_with_one_double_signer`.

**A4. Com dois faltosos em quatro, o acordo não vale.** Se dois validadores assinam os dois blocos, os dois lados chegam a três votos e confirmam blocos diferentes. Esse é o limite da regra, e o teste o mostra de propósito.
Teste: `a4_two_double_signers_of_four_break_agreement`.

**A5. Um bloco canônico não é substituído.** Um irmão de outro proposer fica registrado como `Fork` e não troca a ponta. Uma cadeia mais longa não troca a ponta. Dois blocos do mesmo proposer na mesma altura são `Equivocation` e o segundo não é gravado. Não há reorg, nem antes nem depois da confirmação.
Onde: `ArkheNode::import_block`. Teste: `a5_a_committed_block_is_not_replaced_by_a_sibling_or_a_longer_chain`.

O que o acordo não cobre:

- Não há evidência de falta nem punição. Um voto duplo não é detectado por um nó que só vê um dos lados.
- Uma bifurcação não se resolve sozinha. Se dois processos selam e a rede se divide, cada nó fica com o bloco que viu primeiro, para sempre. Sair disso exige apagar o arquivo dos nós do lado descartado, o que é uma decisão de operador fora do protocolo.
- O conjunto de validadores é o do gênese. Não muda.

## Progresso

**P1. O selador sela só depois de ouvir todos os pares nomeados na passagem.** Um par que não respondeu, ou cuja ponta anunciada está atrás, segura o selo. As transações e os atestados ficam na fila até a passagem em que todos respondem na mesma ponta. Com um validador parado, a altura não avança; quando ele volta, o que esperava é selado.
Onde: `OperatorHandle::catch_up` e `heard_every_peer`. Teste: `p1_the_sealer_seals_only_after_every_named_peer_answered`.

**P2. Um bloco exige conteúdo.** Sem transação e sem atestado na fila, nenhum bloco é selado. O timestamp do bloco 1 é o de `--time`; cada bloco seguinte usa o do pai mais um.
Onde: `ArkheNode::propose_and_seal_block` e `seal_timestamp`. Teste: `the_sealing_operator_takes_lists_from_the_inbox_and_seals_them`, em `tests/operator.rs`.

O que o progresso não garante:

- **Não há tolerância a parada.** A1 confirmaria com três de quatro votos, mas P1 não deixa o bloco nascer com um par fora. A rede para com qualquer validador parado. Isso é uma escolha: como não há reorg, selar sem ouvir todos arrisca uma bifurcação permanente quando existe mais de um selador.
- **Não há troca de selador.** Se `val1` para, ninguém sela. Não há rodada posterior à 0 nem escolha de proposer.
- **Não há prazo.** Nada garante que uma transação aceita seja selada em um tempo dado.

## Recuperação

**R1. Um nó que perdeu o arquivo ressincroniza do gênese.** Ele sobe na altura 0, busca os blocos dos pares, reexecuta cada um contra a raiz do cabeçalho e volta a votar. Os votos dos outros chegam de novo e a altura confirmada é reconstruída.
Onde: `sync_pass` e `attest_configured`. Teste: `r1_a_follower_that_lost_its_file_syncs_from_genesis_and_votes_again`.

**R2. Um nó reiniciado retoma do próprio arquivo.** Altura, ponta, altura confirmada e fila de transações voltam como estavam. O arquivo é reexecutado do gênese na abertura e recusado se o resultado difere do que está gravado.
Onde: `ArkheNode::open`. Teste: `r2_a_restarted_node_resumes_from_its_file`.

**R3. Um temporário órfão impede a partida até ser removido.** Um processo morto no meio de uma gravação deixa `<arquivo>.arkhe-tmp`. O nó não sobe enquanto ele existir e devolve `Snapshot`. O arquivo da cadeia é trocado inteiro ou não é trocado, então o órfão pode ser removido.
Onde: `persist::write_atomic`. Testes: `r2_a_restarted_node_resumes_from_its_file` e `a_stale_temporary_file_cannot_be_followed_or_truncated`, em `tests/audit_regressions.rs`.

**R4. Um bloco entregue por dois caminhos não derruba a sincronização.** Um voto pode trazer o bloco enquanto a busca ainda o pede. A busca aceita um bloco que já é canônico no nó.
Onde: `import_synced` em `src/p2p.rs`. Não há teste na suíte para essa corrida. Ela apareceu na primeira execução com quatro processos e não voltou a aparecer nas execuções de `scripts/devnet_smoke.sh`.

O que a recuperação não cobre:

- **A fila de atestados não está no arquivo.** Um selador reiniciado perde os atestados que esperavam. As transações que esperavam voltam.
- **Não há recuperação de bifurcação**, como dito em Acordo.
- **Não há cópia de segurança.** Um nó com o arquivo corrompido tem de ser apagado e ressincronizado (R1), o que só funciona enquanto os outros três estão de pé (P1).

## Autorização

As regras do registro de atestados estão em [atestados.md](atestados.md). As que fecham o caminho de execução:

**Z1. Só uma execução assinada consome uma aprovação.** A execução é um atestado `Execution` assinado por uma conta com o papel `executor`. O proposer do bloco não consegue fabricar uma: ele carrega a que o executor assinou, para aquela aprovação, aquela ação e aquele artefato. O recibo nomeia o executor e o atestado de execução.
Testes: `full_flow_yields_one_receipt_that_names_the_executor`, `authority_valid_key_without_role_cannot_approve_or_execute` e `the_header_root_covers_the_registry`.

**Z2. Ninguém ocupa dois assentos da mesma execução.** O avaliador, o aprovador e o executor são três contas diferentes, e o autor da proposta não é o avaliador nem o aprovador. O autor pode ser o executor.
Teste: `separation_no_account_holds_two_seats_of_one_execution`.

**Z3. A aprovação nomeia a proposta e um custo, e o custo sai do orçamento do pedido.** A soma dos custos executados de um pedido não passa do `budget` que o solicitante assinou. Uma execução que passaria é recusada com `Attest("budget")` e a aprovação fica sem uso.
Teste: `budget_executions_cannot_spend_more_than_the_request_allows`.

**Z4. Uma aprovação vale uma vez.** A mesma execução de novo é `Attest("replay")`. Outra execução da mesma aprovação é `Attest("consumed")`.
Testes: `single_use_second_execution_is_rejected` e `single_use_concurrent_executions_produce_one_effect`.

O que a autorização não cobre:

- **O veredito de admissão de uma transação não é assinado por ninguém.** `apply_tx` exige um `DecisionVerdict` com `Allow` e o `subject` da transação, e não exige assinatura de uma autoridade de política. Quem tem a chave de uma conta consegue emitir o próprio veredito, como faz `examples/devnet_tx.rs`. Fechar isso pede uma chave de política no gênese e uma mudança no formato do payload, e não foi feito aqui.
- **A caixa `--inbox` não autentica quem escreve.** O que protege é a assinatura de cada transação e de cada atestado. Quem escreve no diretório consegue encher a fila.
- **O custo é o que o aprovador declara.** O registro confere a soma contra o orçamento. Não mede o que a ação gastou.
- **O efeito da execução fica fora da cadeia.** O recibo registra que a execução foi autorizada e consumida, não que a ação foi aplicada corretamente.

## Como repetir

```bash
cargo test --test devnet_rules
```

```bash
cargo test --test attest --test attest_chain
```

```bash
bash scripts/devnet_smoke.sh
```

O terceiro comando sobe os quatro processos de uma pasta de dados vazia e confere P1, R2 e o fluxo de atestados de ponta a ponta. Ele termina com código diferente de zero na primeira verificação que não vale.
