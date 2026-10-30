# Aquisição de objetivo persistente — piloto v1

## Resultado executado

600 episódios, 30.000 ações, 1.201 eventos. Verificador: `LOCAL_CHAIN_AND_EPISODES_REPLAYED` em todos os 600 episódios.

| Condição | Sucessos | Tarefas com cinco sucessos finais | Brier médio |
|---|---:|---:|---:|
| Adaptativo | 190/200 | 20/20 | 0,025 |
| Sem atualização | 100/200 | 10/20 | 0,25 |
| Oráculo | 200/200 | 20/20 | 0 |

O adaptativo identifica um único objetivo após o episódio 1 em 20/20 tarefas; nos episódios 2–10, obtém 180/180 sucessos. No primeiro episódio tem 10/20 sucessos, pela escolha fixa inicial do marcador 3. O resultado decorre da eliminação correta de hipóteses na família binária fornecida. Não constitui inferência sobre um LLM. No oráculo e no baseline congelado, `first_singleton_after_episode=null` significa que esse learner não foi atualizado, não falha de conhecimento do oráculo.

A previsão de recompensa do adaptativo começa em 0,5 e torna-se exata após o feedback. O baseline congelado mantém 0,5, mesmo nas tarefas em que tem sucesso repetido: sucesso comportamental isolado não demonstra aquisição. O verificador confere os eventos; o agregado JSON é uma conveniência e não uma atestação separada.

## Contrato

20 tarefas (IDs 0–19), dez episódios de horizonte 50 por tarefa e condição. Cada par de IDs compartilha dinâmica e difere no objetivo, marcador 3 ou 4. Layouts 3000–3009, pareados entre condições. Regra e objetivo persistem nos dez episódios; learner novo por tarefa. Não há transferência de memória entre tarefas.

Para isolar objetivo, a mecânica exata das ações é fornecida a todas as condições, assim como BFS sobre mapa visível, semântica das células e família de recompensa binária determinística. Isto **não** mede aprendizagem conjunta da mecânica e objetivo. Marcadores 3 e 4 são visualmente distinguíveis; a associação à recompensa é oculta.

- `adaptive`: candidatos iniciais {3,4}; escolhe menor candidato e elimina hipóteses incompatíveis com recompensa terminal.
- `frozen`: mesma escolha inicial e mesmas previsões, sem atualização por feedback.
- `oracle`: recebe também objetivo verdadeiro; controle privilegiado.

O agente navega ao marcador escolhido e usa a ação estacionária até o passo 50. Nenhum sucesso é observado antes do terminal. Não se chama o oráculo do ambiente para navegar: BFS usa o mapa inicial público e mecânica fornecida. O avaliador continua no mesmo processo: API funcional, não sandbox.

## Métricas e registro

Primárias: episódio do primeiro conjunto singleton de objetivos; sucesso em todos os cinco episódios finais. Primeira identificação ocorre após feedback, portanto o sucesso anterior à identificação não conta como evidência de conhecimento. Um fracasso fora dos dois marcadores não elimina nenhuma hipótese (teste explícito).

Secundárias: previsão probabilística da recompensa terminal, Brier e acerto binário com limiar >=0,5, registrados por episódio. Probabilidade 0,5 representa a distribuição uniforme convencional sobre hipóteses fornecidas, não calibração aprendida. Estes escores não são RHAE.

Manifesto escrito antes da execução. Cada previsão é registrada com flush/fsync antes da última ação; feedback referencia o hash correspondente. A cadeia local permite checar consistência relativa ao head, não provar tempo absoluto, ausência de reescrita integral ou completude de todas as tentativas. Não há assinatura, âncora externa ou integração WER/WormGraph. Nenhuma publicação ou chamada LLM.

Fontes: `persistent_goal_pilot.py`, `hidden_mechanics_micro.py`; testes: `test_persistent_goal_pilot.py`. Saída: `arc3-persistent-goal-20261027/manifest.json`, `events.jsonl`, `report.json`. Suíte completa: 175 testes PASS.

## Limites dos anexos

Uma publicação posterior do head não estabelece que predições existiam antes dos resultados nem revela runs nunca registrados. Um gist controlado pelo operador não é automaticamente testemunha independente; é preciso definir imutabilidade, identidade, disponibilidade e momento testemunhado. Canary ausente não exclui leakage, e correspondência parcial com holdout não implica presença do GUID. Assinaturas autenticam bytes em relação à chave, não a veracidade das transições. Os diagnósticos anteriores não foram promovidos a provas mais fortes nesta rodada.

Os resultados são controles dentro de família conhecida, com condições e layouts correlacionados e sem inferência estatística de transferência. Não estabelecem aquisição geral de objetivos, capacidade ARC-AGI-3 ou AGI. Recomendações sobre integração nativa/ancoragem dos anexos permanecem trabalho separado.
