# DSL finito: verificação estática dos controles

Implementado finite_grid_dsl_types.py: registro de assinaturas monomórficas, formas polimórficas especiais, Option total, lambdas restritas aos combinadores, let, pair, fold e if. O if é explicitado como forma especial, pois os controles o usam embora a tabela revisada não o liste. Grid/Object/State são tipos opacos nesta fase; seu formato de runtime não foi validado por este módulo.

Controles construídos como JSON AST sem sharing na contagem: clique20 nós, movimento22; ambos tipam Pair[Grid,State] e cabem em24. Literais Offset/Count/Color separados, domínios finitos dos literais, aridade, binds, defaults de Option, igualdade de ramos e accumulator de fold são checados. Writes de State são rejeitados quando USES_MEMORY=False. 106 testes passaram, quatro novos. Isso não verifica semântica runtime ou sintetizabilidade dentro de1M candidatos.

Registro concreto evita depender do número40 da prosa. Nomes de binders não têm normalização alfa no checker; um futuro enumerador deve usar nomes canônicos finitos ou índices DeBruijn para evitar infinitas variantes equivalentes. Não se afirma que um conjunto de assinaturas isolado seja uma gramática de enumeração completa.

## Busca: correção necessária

Equivalência nos inputs do treino não autoriza eliminar um programa para fins de previsão futura. Exemplo: identidade e programa que pinta a célula clicada concordam em todas as transições de treino compostas somente por NOOP; divergem num CLICK futuro. Conservar só identidade pode descartar a hipótese correta. O problema persiste se ambos retornam o mesmo estado vazio no treino. Classes podem ser usadas como organização mantendo alternativas simbólicas; poda para apenas um representante é heurística, não preservação de completude sem uma equivalência contextual provada.

Com memória, assinar apenas trajetórias reais de treino também não prova equivalência de subexpressões sob outros estados possíveis. Bottom-up com poda observacional exige um contrato de amostragem/completude e representação dos membros; não se pode anunciar que1 representante mantém a família integral.

O limite MAX_HOLDOUT_ADMITTED não pode controlar geração de candidatos se o conjunto de busca deve ser fixado antes de consultar o sufixo. Pode limitar apresentação do relatório depois da avaliação, explicitando truncamento, ou admitir que o sufixo participa da seleção. Mesmo reportar todos os aprovados é seleção pelo conjunto de validação; uma conclusão confirmatória demanda avaliação final independente.

## Execução e dados

Sem watchdog, um bug real de loop infinito não produz INTERPRETER_BUG automaticamente: pode impedir qualquer retorno. Um aborto externo deve gerar RUN_INCOMPLETE com fronteira de busca registrada, e não rejeição científica do candidato por ser falso. Essa distinção permite núcleo de semântica com combustível determinístico sem prometer determinismo operacional sob bugs/falhas externas.

Step counter precisa cobrir nós, iterações e custo interno de primitivas; primitivas totais não são primitivas de custo unitário real. Recursos finitos garantidos pela linguagem não certificam ausência de bugs no interpretador. A aceitação de AST pelo checker não é isolamento OS.

Episódios completos requerem identificação explícita de início/fim no adapter, contagem de descartados e erro de split vazio. Não assumir que os traces já têm resets adequados ou episódios novos suficientes no sufixo sem essa checagem. Teacher-forced continua diferente de rollout.

Os negativos de modo oculto e memória necessária precisam de dados que sejam indistinguíveis sob TODAS as entradas/estado permitidos. Só repetir grid+ação não demonstra impossibilidade para programa com memória. Falta também aritmética para um contador genérico; state_get/set sozinhos não garantem expressibilidade de incremento.

## Estado de implementação

Typechecker e ASTs de controles: implementados/testados. Interpretador, enumeração, execução dos controles de dinâmica, gates de candidato e novos traces: não implementados/não executados nesta rodada. Nenhum kernel, política ativa ou submissão foi alterado.

Relatório com ASTs e hashes em D:/arkhe/output/arc3-finite-dsl-types-20261027/report.json.
