# Auditoria executável do contrato DSL revisto

A versão anexada melhora a ação/memória e a intenção de restringir AST, mas não fecha expressibilidade, tipos e semântica. Foram executados contraexemplos em audit_dsl_contract.py; não foi implementado ou executado um sintetizador.

## Contraexemplos medidos

- O programa de clique mostrado usa16 nós quando operadores, variáveis e literais contam como nós de AST. São if1, condição4, ramo grid_set10 e else1. MAX_NODES12 não admite essa representação. Se a métrica de tamanho for outra, precisa ser declarada; DAG com sharing não é a mesma AST.
- grid_count de uma grid64x64 toda0 retorna4096, fora de Int[-64,64].
- list_len(grid_objects(checkerboard de duas cores)) retorna2048 componentes não-fundo, também fora do domínio. Assinaturas anunciadas como totais não fecham seus tipos.

102 testes passaram, dois novos. Isso confirma os casos construídos, não um typechecker universal.

## Outros contratos ainda abertos

1. List[T] de comprimento finito arbitrário não tem domínio finito mesmo quando T é finito. Fixar limites por tipo/operação e instâncias de polimorfismo. State com32 chaves opcionais tem130^32 estados quando cada chave pode estar ausente ou conter129 inteiros;129^32 conta somente mapas com todas as chaves presentes.
2. Coord construtor recebe Int que inclui negativos e64; falta comportamento para argumentos inválidos. Coord_add com clamp é uma semântica diferente da aritmética usada para detectar saída no is_blocked; manter essa diferença explícita.
3. Unwrap parcial não fica seguro só por existir if. Faltam refinamentos de tipo com condições action_kind/is_some, ou um eliminador total match_option com binder e escopo. O let h usado no controle não tem produção AST definida. If deve ter avaliação lazy dos ramos; do contrário avalia unwrap indevido.
4. Grid/state imutáveis, seq que descarta o primeiro resultado e forall que retorna List[U] não atualizam um acumulador. Falta binding/retorno de par e fold ou outra regra explícita para transportar g/s. Não tratar essas operações puras como mutações implícitas.
5. Cabeçalho USES_MEMORY, estado inicial, saída (grid,state), validação de estado, goal predicate e gramática de expressões/abstrações/binders precisam de representação e typing fechados. Não há operador aritmético que incremente o contador do controle de memória, por exemplo.
6. Grid_objects(g) dito calculado uma vez por step entra em conflito com sua assinatura Grid→List[Object] quando g é uma grid intermediária diferente. Definir se é função do argumento ou uma variável snapshot separada. Background usado para limpar células de translate também deve ser definido para grids intermediárias.
7. Modo oculto contraditório para grid/ação não impossibilita um programa com memória que discrimine passos. O negativo precisa fixar também memória inicial/histórico acessível, ou restringir candidatos a stateless. Memória necessária exige traces que demonstrem indistinguibilidade sob o estado permitido, não apenas mencionar um contador.

## Execução e avaliação

Interpretador sem eval/exec/imports acessíveis ao DSL restringe capacidades da linguagem. Subprocesso Python padrão herda permissões do usuário: não estabelece ausência de filesystem/rede. Ausência dessas primitivas é diferente de isolamento OS. Timeout60s é portável como mecanismo de interrupção do processo, mas pode alterar candidatos sobreviventes entre máquinas; não certificar determinismo integral. Tratar aborto externo como execução inconclusiva, preservando a fronteira de busca. Step counter exige definir custo de chamadas, ramos, iterações e primitivas que internamente percorrem grids/listas.

Um milhão de programas precisa distinguir ASTs parciais geradas, programas completos bem-tipados e candidatos efetivamente avaliados. Sem isso a geração pode consumir recursos antes do contador de candidatos.

Se o corte2500 cair no meio do episódio, resetar a memória no sufixo é um reset artificial não equivalente ao início de episódio real. Não é automaticamente conservador; definir se aquece memória no prefixo e a transporta, ou se avalia episódios completos separados. Receber grid real a cada passo é avaliação one-step teacher-forced, não rollout autônomo.

Admitir todos os candidatos que passam no sufixo ainda usa esse sufixo para seleção de um conjunto; não escolher o melhor não remove múltiplas tentativas nem o torna teste final confirmatório. Registrar todo conjunto e reservar avaliação final nova se houver alegação confirmatória. Strong/Medium são rótulos de desempenho observado, não provas de generalização; pares vistos/não vistos e baselines permanecem necessários.

O critério correto de GP-250 anteriormente localizado é BC-3: nenhum episódio solved cujo modelo ratificado falhe no replay posterior do episódio. Não reatribuir como se fosse somente passar quaisquer gates escolhidos; um gate de50% não equivale a essa propriedade.

## Fechamento mínimo sugerido

Separar Offset[-64,64] e Count[0,4096], limitar listas, definir AST canônica com contagem exata e testes de typing; usar match_option total e binding/fold com estado explícito. Só então contar o programa positivo real e fixar seu limite de tamanho. Essa é correção de contrato antes de busca, não relaxamento do gate por resultados reais.

Nenhum código externo executado, nova ação ARC, alteração de kernel/política ou submissão. Relatório em D:/arkhe/output/arc3-dsl-contract-audit-20261027/report.json.
