# JSON Schema real no decoder: propostas chegam ao replay

Implementado dsl_output_schema.py e condição format=schema() no adapter Ollama. O schema é gerado do registro atual do DSL, usa op/args e não a representação kind do anexo. Preserva AST atual e inclui if, lambda, let, fold, Options e literais Coord em arrays. Aridade por operação é derivada das assinaturas: translate/is_blocked têm4argumentos. Valores de literais e campos exigidos são restritos pelo schema. Nome de binder de let é name, não binder.

O adapter passou a aceitar format_spec opcional; padrão continua json. O código anterior foi preservado em output/arc3-local-proposer-examples-20261027/source-ollama_dsl_proposer.py para reproduzir aquela rodada. Nenhuma atualização do Ollama, novo modelo ou ajuste de prompt foi feito.

## Plano e verificação de fatores

Mesmo north-mini-code-1.0:latest, evidência, exemplos genéricos, temperature0/seed0, contexto8192, saída1024, duas chamadas por controle e4totais. A comparação dos request-1.json confirma bytes idênticos no prompt e igualdade de todas as opções; só format mudou. Pedidos de reparo posteriores recebem o contraexemplo do estágio atingido, conforme o mesmo ciclo. A comparação continua exploratória/histórica, não inferência estatística com seeds independentes.

Fonte da API: https://docs.ollama.com/api/generate e https://docs.ollama.com/capabilities/structured-outputs . O campo format suporta objeto JSONSchema. A versão instalada0.40.11 aceitou o schema nesta execução. Isso não certifica suporte irrestrito a qualquer palavra-chave/schema.

## Resultados

134 testes passaram, cinco novos. Foram4 requests:1falha operacional HTTP durante inicialização CUDA e3respostas completas. A chamada de clique foi repetida uma vez dentro do teto original2porcontrole. As3respostas completas passaram na validação independente do schema, no parser e no typechecker e foram executadas. Todas falharam no primeiro par do replay.

|Condição|Requests|Respostas completas|ASTs aceitas/tipadas|Replay executado|Replay PASS|
|---|---:|---:|---:|---:|---:|
|JSON com exemplos (anterior)|4|4|0|0|0|
|Schema com mesmos exemplos|4|3|3|3|0|

As3propostas foram o MESMO programa de7nós: lets reatribuindo g/s e retorno pair(g,s), isto é, identidade. Não se tratam de3hipóteses independentes. No movimento, divergiu em2pixels da primeira transição (origem/destino); no clique, a célula esperada não foi pintada. Nenhuma proposta foi corrigida manualmente e nenhum candidato foi admitido.

Usage reportado:4579tokens de entrada,342de saída nas respostas completas;203,39s de walltime somados nas4calls, incluindo erro operacional onde aplicável. Tokens da chamada falha não foram retornados. Carregamento separado está no report; métricas não são custoCPU nem comparação justa de velocidade. Modelos descarregados e servidores iniciados pela tarefa encerrados.

## Validação e limites

O schema não limita o total de nós recursivos nem resolve escopo, retorno Pair[Grid,State], typing entre operações, combustível ou correção preditiva. Typechecker continua responsável. Saída truncada, aborto operacional ou suporte parcial do backend ainda podem produzir JSON/schema inválido; inspecionar cada resposta, não prometer impossibilidade de falhas estruturais.

A validação local usa JSONSchema por ramo disjunto op/type e percorre cada filho uma vez; evita retraversar todos os filhos em todas as alternativas anyOf. Campos extras, aridades e valores são checados por jsonschema; não substitui o typechecker e não prova equivalência formal do validador em todo domínio. Os testes cobrem ASTs dos controles, campos faltantes, translate4, Coordarrays e schema válido com programa mal-tipado.

A barreira de forma foi superada nas respostas observadas. O resultado agora é erro de comportamento dos candidatos executados, não mera ausência de schema. Não demonstra incapacidade universal do modelo, DSL ou abordagem. Próxima investigação semântica deve preservar orçamento e não confundir identidade válida com aprendizagem do programa desejado.

## Correções ao anexo

Respostas iguais não permitem inferir compreensão interna ou esforço do modelo. Falta de melhora numa condição de exemplos não refuta prompt como possível fator. Aridade errada é erro de formação/tipagem estática, não evidência de erro nas regras do mundo. JSONSchema pode impor aridade exata e partes dos domínios, embora não substitua relações de tipo e escopo.

Não usar o schema do anexo diretamente: além da representação incompatível, omitia if/lambda earraysCoord e excluía primitivas4-árias. Mudar para aquela representação sem adapter mudaria linguagem/serialização junto do decoder. Erro CUDA local não demonstra versão incompatível com schema e não autoriza atribuir a falha ao decoder.

Relatório, prompts, respostas, schema completo, comparação de fatores e hashes em D:/arkhe/output/arc3-local-proposer-schema-20261027/. Nenhuma ação ARC, integração nativa nova, alteração de política ou submissão Kaggle.
