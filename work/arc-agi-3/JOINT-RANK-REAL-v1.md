# Avaliação cronológica arquivada — learner conjunto por rank

Runner evaluate_joint_rank_probe.py. Quatro traces seed0/cap5000, treino nos primeiros2500 dispatches, teste nos últimos2500, RESET excluído. Treina todos os pares elegíveis (inclusive mudanças de nível/estado no alvo render), sem exclusão para obter PASS. Modelos separados por trace, frozen hash após treino e após teste. Orçamento100000 matchings por transição e100000 vetores de inferência; nenhum cap de uma célula.

Predição é o próximo last-render inteiro; chave aprendida inclui ação canônica (com coordenadas se houvesse suporte), dimensões, fundo e multiconjunto ordenado de assinaturas. Cliques permanecem sem suporte. Gate queries>0/coverage1/acerto1/conflitos0. Como protótipo recebe apenas grids e ações, não testa conflito de observações SDK completas. A chave raw para grupos vistos/não vistos conserva hashes de observação e coordenadas do trace.

## Diagnósticos observáveis e não observáveis

Medem-se contagem de regiões, multiconjunto de assinaturas, fundo inferido e layout entre before/after. Regiões são componentes de paleta, não objetos semânticos. Cardinalidade constante não garante forma constante ou key aprendida, e alteração de cardinalidade no passo não implica necessariamente abstenção nessa predição (pode gerar erro se o before-layout for conhecido).

identity_order_stability_rate permanece null: comparar listas ordenadas sem IDs independentes não informa se uma identidade física trocou de slot. Identidades únicas por assinatura poderiam dar um diagnóstico condicionado à própria hipótese de assinatura, não uma verdade universal; assinaturas repetidas impedem estimar essa taxa sem novas hipóteses. Não aplicar limiares90%/50% sem fundamentação.

A ordenação que muda não torna a família geometricamente incoerente: pode existir uma regra por rank que continua correta mesmo com trocas de identidade. Ela diverge de regras por identidade quando o movimento físico depende de identidade e a ordenação muda. Os gates e erros medidos é que testam a família declarada.

Relatório fornece treino/teste de cardinalidade/layout e métricas futuras separadas para raw visto/não visto e layout/cardinalidade estável/alterada. As divisões por outcome são diagnósticos retrospectivos; não podem selecionar comportamento em tempo de inferência.

Nenhuma ação nova ARC, política ou submissão Kaggle. As transições são retrospectivas e já exploradas anteriormente; resultados não são holdout confirmatório.

## Resultado concluído

87 testes passaram. Quatro gates FAIL. Treino ls20: frontier7/2481 emitidas e corretas;random8/2481. vc33:0/2452 em cada trace por clique sem suporte. Teste:9864 consultas,8687raw não vistas;zero previsões,erro condicional indefinido. Todos os hashes de modelos congelados permaneceram iguais; hashes de fonte e traces conferidos.

|Trace|Mudança de cardinalidade|Mudança de layout|Consultas totais|
|---|---:|---:|---:|
|frontier-ls20.jsonl|462 (9.31%)|4942 (99.60%)|4962|
|frontier-vc33.jsonl|271 (5.53%)|4903 (100.00%)|4903|
|random-ls20.jsonl|421 (8.48%)|4950 (99.76%)|4962|
|random-vc33.jsonl|267 (5.45%)|4903 (100.00%)|4903|

Em ls20, todas as consultas de teste resultam NO_SUPPORTED_HYPOTHESIS; em vc33,UNSUPPORTED_ACTION. Fundo inferido não muda nesses pares. Cardinalidade baixa não torna viável o modelo: multiconjunto de formas/cores muda em quase todas as transições. Não se atribui a mudança ao HUD nem se promove máscara. A taxa de mudança do layout em passos é diferente da frequência de encontrar uma chave de layout/ação aprendida no treino. Taxa de ordenação física continua indefinida. Esses resultados limitam a família que exige translação preservando toda a cena, não invalidam modelos locais que preservem outras variáveis.
