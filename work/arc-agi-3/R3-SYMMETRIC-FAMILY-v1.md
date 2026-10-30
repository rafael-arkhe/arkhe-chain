# R3 — ampliação simétrica e comparação com ações fixas

Piloto exploratório executado em 2026-10-28. Código `run_r3_symmetric.py`; pacote `arc3-r3-symmetric-20261028`. Não é pesquisa externa, coleta confirmatória, expansão autônoma ou descoberta de primitivas.

## Família e decisões antes da execução

Para cada uma das 120 permutações, incluir original e quatro variantes que dobram cada deslocamento não nulo. A ação estacionária pode ser qualquer uma de ACTION1–5 e nunca é dobrada. Total enumerado: 600 entradas distintas. R2_124 é subconjunto de R3_600. IDs H001_0..H120_4; sufixos 1–4 seguem a ordem das ações não estacionárias de cada permutação, não uma ação global fixa. Manifesto contém todos os vetores.

J1: destino apenas, borda/parede no destino bloqueia; intermediária ignorada. Uniforme sobre candidatos sobreviventes: 20% de massa inicial sem salto, 80% com salto. É escolha de distribuição, não neutralidade universal nem balanceamento 50/50 de tipos. A1 minimiza número esperado de candidatos restantes sob essa distribuição.

15 episódios ativos por família: P2 original e quatro variantes persistentes de P2, layouts 42,43,44. Mesmas regras, seeds 1000+10*case_index+layout_index e controlador de R2. Não houve 45 episódios por família ou repetições adicionais de seed. 30 episódios ativos, 1.500 ações. Hipóteses reiniciadas por episódio; limite de dez ações de exploração antes de desabilitar planejamento; horizonte 50, replanejamento de uma ação, alvo diagnóstico 4 e recompensa verdadeira cor 3.

Para preservar fontes e verificadores dos arquivos anteriores, o runner reutiliza o bytecode de `run_r2_extended.core` com um namespace isolado onde somente família e IDs de hipóteses são substituídos. Não modifica globals do módulo original. Fontes originais e nova fonte são snapshotadas. O controlador é o mesmo; ações escolhidas e trajetórias podem mudar porque A1 depende da família.

## Comparação ativa (LEMMA local)

| Métrica | R2, 124 hipóteses | R3, 600 hipóteses |
|---|---:|---:|
| Singleton correto ao fim | 15/15 | 15/15 |
| Passos até singleton | 1–6 | 4–16 |
| Planejamento desabilitado por orçamento | 0 | 1 |
| Terminal no alvo diagnóstico | 15/15 | 14/15 |
| Emitidas/exatas | 707/707 de 750 | 674/674 de 750 |
| Cobertura | 94,27% | 89,87% |
| Acerto ITT em pares novos | 65/108 | 67/143 |
| Recompensa terminal | 0/15 | 0/15 |

Recompensa zero é esperada para o alvo 4; o ambiente exige cor 3. Não se reinterpreta chegada ao alvo diagnóstico como sucesso do ambiente. Novidade é par bruto grade/ação ausente no prefixo do episódio, antes da atualização online, não holdout selado.

Casos de salto: R2 12/12 singletons em 1–5 passos, 571/600 emitidas; R3 12/12 em 4–16 passos, 540/600 emitidas, 11/12 terminais no alvo. Controles sem salto: R2 3/3 em 4–6 passos, 136/150 emitidas; R3 3/3 em 5–6 passos, 134/150 emitidas. Esses são grupos de regras verdadeiras testadas, não os pesos a priori do learner.

Falha específica: JUMP_ACTION2/layout42 em R3. Orçamento de exploração esgotado, singleton correto só no passo 16. Pela política comum, planejamento permaneceu desabilitado; houve chegada incidental ao marcador no passo 17, mas permanência posterior foi 4/33 e o terminal ficou fora dos marcadores. Não se afirma 15/15 identificações dentro do orçamento nem 15/15 navegações concluídas. Todos os demais casos terminaram no alvo.

