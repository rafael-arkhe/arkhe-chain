# Carga de revisão e comparação de limiares em sombra

## Estado atual

ReviewRouter, composição dos sinais, fila priorizada, proteção no gate e seed
origin-corrected já foram implementados na rodada anterior. A tabela do novo
anexo que os descreve como ausentes não corresponde ao código atual. A política
de governança existente não foi promovida a aprovada/ativa por estas mudanças.

Esta rodada acrescenta telemetria de carga por severidade e comparação em sombra.
ThresholdProposal continua somente proposta; sua eficácia neste domínio não foi
demonstrada. Não foi implementada ativação automática, calibração online ou
dispensa de revisão com base na confiança. Critical/High continuam encaminhados
para revisão e a configuração padrão continua sem automação.

## Métrica observada, com denominador explícito

`review::telemetry` registra as três saídas do roteador, incluindo AutoAccept e
AutoReject que não entram na fila de pendências. Medir só os itens dessa fila
criaria seleção no denominador e poderia apresentar 100% artificialmente.

`observed_review_routing_fraction = ReviewRequired / total de snapshots de roteamento observados`.

Cada snapshot vincula caso, solicitante, operation_id, relatório, parâmetros,
políticas, versão do modelo, severidade proposta e origem. Retries idênticos não
aumentam o total; uma decisão atualizada substitui a observação anterior daquele
snapshot. Mudanças de política/modelo/snapshot formam estratos distintos. Não é
um log de todas as tentativas, medida de flip rate, amostra independente ou taxa
populacional. Os estratos separam fonte histórica de observações do executor.

O relatório inclui contagens por severidade, modelo, política e origem, razões de
encaminhamento, backlog pendente e casos concluídos. Razões se sobrepõem e são
deduplicadas dentro de cada caso: não somá-las como se fossem pessoas distintas.
HighImpact obrigatório é distinguível de Ambiguity ou UnknownConfidence.
Casos concluídos saem do backlog, mas sua decisão de roteamento permanece na
medição. AutoAccept significa destino proposto, não autorização ou escrita executada.
Falhas posteriores de gate/dispatch, reconciliação e trabalho humano fora do fluxo
não são quantificados por essa fração de roteamento.

Sem observações, a fração é null, não zero. Filas antigas sem telemetria informam
quantos casos não têm observação; não inventam um denominador retroativo. Leitura
de métricas não modifica o arquivo. A persistência e os limites da fila operacional
local continuam os documentados em REVIEW-ROUTER-2026-10-18.md.

**Essa fração não é a ΓArea formal de SA-ROC.** O campo gamma_area permanece null
com status NOT_COMPUTED. Não há implementação da definição matemática do artigo,
conjunto de dados e parâmetros necessários para atribuir esse nome ao resultado.
Também não se presume que toda revisão seja indecisão estatística: parte dela é
obrigatória por impacto/política. Percentual observado de encaminhamento não mede,
sozinho, tempo de revisão, custo monetário ou saturação do revisor. Esses valores
e concordância humana permanecem null quando não medidos.

## Modo sombra

`compare_shadow` aplica uma política candidata às mesmas observações retidas e
reporta destinos ativos versus simulados, matriz de transições, mudanças e frações
por severidade. É comparação de regras, não nova inferência ou implementação de
uma política no gate. O comando só lê fila e política; não grava decisões ativas,
altera limiares de produção ou despacha operações. Backlog nos sub-relatórios de
sombra fica null, pois simular destinos não cria nem resolve tarefas reais.

O resultado é SHADOW_ONLY_NO_POLICY_MUTATION_NO_DISPATCH,
production_authorized=false e eficácia
CONJECTURE_NOT_EVALUATED_AGAINST_VALIDATED_HUMAN_LABELS. Concordância humana não é
calculada sem pares de rótulos humanos validados. Menor encaminhamento ou maior
concordância retrospectiva, isoladamente, não demonstra menor risco. Promoção
exige revisão, política ratificada e avaliação prospectiva de erros, cobertura e
carga; o holdout e os critérios de run-02 continuam protegidos.

Para comparar uma ThresholdProposal, exporte seu campo candidate como um novo
arquivo ReviewPolicy e preserve a proposta com seus vínculos de feedback. Isso
não valida os feedbacks nem aprova a configuração. Shadow aceita uma política
candidata como dado para simulação, nunca como autoridade.

## Prioridade e pesquisa

A fila continua ordenada por severidade, incerteza autorrelatada, divergência e
ID estável. É uma heurística determinística. Não se rebatizou essa ordenação como
Max Ratio/Max KL e não há HMM, distribuição posterior ou função de utilidade de
triagem que permita alegar a aplicação daqueles algoritmos ou ganhos empíricos.
A aplicação a triagem de severidade e a eficácia da adaptação permanecem hipóteses.
Esta implementação não herda taxas ou limiares universais dos artigos citados no
anexo e não constitui validação bibliográfica deles.

## Uso e evidência local

```powershell
cargo run -p arkhe-bugbounty --bin review_queue -- metrics <fila.json>
cargo run -p arkhe-bugbounty --bin review_queue -- shadow <fila.json> <candidate-policy.json>
```

Foi preparada uma cópia isolada da fila em
`docs/evidence/local/2026-10-18/review-shadow/queue.json`, com proveniência e hash
da fila original. A importação explícita do seed acrescenta uma observação histórica
de origin-corrected, verificando relatório/parâmetros contra o stdout retido.
A fila original e os resultados históricos ficam preservados. A divergência
textual continua suspeita apontada pela auditoria, não revisão humana concluída.
Um único seed não representa todo run-01 nem o tráfego futuro de triagem.

Resultados e logs:
`docs/evidence/local/2026-10-18/review-shadow/RESULTS.md`.
Testes cobrem os três destinos no denominador, retry sem duplicação, recuperação
da telemetria, dados legados sem denominador inventado, severidade sem amostra,
matriz de sombra e ausência de mutação/promoção. Não houve nova inferência,
parecer humano, escrita HackenProof ou execução de run-02.

## Resultado local observado

A suíte final `cargo test --workspace --locked` passou: 82 testes, sem falhas. Formatação e verificação de arquitetura passaram. Os registros incluem hashes de fonte iguais antes e depois de cada comando.

O único snapshot histórico é High: 1/1 encaminhado para revisão, zero aceitações e zero rejeições automáticas. A candidata em sombra produziu zero mudanças. As demais severidades não têm amostras; suas frações são `null`. Isso demonstra o mecanismo, sem estimar eficácia ou representatividade. Relatórios estruturados: `docs/evidence/local/2026-10-18/review-shadow/metrics.json` e `shadow-report.json`.

A fila original preservou SHA-256 `f3d04ae5c8630c3ed2bc86aa8cc3fa5e149c9ea6e9805a1fea4bf8b06e3a28c0`. Uma segunda execução de métricas e sombra preservou byte a byte a fila isolada e a política candidata. Produção permanece não autorizada.
