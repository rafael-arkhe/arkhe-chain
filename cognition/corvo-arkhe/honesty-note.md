# Honesty Note (τ) — corvo-arkhe

O que este pipeline **prova** e o que ele **não prova**, na mesma convenção τ
usada no `arkhe-consciousness`. A honestidade sobre o que não está provado é
parte da accountability, não uma fraqueza.

## Tabela τ

| # | Afirmação | τ | Justificação / Nota |
|:--|:--|:--|:--|
| 1 | O corpus tem 490.633 linhas, 278.854 delas de sinal, e os filtros de ruído são reprodutíveis | `LEMMA` | `pipeline/normalize.py`. Contagem determinística; `out/corpus/stats.json` traz todos os buckets. Roda de novo e dá igual. |
| 2 | Toda afirmação sobre ele aponta a linha do corpus que a sustenta | `LEMMA` | Campo `support` em cada átomo, `timestamp` em cada nó do WormGraph. `tests/test_integrity.py` checa que todo hit de `recall` tem suporte não vazio. |
| 3 | O gate de admissão é fail-closed, com nove checagens independentes | `LEMMA` | `atoms.py::gate`. Cada checagem rejeita sozinha; o átomo rejeitado permanece no arquivo com o motivo. |
| 4 | **Todas** as 490.633 linhas foram escritas por ele | `CONJECTURE` | O export não tem campo de autor. A evidência a favor é forte (as afirmações de 1ª pessoa batem com o perfil conhecido: Arkhe govtech, aprovação no governo de Goiás, Linux Foundation) mas é circunstancial. Ver #5. |
| 5 | O corpus contém texto colado de terceiro | `LEMMA` | Encontrado e filtrado: matéria do Business Insider, blurb de VC em inglês, output de política da OpenAI, copypasta de chat. 48 átomos rejeitados por registro estranho. A existência das colagens é prova de que #4 é conjectura. |
| 6 | Copypasta de chat é detectada | `REFUTED` | Copypasta é, por definição, texto que circula entre muitas pessoas. Com um corpus de autor único não há como saber que uma frase circula — precisaria de corpus multi-autor. Mitigação parcial: mensagens com bits (`Cheer30 ...`) levam penalidade de 0,75 na salience e a flag `cheer` fica visível no átomo. Resíduo conhecido. |
| 7 | A ordem das linhas é cronológica ascendente | `CONJECTURE` | Evidência: o Arkhe govtech e a aprovação em Goiás aparecem no último decil; não aparecem no primeiro. Sem timestamp no export, não há prova. Tudo que depende de tempo neste pipeline depende desta conjectura. |
| 8 | `epoch` é data | `REFUTED` | `epoch` é o decil da posição da linha — tempo **ordinal**. O mesmo vale pro `timestamp` dos nós do WormGraph, que é o número da linha, não epoch Unix. Declarado em `out/attest/identity.json`. |
| 9 | No `WormNode` original, `content` fica fora da cadeia de compromisso | `LEMMA` | `WormNode.build` hasheia state_id, intent_id, verdict, transition_id, reject_reason, parent_ids e timestamp — não o content. Logo o content fica fora do `node_id`, fora do `mmr_root` e fora do `trust_root_id`. Demonstrado em `tests/test_integrity.py`, violação 6. Corrigido aqui com `state_id = blake3(content)`. |
| 10 | **A verificação offline prova autenticidade** | `REFUTED` | `tests/test_integrity.py`, violação 8, monta uma forja completa recomputando node_id, mmr_root, trust_root_id e signatures em cascata — e ela passa. Em DryRun o `trust_root` deriva do próprio bundle, então se auto-avaliza. Autenticidade exige Rekor real, com o `agent_identity` publicado antes por quem não é o criador. |
| 11 | A verificação offline prova consistência interna e detecta violação pontual | `LEMMA` | Violações 1 a 7 do teste: alterar conteúdo, remover nó, reordenar, promover Reject pra Allow, forjar trust_root, recalcular só a identidade, alterar state_id sem o node_id. Todas falham. 30 checagens, 0 falhas. |
| 12 | O tier restrito não vaza no `ovb.json` | `LEMMA` | Os 259 nós restritos carregam `restricted:<64 hex>` em `content`. O teste checa que o tamanho é exatamente `len("restricted:") + 64` em todos — nenhum claim em texto claro. `recall` default também não os traz. |
| 13 | A calibração do agente foi medida | `REFUTED` | `calibration_summary.samples = 0`, de propósito. Calibração exige oráculo: alguma fonte independente que diga se o átomo é verdadeiro. Este pipeline não tem nenhuma — a única evidência é o próprio corpus. Derivar um número a partir da salience seria inventar acurácia e chamar de medição. |
| 14 | `steelman = 4` significa que ele não reconstrói argumento alheio | `REFUTED` | Artefato de regex. O padrão exige frases muito específicas ("o lado dele", "por outro ângulo"). Quatro ocorrências medem o regex, não o comportamento. Mesma ressalva, em grau menor, para `plausibility` (118) e `concede` (110). |
| 15 | O perfil cobre a voz técnica ou profissional dele | `REFUTED` | `tech_dev` aparece em 372 de 278.854 linhas — 0,13%. `arkhe_govtech` em 724. Este corpus é a voz social dele em chat de Twitch. Tudo que os modos de persona dizem sobre registro técnico é extrapolação, e está marcado como tal dentro dos próprios arquivos. |
| 16 | As cadeias de raciocínio dele foram reconstruídas | `PENDING` | Só 11 linhas têm 3 ou mais movimentos. A mediana de mensagem tem 31 caracteres: ele encadeia raciocínio **entre** mensagens, não dentro de uma. O corpus não tem fronteira de conversa nem timestamp, então o pipeline não consegue remontar essas cadeias. É a lacuna mais séria do perfil de raciocínio. |
| 17 | As taxas de idioleto no modo espelho são medições corretas | `LEMMA` | `pipeline/lexicon.py`, sobre as 278.854 linhas de sinal. Maiúscula inicial 23,57%, pontuação final 8,15%, acento mantido em 99,6% dos `não`, mediana 31 chars. Reprodutível. |
| 18 | Texto gerado seguindo o modo espelho **conforma às taxas medidas** | `LEMMA` | `eval/report.md`. Distância de estilo até a amostra real held-out, em 15 dimensões ponderadas: `mirror_v2` **0,0336**, abaixo do piso de amostragem de **0,0522** (que é a distância da própria escrita dele até a referência quando a amostragem muda). Linha de base sem a especificação: **0,5011**. Ressalva em #22. |
| 18a | Um LLM seguindo o modo espelho **soa** como ele | `PENDING` | Conformidade a taxa não é indistinguibilidade: ritmo, assunto e timing de piada não entram em nenhuma das 15 dimensões. O teste cego está montado (`eval/blind-test.md`, 60 itens, 30 reais held-out contra 30 geradas, gabarito separado) e **não foi respondido**. Eu escrevi a especificação e os braços gerados, então não posso ser o juiz. |
| 22 | O braço `mirror_v2` é um teste limpo da especificação | `REFUTED` | Ele foi escrito **com os números da referência em mão**, então mede "é possível acertar as taxas", não "o documento transmite as taxas". O teste limpo é o `mirror` v1, que só teve o documento: deu **0,1281** — 3,9x melhor que a linha de base, mas 2,5x o piso. |
| 23 | Seguir o documento literalmente produzia a voz dele, antes desta avaliação | `REFUTED` | O v1 errou por **excesso**, não por falta: `num` em 100% das negações (real: 27,8%), `q` em 95,7% dos *que* (real: 71,4%), o dobro de marcadores de idioleto por linha (1,25 vs 0,592) e nenhuma mensagem longa (p95 52 vs 91). Vocabulário certo, proporções erradas. O documento listava frequências e um LLM leu lista de marcadores como menu a esvaziar. Corrigido com a seção "Calibragem" em `mode-mirror.md`, que agora dá os alvos explícitos. |
| 24 | A primeira rodada da avaliação mediu retenção de acento corretamente | `REFUTED` | Bug do harness: `acento_mantido_pct.nao` deu 0,0 para o braço `mirror` porque ele nunca escreveu `não` **nem** `nao` — denominador zero virou zero por cento, e a dimensão de maior peso marcou desvio máximo. Indefinido não é zero. Corrigido em `eval/metrics.py::score.ratio`, que devolve `None`, e em `distance`, que exclui a dimensão e declara a exclusão. A distância do `mirror` caiu de 0,2232 para 0,1281 só com essa correção. |
| 19 | Os pesos de salience são aprendidos | `REFUTED` | Escolhidos à mão (`atoms.py::salience`: 0,22 corroboração + 0,20 especificidade + 0,10 ancoragem + 0,26 peso do tipo + 0,12 peso do tópico + 0,10 recência). Não há conjunto de treino nem validação. Mexer neles muda quais átomos entram — e muda o `agent_identity`. |
| 20 | Os extratores têm precisão e recall conhecidos | `PENDING` | Não existe conjunto anotado. A validação foi inspeção manual de amostra em cada estágio, que achou e corrigiu quatro classes de falso positivo (`/me` como fato, citação como afirmação, notícia colada, `to` do inglês casando como 1ª pessoa). Não há garantia de que não restem outras. |
| 21 | Isto é treino de modelo | `REFUTED` | Nenhum peso é ajustado. É destilação pra memória recuperável e contexto de prompt. Ver README, seção "Isto não é treino". |

