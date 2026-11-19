# Verificação do registro de execução

Captura conferida: `Ac7887e0d-t01`. Execução local, sem rede.
Testes com prefixo `T-` só passam quando a verificação indicada falha.

| ID | Invariante | Verificação | Esperado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- |
| X1 | X1 | observacao entregue = observacao capturada | passar | PASSOU | 5 observacoes identicas a captura e 6 somas coerentes no registro |
| X1b | X1 | reexecucao reproduz a observacao | passar | NAO SE APLICA | traco adaptado: nao ha como reexecutar a ferramenta do agente, e o traco nao traz hash do alvo lido; divergencia nao seria atribuivel |
| X2 | X2 | afirmacao localizada ou declarada sem suporte | passar | PASSOU | 4 citacoes conferidas em 5 afirmacoes |
| X2b | X2 | recusada nao segue afirmada na resposta | passar | PASSOU | resposta marcada nao entregavel: afirma B05 sem suporte |
| X3 | X3 | observacao e dado, nao instrucao nem fonte | passar | PASSOU | passos iguais ao traco recebido, escolhidos pelo modelo durante a execucao; nao houve plano anterior; nenhuma afirmacao apoiada em conteudo recebido |
| X4 | X4 | tentativa nao sobrescreve tentativa | passar | PASSOU | 4 tentativas em pastas proprias, nenhuma sobrescrita |
| X5 | X5 | quem executou e alcance da revisao | passar | PASSOU | tipo, modelo, harness, revisor, alcance e sha256 do plano no relatorio |
| X6 | X6 | registro legivel sem rede e sem servico | passar | PASSOU | texto simples, caminhos relativos, captura crua fora do registro, nenhuma tentativa de rede |
| X7 | X7 | segredo nao viaja no registro | passar | PASSOU | nenhum padrao de segredo no registro |
| X9 | X9 | candidato, fornecido e descarte declarado | passar | NAO SE APLICA | nenhum passo declarou recuperacao: nao ha hierarquia a conferir |
| X10 | X10 | permissao vigente em cada estagio | passar | NAO SE APLICA | nenhum passo declarou recurso: nao ha permissao a conferir |
| X11 | X11 | digest e assinatura por registro | passar | NAO SE APLICA | captura sem digest por registro: traco adaptado nao o traz |
| X12 | X12 | execucao dentro do escopo delegado | passar | NAO SE APLICA | execucao sem delegacao declarada: nao houve gate a montante |
| X8 | X8 | todo efeito tem chave de idempotencia | passar | PASSOU | 2 escritas com chave, 2 derivadas dos argumentos pela politica |
| X8b | X8 | efeito aplicado uma unica vez | passar | NAO SE APLICA | traco adaptado: a chave foi derivada depois do fato e nao ha livro de aplicados do momento da execucao; aplicacao unica nao e demonstravel a partir do traco |

9 verificações passaram com evidência, 0 falharam e 6 não se aplicam a esta captura, de 15 no total.
Uma verificação que não se aplica não é evidência de nada: ela está listada
para que a ausência fique visível em vez de virar um `passou` vazio.
Tentativas de uso de rede: 0.

O executor é um runner determinístico de ferramentas declaradas. Nada aqui
mede alucinação de modelo: mede se a afirmação está localizável no que a
execução de fato leu, e se o efeito aconteceu uma única vez.
