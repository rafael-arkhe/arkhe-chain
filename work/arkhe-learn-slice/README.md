# arkhe-learn-slice — o gerador de exercícios funciona?

Fatia vertical para responder duas perguntas, antes de desenhar produto:

1. **Mutação automática produz exercício que um humano julga em 15 segundos
   numa tela de celular?** Se não, o Duolingo de vibe coding verificado não
   existe, independente de persona, design ou escopo.
2. **O veredito de cada exercício é o mesmo em toda execução?** Sem isso o
   progresso do aluno não é atestável, e atestação é o diferencial.

Respostas: **sim** e **sim**, a segunda só depois de achar um bug que estava
corrompendo os números da primeira.

## Correção: o agi-coder não tem o gerador

Eu disse antes que `agi-coder-verification` já era o gerador de exercícios.
Está errado — eu tinha lido assinaturas de função e inferido um motor que não
existe. O que o crate tem de fato:

- `Specification { requirement, author, cases: Vec<Case> }` com
  `Case { input: i64, expected: i64 }` — **só funções de um inteiro para um
  inteiro**. Nenhuma função de exercício real cabe nisso. Generalizar `Case`
  para `{args: [...], expected: ...}` é pré-requisito.
- `SpecificationVerifier::verify(spec, author, baseline, mutants)` — grada
  mutantes **que o chamador entrega**, conta killed/survived e dá nota em
  basis points. Isso é a **bancada de correção**, e é boa.
- `mutation.rs` tem os *tipos* `Mutant` e `MutationReport`, e nenhuma função
  que produza mutante. Os únicos mutantes do repositório são closures escritas
  à mão em `agi-coder-tests`: `let plus = |x: i64| Ok(x + 2);`
- `process.rs` roda um `TestCommand` externo com timeout contra snapshots
  preparados pelo chamador. É a peça certa para a história multi-linguagem,
  mas os mutantes continuam vindo de fora — e o timeout dele não serve de
  veredito, pelo motivo da seção "Determinismo" abaixo.

O próprio `lib.rs` diz: *"finite-domain engine, not an automatic
natural-language test generator"*. O crate nunca prometeu o gerador; eu
projetei nele o que queria encontrar.

## O que esta fatia construiu

| arquivo | o que faz |
|:--|:--|
| `mutate.py` | motor de mutação sobre AST de Python, 10 classes de operador |
| `specs.py` | 8 funções semente com casos, escolhidas por caber na tela |
| `runner.py` | executa contando linhas, com orçamento determinístico |
| `grade.py` | orquestra o runner; orçamento é veredito, timeout é rede |
| `fuzz.py` | oráculo diferencial: separa mutante equivalente de spec fraca |
| `run_slice.py` | spec → mutantes → classificação → fingerprint |
| `check_determinism.py` | roda a fatia n vezes e compara os fingerprints |
| `mmr.py` | MMR binário com prova de inclusão logarítmica |
| `attest_progress.py` | sessão → WormGraph + MMR + OVB, com calibração real |
| `test_attest.py` | 25 checagens, 7 violações da credencial |

Cada mutação altera exatamente um nó da AST, ou remove exatamente um
statement. Diff localizado por construção. Baseline e mutante passam os dois
por `ast.unparse`, então a única diferença entre os textos é a mutação, não a
formatação.

## Resultado

```
mutantes gerados               : 149   (de 8 funções)
  erro de valor                : 127
  estourou o orçamento         : 7
  sobreviveram à spec          : 15
    -> spec fraca (exercício)  : 1
    -> equivalente (descartado): 14    (93% dos sobreviventes)
  infraestrutura (não veredito): 0

exercícios LEGÍVEIS            : 101 de 135 (75%)
  'ache o bug'                 : 94
  'nunca termina'              : 6
  'spec fraca'                 : 1
legíveis por spec              : 12.6
baselines que cabem na tela    : 8/8
FINGERPRINT                    : 6756133373ef64e6...
```

