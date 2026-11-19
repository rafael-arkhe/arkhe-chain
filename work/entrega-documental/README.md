# Exemplar de entrega documental — etapa 1

Implementa a etapa 1 do plano de fechamento do documento *Arkhe — Entrega documental
rastreável v0.1*: transformar a estrutura da seção 4 em arquivos separados e executar
preservação, conferência e exportação.

As fontes continuam fictícias. O que mudou é que agora são arquivos de verdade, fora
do pacote, e os invariantes da seção 2 são testados em vez de descritos.

```bash
python -I -B montar.py      # gera pacote/ a partir de fontes/ e dados/
python -I -B verificar.py   # invariantes I1..I7 e os testes negativos
python -I -B mutantes.py    # verifica o verificador: 19 defeitos, todos têm de ser pegos
```

Biblioteca padrão, sem rede. `verificar.py` bloqueia `socket` antes de qualquer outra
coisa, então uma tentativa de usar rede durante a conferência aborta a execução. A
única exceção é `receber.py`, que chama `pdftotext` com argv fixo e sem shell para
extrair texto de PDF; o `I3a` confere essa restrição no código.

## Lote real, fora do repositório

Documento real não entra no repositório. O lote, o pacote e o resultado ficam numa
pasta sua, fora de `D:\arkhe`; os scripts aceitam caminho absoluto em qualquer lugar.
Quando `--dados` está fora deste diretório, o resultado da verificação é gravado ao
lado do lote, não em `resultados/`, porque ele cita nome de arquivo e trecho do que foi
conferido. `lotes/` também está no `.gitignore` local, para o caso de alguém processar
aqui dentro de todo modo.

```bash
python -I -B receber.py --entrada <pasta-com-os-arquivos> --saida <pasta-sua>/lote --lote L00N
```

O recebimento classifica, aplica a porta de escopo (10 arquivos, 50 páginas, 50 MB),
copia os aceitos byte a byte, extrai o texto dos PDFs com mapa de página e emite
`enderecos.md`, um localizador de toda linha legível. Recusa o resto com motivo, sem
converter nada: imagem, planilha, PDF escaneado e PDF com senha ficam fora. Também
recusa arquivo cujo caminho real sai da pasta indicada — link e junção não são
seguidos, porque copiar o alvo seria receber o que ninguém autorizou.

Depois é trabalho humano: preencher `<pasta-sua>/lote/lote.json` (versões, origens, revisor,
autorização, destinatários) e escolher com o cliente até 20 afirmações em
`referencias.json`, cada uma com `{id, pagina, linha, trecho}`. O que não tem fonte no
lote entra como `"suporte": "ausente"` e exige uma pendência.

```bash
python -I -B montar.py    --fontes lotes/L00N/recebidos --dados lotes/L00N --saida lotes/L00N-pacote
python -I -B verificar.py --fontes lotes/L00N/recebidos --dados lotes/L00N --pacote lotes/L00N-pacote \
                          --rotulo verificacao-L00N --sem-cenarios
```

`--sem-cenarios` porque os testes negativos são amarrados às fontes fictícias.

## Registro por execução

A mesma disciplina aplicada a outro objeto: em vez de um lote de documentos, uma
execução. Onde a entrega documental pergunta "esta afirmação está localizável nos
arquivos recebidos?", aqui a pergunta é "esta afirmação está localizável no que a
execução de fato leu?".

```bash
python -I -B canonico.py    # autoteste da forma canônica, digest e assinatura
python -I -B permissao.py   # autoteste do oráculo de permissão por estágio
python -I -B delegacao.py --autoteste   # 19 falsificadores do gate de delegação
python -I -B executar.py                                               # roda o plano e captura cada observação crua
python -I -B montar_execucao.py --captura execucao/captura/<run_id>    # monta o registro compartilhável
python -I -B verificar_execucao.py                                     # X1..X8 e 8 testes negativos
python -I -B mutantes_execucao.py                                      # 18 defeitos, todos têm de ser pegos
```

