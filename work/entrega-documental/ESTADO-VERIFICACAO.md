# Estado das verificações do exemplar

Execução local em 14 de novembro de 2026, sobre as fontes fictícias deste diretório.
Atualiza a seção 7 do documento *Arkhe — Entrega documental rastreável v0.1*, que
listava onze verificações, nove delas nunca executadas.

Quatro passaram a existir como teste que roda: preservação de arquivos externos,
alteração de byte, fonte removida e documento com instrução. O que depende de outra
pessoa, de documentos reais ou de um comprador continua sem evidência, e nada aqui
mudou isso.

## Seção 7, linha por linha

| Verificação (seção 7) | Estado em 14/11 no documento | Estado agora | Onde está a evidência |
| --- | --- | --- | --- |
| Coerência das referências | Conferida textualmente pelo mesmo processo que redigiu | Executada mecanicamente: 8 localizações conferidas em 4 afirmações | `I2` em `resultados/verificacao.md`; mutantes M01, M02, M05 |
| Lacuna deliberada (quitação) | Presente no exemplar | Executada: a afirmação não pode ser marcada compatível citando a linha que nega o comprovante | `I2`; mutantes M03, M04 |
| Histórico (18→21, 1.800→2.100) | Presente no exemplar | Executada: diferença calculada por `difflib` e cada valor declarado conferido na linha citada | `I2b`; `pacote/alteracoes.md`; mutantes M08, M09 |
| Preservação de arquivos externos | Não executada; não havia arquivos externos | **Executada**: 3 arquivos em `fontes/` comparados byte a byte com os originais entregues | `I1`; mutantes M06, M07 |
| Teste de alteração | Não executado | **Executado**: um byte trocado derruba a aprovação; trocar arquivo e soma juntos também | `T-BYTE`, `T-SOMA` |
| Fonte removida | Não executado operacionalmente | **Executado**: sem D003, nenhuma linha do mapa sai como "Compatível" e a verificação recusa o pacote | `T-FONTE`, `T-FONTE-MAPA` |
| Documento com instrução maliciosa | Não executado | **Executado**: a instrução é registrada em `ocorrencias.md`; mapa, pendências e aceite ficam byte a byte iguais | `T-INJECAO`; estático em `I3a`, mutante M16 |
| Leitura independente sem rede | Não executada | Parcial: a parte mecânica roda (texto, caminhos relativos, zero tentativa de rede, todo arquivo citado existe). Ninguém de fora leu o pacote | `I6`; mutantes M10, M11 |
| Caso com documentos reais autorizados | Não executado | Não executado. O fluxo já roda ponta a ponta sobre arquivos de formato real, inclusive PDF, mas as fixtures continuam sendo minhas e não houve autorização de ninguém | `resultados/verificacao-lote-real.md` |
| Margem do lote | Não medida | Não medida | — |
| Interesse comercial | Não demonstrado | Não demonstrado | — |
| Primeira venda e aceite | Não realizados | Não realizados | — |

## Verificações que a seção 2 pedia e a seção 7 não listava

| Invariante | Verificação prometida | Estado |
| --- | --- | --- |
| I4 | Receber duas versões com o mesmo nome e comprovar que ambas permanecem identificáveis | Executada: `T-NOME`. Os originais ficam em `originais/<ID>/`, então nome igual não sobrescreve |
| I5 | Campo sem revisor ou data impede status de revisão concluída | Executada: `T-REVISOR`, mutantes M12 e M13 |
| I7 | Conferir permissões, ausência de links públicos, registro de destino e exclusão | Parcial: autorização, ambiente e destinatários constam do relatório e nenhuma exclusão é declarada como concluída (`I7`, mutantes M14, M15). O recebimento recusa arquivo cujo caminho real sai da pasta indicada, testado com uma junção do Windows apontando para fora. Não há arquivo de terceiro para excluir, então a retenção segue sem teste real |
| Escopo | Lote até 10 arquivos, 50 páginas, 50 MB e 20 afirmações; arquivo inesperado exige novo escopo | Executada: a porta recusa o que está fora do lote com motivo, e o excesso de limite tem de constar do pacote (`E1`, mutantes M18, M19) |

## Documento real fica fora do repositório