## Níveis τ

- **`LEMMA`** — provado a partir do código e dos testes. Refutar exige achar um
  bug ou um contra-exemplo executável.
- **`REFUTED`** — a afirmação é falsa para este sistema. Não é imaturidade, é
  impossibilidade lógica ou ausência de dado.
- **`CONJECTURE`** — provável, não verificado. Depende de condição que o
  pipeline não controla.
- **`PENDING`** — não testado. Não há evidência nem contra-evidência.

## O que muda se você aceitar esta tabela

1. **O agente pode citar a origem de tudo que afirma sobre ele.** É o ponto
   forte e é LEMMA (#2). Use isso: faça o agente responder com `L<linha>`
   quando alegar saber algo, e trate ausência de linha como inferência.

2. **Não trate o `ovb.json` como prova de autenticidade.** Ele prova
   consistência interna (#11) e nada além, enquanto o `trust_root` for DryRun
   (#10). Pra valer como prova pra terceiro, falta publicar o `agent_identity`
   num log de transparência real.

3. **Não deduza nada sobre o trabalho técnico dele a partir daqui** (#15). Pra
   isso o corpus certo é outro: commits, issues, documentos, conversas de
   trabalho.

4. **A camada restrita é separação por decisão, não por criptografia forte.**
   O `ovb.json` não vaza (#12), mas `out/memory/atoms.restricted.jsonl` está em
   texto claro no disco. Se o modelo de ameaça inclui acesso ao disco, esse
   arquivo precisa de cifragem — não foi feito.

5. **A conjectura #7 (ordem cronológica) é load-bearing.** Se o export não
   estiver em ordem, `epoch`, o bônus de recência no `recall` e a leitura de
   "o Arkhe aparece no fim" caem todos juntos. Vale confirmar com quem exportou.

## Resíduos conhecidos, em ordem de impacto

0. O teste cego existe e não foi respondido (#18a). Enquanto não for, "soa como
   ele" segue `PENDING` — e é a única pergunta que o usuário realmente fez.
1. Cadeias de raciocínio multi-mensagem não remontadas (#16) — a lacuna real.
2. Copypasta não detectável com corpus de autor único (#6).
3. Sem oráculo, sem calibração (#13).
4. `steelman`, `plausibility` e `concede` subdetectados por regex estreito (#14).
5. Trigramas de resposta de `!sorteio` poluíam a lista de construções;
   filtrados em `persona.py::_clean_ngrams` exigindo palavra gramatical, mas o
   filtro é heurístico e pode cortar construção legítima.
