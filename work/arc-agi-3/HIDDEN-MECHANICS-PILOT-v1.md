# Microambiente materializado: piloto de mecânica, objetivo ainda não aprendido

27/10/2026. Implementados hidden_mechanics_micro.py, run_hidden_mechanics_pilot.py e verificador offline. Zero chamadas ao LLM; Arkhe/run_dev não executados. Não é a rodada200/50nem avaliação de transferência ARC.

## Contrato executável v0

Grade8x8, valores0..5: fundo0, ator1, parede2, marcadores3/4e ator sobre marcador5. available_actions contém cinco códigos ACTION1..5. Cada tarefa atribui uma permutação oculta dos cinco efeitos (quatro deslocamentos unitários e permanecer) aos códigos; um dos dois marcadores é a condição oculta de sucesso. Família240regras (5!×2). Regras estáveis durante o episódio, layouts procedurais com oito paredes e os dois marcadores alcançáveis.

Observe expõe somente grade, lista de ações, passo, done e reward. Nenhum rule_id, goal, seed, ação semântica ou caminho ótimo aparece nessa observação. Isso é separação funcional de API, não uma sandbox contra introspecção Python. O evaluator possui os atributos privados e registra metadados separados para reprodução.

Horizonte50. reward=None antes do último passo; ao fim vale1se a posição final é o marcador correto,0caso contrário. Não há encerramento precoce ao tocar no alvo. Ações inválidas e ações após done são rejeitadas. Este é um caso deliberadamente simples da proposta, não todos os exemplos de pintura/alinhamento e nem estética de shmup.

## Baselines e orçamento

Vinte episódios: dez layouts com regra0na partição de desenvolvimento e dez layouts diferentes com regra137na partição denominada avaliação. Cada learner começa vazio em cada episódio; não existe treino acumulado de200episódios nem modelo aprendido em R1transferido para R2. As duas regras diferem dentro da família fornecida, não são famílias de operações conceitualmente inéditas.

Política de ações uniforme aleatória durante50passos. Separadamente, FiniteEffectLearner recebe explicitamente os cinco efeitos candidatos, usa as dez primeiras transições para eliminar associações inconsistentes por ação e é congelado. Prediz somente quando todos os efeitos ainda possíveis concordam na grade inteira. É baseline de adaptação de uma família dada, não síntese livre de operações.

O evaluator forma todos os pares render/ação alcançáveis não observados no prefixo, embaralha com seed fixada e seleciona aproximadamente20%, por arredondamento para baixo. Consulta o snapshot congelado antes de continuar o rollout. Nenhuma resposta dos probes volta ao learner ou à política. Não são apenas20%das ações cuja observação inevitavelmente já foi dada ao agente. O conjunto é teste preditivo externo ao prefixo, não holdout selado independente de famílias/datasets.

BFS omnisciente usa estado real, efeitos e objetivo privados, expande no máximo64posições. Esse limite é adequado para este mundo cujo único estado dinâmico é a posição;8x8sozinho não garantiria BFS barato para pinturas, objetos e memória arbitrários. Se ultrapassar o orçamento, retorna SEARCH_INCOMPLETE. O caminho encontrado é seguido e depois preenchido com a ação de permanecer até50passos.

Interações contabilizadas:1000da política aleatória,1000da execução do oracle,1077consultas offline do evaluator. Só200das interações aleatórias pertencem aos prefixos de aprendizagem. Consultas offline não foram apresentadas como interações grátis de um solver ARC.

## Resultados locais

|Partição|Episódios|Probes|Emitidas/exatas|Acerto global (abstenção=0)|Acerto condicional|Identidade exata|
|---|---:|---:|---:|---:|---:|---:|
|Desenvolvimento, regra0|10|537|368/368|68,53%|100%|217/537|
|Avaliação, regra137|10|540|457/457|84,63%|100%|228/540|

O learner conhece uma família que contém a verdade por construção; por isso o consenso sem erro emitido é esperado sob extração/semântica corretas. Não comparar100%condicional com descoberta irrestrita ou sucesso de tarefa. Diferenças entre partições não isolam regra, dificuldade ou generalização: também mudam layouts e queries. Probes de um episódio compartilham layout e learner, portanto não são amostras independentes.