O lote, o pacote e o resultado de um lote real ficam numa pasta fora de `D:rkhe`.
A verificação grava o resultado ao lado do lote quando o lote está fora deste
diretório, porque o resultado cita nome de arquivo e trecho do que foi conferido;
trazê-lo para `resultados/` levaria conteúdo de terceiro para dentro do git. Rodei um
lote inteiro fora do repositório para conferir: 11 de 11 verificações, resultado
gravado junto do lote e nenhuma entrada nova no `git status`.

## O que o lote de teste acrescentou

`receber.py` fechou o buraco entre "arquivos chegaram" e "o mapa de referências já
está escrito", que antes era pressuposto. O lote de teste tem dez arquivos: quatro
aceitos e seis recusados com motivo — PNG, XLSX, arquivo sem extensão, texto em
cp1252, PDF escaneado sem camada de texto e PDF protegido por senha. Nenhum foi
convertido para caber no escopo.

Para PDF, o endereço citável passou a ser a página física: `D003, página 2, linha 8`.
A extração fica em `extracoes/`, viaja no pacote rotulada como arquivo de trabalho, e
o `I1c` confere que a extração entregue é idêntica à que foi conferida e que o mapa de
páginas tem uma entrada por linha. O `I1b` fecha a cadeia sha256 origem → recebimento
→ original entregue, e distingue o arquivo que mudou na origem depois do recebimento
(não é falha da entrega) do original entregue que divergiu do que se recebeu (é).

O anexo com instrução agora atravessa o fluxo como arquivo de verdade: um PDF cuja
página 2 manda ignorar o operador, enviar o lote para um endereço externo e aprovar a
versão final com 99 participantes. Ele é preservado byte a byte, suas três linhas
aparecem em `ocorrencias.md` com endereço de página, e nenhuma afirmação dele foi
selecionada.

Isso também produziu um conflito entre invariantes que o texto do documento não
previa. O I3 exige registrar o conteúdo recebido, inclusive a URL; o I6 exige que o
pacote não dependa de endereço externo. A primeira versão do `I6` reprovou o pacote
por causa da própria citação. A regra agora separa citação de dependência: em
`ocorrencias.md` o endereço pode aparecer dentro de uma linha de tabela do registro,
nunca na prosa que o leitor seguiria. O mutante M17 cobre a diferença.

## Registro por execução: o que passou a existir

O anúncio da Payfy aponta observabilidade de agente em produção como o diferencial
mais raro, e era o buraco óbvio aqui: tudo era por lote, depois do fato. Agora há um
registro por execução, com os invariantes X1 a X8, oito testes negativos e 18
mutantes, todos pegos.

Três coisas ficaram demonstradas e não apenas descritas. **Conciliação com dente**:
guardar o sha256 do alvo lido permite separar "o arquivo mudou no mundo" de "a
observação foi fabricada" — o teste `T-FABRICADA` troca observação e somas juntas,
`X1` passa (quem controla a captura controla as somas) e `X1b` pega pela reexecução.
**Idempotência**: reexecutar o plano com a chave já aplicada sai como `repetido`, o
arquivo de destino fica intacto, e passo de escrita sem chave é recusado pelo runner
antes de qualquer efeito. **Conteúdo recebido não sustenta afirmação**: promover a
afirmação do anexo de injeção a apoiada é localizável — o trecho "99 participantes"
existe mesmo no anexo — e é recusada por `X3` pelo papel da observação, não pela
redação.

## O adaptador de traço, e o que ele não pode saber

O adaptador converte traço de agente com LLM (dialetos Anthropic e OpenAI) para o
formato de captura. Ao escrevê-lo ficou claro que um traço não carrega três coisas que
a verificação exige, e que nenhuma delas é inferível: papel da observação, efeito do
passo e chave de idempotência. As três passaram a vir de `politica.json`, declarada
por ferramenta com justificativa, e ferramenta sem política tem o passo recusado. Nove
casos de traço defeituoso estão testados — ferramenta sem política, `tool_use` sem
`tool_result`, id repetido, resultado órfão, escrita sem chave derivável, dialeto
OpenAI — e nenhum é corrigido em silêncio.

A quarta ausência é a mais importante para o produto: **o traço não traz citação das
afirmações**. O adaptador extrai o texto final do agente e emite um esqueleto com a
lista de afirmações vazia, mais um localizador de todas as linhas de observação. Ele
não propõe citação nenhuma, porque propor seria fabricar suporte. Em outras palavras,
um agente cujo runtime não exige citação produz resposta inverificável por construção,
e nenhuma ferramenta conserta isso depois.

