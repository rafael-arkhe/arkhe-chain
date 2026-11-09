# Ponta, fork e finalidade

O bloco só é adotado quando o pai é a ponta atual e a altura é a ponta mais um. O proposer assina com Ed25519, domínio `AKG:CHAIN:PROPOSER:v1`, sobre o cabeçalho sem a assinatura e sobre as transações. A assinatura tem 64 bytes. A chave tem de ser a do `node_id` no conjunto de validadores. `block_seal` e `BlockSeal` não fazem parte da API. O bloco codificado não carrega a marca `ARKH`.

## Fork e equivocação

Um bloco com o mesmo pai e a mesma altura, de outro proposer, que reproduz o estado do pai, é `Fork`. A ponta e os saldos canônicos ficam. A repetição do mesmo irmão não aumenta a contagem. Um pai que não é o pai canônico daquela altura é `ParentMismatch` e não é registrado.

Dois blocos distintos do mesmo proposer na mesma altura são `Equivocation`. O estado e a ponta ficam. O mesmo bloco importado de novo é `ParentMismatch`.

O sync que encontra um irmão grava `Fork` e devolve `P2p("fork")`. O sync que encontra equivocação devolve `Equivocation` e não grava o bloco. Uma cadeia mais longa não substitui a ponta local.

Não há reorg, voto com peso nem quórum.

## Finalidade

`finality(height)` devolve `Finality { height, depth }`, com `depth = ponta − height`. Altura ausente, inclusive 0, é `UnknownBlock`. Isso descreve a cadeia canônica local. Não é checkpoint justificado.

`Precommit` é uma assinatura Ed25519 local no domínio `AKG:CHAIN:PRECOMMIT:v1`, sobre a altura e o hash do bloco. Não tem round nem part set. Não é um `CanonicalVote` do CometBFT. Cada validador configurado tem peso 1. `bft_commit` devolve sucesso só quando os precommits do hash canônico são mais de dois terços desse conjunto. Com dois validadores, um voto é `QuorumAbsent` e os dois passam. Com três, dois votos ficam `QuorumAbsent`. Os precommits reabrem com o snapshot. A ponta não se move.
