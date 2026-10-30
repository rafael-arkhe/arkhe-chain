# Seletor congelado de alteração na região visível

Implementado region_change_selector.py como componente independente. Não é modelo híbrido completo e não transforma pixels. Label: ao menos uma célula ocupada pela região no before tem valor diferente no after. Não se chama o label de movimento de objeto ou de persistência semântica.

Features apenas before+ação: cor, forma normalizada, posição x/y, área, distância à borda e valores de paleta no contorno8 da região; ação canônica completa inclui coordenadas de clique. Usa lookup local de features, suporte mínimo2 e um único rótulo observado; sem suporte ou com conflito abstém. Não pressupõe que o rótulo se torne invariável no futuro. Não é um seletor com probabilidades nem teste de calibração. A posição absoluta limita transferência espacial e foi declarada antes da execução.

Quatro traces históricos seed0/cap5000: primeiros2500 dispatches para treino, últimos2500 para teste, RESET excluído, modelo separado por trace e congelado. After somente produz labels de treino e mede acerto; função predict recebe apenas a chave de features before/ação. Cliques podem ser features desse classificador, mas isto NÃO implementa a dinâmica de clique nem altera a falta de suporte nos probes de translação.

Métricas por região: queries, emitidas, corretas, TP/FP/FN/TN entre emitidas, abstenção, cobertura, cobertura correta, erro condicional e recall das regiões tocadas usando todas as positivas, inclusive abstenções. Baseline sempre-untouched em todas as consultas é registrado, sem alegar superioridade comparando subconjuntos diferentes. Não é bootstrap nem inferência independente por região.

## Controles e limites

Três testes: predict não recebe after nem modifica o hash; labels conflitantes causam abstenção; crescimento deixa as células antigas inalteradas e pode receber label0 apesar de after!=before. Esse último é um limite do próprio alvo, não sucesso de persistência.

O modelo de transformação permanece NÃO IMPLEMENTADO. hybrid_gate=NOT_EVALUATED_NO_TRANSFORMATION_MODEL. Acerto alto do seletor não certifica full-render, crescimento, cor em novos pixels, desaparecimento ou composição sem colisão. Regiões nunca rotuladas como tocadas no treino não se tornam semanticamente estáticas.

## Precisões ao anexo

A translação de uma célula no controle modifica origem e destino; olhar só a região antiga omite metade NAQUELE exemplo, não metade em todos os traces. Os336/380 pixels de fundo alterados não são necessariamente destino/origem de objetos: podem ser criação, apagamento, mudança de cor ou representação. Média2532/80=31,65 pixels sem distribuição nem referência não estabelece mudança substancial. Passagem de testes locais não demonstra correção universal.

Não olhar para after no teste significa usá-lo fora da inferência apenas para avaliação, não proibi-lo no avaliador. Seletor errado não implica apenas features insuficientes; transformação errada não força outra família; ambos errados não demonstram necessidade exclusiva de modelo programático. Gate de ajuste histórico não decide sozinho utilidade preditiva futura.

Execução retrospectiva exploratória; novos controles não a tornam holdout cego. Sem nova ação ARC, alteração de política ou submissão Kaggle. Saída em D:/arkhe/output/arc3-region-selector-20261027/.

## Resultado concluído

96 testes passaram. Quatro execuções completas, hashes congelados preservados e artefatos de modelo conferidos.

|Trace|Regiões no teste|Cobertura|Erro entre respostas|Recall touched (inclui abstenções)|
|---|---:|---:|---:|---:|
|frontier-ls20.jsonl|47128|62.50%|0.255%|95.05%|
|frontier-vc33.jsonl|36448|75.64%|0.025%|38.87%|
|random-ls20.jsonl|47034|58.60%|0.116%|88.15%|
|random-vc33.jsonl|36473|78.82%|0.003%|43.83%|

Os casos de label0 não autorizam copiar a região como objeto persistente: crescimento fora do footprint pode ocorrer. A cobertura seletiva abaixo de1 no próprio treino impede aprovação pelo gate integral se ele fosse aplicado a esse componente; o gate full-render do híbrido continua não avaliado. A taxa de erro de treino zero entre respostas decorre da regra única por chave ajustada nesses dados e não é validação independente. Os muitos componentes por frame não equivalem a amostras independentes. Não foi provada melhoria de ações ou RHAE.
