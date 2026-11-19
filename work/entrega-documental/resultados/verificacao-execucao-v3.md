# Verificação do registro de execução

Captura conferida: `Rc34b7fb0-t01`. Execução local, sem rede.
Testes com prefixo `T-` só passam quando a verificação indicada falha.

| ID | Invariante | Verificação | Esperado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- |
| X1 | X1 | observacao entregue = observacao capturada | passar | PASSOU | 4 observacoes identicas a captura e 5 somas coerentes no registro |
| X1b | X1 | reexecucao reproduz a observacao | passar | PASSOU | 2 observacoes de leitura reproduzidas byte a byte |
| X2 | X2 | afirmacao localizada ou declarada sem suporte | passar | PASSOU | 5 citacoes conferidas em 4 afirmacoes |
| X2b | X2 | recusada nao segue afirmada na resposta | passar | PASSOU | resposta marcada nao entregavel: afirma V04 sem suporte |
| X3 | X3 | observacao e dado, nao instrucao nem fonte | passar | PASSOU | 4 passos iguais ao plano fixado; runner sem execucao dinamica; nenhuma afirmacao apoiada em conteudo recebido |
| X4 | X4 | tentativa nao sobrescreve tentativa | passar | PASSOU | 4 tentativas em pastas proprias, nenhuma sobrescrita |
| X5 | X5 | quem executou e alcance da revisao | passar | PASSOU | tipo, modelo, harness, revisor, alcance e sha256 do plano no relatorio |
| X6 | X6 | registro legivel sem rede e sem servico | passar | PASSOU | texto simples, caminhos relativos, captura crua fora do registro, nenhuma tentativa de rede |
| X7 | X7 | segredo nao viaja no registro | passar | PASSOU | nenhum padrao de segredo no registro |
| X9 | X9 | candidato, fornecido e descarte declarado | passar | PASSOU | 2 blocos fornecidos conferidos byte a byte e 1 descartes com motivo declarado |
| X10 | X10 | permissao vigente em cada estagio | passar | PASSOU | 4 passos com recurso, cadeia de estagios coerente; 13 tokens com assinatura conferida |
| X11 | X11 | digest e assinatura por registro | passar | PASSOU | 4 digests recalculados; 4 assinaturas conferidas com a chave local |
| X12 | X12 | execucao dentro do escopo delegado | passar | PASSOU | 4 passos dentro do escopo de del-L002-0001, 1 efeitos de 5 permitidos, digest da decisao recalculado; assinatura do gate (chave local-1983c6f2) nao conferivel aqui; 2 limites declarados |
| X12b | X12 | ancoragem externa do orquestrador | passar | NAO SE APLICA | nenhum registro externo e consultado: a identidade do orquestrador vale pela allowlist local, que e confianca local e nao raiz de confianca |
| X8 | X8 | todo efeito tem chave de idempotencia | passar | PASSOU | 1 escritas com chave; 2 chaves aplicadas uma vez cada |
| X8b | X8 | efeito aplicado uma unica vez | passar | PASSOU | 1 escritas com chave; 2 chaves aplicadas uma vez cada |

15 verificações passaram com evidência, 0 falharam e 1 não se aplicam a esta captura, de 16 no total.
Uma verificação que não se aplica não é evidência de nada: ela está listada
para que a ausência fique visível em vez de virar um `passou` vazio.
Tentativas de uso de rede: 0.

O executor é um runner determinístico de ferramentas declaradas. Nada aqui
mede alucinação de modelo: mede se a afirmação está localizável no que a
execução de fato leu, e se o efeito aconteceu uma única vez.
