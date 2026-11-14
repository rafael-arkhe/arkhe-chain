# corvo-arkhe — memória, raciocínio e personalidade destilados do corpus

Pipeline determinístico que transforma `memory.md` — 490.633 mensagens de chat
escritas pelo Corvo, uma por linha, sem autor e sem timestamp — em três
artefatos que um agente carrega: **memória recuperável com procedência**,
**perfil de raciocínio medido** e **persona em dois modos**.

A memória sai atestada num WormGraph append-only, no formato do scaffold
`arkhe-consciousness`: `agent_identity = blake3(histórico)`. A identidade do
agente *é* o hash da memória dele.

```
agent_identity : 5f5ca821c84ffb83fd0b0597a15ade93ac9ba5a794351f597e03c02e60700141
mmr_root       : 7a9a072186fc1ae75df783ad465939d6a4b97817ab1da5c36624e6556f7bf055
nós            : 6.924  (Allow 3.755 / Reject 3.169)
```

## Isto não é treino

Você pediu pra "treinar". Nada aqui ajusta peso de modelo. O que o pipeline
faz é **destilação**: extrai afirmações, mede estilo, e escreve contexto que
qualquer LLM carrega no prompt. A diferença importa por dois motivos práticos:

- **Reversível e auditável.** Cada afirmação sobre ele aponta a linha do
  corpus que a sustenta. Fine-tuning dissolveria isso em pesos; aqui você
  consegue perguntar "por que você disse isso?" e receber `L490623`.
- **Editável.** Corrigir um fato é editar um átomo e rodar de novo, não
  retreinar.

Se o objetivo for mesmo gerar peso de modelo, o estágio que falta é um
`06_dataset.py` que vire `out/corpus/normalized.jsonl` em pares de treino.
Não foi construído.

## O que o corpus é, e o que não é

| | |
|:--|:--|
| linhas cruas | 490.633 |
| linhas de sinal | 278.854 (56,8%) |
| descartadas | 131.274 curtas · 68.158 emote/risada · 9.364 comandos · 2.428 só URL |
| primeira pessoa | 46.954 |
| átomos admitidos | 3.755 (3.567 públicos + 188 restritos) |

**É a voz social dele.** Chat ao vivo, entre amigos, em 14 canais de Twitch. O
tópico `tech_dev` aparece em 372 de 278.854 linhas — 0,13%. Qualquer coisa que
este pack diga sobre como ele escreve código, documento técnico ou proposta é
extrapolação, não medição. Isso está escrito dentro dos dois modos de persona,
não só aqui.

## Os três artefatos

### 1. Memória — `out/memory/`

Um **átomo** é uma afirmação que ele fez sobre si mesmo, deduplicada, com a
lista de linhas que a sustentam. Dez tipos: `identity`, `project`, `analysis`,
`relationship`, `biography`, `skill`, `preference`, `practice`, `belief`,
`state`.

Passa por um **gate de admissão** fail-closed, com a semântica do
`ContainmentGate` do scaffold: nove checagens sequenciais, cada uma capaz de
rejeitar sozinha. O átomo rejeitado **não desaparece** — fica no arquivo com
`verdict: "Reject"` e o motivo, porque a identidade só é auditável se o
histórico for completo.

```
roleplay_not_selfreport           23   /me do Twitch: ele faz piada em 3ª pessoa
quotation_not_own_claim           41   a linha é citação entre aspas
news_or_policy_register            5   matéria de jornal / output de LLM colado
long_without_idiolect_marker       2   linha longa sem nenhuma marca de voz dele
not_portuguese_likely_pasted       —   blurb em inglês colado
insufficient_content_words     1.951
claim_too_short                  452
below_min_salience               598
interrogative_not_claim           95   pergunta não é afirmação
```

**Camada restrita** (`atoms.restricted.jsonl`, 188 átomos): finanças pessoais,
saúde, questão jurídica, conflito familiar, intimidade, substâncias. A regra de
roteamento é `categoria sensível E auto-relato de 1ª pessoa` — menção genérica
("depressão é sério") fica no tier público, pra não esvaziar a memória por
excesso de filtro. **Não carrega por default.**

