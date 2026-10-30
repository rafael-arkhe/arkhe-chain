# Interpretador do DSL: controles dinâmicos

Implementado finite_grid_dsl_runtime.py; finite_grid_dsl_types.py recebe add:Offset×Offset→Offset com saturação[-64,64]. Não usa eval/exec, código sintetizado Python ou imports fornecidos por AST. É um interpretador de linguagem restrita, não um sandbox OS. Não há subprocesso/watchdog nesta fase; um bug Python fora do combustível permanece risco de execução operacional.

## Semântica executada

Grid64x64 de inteiros0..15, entrada validada e convertida em tuplas imutáveis; escrita copia somente linhas tocadas. Action é MOVE(dx,dy),CLICK(x,y),NOOP com campos/intervalos estritos; Move(0,0) e clique fora da tela são erros de entrada, não ações silenciosamente substituídas por noop. State tem quatro chaves e offsets limitados, com validação de saída e limite de4096bytes. Stateless recebe/devolve{}.

If e match_option são lazy. Let tem escopo léxico; fold transporta acumulador explicitamente sobre lista snapshot; closures são estruturas do interpretador, sem execução de Python arbitrário. Option usa tag explícita. Grid_objects usa o grid ARGUMENTO e ordem de descoberta(y,x), componentes4-conexos, fundo moda/tie menorcor. Isso resolve a ambiguidade anterior de objetos sempre calculados só uma vez para qualquer grid intermediário; o snapshot é o valor da lista efetivamente passado ao fold.

Translate limpa células visíveis antigas com o fundo inferido da grid argumento, desloca e escreve cor, clipa fora dos limites e pode sobrepor pixels. Is_blocked verifica bounds e ocupação exceto células próprias. A lógica do controle decide se bloqueia antes de translate; translate não recebe comportamento de colisão implícito. Componentes são estruturas geométricas, não identidades semânticas.

## Combustível

Limite10000 por chamada execute. Conta visitas de AST, aplicações de closure, iterações e operações explícitas de células/vizinhos/cópias de linha. Fundo é cacheado por identidade imutável de grid dentro de cada chamada; contagem inicial e extração custam scans explícitos. É um custo lógico definido, não medição exata de CPU nem garantia de tempo/memória no OS. Parsing/typechecking/validação de fronteira ficam fora do orçamento do programa. StepLimitExceeded interrompe avaliação modelada; interrupção externa ou bug inesperado não demonstra falsidade da hipótese.

## Controles executados (programas escritos manualmente)

|Controle|Nós|Combustível|Resultado|
|---|---:|---:|---|
|Clique|20|146|Pinta exatamente a célula clicada; input preservado|
|Movimento livre|22|8351|Move uma célula à direita|
|Movimento bloqueado|22|8219|Grid permanece igual|
|Memória|21|17/148|Estado{k0:1}→{k0:2}; pixel(0,0) muda no segundo passo|

113 testes passaram, sete novos. Incluem empty scene, NOOP, fold pintando vizinhos do canto, saturação, ações inválidas, combustível baixo e entradas/estado com validação. Não certificam todos os inputs possíveis ou ausência de bugs.

Negativo de modo oculto: duas execuções com o MESMO grid, ação e estado inicial retornam a mesma saída; dois targets diferentes não são simultaneamente satisfeitos. O teste executa o controle escolhido. A impossibilidade para todo modelo determinístico decorre da indistinguibilidade dessas entradas, não de enumeração exaustiva realizada. Controle de memória separa dois passos com o mesmo before/ação, mas estados distintos, e demonstra o recurso para o programa fornecido, não síntese automática.

## O que ainda não foi feito

Enumerador, poda, synthesize, política holdout, restore/replay engine, execução sobre traces reais e integração nativa: não implementados nesta rodada. Programas corretos não foram ENCONTRADOS por busca. Opção de primeira busca: sem descarte por equivalência apenas no treino. Orçamento finito produz busca incompleta quando corta a enumeração; não podar não garante que todos os programas expressíveis serão alcançados. Agrupar alternativas mantendo todos os membros não é automaticamente mais eficiente.

Fonte/ASTs e relatórios estáticos anteriores permanecem históricos; hashes do typechecker mudaram ao adicionar add. Relatório desta revisão fixa ambos os hashes atuais em D:/arkhe/output/arc3-finite-dsl-runtime-20261027/report.json.

Nenhuma ação ARC, alteração da política ativa, autenticação externa ou submissão Kaggle.