Critérios de legibilidade, todos objetivos e verificados por máquina:
≤ 12 linhas e ≤ 48 caracteres de largura (375 px), diff ≤ 2 linhas, e o menor
caso falho com tamanho de entrada ≤ 12. O último é o que importa: um mutante
que só falha com `n=997` não é exercício de celular; um que falha com lista
vazia é.

Exemplo real, da categoria mais limpa — 11 linhas, diff de 1 linha,
contraexemplo de tamanho 1:

```python
def binary_search(xs, t):
    lo = 0
    hi = len(xs) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if xs[mid] == t:
            return mid
        if xs[mid] < t:
            lo = mid + 1
        else:
            hi = mid - 1
```

Falta o `return -1`. Com `xs=[]` devolve `None` em vez de `-1`.

## Determinismo

O veredito saiu do relógio. `subprocess.timeout` virou rede de segurança; quem
decide é **orçamento de linhas executadas**, contado em `runner.py` via
`sys.settrace`. Para o mesmo código e a mesma entrada o número é idêntico em
qualquer máquina, então é atestável. O orçamento é derivado do baseline
(`custo × 50`, com piso de 2.000) e entra no registro do exercício — nestas
8 specs o baseline gasta 3 a 24 linhas, então o piso é que vale.

Ganho de lado: mutante que entra em loop infinito deixou de ser timeout
descartado e passou a ter veredito próprio, `nunca_termina` — 7 deles, 6
legíveis. É exercício de outro tipo: "por que isso não termina?".

**O que o teste de determinismo achou foi outra coisa, pior.** Com o
orçamento no lugar, quatro execuções ainda davam quatro fingerprints
diferentes, e os mutantes migravam entre "morto por valor" e "sobreviveu". A
causa não era o relógio: eu escrevia todo candidato no mesmo `cand.py`, e o
cache de bytecode do Python valida o `.pyc` por `(mtime, tamanho)` da fonte.
Mutantes da mesma spec têm quase o mesmo tamanho e eram escritos dentro do
mesmo tique de mtime — então **o segundo mutante rodava o bytecode do
primeiro**. O veredito dependia do timing do disco.

Corrigido com nome de arquivo por hash do conteúdo e `-B` (sem cache). Depois
disso:

```
run 1..4: 6756133373ef64e6...  valor=127 orcam=7 surv=15 fraca=1 equiv=14
fingerprints idênticos : True
```

Consequência que vale registrar: **as contagens que eu reportei antes estavam
infladas.** Mutantes rodando código de outros mutantes morriam pelo motivo
errado — eu havia dito 133 a 138 mortos por valor, e o número real é 127. O
bug tornava o kill count otimista e o equivalente subestimado.

Isso não prova determinismo entre máquinas nem entre versões de Python: a
contagem de linhas depende do que o compilador de bytecode emite, e isso pode
mudar numa release. O orçamento e a versão do Python precisam entrar no digest
junto com a spec.

## A ressalva que quase estragou tudo

Quando um mutante passa em todos os casos da spec, há duas causas e elas
ensinam coisas **opostas**:

- **equivalente** — mesmo comportamento para toda entrada. `clamp` com
  `n <= lo` em vez de `n < lo`: quando `n == lo`, devolver `lo` ou `n` dá o
  mesmo valor. Apresentar isso como bug ensinaria algo falso.
- **spec fraca** — genuinamente diferente, e a spec não tem caso que pegue.
  `clamp` com `return 0` em vez de `return lo` passa porque **todos os casos
  usam `lo=0`**. É o melhor exercício do conjunto.

Sem separar os dois, 93% do que eu ia apresentar como "passa nos testes e
ainda está errado" era mutante equivalente. O `fuzz.py` separa rodando
baseline e mutante sobre 300 entradas aleatórias: se discordarem uma vez é
spec fraca, e **a entrada discordante é o caso de teste que faltava** — que
vira por si um segundo exercício, "escreva o teste que pega isto".

Equivalência de programas é indecidível, então isso é amostragem, não prova.
Erra para o lado seguro: descarta exercício bom em vez de ensinar errado.

## O dial de dificuldade

O tipo "spec fraca" depende de a spec ser fraca. Cortando o número de casos,
mesmo motor e mesmas 8 funções:

