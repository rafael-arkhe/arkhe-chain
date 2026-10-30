# Auditoria da proposta de roteador de transformações

Reanálise de contadores existentes, sem novo treinamento. O anexo toma17614/19321 como se fossem fração de91%; na verdade são duas contagens de conflito, frontier/random de ls20. Denominadores corretos são abstenções ou consultas de cada trace, nunca a contagem de outro trace.

Entre TODAS as abstenções, conflitos representam99,67% em ls20/frontier e99,22% em ls20/random. Em vc33, falta de suporte (chave ausente ou suporte<2) representa99,29%/99,16%. Isso caracteriza as razões do algoritmo nesses datasets. Não atribui cada positiva abstida a essas razões: a tabulação cruzada motivo×label não foi conservada no relatório agregado. Os rastros/modelos permitem um novo cruzamento futuro, mas ele não foi executado nesta auditoria.

## Limites causais

Conflito em treino pode refletir estado ausente, ruído de rótulo, diferenças históricas ou projeção insuficiente; não prova features grosseiras. Falta de suporte pode vir de amostragem, coordenadas específicas da ação, rareza ou distribuição alterada; não prova features específicas demais. Acrescentar features pode separar grupos, mas também tornar todos raros; removê-las pode unir suporte ou criar conflitos. Nenhuma dessas operações garante a correção alegada. Um ajuste compartilhado pode beneficiar ambos; os contadores não provam impossibilidade.

## Por que a atribuição de classes ainda não é um learner

Translação, forma, cor e desaparecimento não são necessariamente classes mutuamente exclusivas: uma região pode mover e mudar cor, ou mover e crescer. Crescimento pode fundir componentes; desaparecimento pode ser oclusão na representação; surgimento não é coberto por um roteador que só recebe regiões before. Preencher células restantes com fundo uniforme é uma hipótese adicional, não consequência dos labels.

Mesmo no treino, comparar after não fornece automaticamente identidades nem classes únicas. A proposta deve preservar conjuntos de transformações/correspondências conjuntas compatíveis com os pixels observados, ou escolher uma representação de regras que torne a ambiguidade explícita. Treinar um classificador multiclasses a partir de um matching arbitrário reintroduz o problema já documentado.

Uma taxonomia possível precisa parametrizar transformações compostas, multiplicidade/criação/fusão e inalterada com preservação integral sob uma correspondência explicitamente hipotética. Não foi escolhida ou implementada uma gramática geral nesta auditoria. Uma alternativa legítima é prever o render diretamente, sem roteador separado; portanto roteador multiclasses não é exigência universal do contrato sem vazamento.

Transformação e roteamento apenas com treino/frozen/test são válidos quando definidos, mas não definem sozinhos a família. O seletor atual não fornece essas transformações. Gate de treino integral continua necessário no protocolo declarado, sem garantir generalização futura. Os resultados anteriores são locais LEMMA, não THEOREM por execução.

Resultado: não implementar classes supervisionadas não identificadas como se fossem verdade. Arquivo numérico em D:/arkhe/output/arc3-router-proposal-audit-20261027/report.json. Nenhum gate novo, execução ARC ou alteração de política.