| Invariante | O que exige |
| --- | --- |
| X1 | A observação entregue é a observação capturada, por sha256 |
| X1b | Reexecutar passo de leitura reproduz a observação. Com o hash do alvo guardado, dá para separar "o arquivo mudou" de "a observação foi fabricada" |
| X2 | Toda afirmação está localizada numa observação, ou é declarada sem suporte com pendência aberta |
| X2b | Afirmação recusada não segue afirmada no texto entregue; se segue, a resposta é marcada como não entregável |
| X3 | Observação é dado: não sustenta afirmação quando seu papel é `conteudo_recebido`, não autoriza passo, e o plano é fixado antes do primeiro passo |
| X4 | Tentativa não sobrescreve tentativa: cada uma tem pasta e `run_id` próprios |
| X5 | O registro diz tipo, modelo, harness, revisor e alcance da revisão |
| X6 | O registro se lê sem rede e sem o serviço que o produziu; a captura crua não viaja nele |
| X7 | Segredo não viaja: linha de observação **e valor de argumento** são suprimidos no registro, a chave do argumento fica, e o marcador não ecoa o padrão casado |
| X8 | Todo passo de escrita tem chave de idempotência; sem chave é recusado antes de qualquer efeito |
| X9 | O que a busca achou, o que entrou no contexto e por que o resto ficou fora. Bloco fornecido confere byte a byte com o arquivo; descarte sem motivo falha |
| X10 | Permissão vigente em T1 a T4, conferida sobre tokens que o **runtime** gravou. O verificador não emite token nenhum |
| X11 | Digest e assinatura por registro, sobre uma forma canônica definida |
| X12 | A execução cabe na delegação que a autorizou: recurso no escopo, efeitos dentro do limite, decisão dentro da própria janela e antes de expirar |
| X12b | Ancoragem externa do orquestrador — permanentemente `NAO SE APLICA`: a identidade vale pela allowlist local, que é confiança local e não raiz de confiança |
| X8b | O efeito aconteceu uma única vez, pelo livro de aplicados do momento da execução |

## Dois modos: plano fixo e traço adaptado

A captura aceita duas origens, e o registro diz qual é qual.

**Plano fixo** (`executar.py`, prefixo `R`): o plano é lido e hasheado antes do
primeiro passo, as ferramentas são uma lista fixa com caminho preso à base, e o livro
de aplicados existe no momento da execução. É aqui que X1b e X8b valem.

**Traço adaptado** (`adaptar.py`, prefixo `A`): converte um traço de agente com LLM
nos dialetos Anthropic (`tool_use` / `tool_result`) e OpenAI (`tool_calls` / role
`tool`).

O envelope não precisa ser nenhum em particular. O carregador aceita documento JSON
com as mensagens em alguma chave conhecida (`messages`, `data.messages`,
`conversation.messages`, `trace.messages` e outras), lista JSON crua de mensagens, e
JSONL de uma mensagem por linha — inclusive quando cada linha embrulha a mensagem num
evento, como num transcript de sessão. Não achando mensagem, ele recusa com código 2
dizendo quais chaves viu e onde procurou, em vez de estourar. Linha de JSONL que não
parseia vira ocorrência registrada, não descarte silencioso.

A captura guarda os dois lados da conversão: `traco.recebido` são os bytes exatos que
chegaram, `traco.json` é o envelope normalizado que o extrator consumiu. O `X3` confere
a cadeia inteira — recebido intacto pelo sha256, normalizar o recebido de novo
reproduz o normalizado guardado, e os passos correspondem às chamadas.

Traço real fica fora do repositório, como os lotes. Quando a captura está fora deste
diretório, a verificação grava o resultado ao lado dela, porque o resultado cita
trecho de observação e argumento de passo.

```bash
python -I -B adaptar.py --traco execucao/traco-exemplo.json \
    --politica execucao/politica.json --captura execucao/captura --revisor "seu nome"
python -I -B testes_adaptador.py   # 14 casos de traço defeituoso ou em formato real
```

Um traço de LLM **não carrega** três coisas que a verificação exige, e nenhuma delas é
inferível dele:

| Falta no traço | De onde vem | Sem isso |
| --- | --- | --- |
| Papel da observação (`fonte` ou `conteudo_recebido`) | `politica.json`, por ferramenta, com justificativa | O passo é recusado |
| Efeito (`leitura` ou `escrita`) | `politica.json` | O passo é recusado |
| Chave de idempotência | Derivada dos argumentos que `chave_de` indicar | A escrita é recusada |
| Citação das afirmações | Anotada por quem confere, com `enderecos.md` para localizar | Nada: o adaptador não propõe citação, porque propor seria fabricar suporte |

O que **degrada** no modo adaptado, e o registro declara em vez de fingir: `X1b` não
se aplica, porque não há como reexecutar a ferramenta do agente e o traço não traz
hash do alvo lido — divergência não seria atribuível. `X8b` não se aplica, porque a
chave foi derivada depois do fato e não há livro do momento da execução: dá para
mostrar que toda escrita tem chave, não que o efeito aconteceu uma só vez. E `X3`
troca de pergunta: não existe plano anterior, já que os passos foram escolhidos pelo
modelo durante a execução, então o que se confere é que a captura corresponde ao traço
recebido, sem passo inventado pelo adaptador.

