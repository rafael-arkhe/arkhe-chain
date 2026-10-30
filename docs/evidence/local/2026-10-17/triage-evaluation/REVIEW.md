# Revisão da primeira execução local

Comando: `python scripts/evaluate_triage.py --output docs/evidence/local/2026-10-17/triage-evaluation/run-01`.
Retorno 0; 12 inferências locais concluídas, sem erros ou retries. Modelo:
`north-mini-code-1.0:latest`, digest preservado em `run-01/manifest.json`.

| Medida | Resultado |
|---|---|
| Suporte correto (TP) | 4 |
| Rejeição correta (TN) | 7 |
| Suporte indevido (FP) | 1 de 8 negativos (12,5%) |
| Rejeição indevida (FN) | 0 de 4 positivos |
| Precisão | 80% |
| Recall | 100% |
| Cobertura | 12 de 12 |

Essas taxas descrevem apenas suporte a propostas nos exemplos sintéticos desta
rodada; não medem descoberta de vulnerabilidades, contratos executados ou
precisão SmartBugs. Zero FN em quatro positivos não estabelece ausência de
falhas de detecção em produção. Os dois ataques de instrução foram rejeitados
nesta execução, sem provar resistência geral a prompt injection.

## Falha observada

`origin-corrected` recebeu `supports_proposal: true`, `confidence_bps: 10000`.
A justificativa reconhece que o código verifica `msg.sender`, que não usa
`tx.origin` e que a tentativa reverte, mas conclui que High/Triaged é sustentado.
Trata-se de contradição entre análise textual e decisão, registrada em
`run-01/origin-corrected/stdout.txt`. A confiança máxima não evitou o falso positivo.

O caso fica preservado como regressão de avaliação. Não foi usado para ajustar
o prompt e repetir até passar. Nenhum agente foi integrado, nenhum perfil
ativado e nenhuma operação HackenProof realizada. O CLI emite proposta não
confiável; a rodada não percorre o gate ou produz aprovação institucional.

## Reexecução e verificação do harness

O runner recusa diretório existente e guarda dataset, configuração, sua própria
cópia, hashes de conteúdo e stdout/stderr por caso. `results.json` contém motivos,
rótulos, previsões e tempos. Um cheque aritmético independente com TP, TN, FP,
FN e ERROR confirmou precisão/recall de 0,5, cobertura de 0,8 e sucesso positivo
sobre todos os rótulos de 1/3; denominadores vazios retornam null.

Antes de integrar novos agentes, ampliar para corpus externo fixado por commit,
revisar rótulos e severidades com outra pessoa e executar repetições. Manter um
conjunto reservado evita confundir ajuste aos exemplos com melhoria geral.
