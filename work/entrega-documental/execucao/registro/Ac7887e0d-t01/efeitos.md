# Efeitos desta execução

| Passo | Chave de idempotência | Estado | Observação |
| --- | --- | --- | --- |
| P04 | gravar_resumo-859075d4381f7174 | executado | gravado 46 bytes em saida/resumo-adaptado.md |
| P05 | enviar_email-60ecbc68ac7f6133 | falhou | PermissionError: envio não autorizado neste ambiente |

Passo de escrita sem chave de idempotência é recusado. Com a chave já no
livro de aplicados, o passo sai como `repetido` e o efeito não é reaplicado:
reexecutar o plano não duplica a escrita.
