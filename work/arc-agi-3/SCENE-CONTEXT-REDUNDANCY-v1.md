# Auditoria da redundância do contexto na chave exata de cena

O descritor proposto inclui ação, fundo e TODAS as assinaturas com coordenadas absolutas ordenadas. Com dimensões fixas64x64 (ou explicitadas), forma normalizada codificada na assinatura e ignorando colisões de hash, ele já determina a cena extraída e seu render. Ocupação e paleta de contorno são funções determinísticas desse descritor. Logo adicionar tais funções à chave NÃO muda as classes de igualdade de um lookup exato. Isso vale somente com todos os demais procedimentos fixos; outro algoritmo que use features separadamente pode comportar-se de modo diferente.

Implementado audit_scene_context_redundancy.py. Três casos e uma repetição: cena duplicada, cena transladada e obstáculo removido. As partições de igualdade C0/C1/C2 são iguais. Coordenadas absolutas produzem chaves novas em todas as variantes quando a cena é transladada. 98 testes passaram, dois novos. Não foi executada uma ablação real redundante.

Amostras não provam a propriedade universal: a razão geral é C1=(C0,f(C0)) e C2=(C0,g(C0)), logo C0_i=C0_j se e somente se C1_i=C1_j, e idem C2, sob as hipóteses acima. A canonicalização e a extração devem permanecer determinísticas e idênticas.

## Ajuste concreto para uma ablação informativa

Usar o layout do learner joint-rank existente: dimensões, fundo e sequência ordenada de assinaturas/quantidades, SEM coordenadas absolutas na chave. Coordenadas continuam disponíveis para calcular contextos e aplicar vetores; não são apagadas da cena. C0 condiciona vetores nesse layout; C1 acrescenta tupla de contornos binários relativos por slot; C2 acrescenta paleta relativa. Todos retêm vetores COMPLETOS e sua interseção é válida somente na família constante por slot dentro de cada chave. Esta especificação revisada não foi implementada ou executada aqui.

Controle que discrimina: pares com mesmas assinaturas/cardinalidade e ação, mas contextos de bloqueio diferentes, exigindo vetores incompatíveis em C0. Validar em posições novas; ter um livre e um bloqueado numa única cena não estabelece dependência de contexto, pois C0 pode memorizar aquele vetor de cena. Não usar identidade semântica como rótulo de slot.

## Outras precisões ao anexo

EDGE torna a borda distinguível, não elimina dependência da posição; essa distinção é útil para dinâmica de limites. Contextos relativos iguais em posições interiores transladadas podem coincidir, mas C0 com posições absolutas continua diferente. Todas as variantes abstiverem não identifica qual estágio bloqueou; atribuir imediatamente a identidade/representação seria a mesma inferência indevida já corrigida. Emitir mais sem aumentar cobertura correta significa aumentar erros absolutos nas mesmas consultas; pode haver custo sob uma perda declarada, mas não fornece julgamento universal de utilidade.

O resultado real do joint-rank não está ausente: quatro gates FAIL,9864 consultas futuras,8687raw não vistas,zero previsões; mudança de layout99,6–100%. Isso é incompatibilidade observada com a família, não prova de identidade física ambígua ou garantia de que contexto resolverá.

Sem nova ação ARC, alteração de política ou submissão. Relatório sintético: D:/arkhe/output/arc3-context-redundancy-audit-20261027/report.json.
