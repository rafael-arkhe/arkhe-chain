# Ponta, fork e finalidade

O bloco só é adotado quando o pai é a ponta atual e a altura é a ponta mais um. O proposer assina com Ed25519, domínio `AKG:CHAIN:PROPOSER:v1`, sobre o cabeçalho sem a assinatura e sobre as transações. A assinatura tem 64 bytes. A chave tem de ser a do `node_id` no conjunto de validadores. `block_seal` e `BlockSeal` não fazem parte da API. O bloco codificado não carrega a marca `ARKH`.

## Fork e equivocação

Um bloco com o mesmo pai e a mesma altura, de outro proposer, que reproduz o estado do pai, é `Fork`. A ponta e os saldos canônicos ficam. A repetição do mesmo irmão não aumenta a contagem. Um pai que não é o pai canônico daquela altura é `ParentMismatch` e não é registrado.

Dois blocos distintos do mesmo proposer na mesma altura são `Equivocation`. O estado e a ponta ficam. O mesmo bloco importado de novo é `ParentMismatch`.

O sync que encontra um irmão grava `Fork` e devolve `P2p("fork")`. O sync que encontra equivocação devolve `Equivocation` e não grava o bloco. Uma cadeia mais longa não substitui a ponta local.

Não há reorg. O limiar de precommit não troca a ponta.

## Finalidade

`finality(height)` devolve `Finality { height, depth }`, com `depth = ponta − height`. Altura ausente, inclusive 0, é `UnknownBlock`. Isso descreve a cadeia canônica local. Não é checkpoint justificado.

`Precommit` é uma assinatura Ed25519 local no domínio `AKG:CHAIN:PRECOMMIT:v4`, sobre a altura, a rodada, o hash do bloco, um cabeçalho de um único part e o identificador `arkhe-chain`. Esse part tem de ser 1 e o hash do part tem de ser o hash do bloco. Outro identificador é `ChainId`. O bloco não é dividido. Não é um `CanonicalVote` nem um `CanonicalPartSetHeader` do CometBFT. Cada validador configurado tem peso 1 e um voto por altura. Uma rodada maior, no mesmo hash, substitui a anterior. Uma rodada menor é `RoundRegression`. Outro total de parts, ou outro hash de part, é `BadPartSet` e não entra. `bft_commit` conta só a rodada mais alta e devolve sucesso só quando ela passa de dois terços. Uma rodada anterior não soma. Com dois validadores, os dois na rodada 0 passam; se só um sobe de rodada, o resultado volta a `QuorumAbsent`. `AKGCHNS5` e `AKGCHNS6` reabrem o precommit antigo, sem rodada na assinatura, como rodada 0. Um voto marcado como versão 2 no `AKGCHNS7` reabre a assinatura que liga só a rodada. A versão 3 reabre a assinatura do part, sem o identificador. `note_precommit` não aceita essas assinaturas antigas. A ponta não se move.