| casos na spec | valor | hang | sobrev. | spec fraca | equiv. | legíveis "fraca" | legíveis total |
|--:|--:|--:|--:|--:|--:|--:|--:|
| 1 | 81 | 3 | 65 | 51 | 14 | **42** | 96 |
| 2 | 105 | 4 | 40 | 26 | 14 | 23 | 98 |
| 3 | 118 | 6 | 25 | 11 | 14 | 10 | 97 |
| 4 | 126 | 7 | 16 | 2 | 14 | 2 | 100 |
| todos (5–6) | 127 | 7 | 15 | 1 | 14 | 1 | 101 |

Duas leituras, e a segunda é a interessante:

1. O número de casos **é** o controle de dificuldade. Começa com spec de 1
   caso, onde quase tudo sobrevive e a lição é "o teste passou e o código está
   errado"; vai adicionando casos conforme o aluno sobe.
2. **O total de exercícios legíveis quase não muda** — 96 a 101 em todas as
   faixas. O que muda é o *mix*: de 42 exercícios de "teste fraco" com 1 caso
   para 1 com a spec cheia, compensado por "ache o bug". Então o dial não
   mexe no volume de conteúdo, mexe no que o conteúdo ensina.

A contagem de equivalentes fica em **exatamente 14** nas cinco faixas. Tinha
que ser: equivalência é propriedade do código, não do conjunto de testes. É
um teste de validade interna do filtro de fuzz, e ele passou.

## Atestação do progresso

`attest_progress.py` transforma uma sessão de estudo em WormGraph encadeado +
MMR + OVB, na mesma semântica de `cognition/corvo-arkhe/pipeline/attest.py`.
Com duas diferenças que importam.

**A calibração é medida, não zerada.** Na memória do Corvo eu deixei
`calibration_summary.samples = 0` de propósito, porque calibração exige
oráculo e lá o único dado era o próprio corpus. Aqui o oráculo existe: é o
veredito determinístico. Então o OVB carrega números de verdade — e eles são
a métrica pedagógica do produto, não enfeite. A habilidade que se treina em
vibe coding verificado não é acertar, é a confiança bater com o que a
verificação provou.

Sessão simulada de 80 tentativas sobre o banco real de 109 itens:

```
acertos 64 / erros 16
  falso aprovado  : 10   <- o erro perigoso: aprovou código quebrado
  falso rejeitado : 6

confiança média    : 0.8775
acurácia observada : 0.8000
gap médio          : 0.0775
ECE                : 0.1575
  conf 0.7  n=24  acurácia=0.83  gap=0.13
  conf 0.9  n=26  acurácia=0.69  gap=0.21
  conf 1.0  n=30  acurácia=0.87  gap=0.13
```

Esse resultado mostra por que ECE é a métrica e gap médio não é: na média o
aluno parece quase calibrado (0,0775), mas por bucket erra 0,21. A média
cancela excesso com falta de confiança; o ECE não.

**O banco de itens precisa de código correto.** Se fosse só mutante, a
resposta certa seria sempre "rejeito" e o exercício não mediria julgamento
nenhum. O banco é 8 baselines corretos + 101 mutantes legíveis, e a sessão
amostra balanceado.

### Commit-reveal

A resposta e a confiança são **comprometidas antes** de o aluno ver o
veredito: `commit = blake3(nonce|resposta|confiança)` entra no `intent_id`,
que entra no `node_id`, que entra no `mmr_root`. Sem isso a calibração não
vale nada — bastaria ajustar a confiança depois de saber o resultado. Com o
commitment amarrado na cadeia, inflar a confiança a posteriori quebra a
verificação em três lugares ao mesmo tempo.

### MMR com prova de inclusão

O `Mmr` do scaffold usa `blake3(concat(leaves))`, que detecta alteração mas
não produz prova de inclusão — provar uma tentativa exigiria revelar o
histórico inteiro. Para credencial isso não serve, então `mmr.py` é um MMR
binário de verdade, com bagging dos peaks da direita para a esquerda.

