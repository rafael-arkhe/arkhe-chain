# Diagnóstico estrutural da cena contextual

Executado diagnose_context_scenes.py sobre dez before-frames por trace ls20: cinco igualmente espaçados no treino e cinco no sufixo. Sem novas ações, alterações de extração ou política. 66 testes passaram.

## Resultado

Todos os 20 frames são cenas não vazias com assinaturas repetidas. Extração produz18–20 regiões;13–16 são únicas. Reconstrução dos pixels é exata. Moda global, moda da borda e moda dos cantos coincidem na cor4 em todos os frames. Não se estabelece que essa seja a definição semântica correta de fundo; apenas não há divergência entre essas três heurísticas na amostra.

Exemplo inicial comum aos traces: dois componentes cor1 de área1 em(20,32)/(21,33), e três componentes cor8 de área4 em(56,61)/(59,61)/(62,61). Repetição geométrica não é erro de extração por si só; rejeitar a cena inteira por isso é uma restrição do preditor. Não se atribuiu a esses componentes identidade de sprite ou HUD.

O diagnóstico refuta a interpretação de cena não extraída: ela existe, reconstrói pixels e contém regiões únicas. A condição len(unique_objects) != len(objects) barra toda a cena quando qualquer assinatura se repete. Esse bloqueio precede a avaliação de suporte/contexto. Isso não valida tracking das regiões únicas, semântica ou adequação do contexto.

## Correções ao anexo

- Os modelos ls20 não estão vazios: frontier tem774 chaves e random778. O empty_model_gate é um controle sintético deliberadamente vazio; seu FAIL não descreve o modelo real.
- Os quatro gates têm cobertura zero no treino. Em ls20 isso é rejeição estrutural na inferência, apesar de haver regras aprendidas; não demonstra ausência de aprendizagem.
- Controles positivos não provam correção geral da implementação ou que toda cena válida será prevista.
- Lookup acerta todas as consultas vistas deste sufixo (133/49/585/410), não prova determinismo do estado completo nem ausência de variáveis ocultas. Também não exclui persistência ou outros preditores como baselines funcionais.
- Buracos não tornam uma região necessariamente desconexa. O código AMBIGUOUS_OR_EMPTY_SCENE não soma diagnósticos de fundo errado/animação/sprite: verifica apenas ausência de regiões únicas ou desigualdade entre quantidade total e única.
- Não há evidência aqui para mudar o fundo ou filtrar animações. Remover assinaturas repetidas da consideração sem prever seus efeitos também não garante frame completo correto.
- O gate vigente exige cobertura1 e acerto1 em todas as consultas de treino. Cobertura apenas positiva e hit rate alto não o aprovam. Não relaxar retroativamente.
- Evidência local é LEMMA, não THEOREM por execução. Não é negativo universalmente mais forte: a variante introduziu uma exigência adicional de unicidade para todas as regiões.

Próximo passo possível: separar regiões candidatas a movimento das regiões que compõem contexto, conservando representação explícita das repetidas e validando regras de correspondência com controles de duplicatas móveis/estáticas. Isso é uma revisão da hipótese representacional e da política de abstenção, não uma correção automaticamente validada por estes20 frames.

Relatórios em D:/arkhe/output/arc3-context-scene-diagnosis-20261027/.
