# Reanálise dos erros do seletor congelado

Reutiliza somente contadores de teste do relatório completo output/arc3-region-selector-20261027/report.json. Sem novo ajuste, nova hipótese executada ou repetição de traces.

|Trace|Positivas|TP|FN entre respostas|Positivas abstidas|Fração das positivas não detectadas por abstenção|
|---|---:|---:|---:|---:|---:|
|frontier-ls20|8102|7701|43|358|89,28%|
|random-ls20|8177|7208|23|946|97,63%|
|frontier-vc33|3069|1193|1|1875|99,95%|
|random-vc33|3000|1315|1|1684|99,94%|

Recall aqui conta abstenções no denominador positivo. O anexo confunde abstenções com falsos negativos emitidos. Em vc33, não há evidência de que o seletor esteja classificando grandes quantidades de regiões tocadas como não tocadas. O suporte é escasso:5788/4809 queries de feature sem chave conhecida e3029/2852 com suporte insuficiente, entre todas as regiões de teste. Esses totais não estão separados por classe; não atribuir toda positiva abstida a um motivo específico sem novo cruzamento.

Em ls20,17614/19321 consultas têm chaves com labels conflitantes: não é apenas falta de exemplos. Novas features poderiam separar conflitos, ou a própria política de abstinência/família estatística poderia ser inadequada; nenhuma causa está identificada por esses contadores.

## Correções ao enquadramento

Features incluem posição absoluta, forma inteira, contexto e a ação completa (inclusive coordenadas de clique). Não são um teste isolado de local versus global. Atribuir a diferença entre jogos à natureza global do vc33 ou declarar inadequação para todos os jogos de clique não decorre das métricas. Features globais são uma hipótese para ablação controlada, não uma necessidade demonstrada.

O alvo é alteração em células antigas, não movimento de sprite nem estado lógico. Recall alto não valida identidade ou semântica objeto-cêntrica. Nenhum resultado local autoriza classificar execução como THEOREM por si só.

## Transformação e composição

Classificar retrospectivamente translação/forma/cor/desaparecimento pode ser diagnóstico, mas não fornece uma função de roteamento utilizável em teste. Escolher a transformação com a classe derivada de after durante inferência é vazamento. Correspondências não precisam ser únicas e uma classificação não deve escolher um matching arbitrário.

Label0 do seletor NÃO autoriza copiar o objeto inteiro como persistente: o controle de crescimento já demonstra label0 com after diferente de before. É preciso prever regiões de destino e fundo, e a forma do objeto pode mudar fora das células antigas. Aplicar apenas a translação das regiões positivas ao resto persistente reintroduz justamente essa falha.

Um próximo modelo requer transformação e roteamento definidos no treino e congelados, sem seleção por after; o seletor atual permanece um componente descritivamente validado no próprio alvo. Erros ou abstenções não demonstram automaticamente necessidade de outras features, outra família ou modelo programático. Gate histórico não estabelece utilidade futura.

Relatório numérico em D:/arkhe/output/arc3-selector-error-audit-20261027/report.json. A suíte93→96 foi executada na implementação anterior; esta reanálise não adiciona código de predição nem testes. Sem nova ação ARC, política ou submissão Kaggle.