## Primeiro salto: evidência isolada versus prefixo

Nas 12 trajetórias com salto de cada família, refiltrar H0 usando apenas o primeiro salto observado produziu 1 candidato em R2 e 24 em R3. Em R3, incorporar também o prefixo anterior deixou entre 1 e 24. Não restaram 480: esse é o tamanho inicial do grupo com salto antes de observar ação e direção.

A identificação pode ocorrer antes do primeiro salto desobstruído: colisões e evidências sobre outras ações também eliminam candidatos. Em JUMP_ACTION2/layout42, R3 teve singleton no passo 16 e primeiro salto observado no 17. Portanto passos até primeiro salto e passos até singleton não são a mesma métrica. Primeira observação sem salto inclui bloqueios e permanência; não demonstra ausência de primitiva de salto. Diagnósticos exatos por episódio estão no JSON.

## Análise de trajetórias fixas

Reprocessadas as 15 trajetórias de cada família ativa sob ambas as famílias, sem nova seleção de ações. São 60 análises episódio/família e 3.000 consultas offline, sem ações adicionais no ambiente. As trajetórias são pós-coleta; as previsões recomputadas não são compromissos históricos anteriores às observações. Os runs ativos que geraram as trajetórias possuem seu próprio registro prospectivo.

| Trajetória fornecida | Família na análise | Emitidas/exatas | Singleton até o fim |
|---|---|---:|---:|
| Ações R2 | R2_124 | 707/707 | 15/15 |
| Ações R2 | R3_600 | 691/691 | 11/15 |
| Ações R3 | R2_124 | 689/689 | 15/15 |
| Ações R3 | R3_600 | 674/674 | 15/15 |

Em ações fixadas, a família maior deixa mais ambiguidade. Nas ações de R2, quatro trajetórias não identificam uma única hipótese de R3 até o final, embora ainda permitam previsões por consenso nas ações repetidas. Isso separa previsão local e identificação completa. A comparação ativa mostra o resultado total de mudar a família sob A1; a análise fixa mostra ambiguidade e cobertura na mesma evidência. Nenhuma delas demonstra causalidade exclusiva da cardinalidade: também mudam estrutura de candidatos e distribuição induzida por eles.

## Verificação e limites

Manifesto e snapshots antes dos runs; compromissos Writer com flush/fsync antes de env.step; observações vinculadas depois. O observador calcula candidatos a partir das transições e não entrega esses diagnósticos à política. Replay completo das duas execuções ativas, famílias e agregados, e recomputação das análises fixas: `LOCAL_FULL_REPLAY_VERIFIED`. Verificador exige código instalado correspondente aos snapshots, sem executar snapshots arbitrários. Escrita em C: e cópia para D: para evitar latência conhecida de fsync.

196 testes PASS. Dois novos testes verificam 600 candidatos distintos, inclusão de R2, 24 versus 1 para salto de ação/direção fixadas e análise com sequência fixa; o replay do piloto completo também foi executado. Não há teste unitário de todos os layouts nem prova geral do controlador.

Regras verdadeiras ainda são centradas em P2, embora a família candidata agora seja simétrica entre permutações. Três layouts e uma seed por caso/layout não são população abrangente. Família verdadeira sempre incluída; sem teste fora da família nesta rodada. Ambiente e modelo compartilham advance, limitando independência semântica. Nenhuma mudança de objetivo, expansão autônoma, LLM, AppContainer, WER nativo, WormGraph, assinatura ou âncora externa. Autenticidade e isolamento de holdout não estabelecidos. R2-fora e comparação de priors 50/50 permanecem pendentes. Sem alegação de transferência ARC ou AGI.

## Reprodução

No venv e neste diretório: `python run_r3_symmetric.py <diretório-novo>` e `python run_r3_symmetric.py verify <diretório>`. O pai deve existir; não há sobrescrita. Saída contém manifest.json com famílias enumeradas, R2_124.jsonl, R3_600.jsonl, report.json, verification.json e sources/.
