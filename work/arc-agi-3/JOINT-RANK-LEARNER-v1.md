# Learner conjunto por ordem geométrica — escopo sintético

Implementado joint_rank_transition_probe.py. Hipótese explícita: para cada ação canônica e layout (dimensões, fundo inferido, sequência ordenada de assinaturas), existe um vetor constante de deslocamentos por posição na ordenação assinatura/y/x. O vetor completo vale para todas as transições daquele grupo. As posições são slots geométricos recalculados em cada frame, NÃO identidades persistentes. Alteração de quantidade/forma muda a classe de layout e não recebe suporte por default.

No treino, enumera todas as bijeções entre regiões de mesma assinatura e conserva vetores completos. Intersecta esses vetores somente porque a família declarada exige constância por slot geométrico. Não é uma operação universalmente correta para qualquer dinâmica contextual, cardinalidade ou identidade. Enumeração finita de N! por grupo; orçamento100000 combinações de bijeções. Se o total excede orçamento, não admite amostra parcial. Sem heurística de vizinho mais próximo ou cap arbitrário de uma célula.

O adapter predict_vectors recebe vetores completos da cena: não projeta em marginais. Renderiza cada vetor com verificação global multicélulas. Consenso não vazio após busca completa emite; alternativas divergentes, falta de suporte, limites/colisões ou orçamento interrompido provocam abstenção. Os módulos anteriores foram preservados; esta interface é adicional.

## Controles executados

85 testes passaram, seis novos. O contraexemplo(5,10)→(6,11) conserva exatamente(1,1)/(6,-4); renderiza somente(6,11), sem fabricar(11,16). Outra transição(4,10)→(5,11) elimina a alternativa de troca nessa família e permite prever(3,8)→(4,9). Isso é transferência espacial sintética sob uma regra constante declarada, não demonstração de tracking ou dinâmica ARC.

Troca invisível conserva duas identidades possíveis, mas emite o mesmo render sem certificar identidade. Conflito para before/ação idênticos reprova gate; teste cobre orçamento, forma/cardinalidade sem suporte, cena vazia, ausência de persistência implícita e clique sem suporte.

Gate histórico exige consultas>0, cobertura1, acerto1 e conflitos0. Os payloads deste protótipo são apenas grids e ações; progresso/estado SDK não são incorporados. Não tratar seu conflito como equivalência da observação completa SDK. Resultado de gate sintético não substitui os quatro FAIL do probe contextual anterior.

## Limites da proposta recebida

Guardar vetores completos resolve perda de correlação, mas não define por si só uma regra que generalize. Cardinalidade e ordenação precisam ser fixadas; identidade cross-tempo requer outra hipótese. A família geométrica acima é estreita e pode rejeitar uma dinâmica correta quando os objetos trocam de ordem, dependem de contexto ou mudam de forma. Uma região móvel e outra estática pode caber em um vetor por slot, embora não caiba em um único delta por assinatura. Ambiguidade de matching não exige abstenção quando todos os renders concordam.

Não foi executado em traces reais; não há rollout, semântica validada, seleção de melhor matching, promoção da política ou submissão. Resultado local é LEMMA conforme critérios do projeto, não THEOREM por execução. Relatório: D:/arkhe/output/arc3-joint-rank-synthetic-20261027/report.json.
