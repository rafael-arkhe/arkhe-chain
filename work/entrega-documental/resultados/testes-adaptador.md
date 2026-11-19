# Testes do adaptador de traço

Cada caso monta um traço com um defeito e exige recusa ou registro. O
adaptador não corrige, não completa e não inventa política.

| ID | Caso | Resultado | Evidência |
| --- | --- | --- | --- |
| A01 | ferramenta sem política declarada | PASSOU | passo recusado, papel e efeito nao declarados, ferramenta listada |
| A02 | tool_use sem tool_result no traço | PASSOU | passo incompleto e ocorrencia registrada, sem observacao inventada |
| A03 | id de chamada repetido no traço | PASSOU | id repetido e resultado duplicado registrados, nenhum passo descartado |
| A04 | tool_result sem chamada correspondente | PASSOU | resultado orfao registrado e nao promovido a passo |
| A05 | escrita com política sem chave_de | PASSOU | escrita recusada por politica sem chave_de |
| A06 | escrita sem o argumento que forma a chave | PASSOU | escrita recusada: argumento da chave ausente no traco |
| A07 | traço no dialeto OpenAI | PASSOU | dialeto openai convertido, observacao e texto final preservados |
| A08 | adaptador não propõe citação | PASSOU | esqueleto sem nenhuma afirmacao, texto final extraido e enderecos disponiveis para quem anota |
| A09 | segunda adaptação do mesmo traço | PASSOU | duas adaptacoes do mesmo traco em pastas t01 e t02 |
| A10 | credencial no argumento da ferramenta | PASSOU | valor do argumento suprimido no registro, chave preservada, original intacto na captura crua |
| A11 | traço como lista JSON crua | PASSOU | lista crua reconhecida: lista JSON de mensagens |
| A12 | JSONL com a mensagem embrulhada em evento | PASSOU | JSONL desembrulhado, modelo recolhido e linha invalida registrada em vez de descartada em silencio |
| A13 | mensagens aninhadas sob chave de envelope | PASSOU | mensagens encontradas em JSON, mensagens em data.messages |
| A14 | traço sem nenhuma mensagem | PASSOU | recusado com codigo 2 e nenhuma captura criada; a mensagem lista as chaves vistas e onde procurou |
| A15 | evidência sem veredito sobre as ferramentas | PASSOU | 3 ferramentas listadas, nenhum campo preenchido, instrução na saída registrada como fato do texto |
| A16 | política em branco recusa todo passo | PASSOU | politica em branco recusa todo passo, com motivo e codigo != 0 |
| A17 | credencial não aparece na evidência | PASSOU | valor suprimido no relatório e no json, rótulo do padrão reportado, chave do argumento preservada |
| A18 | inspeção de traço ilegível | PASSOU | recusado com codigo 2 e nenhum esqueleto gerado |

18 de 18 casos passaram.

Os traços aqui são escritos à mão. Nenhum veio de um modelo de verdade:
o que está testado é a conversão e a recusa, não o comportamento de um agente.
