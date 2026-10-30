# R2 — identificação em família ampliada fornecida

Piloto exploratório de 2026-10-27. Runner `run_r2_extended.py`, pacote `arc3-r2-extended-20261027`. Não houve expansão autônoma ou síntese de primitivas. Os candidatos ampliados foram escritos manualmente e fornecidos desde o início.

## Família e protocolo

Manifesto enumera as 124 hipóteses por ID e vetor das cinco ações, H001–H124. H001–H120 são as permutações originais; H121–H124 são P2=(L,R,D,U,S) alterando apenas ACTION1,2,3 ou4, respectivamente, para duas células na mesma direção. As 124 são distintas. S permanece estacionária.

J1: verifica somente destino; destino fora da grade ou parede produz permanência; célula intermediária ignorada. Mesmo `advance` é usado pelo ambiente e modelo, e testes independentes de casos verificam salto sobre parede intermediária, bloqueio por parede no destino e borda. Compartilhar função também limita a independência da validação semântica.

Testadas as quatro variantes verdadeiras persistentes e P2 original como controle, cada uma nos layouts 42,43,44: 15 episódios, horizonte 50, 750 ações. RNG do agente 1000+10*índice_do_caso+índice_do_layout; ambiente determinístico, sem seed estocástica efetiva. Learner reiniciado com todas as 124 hipóteses em cada episódio; nenhum carry ou recuperação de W neste experimento.

Controlador: A1 greedy uniforme até singleton, até dez ações de exploração; depois BFS no modelo identificado até alvo diagnóstico cor 4, seguido da ação estacionária aprendida. Replanejamento de um passo. Fallback A1/menos tentadas para orçamento, inacessibilidade ou plano maior que horizonte. Não houve essas falhas no run. Alvo diagnóstico fixo em todas as condições; recompensa real permanece vinculada à cor 3. Este é teste de identificação/navegação, não aprendizagem de objetivo.

## Resultados (LEMMA local)

| Grupo | Singleton correto | Passos até singleton | Terminal no alvo diagnóstico | Emitidas/exatas | Acerto ITT em pares novos |
|---|---:|---:|---:|---:|---:|
| Saltos persistentes | 12/12 | 1–5 | 12/12 | 571/571 de 600 | 55/84 |
| P2 original | 3/3 | 4–6 | 3/3 | 136/136 de 150 | 10/24 |
| Total | 15/15 | 1–6 | 15/15 | 707/707 de 750 | 65/108 |

Cobertura total 94,27%; acerto ITT total também 707/750. 43 abstenções, nenhum erro emitido. Novidade é par bruto grade/ação não observado antes no episódio, antes do filtro online; não é holdout selado nem novidade semântica. A acurácia condicional perfeita depende do consenso e de a hipótese verdadeira estar na família inicial.

Permanência após chegada: 100% nos 15 episódios. Recompensa terminal: 0/15, pois alvo diagnóstico era 4 e recompensa exige 3. Não se chama chegada ao alvo de sucesso do ambiente. Nenhuma mudança de objetivo ou de regra durante o episódio.

## Assimetria da família

As quatro variantes adicionadas são centradas em P2. Não são todas as possíveis atribuições que incluam saltos. Uma observação de salto pode identificar de imediato a única variante da lista que a prevê, e assim determinar os outros efeitos por conhecimento fornecido no candidato. Isso explica singletons em uma ação; não demonstra descoberta de todas as regras a partir de uma observação. A comparação entre velocidade dos casos de salto e controles não isola dificuldade intrínseca ou inteligência: espaços de alternativas são assimétricos.

## Evidência e execução

Manifesto e snapshots escritos antes da execução. Writer faz flush/fsync da previsão antes de env.step; observação, filtro e planos registrados e vinculados. Verdade usada apenas no avaliador para instalar a dinâmica e checar singleton; nem ID da variante nem vetor verdadeiro são passados à política. Modelo e ambiente compartilham a linguagem de deslocamentos fornecida.

Verificador: `LOCAL_FULL_REPLAY_VERIFIED`, 15 episódios e 750 ações. Confere família enumerada, fontes instaladas/snapshots, cadeia, ações, planos, transições e agregados. Não executa snapshots arbitrários. Testes: 124 candidatos distintos e colisões J1; integração com todos os 15 casos e replay. O teste integrado foi executado antes do piloto; são runs locais declarados, não confirmações independentes ou população externamente pré-registrada. Escrita em C: e cópia para D: para evitar latência de fsync previamente observada.

Sem LLM, assinatura, âncora externa, AppContainer, WER nativo, WormGraph ou alteração do gate. Autenticidade histórica contra operador malicioso e isolamento de holdout não estabelecidos. Não testa descoberta de primitivas ausentes, rejeição de uma quinta variante omitida, adaptação entre famílias, ARC ou AGI.

## Reprodução

Com o venv neste diretório: `python run_r2_extended.py <diretório-novo>`; depois `python run_r2_extended.py verify <diretório>`. Diretório pai deve existir. Saída final contém manifest.json (incluindo candidatos exatos), events.jsonl, report.json, verification.json e snapshots em sources/.
