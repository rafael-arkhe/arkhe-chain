# Perfil reduzido + existência estática por tamanho

Implementado finite_grid_dsl_controls_search.py, preservando a busca anterior. PROFILE_CONTROLS tem12 operações monomórficas explícitas e6 formas especiais (pair/if/list_head/is_some/option_default/match_option), mais lambda como binder de match. Mantém todos os literais finitos do checker nas posições tipadas alcançáveis. Não inclui let/fold ou demais primitivas da busca anterior; essa é mudança do espaço, não otimização preservando todo o perfil anterior. Controles manuais de clique/movimento e operadores de memória continuam expressíveis; suas ASTs não foram injetadas como sementes da busca.

Análise opcional inhabits(tipo,tamanho,tipos_disponíveis) usa memoização e respeita o tipo introduzido pelo binder. Antes de gerar argumentos de uma produção, verifica se TODOS são habitados nos tamanhos alocados. Evita expandir um argumento produtivo quando outro é impossível. Não testa conversão genérica Grid→Bool; a enumeração já esperava os tipos exatos desde a primeira implementação.

## Plano e resultados

Mesmo limite de20000 chamadas de geração por rodada, MAX_NODES24,1M candidatos completos e10000 combustível/execute. A variante com análise tem orçamento ADICIONAL explícito de100000 estados de análise; não se afirma igualdade de custo computacional entre variantes. Atingiu só104 estados de análise em cada busca. Não há poda observacional ou consulta a sufixo.

|Perfil|Existência estática|Candidatos completos|Tamanho completamente percorrido|Tamanho iniciado|Replay PASS|
|---|---|---:|---:|---:|---:|
|Original (rodada anterior)|não|231|5|6|0|
|Controles|não|8004|9|10|0|
|Controles|sim|14244|10|11|0|

Cada linha reduzida vale tanto para clique quanto para movimento, executados separadamente nos mesmos exemplos da busca original. Todas as4 buscas novas terminaram SEARCH_INCOMPLETE_GENERATION. A análise aumentou candidatos14.244/8.004≈1,78× por igual limite de chamadas de geração; reduzir o perfil deu8.004/231≈34,65× nesse contador. Isso não é speedup de CPU, não é garantia assintótica e não recupera controles de20/22 nós. Chamadas de geração e número de ASTs não são a mesma unidade.

121 testes passaram, quatro novos: análise com e sem poda gera a MESMA sequência completa de ASTs para tipos selecionados e tamanhos1..5; existência depende do escopo; limite da análise produz status incompleto; perfil inclui operadores dos controles. Igualdade desses pequenos conjuntos é regressão local, não prova formal de preservação em todos os tamanhos.

## Correções ao anexo

20.000/231≈86,58 é uma razão de contadores diferentes, não prova que cada candidato custe exatamente87 operações. Os231 incluem111 candidatos no tamanho6 parcialmente percorrido: não foram todos produzidos em5nós. O crescimento superexponencial e a previsão sobre100× orçamento não foram medidos. Eficiência e orçamento são fatores distintos, ambos podem importar.

Reduzir40 para14 não fornece um fator3^n: aridades, tipos, terminais, binders e distribuição de tamanhos alteram contagens. O código não tinha40 primitivas indistintas competindo em cada nó. O tipo-alvo já orientava a geração; a análise nova elimina tamanhos/escopos estaticamente impossíveis, não introduz pela primeira vez orientação pelo resultado.

Táticas não são necessariamente incapazes de generalizar entre jogos; seria necessário testar o domínio e suas abstrações. Falhar nos controles sob este orçamento não prova impossibilidade de encontrar qualquer programa para um trace real com solução mais curta; nesta linha, recuperar controles positivos continua um requisito experimental escolhido antes de avançar.

## Próxima etapa e limites

Sem recuperação dos controles, não se executaram traces reais ou holdout. Está demonstrado um ganho localizado de exploração, não um sintetizador eficaz. Próximas alterações precisam separar aumento de orçamento, caching de subexpressões/derivações tipadas, ordem de busca e perfil. Não introduzir macrotáticas derivadas da solução e apresentá-las como síntese na gramática original.

Relatórios e orçamento pré-execução em D:/arkhe/output/arc3-controls-profile-search-20261027/. Nenhuma nova ação ARC, política alterada ou submissão Kaggle.
