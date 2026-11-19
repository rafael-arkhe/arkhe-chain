# Verificação do registro de execução

Captura conferida: `R8a9fa5de-t01`. Execução local, sem rede.
Testes com prefixo `T-` só passam quando a verificação indicada falha.

| ID | Invariante | Verificação | Esperado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- |
| X1 | X1 | observacao entregue = observacao capturada | passar | PASSOU | 5 observacoes identicas a captura e 6 somas coerentes no registro |
| X1b | X1 | reexecucao reproduz a observacao | passar | PASSOU | 4 observacoes de leitura reproduzidas byte a byte |
| X2 | X2 | afirmacao localizada ou declarada sem suporte | passar | PASSOU | 4 citacoes conferidas em 4 afirmacoes |
| X2b | X2 | recusada nao segue afirmada na resposta | passar | PASSOU | nenhuma afirmacao recusada aparece afirmada no texto entregue |
| X3 | X3 | observacao e dado, nao instrucao nem fonte | passar | PASSOU | 5 passos iguais ao plano fixado; runner sem execucao dinamica; nenhuma afirmacao apoiada em conteudo recebido |
| X4 | X4 | tentativa nao sobrescreve tentativa | passar | PASSOU | 4 tentativas em pastas proprias, nenhuma sobrescrita |
| X5 | X5 | quem executou e alcance da revisao | passar | PASSOU | tipo, modelo, harness, revisor, alcance e sha256 do plano no relatorio |
| X6 | X6 | registro legivel sem rede e sem servico | passar | PASSOU | texto simples, caminhos relativos, captura crua fora do registro, nenhuma tentativa de rede |
| X7 | X7 | segredo nao viaja no registro | passar | PASSOU | nenhum padrao de segredo no registro |
| X9 | X9 | candidato, fornecido e descarte declarado | passar | NAO SE APLICA | nenhum passo declarou recuperacao: nao ha hierarquia a conferir |
| X10 | X10 | permissao vigente em cada estagio | passar | NAO SE APLICA | nenhum passo declarou recurso: nao ha permissao a conferir |
| X11 | X11 | digest e assinatura por registro | passar | PASSOU | 5 digests recalculados; 5 assinaturas conferidas com a chave local |
| X12 | X12 | execucao dentro do escopo delegado | passar | NAO SE APLICA | execucao sem delegacao declarada: nao houve gate a montante |
| X8 | X8 | todo efeito tem chave de idempotencia | passar | PASSOU | 1 escritas com chave; 2 chaves aplicadas uma vez cada |
| X8b | X8 | efeito aplicado uma unica vez | passar | PASSOU | 1 escritas com chave; 2 chaves aplicadas uma vez cada |
| T-OBS | X1 | byte alterado na observacao capturada | falhar | PASSOU | P02: observacao crua 54d01056d219 != registrada 057cd9a073cf |
| T-FABRICADA | X1 | observacao e somas trocadas juntas | falhar em X1b | PASSOU | X1 passou, como esperado de quem controla a captura; X1b pegou: P02: alvo intacto mas a reexecucao devolve 057cd9a073cf != observacao registrada 54d01056d219; observacao nao reproduz |
| T-CITACAO | X2 | afirmacao cita trecho que nao esta na observacao | falhar | PASSOU | A02: trecho nao encontrado em P02 linha 5 |
| T-INJECAO-ADOTADA | X3 | afirmacao do anexo promovida a apoiada | falhar em X3 | PASSOU | X2 localizou o trecho (ele existe mesmo no anexo), X3 recusou: A04: apoiada em P03 de papel conteudo_recebido; conteudo recebido nao sustenta afirmacao |
| T-PASSO-EXTRA | X3 | passo executado fora do plano fixado | falhar | PASSOU | passos executados P01,P02,P03,P04,P05,P99 diferem do plano P01,P02,P03,P04,P05 |
| T-SEGREDO | X7 | credencial dentro de uma observacao | passar | PASSOU | byte original na captura, linha suprimida e declarada no registro, nenhum padrao de segredo no que viaja |
| T-IDEMPOTENCIA | X8 | reexecutar o plano com a chave ja aplicada | passar | PASSOU | segunda tentativa saiu como repetido, arquivo intacto e chave aplicada uma unica vez |
| T-SEM-CHAVE | X8 | escrita declarada sem chave de idempotencia | passar | PASSOU | passo recusado pelo runner e nenhum arquivo gravado |

20 verificações passaram com evidência, 0 falharam e 3 não se aplicam a esta captura, de 23 no total.
Uma verificação que não se aplica não é evidência de nada: ela está listada
para que a ausência fique visível em vez de virar um `passou` vazio.
Tentativas de uso de rede: 0.

O executor é um runner determinístico de ferramentas declaradas. Nada aqui
mede alucinação de modelo: mede se a afirmação está localizável no que a
execução de fato leu, e se o efeito aconteceu uma única vez.
