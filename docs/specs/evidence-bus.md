# Evidence Bus

Estado em 17/11/2026: nome do contrato que os três recibos já cumprem. Não há processo de barramento, fila ou rede publicado neste repositório.

## Mensagem

Uma mensagem é um recibo `arkhe-receipt/v1`. A ordem que o pacote sabe emitir é admissão, depois commit, depois âncora. O commit só é assinado depois que a admissão verifica. A âncora nomeia o id do commit. Quem recebe não confia na ordem contada por quem enviou: recalcula o hash, a assinatura e a raiz.

## Entrega

Entregar no barramento é gravar o recibo onde outro processo consegue lê-lo. No pacote, isso é um arquivo. `arkhe-storage` acrescenta a admissão uma vez e devolve o mesmo commit se o arquivo se repetir. Um arquivo diferente com o mesmo id conflita e não grava.

Não há assinatura de efeito no fim do barramento. Uma mensagem `PASS` não libera ação. O [broker de proveniência](provenance-broker.md) é o leitor. O `CapabilityBroker` do kernel, se estiver em uso, continua sendo outro componente e não é acionado por este contrato.

## Falha

Um byte do assunto que não é o hash assinado produz `subject: FAIL` e `overall: FAIL`. A mensagem de âncora anterior, se ainda for a do commit antigo, continua dizendo o que dizia. Não passa a descrever o byte novo. Âncora ausente, pendente, ou sem cliente de transporte permanece `INCONCLUSIVE`. `INCONCLUSIVE` não é entrega confirmada.