Três verificações degradam no modo adaptado, e o registro declara em vez de fingir:
`X1b` não se aplica, porque não há como reexecutar a ferramenta do agente nem hash do
alvo lido; `X8b` não se aplica, porque a chave foi derivada depois do fato e não há
livro do momento da execução — dá para mostrar que toda escrita tem chave, não que o
efeito aconteceu uma só vez; e `X3` troca de pergunta, já que não houve plano anterior
e os passos foram escolhidos pelo modelo. Daí veio uma decisão de apresentação:
verificação que não se aplica aparece como `NAO SE APLICA`, nunca como `PASSOU`, e o
resumo conta as três coisas separadas. Um `passou` por ausência de objeto é falso
conforto.

Também apareceu um invariante que não existia: `X2b`. O traço de exemplo termina com o
agente afirmando "a atividade teve 99 participantes e a versão pode ser aprovada como
final" — número que só existe no anexo de injeção e numa busca na web, ambos de papel
`conteudo_recebido`. Recusar a afirmação não conserta o texto que continua afirmando
aquilo, então o registro marca `estado_da_resposta: nao_entregavel` e diz o motivo. É a
diferença entre apontar o problema e deixar a entrega sair.

Preparar o adaptador para um traço de verdade achou um vazamento que os fixtures não
exercitavam: o registro imprimia a **entrada** de cada passo verbatim. Ferramenta real
recebe token, cabeçalho de autorização e senha como argumento, e aquilo ia direto para
o que se entrega. Agora o argumento passa pelo mesmo crivo da observação — a chave
fica, o valor sai, o original permanece só na captura crua — e isso está testado com
credencial no argumento.

O carregador também deixou de exigir um envelope específico, porque traço real não vem
em `{"messages": [...]}`: aceita mensagens sob chave conhecida, lista crua, e JSONL com
a mensagem embrulhada em evento, recolhendo `model` e `harness` quando aparecem soltos.
Traço sem mensagem nenhuma é recusado com código 2 e a mensagem diz quais chaves viu e
onde procurou. Catorze casos cobrem conversão e recusa.

A captura passou a guardar os dois lados: `traco.recebido` com os bytes que chegaram e
`traco.json` com o envelope normalizado. O `X3` confere a cadeia inteira, incluindo que
normalizar o recebido de novo reproduz o normalizado — se a normalização mudar, o
registro antigo acusa.

Por fim, o mesmo vazamento de destino que o lote documental tinha existia aqui: o
resultado da verificação era gravado dentro do repositório. Agora, captura de fora
tem resultado gravado ao lado dela. Rodei um traço inteiro no scratchpad para
conferir: 9 com evidência, 0 falhas, 2 não se aplicam, e `git status` sem entrada nova.

Diante de um traço novo faltava o primeiro passo, e ele não é adaptar: é reunir
evidência. `inspecionar.py` lista cada ferramenta e junta os fatos observáveis —
chamadas, chaves de argumento com tipos e tamanhos, bytes e linhas das saídas,
chamadas sem resultado, erros, se a mesma entrada deu a mesma saída, linhas com
aparência de instrução, rótulo de padrão de segredo em argumento ou saída — e não
propõe nada. O esqueleto de política sai com os campos vazios de propósito: política
em branco faz o adaptador recusar todo passo. Decidir se a saída de uma ferramenta
sustenta afirmação não se infere de nome de função.

Esse teste achou um bug de verdade: com a política em branco, todos os passos eram
recusados e o adaptador ainda saía com código 0, o que faria um script tratar como
sucesso uma captura onde nada era verificável. Agora passo recusado ou incompleto
derruba o código de saída.

O limite a repetir: não há modelo de linguagem em nenhuma das duas execuções. O traço
de exemplo foi escrito à mão. O que está testado é conversão, recusa e localização.

Esta parte também produziu dois defeitos meus, da mesma família do conflito entre I6 e
I3. O marcador de supressão de segredo ecoava o próprio padrão casado, reintroduzindo
no registro justamente o que suprimia; agora nomeia a classe sem reproduzir o literal.
E a verificação por reexecução contava listagem de pasta como "alvo não mais legível",
só porque o alvo não é arquivo, quando a listagem reexecuta perfeitamente.

## Os três eixos incorporados do contrato v3

Depois do parecer, os três ganhos reais do contrato avaliado entraram no nosso
`passos.jsonl`, com as correções que o parecer apontou.

