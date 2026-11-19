# Resultado da verificação

Execução local, sem rede, sobre as fontes fictícias deste diretório.
Testes com prefixo `T-` só passam quando a verificação correspondente falha.

| ID | Invariante | Verificação | Esperado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- |
| I1 | I1 | bytes recebidos = bytes entregues | passar | PASSOU | 4 originais identicos byte a byte, 4 somas coerentes |
| I1b | I1 | cadeia origem-recebimento-entrega | passar | PASSOU | 4 originais iguais ao sha256 do recebimento |
| I1c | I1 | extracao de PDF igual a conferida | passar | PASSOU | 2 extracoes identicas e com mapa de paginas coerente |
| I2 | I2 | afirmacao localizada ou pendente | passar | PASSOU | 8 localizacoes conferidas em 4 afirmacoes |
| I2b | I2 | campo alterado com origem conferivel | passar | PASSOU | 0 campos com origem conferivel |
| I3a | I3 | codigo nao executa conteudo de fonte | passar | PASSOU | montar.py sem processo externo; receber.py com uma chamada de argv fixo ao extrator, sem shell |
| E1 | escopo | limite excedido fica registrado | passar | PASSOU | 4 afirmacoes dentro do limite de 20; nenhum limite excedido |
| I4 | I4 | nenhuma versao sobrescrita | passar | PASSOU | 4 originais em pastas por ID |
| I5 | I5 | revisor, data e alcance declarados | passar | PASSOU | revisor, data e alcance declarados no relatorio |
| I6 | I6 | pacote legivel sem rede e sem servico | passar | PASSOU | somente texto, caminhos relativos, nenhuma tentativa de rede |
| I7 | I7 | autorizacao e destino registrados | passar | PASSOU | autorizacao, ambiente e destinatarios registrados; nenhuma exclusao declarada como concluida |

11 de 11 verificações passaram. Tentativas de uso de rede: 0.

Esta execução confere o exemplar contra as próprias fontes fictícias do
diretório. Não substitui leitura independente, caso com documentos reais
autorizados, nem revisão por outra pessoa.
