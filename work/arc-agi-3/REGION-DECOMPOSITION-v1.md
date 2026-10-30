# Decomposição observacional das mudanças de regiões

Script decompose_region_changes.py, 20 transições por trace (10 treino/10 teste igualmente espaçadas entre passos não RESET),80 no total. Esta amostra determinística serve diagnóstico; não estima taxas populacionais com IC nem substitui a avaliação integral anterior.

|Trace|Amostra|Multiconjunto de formas muda|Multiconjunto de cores por região muda|Cardinalidade muda|Assinaturas repetidas em algum frame|
|---|---:|---:|---:|---:|---:|
|frontier-ls20.jsonl|20|20|4|2|20|
|frontier-vc33.jsonl|20|20|2|2|20|
|random-ls20.jsonl|20|20|1|1|20|
|random-vc33.jsonl|20|20|1|1|20|

Formas normalizadas são comparadas sem cor e sem posição; cores são contadas por componente, não frequência de pixels. Ambas são marginais: não rastreiam qual região virou qual. Nenhuma taxa semântica shape_change_rate é definida. Não atribuir mudanças a objetos persistentes, UI, animação ou mecânica sem evidência adicional.

Todos os pares amostrados mudam o multiconjunto cor/forma. Logo não há bijeção completa que preserve todas as assinaturas nesse modelo; contar permutações por assinaturas repetidas não mede ambiguity de pairing semântico quando parte da cena muda de assinatura. Repetição em80/80 apenas identifica não-unicidade de descritores. Não decide automaticamente entre tracking, mudança de forma ou código programático.

## Correções ao anexo

- Cardinalidade igual não prova ausência de aparecimento/desaparecimento: entradas e saídas podem se compensar; componentes também podem dividir/fundir. A taxa baixa descreve contagem, não número de objetos persistentes.
- Assinaturas mudando em99,6% das transições significa que pelo menos parte do multiconjunto muda. Não que99,6% dos objetos mudem de forma nem que uma região candidata a movimento mude.
- 7/2481 e8/2481 são corretas por consultas de treino totais; entre previsões emitidas o acerto foi7/7 e8/8. Isso confirma esses casos, não prova correção geral do algoritmo.
- Background inferido constante não exclui erro da heurística ou superfície oculta.
- vc33 já foi executado integralmente com UNSUPPORTED_ACTION e gate FAIL em ambos os traces. Não está pendente nem precisa de repetição.
- Noventa testes locais passaram; classificá-los como THEOREM por execução contraria o escopo local LEMMA declarado no projeto. Não foram verificadas aqui alegações bibliográficas gerais sobre todas as abordagens de ponta.
- Preservar cardinalidade novamente excluiria uma parcela real das transições e não satisfaria o gate integral se elas ficassem sem previsão. Mudança de forma é uma hipótese candidata, não escolha identificada por estes agregados.

O próximo experimento deve localizar as diferenças na representação e testar regras para regiões candidatas sem esconder as demais mudanças do alvo full-render. Estatísticas marginais desta amostra não fornecem a identificação semântica necessária para escolher a próxima família automaticamente.

Resultados e referências de snapshots em D:/arkhe/output/arc3-region-decomposition-20261027/report.json. Nenhum modelo foi retreinado, gate relaxado, política promovida ou ambiente acionado.
