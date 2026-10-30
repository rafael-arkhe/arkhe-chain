# R1 — reabertura após espera fixa

Piloto exploratório local de 2026-10-27. Runner `run_r1_recovery.py`; pacote `arc3-r1-recovery-20261027`. Quatro condições de 50 ações, 200 ações ao todo, replay completo verificado. Mesmo controlador, condições iniciais, seed 1000, layout 43 e dinâmica-base P2, com salto excepcional no passo 11 (JumpWitness de E1). A única configuração que varia é W=3,5,10 ou nunca reabrir.

## Decisões declaradas antes da execução

Para evitar misturar recuperação de mecânica e aquisição de objetivo, o alvo diagnóstico é a cor 4, igual em todas as condições e não atualizado pelo feedback. A recompensa original permanece cor 3. A1 até singleton, depois BFS no modelo aprendido e permanência usando a ação estacionária aprendida. Nada de oráculo de navegação. Hipóteses de objetivo não são usadas para escolher o alvo neste controle.

A condição NEVER é uma reexecução pareada do baseline de abstenção persistente com este controlador, não reutilização numérica do E1 anterior, que não navegava antes da anomalia. Recompensa, chegada ao alvo diagnóstico e permanência são desfechos separados.

## Resultado (LEMMA local)

| Condição | Reabre antes do passo | Singleton correto após passo | Primeira chegada ao alvo após reabertura | Cobertura passos 12–50 | Erro entre emitidas passos 12–50 |
|---|---:|---:|---:|---:|---:|
| Nunca reabrir | — | — | — | 0/39 | N/A |
| W3 | 15 | 18 | 22 | 32/39 | 0/32 |
| W5 | 17 | 20 | 24 | 30/39 | 0/30 |
| W10 | 22 | 25 | 28 | 25/39 | 0/25 |

As três recuperações chegaram à permutação verdadeira P2. Cada uma levou quatro observações novas desde a reabertura até singleton (15–18,17–20,22–25). Permanência posterior à chegada: 100% em todas. Recompensa terminal: 0/1 em cada condição; recuperação terminou sobre cor 4, NEVER fora dos marcadores. Recompensa zero era esperada para o alvo diagnóstico, não falha de recuperação.

| Condição | Emitidas/exatas após reabertura | Emitidas/exatas em pares novos após reabertura |
|---|---:|---:|
| W3 | 32/36 | 5/9 |
| W5 | 30/34 | 4/8 |
| W10 | 25/29 | 4/8 |

Todos os erros condicionais pós-reabertura são zero; os denominadores maiores incluem abstenções. Novidade significa par bruto grade/ação ainda não visto desde a primeira reabertura, não novidade semântica ou holdout selado. A janela comum 12–50 permite comparar cobertura incluindo o custo da espera. Pós-reabertura de NEVER é N/A, pois nunca reabre; não deve receber erro condicional zero por ausência de previsões.

## Indexação e evidência

Anomalia no passo t: H fica vazio. Próximas W ações são fallback. Reabre antes de t+W+1, não no mesmo passo em que a contagem de espera chega a zero. Transições da espera são verificadas contra H0 somente para detectar nova incompatibilidade; não filtram o conjunto de recuperação. Evidência da anomalia fica no log, mas é esquecida pelo conjunto de hipóteses reaberto.

Toda nova incompatibilidade durante a espera restaura a contagem W, mesmo com H vazio. Dois testes novos: indexação do timer com segunda anomalia reiniciando espera e persistência de NEVER; integração pareada nas quatro condições com replay. O teste de segunda anomalia é unitário do timer, não execução ambiental com múltiplos saltos. O run completo possui apenas uma anomalia por condição.

Depois da reabertura, até dez ações de exploração antes de desabilitar planejamento para aquele episódio; fallback/A1 continuam. Limite não foi atingido neste run. Ação estacionária e plano usam o modelo identificado. Cada previsão é comprometida via Writer com flush/fsync antes de env.step, e observação/atualização são vinculadas depois.

## Verificação e limites

`LOCAL_FULL_REPLAY_VERIFIED`: fontes instaladas e snapshots, manifesto, todos os eventos, ações, estados, filtros, tempos de espera e agregados conferidos. Escrita original em C:, cópia para D:; nenhum arquivo anterior sobrescrito. Testes temporários e piloto são execuções declaradas, não população externamente pré-registrada.

W3 recuperou mais cedo nesta fixture; isso não determina W ótimo. São quatro trajetórias pareadas em um cenário construído, não estimativa populacional. A recuperação depende de descartar uma anomalia transitória enquanto a dinâmica-base retorna. Não testa mecânica persistentemente fora da família, descoberta de primitivas, aprendizagem de objetivo, múltiplas anomalias ambientais ou generalização ARC.

Hash e replay locais não provam autenticidade histórica perante um operador malicioso. Sem LLM, AppContainer, WER nativo, WormGraph, assinatura, âncora externa ou mudança de gate. R2 não foi executado.

Reprodução: usando o venv neste diretório, `python run_r1_recovery.py <diretório-novo>`; depois `python run_r1_recovery.py verify <diretório>`. O pai precisa existir. O verificador exige código instalado correspondente aos snapshots e não executa snapshots arbitrários.