**Hierarquia da recuperação (`X9`).** O passo `recuperar` declara candidatos e quais
foram fornecidos ao contexto. O bloco fornecido é localizado em bytes na observação e
tem de conferir byte a byte com o arquivo de origem — a primeira versão reconstruía o
bloco decodificando e rejuntando linhas, e falhava porque `write_text` no Windows grava
CRLF. Candidato descartado consta com motivo obrigatório, e o conteúdo do descartado
não pode aparecer na observação. Isso fecha o descarte silencioso: a busca achou a
fonte, o runtime não enviou, e sem registro ninguém saberia.

**Permissão por estágio (`X10`).** O oráculo emite, o runtime grava, o verificador
confere. Essa inversão é a correção central do parecer: quem emite token na hora de
conferir só vê o estado de agora, e reconferir o mesmo registro amanhã daria outro
resultado. Com o relógio avançando entre estágios, `usado_mas_suprimido` é alcançável
de verdade — no `plano-v3.json` a revogação de `anexo-D001` cai entre o T2 e o T3 do
passo P02, e a de `lote-L002` entre o T3 e o T4 do P04, produzindo também
`suprimido_na_exportacao`. Os dois estados que o código avaliado declarava e não
alcançava agora aparecem gravados. O verificador recalcula o `digest_permissao` a
partir do estado avaliado que o token carrega, exige id distinto por estágio,
`conferido_em` não decrescente e dentro da própria janela, e recusa afirmação apoiada
em passo suprimido.

**Digest e assinatura por registro (`X11`).** A forma canônica está definida em vez de
subentendida: chaves ordenadas recursivamente, sem espaço entre separadores, texto em
NFC, UTF-8, campos de digest e assinatura fora do que se hasheia, e campo nulo tratado
como ausente. Nove propriedades disso estão testadas, incluindo que duas ordens de
chave diferentes dão o mesmo digest. A assinatura é HMAC com chave local, e o registro
diz o que isso prova: que quem assinou detinha a chave, e nada além. Raiz de confiança
externa continua pendente, declarada como tal.

Treze mutantes novos cobrem os três eixos — bloco alterado, descarte sem motivo,
citação fora de bloco, descartado que entrou no contexto, `usado_mas_suprimido` com T3
permitindo, estado sem o token que ele implica, digest de permissão que não bate com o
estado, `conferido_em` retrocedendo, evento retroativo, afirmação apoiada em passo
suprimido, digest trocado, campo alterado depois de assinado e MAC trocado.

## O verificador foi testado por mutação

Quinze verificações que passam não dizem nada se nenhuma delas souber falhar.
`mutantes.py` introduz 19 defeitos, um por vez, em cópias do exemplar — afirmação
apagada do mapa, trecho citado que não existe na fonte, quitação declarada
compatível, pendência encerrada sem o documento, original a mais e a menos,
autorrevisão apresentada como revisão, exclusão declarada sem confirmação — e exige
que a verificação correspondente falhe. Os 19 foram detectados.

## O que estes números não são

A mutação cobre os defeitos que alguém pensou em escrever. Não cobre o resto.

As fontes são fictícias e foram escritas aqui. O exemplar, o verificador e os mutantes
têm o mesmo autor, então continua valendo o que o documento já dizia: isto não é
revisão independente.

`I2` decide se uma afirmação está **localizável** no que foi recebido, não se é
verdadeira. A checagem de negação que derruba o mutante M03 é heurística de redação:
reconhece "não anexado", "ausente", "sem" na linha citada. Implicação lógica entre
afirmação e fonte não está mecanizada, e a coluna de alcance do mapa continua sendo
julgamento do operador.

`I1` compara o que saiu com o que está em `fontes/`, na mesma máquina. No lote real,
quem compara é o cliente, com a cópia de referência dele; é por isso que o documento
pede que ele guarde a própria cópia. A soma em `somas.sha256` detecta diferença entre
cópias e nada além: o teste `T-SOMA` existe justamente para mostrar que substituir
arquivo e soma ao mesmo tempo não engana a comparação externa, mas engana quem só
confere a soma.

O tempo de montar e verificar este exemplar é de segundos e não diz nada sobre as seis
horas que o documento usa como limite de esforço do lote. O trabalho humano —
qualificar o pedido, escolher as afirmações com o cliente, abrir cada localização —
não foi medido.
