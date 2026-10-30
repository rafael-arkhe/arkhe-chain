# Auditoria executável da proposta de learner

A proposta não preserva correlações: deltas = {d for matching in m for d in matching_deltas(matching)} calcula união das alternativas dentro da transição. A interseção entre transições não restaura quais deltas pertenciam ao mesmo matching.

Contraexemplo executado: duas regiões idênticas em x=(5,10), depois x=(6,11). Matchings completos possíveis têm vetores(1,1) e(6,-4). Projetar em deltas individuais dá{-4,1,6}. Repetir essa transição e intersectar os conjuntos mantém todos. O enumerador que recebe opções independentes então admite(6,6), produzindo posições(11,16): resultado nunca observado e que não corresponde a nenhum matching daquela transição. Colisões e limites não removem esse candidato.

Isso pode causar abstenções artificiais e perda de cobertura no enumerador; não implica que ele emitiria uma previsão incorreta neste próprio exemplo, pois seu consenso detecta renders divergentes. O erro está em declarar o conjunto marginal como hipóteses conjuntas compatíveis com o treino.

## Forma lógica necessária

Declarar uma família de regras H. Reter h somente se, para CADA transição de treino t, EXISTIR um matching completo m_t que satisfaça a regra h, preservação de formas e reconstrução do after observado. Restrições de identidade entre passos só se houver uma hipótese explícita de persistência e continuidade da trajetória; não unir identidades entre resets/episódios. O learner deve preservar alternativas correlacionadas, por exemplo uma disjunção de conjuntos de regras ou restrições de satisfação. O adaptador ao enumerador também deve preservar as correlações, pois opções independentes por região podem reintroduzir combinações espúrias.

Nenhuma família de funções de transição que generalize foi implementada nesta auditoria. Enumerar matchings de um par finito não produz automaticamente essa família. O espaço de matchings é finito (N! para um grupo com cardinalidade N), mesmo sem um cap de deslocamento. Constraints prévias são permitidas se declaradas e justificadas; aprender constraints de matches ambíguos não resolve por si só sua identificação.

## Controles corrigidos

Troca de identidades idênticas: before=(5,10), after=(5,10), vetores(0,0) ou(5,-5). Identidades diferem, render é igual. Consenso pode emitir o render; não deve declarar que descobriu troca nem identidade persistente. Logo a exigência de nunca emitir nessa situação contradiz o contrato one-step.

Duas regiões idênticas, uma móvel e outra estacionária, não cabem necessariamente em um único deslocamento constante por(action,signature). É necessária uma hipótese adicional (contexto ou identidade condicionante) ou abstenção. Matching único no treino não garante previsão única no teste.

Mudança de forma junto à borda pode resultar em UNSUPPORTED_REPRESENTATION, mas tocar a borda não prova clipping. A canonicalização existente é de estrutura JSON, não de bytes originais do arquivo. O gate do modelo contextual anterior permanece FAIL; o learner novo, não implementado, ainda não possui resultado de gate.

## Evidência

Script audit_matching_projection.py, dois testes novos. O relatório output/arc3-matching-projection-audit-20261027/counterexample.json contém alternativas e candidatos espúrios. Nenhuma nova execução de traces ARC, ação no ambiente ou promoção de política. O learner sugerido não foi ligado ao enumerador, porque descarta as restrições conjuntas que deveria preservar.
