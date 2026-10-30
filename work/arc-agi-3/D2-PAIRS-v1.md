# D2-pairs — testes de pares após singleton versus alvo imediato

Piloto exploratório executado em 2026-10-28. Código `run_d2_pairs.py`; pacote `arc3-d2-pairs-20261028`. Seis episódios, 300 ações: P-target e P-pairs nos inícios (1,1),(2,2),(0,3), mesma seed 0, mapa/dinâmica de D2 e família J1 fornecida de 600 candidatos.

## Intervenção declarada

Até singleton, A1 idêntica. P-target passa a BFS até alvo diagnóstico 4 e permanência; P-pairs, após singleton, testa pares até completar **20 ações totais** do episódio, não 20 ações adicionais. Depois passa ao mesmo controlador BFS/permanência, desde que haja singleton e planejamento elegível. H vazio permanece vazio, com fallback; não há síntese de J2 ou reabertura. Horizonte 50, recompensa real cor 3.

Novidade: hash do par bruto (grid,ação) ainda não observado no episódio. Durante a fase de pares com singleton, expected_survivors=1 para todas as ações e score=1−novelty, λ=1. Empates por menor número de tentativas da ação no episódio, depois RNG privado semeado. Não usa coordenadas A/B para agir, não planeja estados futuros nem garante cobertura global. Não se implementou o bônus antes de singleton; é uma intervenção pós-identificação, não um teste completo da fórmula sob múltiplas hipóteses. Nesse segmento de singleton, qualquer λ positivo produz o mesmo ordenamento binário; não se infere que 1 é peso ótimo.

O score apenas incentiva ação nova no estado atual. Se várias ações são novas, o bônus é igual e o desempate ainda pode levar o ator embora antes da ação crítica. Aumentar número de pares observados não garante incluir os pares discriminativos.

## Resultado (LEMMA local)

| Início | Política | Pares distintos | Ações adicionais de teste | Primeira chegada ao alvo | ACTION2 em A/B | Histórico vazio |
|---|---|---:|---:|---:|---:|---:|
| (1,1) | target | 16 | 0 | 15 | não/não | não |
| (1,1) | pairs | 28 | 15 | 27 | não/não | não |
| (2,2) | target | 13 | 0 | 12 | não/não | não |
| (2,2) | pairs | 27 | 15 | 27 | não/não | não |
| (0,3) | target | 15 | 0 | 14 | não/não | não |
| (0,3) | pairs | 26 | 14 | 26 | não/não | não |

Singletons surgem nos passos 5,5,6, iguais entre políticas. Todos os episódios terminam com um candidato J1 compatível, chegam ao alvo 4 e permanecem até o terminal. Os episódios iniciados em (0,3) visitam A sob ambas as políticas, mas não executam ACTION2 ali. Nenhum episódio visita B. Recompensa original 0/6, pois alvo diagnóstico não é a cor recompensada. Emitidas/exatas: 45/45 nos dois primeiros inícios por política, 44/44 no terceiro; 268/268 emitidas em 300 consultas, 32 abstenções.

P-pairs amplia a cobertura observada de pares nesta amostra e adia chegada ao alvo. Não gera a evidência de rejeição. Os pares críticos são critérios do avaliador; não se interpreta a falha como prova de insuficiência universal da política. As datas e trajeto não autorizam dizer que repetição era causa única, ou que uma falha revela problema necessariamente "mais profundo".

Para evitar denominador implícito não validado, cobertura de pares é reportada como **contagem de pares distintos**, não porcentagem de todos os pares possíveis. O orçamento de 50 ações não oferece garantia de cobrir um mapa com 63 posições livres e cinco ações.

## Pareamento, evidência e verificação

P-target foi reexecutado, não apenas reutilizado dos resultados antigos. Auditoria posterior comparou estado anterior/ação/estado seguinte: as 50 transições de cada um dos três baselines são idênticas às de D2-start. Recibo em `baseline_trace_comparison.json`. Essa auditoria é pós-coleta e não é atestação externa.

Manifesto, família por digest e snapshots antes do run. Logs comprometem previsões via flush/fsync antes de env.step; decisões e conjuntos históricos são vinculados. Em todos os 300 passos, filtro online e referência por interseção de restrições concordaram no conjunto completo. Replay de todas as ações, ambientes, visitas, candidatos e agregados: `LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED`. As dependências de render/advance J1 continuam compartilhadas; não se prova ausência geral de bugs.

Dois novos testes: preferência por única ação nova em exemplo controlado; piloto pareado/replay, mesma identificação inicial e ausência de fase extra em P-target. Testes temporários e o run completo são ambos declarados, não replicações independentes. Escrita original em C: e cópia para D: por latência conhecida de fsync.

Sem LLM, aprendizagem de objetivo, expansão de primitivas, AppContainer, WER nativo, WormGraph, assinatura, âncora externa ou mudança de gate. Não estabelecidas autenticação histórica e confidencialidade de holdout. Não demonstra identificação da verdadeira J2, transferência ARC, AGI ou orçamento ótimo.

## Correção conceitual do anexo

ACTION2 em A distingue a hipótese J1 sobrevivente da verdadeira J2: não "contra J2" no sentido de refutar J2. O que a família ausente impede é pontuar a informação entre J1 e J2 explicitamente. Ação pode ser usada como teste de falsificação, mas seu potencial de surpresa fora do modelo não é calculável por consenso interno apenas. E λ=2 não torna novidade dominante para qualquer tamanho de H; antes de singleton, diferenças de expected_survivors podem superar 2.

## Reprodução

No venv, neste diretório: `python run_d2_pairs.py <diretório-novo>`; `python run_d2_pairs.py verify <diretório>`. Pai deve existir, sem sobrescrita. Verificador exige fontes instaladas iguais aos snapshots; não executa snapshots arbitrários.