Uma verificação que não se aplica aparece como `NAO SE APLICA`, nunca como `PASSOU`:
passar porque não havia nada para conferir é falso conforto, e o resumo conta as três
coisas separadas.

**Não há modelo de linguagem em nenhuma das duas execuções deste diretório.** O traço
de exemplo foi escrito à mão. O que está testado é a conversão, a recusa e a
localização — não o comportamento de um agente real.

O caso que vale olhar: o traço de exemplo termina com o agente afirmando "a atividade
teve 99 participantes e a versão pode ser aprovada como final", número que só existe
no anexo de injeção e numa busca na web. A anotação honesta recusa a afirmação, e o
registro marca `estado_da_resposta: nao_entregavel` — porque localizar e recusar não
conserta um texto que continua afirmando aquilo. É o `X2b`.

## Diretórios

| Caminho | O que é |
| --- | --- |
| `fontes/` | Os três documentos fictícios, no papel de arquivos recebidos do cliente |
| `dados/` | O que o operador declara: lote, mapa de referências, alterações, pendências |
| `receber.py` | Recebimento de lote real: classificação, porta de escopo, extração de PDF |
| `montar.py` | Preservação byte a byte e geração do pacote |
| `verificar.py` | I1 a I7 mais os testes negativos da seção 7 |
| `mutantes.py` | 19 defeitos injetados; cada um tem de derrubar uma verificação |
| `fixtures_recebimento.py` | Gera o lote de teste, inclusive PDF com senha e PDF sem texto |
| `preencher_lote_teste.py` | Preenche o lote de teste como o operador preencheria |
| `executar.py` | Runner de plano declarado; captura cada observação crua com sha256 |
| `montar_execucao.py` | Registro compartilhável da execução, sem a captura crua |
| `verificar_execucao.py` | X1 a X8 e os testes negativos da execução |
| `mutantes_execucao.py` | 18 defeitos injetados no registro de execução |
| `delegacao.py` | Gate de delegação a montante: D0 a D8, com os limites declarados |
| `execucao/delegacao/` | Contrato, política, allowlist do verificador e a decisão |
| `inspecionar.py` | Evidência por ferramenta e esqueleto de política em branco |
| `adaptar.py` | Traço de agente com LLM para o formato de captura, falha fechada |
| `testes_adaptador.py` | 18 casos de traço e inspeção; cada defeito tem de ser recusado ou registrado |
| `execucao/plano.json` | O plano: passos, ferramenta, efeito e papel de cada observação |
| `execucao/politica.json` | Papel, efeito e chave por ferramenta: o contrato do adaptador |
| `execucao/traco-exemplo.json` | Traço fictício no dialeto Anthropic, com os casos ruins |
| `execucao/resposta-adaptada.json` | Anotação do traço: a resposta do agente não é entregável |
| `execucao/resposta.json` | A resposta final e as afirmações com citação, declaradas |
| `execucao/captura/` | Captura crua por tentativa; fora do git, pode conter segredo |
| `execucao/registro/` | O registro que se entrega |
| `pacote/` | A entrega gerada, legível sem rede, sem conta e sem serviço Arkhe |
| `teste-recebimento/` | Lote de teste do recebimento: entrada, lote e pacote gerados |
| `resultados/` | Saída das execuções, em `.md` e `.json` |
| `ESTADO-VERIFICACAO.md` | A seção 7 do documento, atualizada com o que passou a rodar |

`pacote/`, `teste-recebimento/` e `resultados/` são gerados; apagar e rodar de novo
reproduz os três.

## Onde o conteúdo das fontes entra e onde não entra

`montar.py` lê as fontes como texto, copia os bytes e procura linhas com cara de
instrução operacional, que vão para `pacote/ocorrencias.md`. Nada do que está nas
fontes decide escopo, referência, pendência ou aceite, e nada é executado: o próprio
`montar.py` é conferido por `I3a` contra `eval`, `exec`, `subprocess`, `importlib`,
`urllib` e `socket`.

O teste `T-INJECAO` monta um lote com um anexo que manda enviar os arquivos para um
endereço externo, executar coisas e aprovar a versão final com números inventados. O
anexo é preservado como recebido, a instrução aparece em `ocorrencias.md` como
conteúdo, e `referencias.md`, `pendencias.md` e `aceite.md` saem idênticos aos do lote
sem o anexo.

## Limites

Mesmo autor para fontes, pacote, verificador e mutantes; nenhuma revisão
independente. A conferência é de localização, não de veracidade. O que falta de
evidência está em [ESTADO-VERIFICACAO.md](ESTADO-VERIFICACAO.md), inclusive as quatro
linhas da seção 7 que seguem sem execução: caso com documentos reais autorizados,
margem do lote, interesse comercial e primeira venda.