### 2. Raciocínio — `out/reasoning/profile.md`

Marcador explícito de raciocínio aparece em **6,2%** das linhas — o corpus é
conversa casual. Mas no subconjunto em que ele argumenta, **44%** das linhas
carregam modalidade (`acho que`, `parece`, `deve ser`, `capaz que`, `será
que`), mais que o dobro do segundo colocado (encadeamento causal, 21%). Ele
declara ignorância abertamente 546 vezes.

Operacionalmente: **ele não evita afirmar, evita afirmar liso.**

O arquivo traz os 15 movimentos ranqueados, os pares que andam juntos, como o
raciocínio muda por domínio, e exemplares reais com número de linha.

### 3. Personalidade — `out/persona/`

Dois modos sobre a mesma memória:

- **`mode-mirror.md`** — Arkhe escreve como ele. O idioleto é regra de
  produção.
- **`mode-advisor.md`** — Arkhe tem voz própria e o idioleto é conhecimento
  *sobre* o usuário, nunca imitado de volta. O que herda dele é o raciocínio,
  não a dicção.

As regras do modo espelho são taxas medidas, não impressões. As quatro que mais
entregam uma imitação ruim:

| | medido |
|:--|--:|
| começa mensagem com maiúscula | **23,6%** |
| termina com `.` `!` ou `?` | **8,2%** |
| mantém acento em `não` / `é` | **99,6% / 100%** |
| mediana de caracteres por mensagem | **31** |

A terceira é contraintuitiva e é a que mais importa: ele abrevia tudo (`pq` em
97,7%, `pra` em 95,3%, `tá` em 96,6%) **e ainda assim nunca tira acento**. Um
modelo imitando "português de internet" escreve `nao`, `eh`, `ja` — e soa como
outra pessoa na primeira linha.

### Avaliação do modo espelho — `eval/`

Distância de estilo até uma amostra real **held-out** (120 linhas que o
pipeline nunca expôs), em 15 dimensões ponderadas. 0 = idêntico.

| braço | distância | |
|:--|--:|:--|
| `real_full` | **0,0522** | piso: a distância da própria escrita dele quando a amostragem muda |
| `mirror_v2` | **0,0336** | seguindo a especificação **corrigida** |
| `mirror` | **0,1281** | seguindo a especificação original, só o documento |
| `naive` | **0,5011** | sem especificação, "português informal brasileiro" genérico |

O achado que mudou o deliverable: a primeira versão errou por **excesso**.
`num` em 100% das negações quando o real é 27,8%, `q` em 95,7% dos *que*
quando o real é 71,4%, o dobro de marcadores por linha. Vocabulário certo,
proporções erradas — o documento listava frequências e um LLM leu lista de
marcadores como menu a esvaziar. `mode-mirror.md` agora tem uma seção
**Calibragem** com os alvos explícitos, e o braço corrigido cai dentro do
ruído de amostragem.

Isso mede **conformidade à especificação**, que é verificável por máquina.
Não mede indistinguibilidade: ritmo, assunto e timing de piada não entram em
nenhuma das 15 dimensões, e eu escrevi a especificação, os braços e o harness
— não posso ser juiz cego do meu próprio texto. Essa perna é um teste cego de
60 itens:

```bash
python -I eval/make_blind_test.py
python -I eval/score_blind.py "RGGRG..."
```

`exemplars.jsonl` traz 154 falas reais classificadas por função (analogia,
hedge, ignorância, tese, prático, técnico, político, música, afeto, humor,
bit em 3ª pessoa), espalhadas pelas dez épocas do corpus.

## Uso

```bash
python -I pipeline/run_all.py D:/arkhe/memory.md out
```

```bash
python -I loader/corvo_memory.py recall "transparencia contrato publico" --k 6
python -I loader/corvo_memory.py persona mirror
python -I loader/corvo_memory.py exemplars --funcao analogia
python -I loader/corvo_memory.py verify
python -I tests/test_integrity.py
```

Como biblioteca:

```python
from corvo_memory import CorvoMemory

m = CorvoMemory("out")
for hit in m.recall("auditoria de modelo de IA", k=5):
    print(hit["claim"], "->", hit["support"])   # L487251

system_prompt = m.persona("advisor")            # ou "mirror"
assert m.verify()["ok"]
```