Resultado: **6 hashes provam uma tentativa entre 48**, sem revelar o conteúdo
de nenhuma outra. Verificado exaustivamente para n = 1..40 (820 provas, zero
falhas, leaf forjado rejeitado).

### O que `test_attest.py` cobre

25 checagens, 7 violações. As que importam:

| violação | o que denuncia |
|:--|:--|
| inflar a confiança depois do veredito | `intent_id` não bate com o commit recomputado |
| promover um erro a acerto | `node_id` não recomputa |
| apagar uma tentativa ruim | cadeia de pais quebra |
| reordenar o histórico | identidade muda |
| forjar o `trust_root` | INV-CONSCIOUSNESS-04 |
| mexer no array `attempts` | deixa de bater com os nós da cadeia |
| forja completa em cascata | **passa offline** — ver abaixo |

A última é o mesmo limite do corvo-arkhe e não é falha de código: em DryRun o
`trust_root` deriva do próprio bundle, então se auto-avaliza. Para a
credencial valer para terceiro, o `agent_identity` tem de ser publicado num
log de transparência no fim da sessão, por quem não é o aluno. Essa é a peça
que falta, e é de infraestrutura, não de design.

### A sessão é simulada

Não existe aluno. A sessão vem de um `StudentModel` com habilidade e excesso
de confiança explícitos, e com um detalhe deliberado: a confiança é ancorada
na facilidade **percebida** do tipo de exercício, não na real. `spec_fraca`
é o caso crítico — o código passa em todos os testes, então parece fácil
(percepção 0,78) e o aluno acerta 42%. A distância entre percepção e
habilidade é justamente o que o ECE captura.

Os números de calibração são mecanicamente corretos dada a simulação. Eles
demonstram que o pipeline mede, não que algum humano tenha esses números.

## Custos que só apareceram depois de medir

1. **Por linguagem**: operadores de mutação sobre a AST daquela linguagem, mais
   um runner com contagem de passos. Python deu ~250 linhas porque `ast`,
   `ast.unparse` e `sys.settrace` vêm na biblioteca padrão. Linguagem compilada
   paga build por mutante, e o contador de passos tem de vir de outro lugar
   (instrumentação de bytecode, `perf`, ou um intérprete próprio) — é aí que a
   conta fica salgada.
2. **Por spec**: um gerador de entradas para o oráculo diferencial, ~8 linhas
   cada. É o custo de autoria escondido. Sem ele não há como separar
   equivalente de spec fraca, e aí 93% dos sobreviventes é lixo pedagógico.
3. **Sandbox**: não construído. O orçamento de passos **não é barreira de
   segurança** — código que chama `sys.settrace(None)` escapa do contador, e
   um `except:` pelado engole o sinal (por isso `BudgetExceeded` herda de
   `BaseException`). Código de aluno exige container sem rede, sem FS e com
   limite de memória.

## Pendências

- Nenhum exercício foi julgado por humano. Os 75% são conformidade a três
  critérios que eu escolhi; que o critério case com "julgável em 15 segundos"
  é conjectura minha, não medição.
- Falta o log de transparência. A atestação está ligada e a verificação
  offline prova consistência interna, mas enquanto o `trust_root` for DryRun
  a credencial se auto-avaliza (violação 7). Publicar o `agent_identity` no
  fim da sessão é infraestrutura, não design.
- Determinismo entre máquinas e entre versões de Python não foi testado.
- O digest da spec aqui usa domínio próprio (`ARKHE/LEARN/SPEC/v1` sobre JSON
  canônico). **Não é byte-compatível** com `Specification::digest()` do
  agi-coder, que usa CBOR canônico sob `AGI/SPEC/v1`. Unificar os dois é
  pré-requisito para a credencial ser verificável pelo verificador dele.
- A persona não está conectada. Ver `cognition/corvo-arkhe/`: o corpus tem 21
  átomos de `tech_dev`, então ela entra como parceira de estudo, não como
  professora.

## Rodar

```bash
python -I run_slice.py
```

```bash
python -I check_determinism.py 4
```

```bash
python -I attest_progress.py 80
```

```bash
python -I test_attest.py
```