Em7/20episódios todas as cinco ações tinham efeito único identificado até o passo10. O recibo registra o primeiro passo de identificação completa dentro desse prefixo quando existe. Essa é identificação dos parâmetros da família conhecida, não da condição de vitória.

Aleatório teve0/10sucessos terminais em cada partição; oracle teve10/10em cada. Zero em vinte tentativas aleatórias não estima uma taxa universal, e o oracle recebeu informação que nenhum agente recebeu. Não houve algoritmo de descoberta do objetivo, planejamento por Arkhe ou amostra humana.

## Lacunas fechadas no desenho, sem inflacionar capacidade

**Objetivo não identificável antes de feedback.** Teste controlado cria regras com a mesma dinâmica/layout e objetivos3ou4. As observações são iguais para as mesmas ações antes do passo terminal. Nenhum agente pode distinguir com certeza esses objetivos apenas por esse histórico. Um primeiro sucesso não demonstra que o objetivo foi identificado. Para estudar aquisição, uma opção é manter regra/objetivo por vários episódios de uma tarefa, permitindo aprender com avaliações terminais anteriores; outra é fornecer sinais observáveis adicionais. A escolha do protocolo precisa preceder a avaliação.

**Eficiência terminal degenera.** Todo sucesso observável exige50ações neste contrato. Medir ações até primeiro sucesso terminal dá50para sucesso e censura aos fracassos, sem granularidade de eficiência dentro do episódio. O caminho BFS é uma distância privilegiada até o marcador, não número mínimo de comandos para receber a recompensa terminal, que continua50. Não calculamos um pseudo-RHAE com esse denominador incompatível.

**BFS não é humano.** Um ratio com caminho ótimo mede referência oracle, não performance relativa a humanos; <1não significa automaticamente 'pior que humano'. Humanos não foram recrutados/testados. RHAE e calibração humana não foram alegados.

**Definição de tarefas.** 'Efeitos variam entre episódios' e '200episódios com mesma regra' exigem níveis diferentes de organização: tarefa=regra persistente, episódio=layout/rollout. Cinquenta episódios da mesma R2não são cinquenta regras independentes; se há memória entre eles, os últimos não começam sem conhecimento de R2. Este piloto declara resets e regras explicitamente.

**Métricas não intercambiáveis.** Sucesso, identificação de mecânica, identificação de objetivo e previsão em pares inéditos são desfechos separados. Correlação de confiança com acerto não é medida suficiente de calibração e é indefinida se a confiança ou os acertos forem constantes. Não coletamos probabilidades/Brier/reliability. Política aleatória e preditor aleatório também são baselines diferentes; foi usado um preditor de identidade separado.

**Falsificação delimitada.** Fracasso de um agente não refuta necessariamente o ambiente nem impede logicamente teste direto em ARC. Falhar aqui pode diagnosticar interface, família, orçamento ou agente. Limiar10%, proxyRHAE1ou empate com acaso não são gates universais derivados da proposta. Nenhum critério foi ajustado após os resultados para alegar aprovação.

## Verificação e integração pendente

167testes passaram. Verificador reconstruiu os20learners a partir dos prefixos, conferiu seus conjuntos finais, unicidade dos probes por episódio, ausência de keys de treino nos probes e limites/sucesso dos oracles. Nenhum segredo foi passado na API pública testada. O runtime DSL existente exige64x64; não fingimos integração direta de um mundo8x8. Uma futura adaptação precisará preservar limites de mapa, render e semântica, sem apenas acrescentar padding que altere o jogo.

Ficam pendentes: aquisição do objetivo, integração Arkhe, desenho200/50com tarefas/episódios claros, controles humanos, probabilidades de confiança e transferência ARC. Nem codificação simbólica comprova calibração de Core Knowledge, nem este piloto é pré-requisito lógico do benchmark oficial.

Artefatos: D:/arkhe/output/arc3-hidden-mechanics-pilot-20261027/plan.json, report.json e verification-receipt.json. Classificação LEMMA para implementações/execuções descritas. Zero efeito em produção, chamada LLM ou submissão Kaggle; nenhuma evidência de AGI.