O tier restrito exige decisão explícita por chamada:

```python
m.recall("...", tiers=("public", "restricted"))
```

## Atestação

Um nó de WormGraph por átomo, encadeado (`parent_ids` aponta o anterior), na
ordem canônica `(primeira linha de suporte, atom_id)`. Determinístico: mesma
entrada, mesmo `agent_identity`.

Os átomos sensíveis **entram** no grafo — senão a identidade não cobriria a
memória inteira — mas o `content` deles carrega só
`restricted:<blake3(claim)>`. Compromisso criptográfico sem divulgação: o
`ovb.json` pode ir pra um terceiro sem vazar o tier sensível, e ainda assim
prova que aqueles átomos existiam e não foram trocados.

### Uma divergência deliberada do scaffold

No `WormNode.build` original, `content` **não entra** no hash do `node_id`. Como
`mmr_root` é o hash da concatenação dos `node_id`, e `trust_root_id` deriva do
`mmr_root`, o conteúdo fica fora da cadeia de compromisso. Em DryRun isso é
explorável: troca-se o texto de um nó, recalcula-se o `agent_identity` — que
qualquer um recalcula — e o bundle volta a verificar, porque `mmr_root` e
`trust_root_id` não mudaram.

Aqui `state_id = blake3(content)`, e `state_id` está dentro do `node_id`. O
conteúdo passa a estar dentro do `mmr_root` e do `trust_root_id`, e a checagem
fica feita sem dado externo. `tests/test_integrity.py`, violação 6, é a
demonstração.

O teste vai além e monta uma **forja completa** (violação 8), recomputando tudo
em cascata — e ela **passa** na verificação offline. Isso não é bug: é o limite
do DryRun, onde o `trust_root` deriva do próprio bundle e portanto se
auto-avaliza. Autenticidade exige Rekor real, com o `agent_identity` publicado
antes por quem não é o criador. Ver `honesty-note.md`, item 10.

## Estrutura

```
pipeline/
  patterns.py     padrões empíricos: ruído, procedência, tópico, sensível,
                  movimento de raciocínio, idioleto, tokenizador canônico
  normalize.py    passagem 1 — classifica as 490k linhas, anota o que sobra
  atoms.py        passagem 2 — destila átomos, aplica o gate de admissão
  lexicon.py      passagem 3 — mede o idioleto (ortografia, reduções, n-gramas)
  reasoning.py    passagem 4 — extrai o perfil de raciocínio
  persona.py      passagem 5 — monta os dois modos + banco de exemplares
  attest.py       passagem 6 — WormGraph, MMR, OVB, MANIFEST
  run_all.py      orquestra as seis, em ordem
loader/
  corvo_memory.py API de recuperação + CLI
eval/
  metrics.py          mede qualquer texto nas dimensões do lexicon
  sample_real.py      amostra held-out, excluindo o que o pipeline expôs
  run_eval.py         compara os braços, escreve report.md + scores.json
  make_blind_test.py  monta o teste cego (gabarito em arquivo separado)
  score_blind.py      corrige e reporta a faixa de indistinguibilidade
  arms/               real_full, real_band, real_blind, mirror, mirror_v2, naive
tests/
  test_integrity.py  30 checagens, 8 violações
out/                 gerado; MANIFEST.sha256 cobre tudo
```

## Limites

Leia `honesty-note.md` antes de usar isto pra qualquer coisa que importe. Em
resumo, o que **não** está provado:

- Que toda linha do corpus foi escrita por ele (há colagem de terceiro; o
  export não tem campo de autor).
- Que o persona pack faz um LLM **soar** como ele. Que o texto gerado conforma
  às taxas medidas, isso está provado (`eval/report.md`). Que soa como ele,
  não: o teste cego está montado e não foi respondido.
- Qualquer coisa sobre a voz técnica ou profissional dele.
- Calibração: não há oráculo, então `calibration_summary.samples = 0` de
  propósito, em vez de um número inventado a partir da salience.
- Precisão e recall dos extratores: não existe conjunto anotado.
