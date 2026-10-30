# Localização retrospectiva de alterações

Implementado localize_region_changes.py. Reutiliza as80 transições amostradas na decomposição; extrai regiões de ambos os lados e cruza seus pixels com a máscara before!=after. Labels são DIFF_TOUCHED e NO_DIFF_ON_VISIBLE_CELLS, sem atribuir semântica de candidato móvel, contexto estável ou objeto persistente.

## Resultado

2532 pixels alterados no total. No before,336 desses pixels pertencem ao fundo inferido; no after,380. Todos os80 pares contêm alguma região antiga sem alteração em suas células visíveis. Isso é descrição após observar o resultado, não previsão nem prova de viabilidade de um modelo híbrido.

Mudanças em fundo são relevantes: pixels de destino de uma região que se move estavam no fundo antes. Limitar a máscara a regiões before omite essas mudanças. O relatório conserva ambas as faces e inclui células inalteradas dentro das regiões tocadas.

## Três controles novos

1. Um componente cresce de uma célula para duas: a célula antiga não muda e seria chamada contexto, embora a forma do componente tenha mudado. Ausência de diff nas células antigas não comprova persistência da região.
2. Dois componentes trocam cores mantendo o multiconjunto de cores e formas: a estatística marginal de cores não muda, mas há alteração cromática nos pixels. Portanto o resultado anterior não autoriza dizer geométrico, não cromático.
3. Translação de uma célula altera origem e destino; há mudança de fundo tanto no before quanto no after.

93 testes passaram. Controles locais discriminam esses casos, sem provar correção universal.

## Limites da proposta

Usar after para localizar mudança durante diagnóstico é permitido; usar esse label como entrada do modelo no teste é vazamento. Separação limpa por diff não é teste de identificabilidade: por definição, uma região que contém célula alterada é tocada, e região rotulada sem diff não muda nas próprias células naquele par. Regiões de mesmo objeto podem se fundir/dividir ou crescer sem alterar as células antigas.

Um modelo híbrido precisaria aprender exclusivamente no treino um seletor/regra que receba apenas before+ação+estado permitido, com a persistência como hipótese sujeita a erros. Não foi implementado esse seletor, nem há gate novo. O gate de treino integral sozinho não demonstra previsão futura.

Falha de uma regra candidata não implica mudança idiossincrática, necessidade de tracking ou exclusividade de modelo programático. Pode ser falta de suporte, estado oculto, abstração inadequada ou dinâmica fora daquela família. Os7/7 e8/8 anteriores confirmam acertos históricos emitidos, não a adequação geral nem equivalência semântica.

Sem novos traces executados, ações ARC, retreino, alteração da política ou submissão. Relatório em D:/arkhe/output/arc3-region-localization-20261027/report.json.
