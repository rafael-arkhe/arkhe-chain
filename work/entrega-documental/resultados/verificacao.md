# Resultado da verificação

Execução local, sem rede, sobre as fontes fictícias deste diretório.
Testes com prefixo `T-` só passam quando a verificação correspondente falha.

| ID | Invariante | Verificação | Esperado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- |
| I1 | I1 | bytes recebidos = bytes entregues | passar | PASSOU | 3 originais identicos byte a byte, 3 somas coerentes |
| I1b | I1 | cadeia origem-recebimento-entrega | passar | PASSOU | lote sem registro de recebimento; cadeia nao se aplica |
| I1c | I1 | extracao de PDF igual a conferida | passar | PASSOU | lote sem PDF; nenhuma extracao a conferir |
| I2 | I2 | afirmacao localizada ou pendente | passar | PASSOU | 8 localizacoes conferidas em 4 afirmacoes |
| I2b | I2 | campo alterado com origem conferivel | passar | PASSOU | 4 campos com origem conferivel |
| I3a | I3 | codigo nao executa conteudo de fonte | passar | PASSOU | montar.py sem processo externo; receber.py com uma chamada de argv fixo ao extrator, sem shell |
| E1 | escopo | limite excedido fica registrado | passar | PASSOU | 4 afirmacoes dentro do limite de 20; nenhum limite excedido |
| I4 | I4 | nenhuma versao sobrescrita | passar | PASSOU | 3 originais em pastas por ID |
| I5 | I5 | revisor, data e alcance declarados | passar | PASSOU | revisor, data e alcance declarados no relatorio |
| I6 | I6 | pacote legivel sem rede e sem servico | passar | PASSOU | somente texto, caminhos relativos, nenhuma tentativa de rede |
| I7 | I7 | autorizacao e destino registrados | passar | PASSOU | autorizacao, ambiente e destinatarios registrados; nenhuma exclusao declarada como concluida |
| T-BYTE | I1 | byte alterado no original entregue | falhar | PASSOU | D002: 298 bytes recebidos != 298 bytes entregues, sha 0a9f0ad7d128 != 20deae623abd; soma divergente para originais/D002/relatorio_v2.txt |
| T-SOMA | I1 | arquivo e soma substituidos juntos | falhar | PASSOU | D003: 200 bytes recebidos != 205 bytes entregues, sha 27f85e124e70 != 5d44a027d195 |
| T-FONTE | I2 | fonte removida com mapa inalterado | falhar | PASSOU | A001: fonte D003 ausente do pacote mas afirmacao segue compativel; A002: fonte D003 ausente do pacote mas afirmacao segue compativel; A003: fonte D003 ausente do pacote mas afirmacao segue compativel |
| T-FONTE-MAPA | I2 | mapa gerado sem resultado positivo antigo | passar | PASSOU | nenhuma linha 'Compatível' no mapa; fonte marcada como ausente |
| T-INJECAO | I3 | documento com instrucao operacional | passar | PASSOU | instrucao registrada como conteudo; mapa, pendencias e aceite inalterados; nenhum envio; anexo preservado |
| T-NOME | I4 | duas versoes com nome igual em lotes diferentes | passar | PASSOU | D002 e D005 preservados em pastas distintas, conteudos diferentes, ambos no indice e nas somas |
| T-REVISOR | I5 | lote sem revisor ou data | passar | PASSOU | relatorio declara revisao nao concluida; revisor ausente e relatorio declara revisao nao concluida |

18 de 18 verificações passaram. Tentativas de uso de rede: 0.

Esta execução confere o exemplar contra as próprias fontes fictícias do
diretório. Não substitui leitura independente, caso com documentos reais
autorizados, nem revisão por outra pessoa.
