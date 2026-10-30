# P1 — composição com mecânica aprendida e objetivo terminal

Piloto exploratório local executado em 2026-10-27. Runner: `run_p1_goal.py`. Pacote: `arc3-p1-goal-20261027/`. Sem LLM, AppContainer, assinatura, WER nativo, WormGraph ou âncora externa. Não é avaliação ARC-AGI-3.

## Resultado

| Métrica | Resultado |
|---|---:|
| Episódios / ações | 50 / 2.500 |
| Sucessos terminais | 49/50 |
| Terminal sobre alvo escolhido | 50/50 |
| Feedback terminal discriminativo | 50/50 |
| Falhas de planejamento | 0 |
| Contradições de mecânica | 2 |
| Previsões emitidas / exatas | 2.489 / 2.487 |
| Cadeias de aquisição/reaprendizagem | 3 |
| Cadeias de execução até o alvo | 50 |
| Escolha posterior coerente com objetivo aprendido | 49/49 avaliáveis |

Episódio 1: objetivo ainda ambíguo; alternância G2 escolheu marcador 4. A navegação chegou e permaneceu nesse marcador; recompensa zero identificou a cor 3. Episódios 2–50 escolheram o objetivo aprendido e tiveram sucesso. Não houve saída do alvo após a primeira chegada em nenhum episódio. Esses resultados são LEMMA local na família e seeds declaradas.

Mecânica identificada após cinco ações no episódio 1. Nos episódios 21 e 41 o singleton herdado foi contradito pela primeira ação; reset seletivo reabriu a família e reaproveitou a evidência, chegando a singleton no passo 4 de cada episódio (três ações adicionais de exploração). O conhecimento de objetivo foi preservado, pois a contradição era apenas de mecânica. Não houve flag de mudança.

Replay completo: `LOCAL_FULL_REPLAY_VERIFIED`. Confere snapshots/fontes locais correspondentes, manifesto, ações, estados, hipóteses, planos, previsões, feedback e agregados. Autenticação e isolamento: `NOT_ESTABLISHED`. Suíte completa: 189 testes PASS. O teste curto anterior ao run completo usou calendário 2/2/2, checou 6 terminais, 5 sucessos, reutilização de singleton, replay e rejeição de agregado adulterado. É um teste de integração exploratório, não replicação independente.

## Protocolo e decisões explícitas

Mesmo calendário, regras e layouts de P0: 20/20/10 episódios; ACTION1–5 como U,D,L,R,S; P1=(U,D,L,R,S), P2=(L,R,D,U,S), P3=(D,U,R,L,S); layouts 42,43,44. Objetivo verdadeiro constante cor 3. Família inicial de mecânica fornecida: 120 permutações. A permutação verdadeira e o objetivo não são entregues ao agente. RNG privado por episódio 1000–1049; contagens reiniciadas; hipóteses persistentes.

Exploração A1 até singleton, no máximo dez ações de exploração por episódio, orçamento compartilhado entre recuperações. Um singleton herdado pode ser usado, mas não é chamado nova aquisição. O orçamento não inclui a ação de navegação que revela uma contradição. Após esgotá-lo, planejamento fica desabilitado até o fim daquele episódio; o agente continua por A1/menos tentadas. Não se força `prediction=None` quando ainda há consenso: falha de planejamento e abstenção preditiva são campos distintos.

Objetivo: se singleton, usar o aprendido; se ambíguo, G2 escolhe 4 nos episódios ímpares e 3 nos pares (indexação um-based). O alvo fica fixo no episódio. Modelo singleton alimenta BFS a partir do mapa público corrente; nenhum oracle_plan é chamado. Executa a primeira ação e replaneja a cada passo. Plano vazio é válido se o ator já está no alvo; usa a ação estacionária identificada no modelo até o terminal. Plano impossível ou maior que horizonte restante desabilita planejamento e aciona fallback. Contradição aciona reset seletivo e nova exploração se orçamento permitir. Nenhuma falha de orçamento, plano longo, inacessibilidade ou fora-da-família foi exercitada no run completo; sua robustez não é demonstrada por este resultado.

Cada plano é registrado antes da execução. Cada previsão usa Writer com flush/fsync antes de env.step, seguida da observação vinculada e atualização. Fontes são declaradas por digest, sem atestação de carregamento contra adversário. Run escrito em C: para evitar latência de fsync observada em D:, depois copiado ao workspace. Teste de integração e run completo são ambos declarados; não há reivindicação de população externa pré-registrada.

## Cadeias e denominadores

O contrato do anexo foi refinado para não contar singleton herdado como reaprendizagem, nem excluir planos vazios válidos. Há duas métricas: aquisição (nova identificação/reaprendizagem + execução ao alvo + terminal discriminativo) e execução com modelo aprendido reutilizado. A escolha posterior é avaliada separadamente: último episódio é censurado por falta de episódio seguinte, não falha artificial. Os três episódios de aquisição (1,21,41) também tiveram confirmação posterior. Estado goal singleton no fim não basta: a confirmação verifica que o próximo alvo foi escolhido por `LEARNED_GOAL` e corresponde à hipótese anterior.

Não se reporta 50/50 cadeias de nova aquisição. Não se atribui a todos os episódios o aprendizado inicial que aconteceu uma vez. Planos BFS são ótimos no modelo para o alvo e estado atuais, não certificados como política global ótima. Total de ações é sempre 50 por contrato; não é actions-to-reward variável nem RHAE.

## Interpretação e limites

P1 conecta aquisição de mecânica, execução planejada e uso do feedback terminal na família fornecida. O piloto anterior com mecânica fornecida já testava o learner de objetivo; a contribuição desta rodada é a composição sem fornecer a permutação verdadeira.

P0 tinha 0/50 sucesso por condição; P1 teve 49/50. É uma comparação descritiva entre políticas compostas: navegação, escolha de alvo e permanência mudaram juntas, alterando também as trajetórias. Não isola causalmente cada adição, não testa mudança do objetivo nem generalização entre famílias. Mecânica e layout mudam juntos; os controles separados anteriores não são uma ablação fatorial deste run.

Nenhuma conclusão de AGI, transferência ARC, calibração humana, segurança de holdout ou superioridade sobre Kepler. A família verdadeira estar incluída no espaço fornecido é uma hipótese forte do experimento.

## Reprodução

Com o venv local: `python run_p1_goal.py <diretório-novo>`; depois `python run_p1_goal.py verify <diretório>`. O pai deve existir, sem sobrescrita. O verificador usa código instalado que precisa corresponder aos snapshots; não executa código arbitrário do pacote.
