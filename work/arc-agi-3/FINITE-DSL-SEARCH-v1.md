# Busca tipada limitada: primeira execução

Implementado finite_grid_dsl_search.py com enumeração por tamanho e ordem fixa de produções, sem poda por comportamento no treino e sem leitura de sufixo. É um gerador tipado orientado pelo tipo de saída, não uma implementação bottom-up completa com todos os tipos polimórficos: usa perfil finito TYPES, pares somente Grid/State, lambdas só em match_option/fold, listas/Options concretos alcançáveis por esse perfil. O sistema de tipos e o interpretador podem aceitar programas fora deste perfil; não confundir busca completa no perfil com completa em todo DSL.

Binders recebem nomes canônicos por profundidade léxica b0,b1,etc. Não são índices DeBruijn serializados; evitam infinitas variantes alfa no perfil de enumeração. Nomes de var globais são g,a,s. A ordem é estrutural de produção definida no código, não ordenação global por JSON. Todos os programas retornados são checados novamente antes do replay. Não usa programa manual como seed.

## Orçamento declarado antes dos controles

- MAX_NODES24, preservando o contrato atual do typechecker.
- Até1000000 programas completos bem-tipados.
- Até20000 chamadas recursivas de geração de expressões, incluindo ramos improdutivos; limite adicional explícito para não deixar geração de parciais sem orçamento.
- Até10000 candidatos que passam replay; corte é pelo treino, sem holdout.
- Combustível10000 POR CHAMADA/PASSO execute, como já declarado anteriormente. Em n passos, teto de combustível executado é10000×n, não um novo orçamento de tempo total nem promessa de sucesso do episódio.

## Execução concluída, busca incompleta

|Controle|Programas bem-tipados examinados|Geração|Tamanho concluído|Tamanho iniciado|Replay PASS|
|---|---:|---:|---:|---:|---:|
|Clique|231|20000|5|6|0|
|Movimento|231|20000|5|6|0|

Ambos SEARCH_INCOMPLETE_GENERATION. Por tamanho:3→1,5→119,6→111. Os tamanhos sem programas também foram percorridos. O limite que encerrou foi o de geração, não1M de programas. O experimento executou até o orçamento; não esgotou a família. Ausência de sobrevivente não refuta a expressibilidade já demonstrada dos controles manuais20/22nós nem comprova falta de solução mais curta.

117 testes passaram, quatro novos: identidade encontrada e busca completa restrita até3nós; limite de geração sem rejeição de modelo; igualdade de relatórios em execução repetida; nenhum sobrevivente para clique em busca completa SOMENTE até3nós. Esses testes não demonstram recuperação dos programas complexos dentro de orçamento.

## Resultados e estados separados

search_status informa completude do espaço percorrido. Replay possui status por candidato, com consultas examinadas e motivo; interrompe na primeira divergência. ratification permanece NOT_EVALUATED porque nenhum holdout foi executado. SEARCH_INCOMPLETE pode coexistir com um candidato reprovado ou aprovado em critérios específicos: um status não substitui o outro.

A implementação não captura falhas Python inesperadas como erro científico de hipótese. StepLimitExceeded é rejeição pelo contrato de combustível desta rodada; erro operacional deve ser tratado externamente como run incompleto. Não há watchdog/processo isolado/execução de código arbitrário.

## Correções ao anexo

Combustível por chamada já estava explícito no contrato e implementação; não era pendência. Combinar movimento e memória pode aumentar AST, mas não prova impossibilidade de toda combinação em24nós; dependeria do programa e sharing via let. Elevar limite para32 não ajuda se a busca nem alcança6. Não podar por equivalência observacional evita aquele descarte, mas não garante exploração completa sob budgets. COMPLETE/SEARCH_INCOMPLETE são resultados de busca; ADMITTED/NOT_ADMITTED são decisões de candidato e não definições de não encontrei/procurei tudo.

Próximo bloqueio identificado: custo da geração de expressões pequenas no perfil. Melhorias futuras devem registrar qualquer mudança de espaço/ordem, por exemplo análise estática de tipos habitados e limites mínimos de tamanho, sem reduzir por equivalência apenas nos exemplos de treino. Não elevar orçamento silenciosamente nem promover conclusão de modelos ainda não encontrados.

Relatório e plano em D:/arkhe/output/arc3-finite-dsl-search-20261027/. Os quatro traces reais NÃO foram executados por esta busca, pois ela não recuperou os controles positivos. Nenhuma ação ARC, alteração de política ou submissão Kaggle.
