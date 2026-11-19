# Verificação re-provável

17/11/2026. Texto aberto. Não mede audiência, não registra inbound e não declara que o mercado adotou esta categoria.

## A frase que está certa

Provenance is not proof. Um recibo de proveniência não prova que o artefato está certo, que a ação aconteceu, nem que a âncora foi confirmada por um transporte. O estudo e o código deste repositório já recusam essa promoção: assinatura autentica quem assinou e quais bytes foram cobertos; inclusão num log autentica pertencimento a um checkpoint; nenhum dos dois é o fato de fora.

## O que a frase não apaga

Se outra pessoa, com os mesmos bytes e a mesma raiz de confiança, não chega ao mesmo veredito, não houve verificação. Houve um relato. Verificação re-provável é a repetição desse veredito, componente por componente, fora do ambiente de quem emitiu. O veredito repetido continua sendo veredito. Não vira prova do mundo.

A demo em [packaging/core/demo](../../packaging/core/demo/README.md) é o caso curto. O assunto intacto passa. Um byte alterado deixa a assinatura `PASS` e o assunto `FAIL`. A assinatura continua verdadeira sobre o hash antigo. O arquivo na mesa já não é esse hash. A âncora do commit original permanece `INCONCLUSIVE` e não cobre o byte novo. O tempo cabe numa execução local do comando.

## O mesmo corte da agência

Um modelo que declara ter agido emite uma proposta. A proposta não é a observação de que a ação ocorreu. Quem assina, qual política autoriza e o que foi observado sobre a execução são perguntas separadas. A proveniência obedece ao mesmo corte. O registro diz o que alguém assinou. A conferência diz se a assinatura e o hash batem com o que está na mesa. Nenhum dos dois observa o efeito lá fora. Tratar o relato do modelo como agência, ou o recibo como prova, é o mesmo salto.

## O que está escrito ao lado

O [broker de proveniência](../specs/provenance-broker.md) é quem entrega o recibo para essa conferência. Não é o broker que reserva efeito. O [Evidence Bus](../specs/evidence-bus.md) é o nome do contrato entre admissão, commit e âncora. Não é uma fila em produção.

Estes três textos nomeiam o que o pacote `packaging/core` já executa. Não substituem o Gate 0: outra pessoa ainda precisa repetir o recibo sem este ambiente. Não substituem o Gate 1: ninguém pagou por verificação em produção.
