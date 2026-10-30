# R3 — comparação exploratória de orçamento 10 versus 20

Executado em 2026-10-28 por `run_r3_budget.py`. Pacote `arc3-r3-budget-20261028`. O orçamento 20 foi escolhido **depois** de inspecionar a falha do R3 anterior. Trata-se de diagnóstico exploratório, não confirmação independente ou pré-registro externo.

## Protocolo pareado

Família simétrica fornecida de 600 candidatos, mesmos cinco casos verdadeiros centrados em P2, layouts 42,43,44 e seeds de R3. Quinze episódios por orçamento, horizonte 50, trinta episódios e 1.500 ações no total. Prior uniforme por candidato, J1 destino apenas, A1 greedy, BFS e permanência idênticos. Alvo diagnóstico 4, recompensa original cor 3. Varia somente `exploration_budget=10` ou `20`.

Runner reaproveita exatamente o controlador usado por R2/R3, sem editar fontes dos pacotes antigos. O orçamento esgotado desabilita planejamento até o fim do episódio, mas não interrompe ações A1/fallback ou a filtragem das hipóteses. Portanto não é um teto absoluto sobre quantas transições podem ensinar ao learner: é um limite para elegibilidade de planejamento.

## Resultado (LEMMA local)

| Métrica | Orçamento 10 | Orçamento 20 |
|---|---:|---:|
| Singleton correto ao final | 15/15 | 15/15 |
| Passos até singleton | 4–16 | 4–16 |
| Planejamento desabilitado por orçamento | 1 | 0 |
| Terminal no alvo diagnóstico | 14/15 | 15/15 |
| Emitidas/exatas | 674/674 de 750 | 674/674 de 750 |
| Cobertura | 89,87% | 89,87% |
| Acerto ITT em pares novos | 67/143 | 62/138 |
| Recompensa terminal | 0/15 | 0/15 |

Orçamento 10 reproduziu os agregados do R3 anterior. A redução do ITT no subconjunto de pares novos não representa novos erros: a trajetória mudou e seu denominador também; em ambos existem 76 abstenções no total e nenhum erro emitido. A análise de acurácia condicional depende da verdade estar no espaço fornecido e de previsão por consenso.

### Caso JUMP_ACTION2/layout42

| Evento | Orçamento 10 | Orçamento 20 |
|---|---:|---:|
| Singleton correto | passo 16 | passo 16 |
| Primeira chegada ao alvo | passo 17 | passo 17 |
| Permanência após chegada | 4/33 | 33/33 |
| Terminal | fora dos marcadores | marcador 4 |

O orçamento maior não acelerou identificação nem primeira chegada neste caso. Permitiu que o controlador BFS/permanência fosse ativado após singleton tardio. Com orçamento 10, o agente continuou escolhendo por A1 mesmo depois de identificar, e saiu do marcador. Assim, a diferença terminal expõe a regra de desabilitação persistente do planejamento; não demonstra ganho de capacidade do learner ou necessidade universal de 20 ações.

Os outros 14 pares não tinham falha de orçamento. Os passos de singleton são iguais nos 15 pares. R3 não "identificou as 600 hipóteses": identificou corretamente as 15 regras verdadeiras testadas dentre 600 candidatas.

## Correções ao anexo

Para uma ação fixa, há 96 variantes com salto nessa ação (4 direções × 24 permutações) e **384** com salto em outras ações, não 360. Somadas às 120 originais, totalizam 600. Fixar também a direção do salto deixa 24 compatíveis em H0; o prefixo pode reduzir ainda mais.

Ausência de singleton não impede previsão por consenso. Um agente pode emitir previsões corretas e justificadas sobre uma consulta mesmo com várias hipóteses sobreviventes; emitir não equivale automaticamente a sobreconfiança. A comparação não autoriza atribuir "honestidade" a uma família e ausência dela à outra.

Se aumentar o orçamento não melhorasse o terminal, isso não identificaria necessariamente a estrutura da família como causa: navegação, horizonte, regra de parada e acesso a evidência também podem limitar o resultado. O resultado positivo observado tampouco estabelece viabilidade geral, orçamento ótimo, superioridade sobre R2, generalização entre famílias ou AGI. Descrições normativas como "melhor/pior" precisam de métrica e população; não são refutadas apenas por dependerem do objetivo.

## Evidência e reprodução

Manifesto com a escolha pós-resultado declarada, família enumerada e snapshots antes da coleta. Compromissos Writer com flush/fsync antes de env.step. Observações e planos vinculados nos logs. Verificador reexecuta os 30 episódios e confere fontes/snapshots, cadeia, ações, transições e agregados: `LOCAL_FULL_REPLAY_VERIFIED`, 1.500 ações. O teste integrado anterior ao piloto executou cinco casos por orçamento no layout42, conferiu a falha conhecida/recuperação/permanência e replay. Esses testes e reruns são execuções locais declaradas, não replicações independentes.

Escrita em C: e cópia a D: para evitar latência conhecida de fsync. Nenhum LLM, expansão autônoma, AppContainer, WER nativo, WormGraph, assinatura, âncora externa ou alteração de gate. Não estabelecidas autenticação histórica nem confidencialidade de holdout. R2-fora e priors 50/50 não executados.

No venv e neste diretório: `python run_r3_budget.py <diretório-novo>`; `python run_r3_budget.py verify <diretório>`. O pai deve existir e não há sobrescrita. A verificação usa fontes instaladas correspondentes aos snapshots, sem executar snapshots arbitrários.
