# R2-fora — controle passivo de incompatibilidade histórica

Executado em 2026-10-28. Código `history_family_diagnostic.py` e `run_history_family_control.py`. Pacote `arc3-history-family-20261028`. É controle passivo com posições fornecidas, não trajetória contínua nem navegação ativa. Nenhuma ação de ambiente: quatro restrições sintéticas, duas por caso.

## Correção física da fixture

Mapa 8×8, parede em (3,3), marcadores em (0,0) e (7,7). A=(2,3), B=(2,5), mesma ACTION1. Efeito verdadeiro controlado: salto de duas células para direita sob J2, exigindo intermediária e destino livres. Em A, intermediária (3,3) é parede e destino (4,3) está livre: permanece em (2,3). Em B, (3,5) e (4,5) estão livres: salta para (4,5).

Não se move uma célula para dentro da parede intermediária. O texto do anexo que dizia "intermediária parede, move 1" foi corrigido. O efeito de ACTION1 é especificado; não se implementou aqui uma família verdadeira completa de regras J2 para todas as ações.

## Resultado (LEMMA local)

| Observação J2 | Candidatos de H0 para a transição isolada | Candidatos para o histórico acumulado |
|---|---:|---:|
| A: permanece | 216 | 216 |
| B: salta duas células | 24 | 0 |

As duas transições isoladas são explicáveis na família simétrica J1 de 600 candidatos. Nenhum candidato explica ambas. `transition_incompatible=false` nas duas; `history_incompatible=true` apenas depois de B. Razão: `NO_CANDIDATE_EXPLAINS_HISTORY`.

Controle compatível J1: mesma ação salta duas células em A e B, pois só o destino é verificado. Há 24 candidatos após cada observação e 24 ao fim, sem alarme histórico. Inverter A/B preserva o conjunto final nos dois casos. Repetir B após histórico já vazio não o reabre silenciosamente.

## Implementação e semântica

HistoryDiagnostic mantém separadamente H0 e o version space acumulado. Em cada observação, calcula candidatos compatíveis com a transição isolada e filtra os sobreviventes anteriores. A interseção incremental é equivalente a refiltrar a conjunção completa, sem exigir recalcular todas as restrições a cada passo. Os frames e mapa completos ficam no log do controle; a classe mantém conjunto corrente e contagens diagnósticas.

Não alterou Policy, E1 ou os verificadores dos pacotes antigos. O learner por eliminação já acumula restrições enquanto não há reset; a novidade é expor o diagnóstico histórico separado do diagnóstico da última transição. Em sistemas com reabertura/esquecimento ou mudança real de tarefa, é preciso declarar qual segmento histórico é tratado como estacionário. Histórico incompatível não distingue sozinho hipótese inadequada, mudança de regime, ruído ou erro de representação.

O oracle J2 calcula explicitamente intermediária e destino sem chamar advance. A família candidata continua usando advance J1. Os testes verificam parede intermediária, destino bloqueado e borda, mas não constituem prova de toda a semântica ou independência de todo o pipeline (render e representação continuam compartilhados).

## Evidência e testes

Manifesto e snapshots antes dos controles; eventos de restrições e diagnósticos em cadeia SHA-256 via Writer. Não se reivindica compromisso online anterior à observação: os pares são construídos offline. Verificador reproduz as quatro restrições, conjuntos e agregados e confere fontes/snapshots e cadeia: `LOCAL_PASSIVE_CONSTRAINTS_REPLAY_VERIFIED`, zero ações de ambiente. Escrita em C: e cópia para D: para evitar latência de fsync conhecida.

Três testes novos: semântica J2 nos casos físicos; distinção última transição/histórico e persistência do vazio; controle J1/J2 e replay. A inversão de ordem é conferida pelo próprio runner. O teste integrado e o run posterior são execuções locais declaradas, não replicações independentes ou pré-registro externo.

## Limites e próximo passo

Detecção na segunda restrição é resultado específico da fixture. As posições foram fornecidas separadamente; nenhum plano ou agente chegou a elas. Portanto o teste fecha D1 passivo, não D2 ativo nem comparação de exploração. Não houve LLM, expansão autônoma, WER nativo, WormGraph, assinatura, AppContainer, âncora externa, mudança de gate, resolução de tarefa fora da família ou transferência ARC.

Se um teste ativo posterior não esvaziar H no orçamento, isso indicará ausência de evidência discriminativa naquela execução; não identifica automaticamente como causa única uma falha de exploração. É necessário conferir se o ambiente, representação, possibilidade de acesso aos estados e hipóteses coincidem com o controle passivo.

## Reprodução

Com o venv neste diretório: `python run_history_family_control.py <diretório-novo>`; `python run_history_family_control.py verify <diretório>`. O pai precisa existir. Não sobrescreve resultados nem executa fontes arbitrárias do pacote.
