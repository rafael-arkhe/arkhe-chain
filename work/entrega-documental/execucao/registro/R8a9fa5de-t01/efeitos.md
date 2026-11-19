# Efeitos desta execução

| Passo | Chave de idempotência | Estado | Observação |
| --- | --- | --- | --- |
| P05 | resumo-L002-v1 | executado | gravado 125 bytes em execucao/saida/resumo-L002.md |

Passo de escrita sem chave de idempotência é recusado. Com a chave já no
livro de aplicados, o passo sai como `repetido` e o efeito não é reaplicado:
reexecutar o plano não duplica a escrita.
