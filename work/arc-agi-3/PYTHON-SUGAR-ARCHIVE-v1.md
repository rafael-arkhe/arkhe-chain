# Sugar limitado implementado; quatro fontes congeladas continuam rejeitadas

27/10/2026. Implementado python_dsl_sugar.py como tradução estática anterior à frente original. O adapter PythonSyntaxProposer agora permite lower_fn/contrato de extensão explícitos; seu padrão continua lower_source original. Nenhuma geração nova, nenhum Python gerado executado, nenhuma mudança de gate/DSL/combustível/limite24nós.

## Traduções e contrato

- Leitura g[y][x] → grid_get(g,coord(x,y)), com eixos na ordem correta. Escrita g[y][x]=value → grid_set e binding da nova grade, sem mutar o input do interpretador.
- obj.pos/obj.color → obj_pos/obj_color. Coordenadas .x/.y → coord_x/coord_y; a.x/a.y → acessores Option de clique. .kind/.dx/.dy e métodos conhecidos têm mapeamento fechado, verificado pela tipagem do DSL. Não há resolução geral de atributos ou despacho Python. Aliases arbitrários de Action não recebem automaticamente a regra especial de a.x/a.y.
- objects(g) e g.objects() → grid_objects(g). Métodos não listados e keywords de métodos são rejeitados; nenhum argumento é descartado silenciosamente.
- Um for com item local, iterador objects(g), um único acumulador preexistente e atribuições/condicionais de atualização é traduzido a fold sobre snapshot. O corpo devolve o acumulador; não há break/continue/return, laços aninhados, while, for-else ou escape do item para fora do laço. Não é tradução universal de loops imperativos.

Os literais permanecem nos domínios finitos originais. Índices dinâmicos precisam ter tipo Offset apropriado; Option precisa ser eliminada explicitamente. coord usa clamp do DSL, não indexação negativa/IndexError do Python. O iterador é snapshot e o item é lambda-local, diferentemente do escopo do for comum. Trata-se de uma linguagem de sintaxe Python declarada, não preservação semântica de Python arbitrário.

Fixtures testam eixos x/y, escrita imutável, atributos e equivalência canônica do for suportado a fold explícito, além de rejeições de atributos host, keyword não suportada, laços arbitrários e item escapado. O fold traduzido moveu o sprite no controle simples.156testes passaram na suíte final, incluindo integração opcional do adapter. Isso verifica formas suportadas, não todas as reescritas possíveis nem segurança universal do parser.

## Reaplicação offline das mesmas fontes

As quatro respostas completas do smoke original foram mantidas exatamente como arquivadas e processadas pela nova frente. Nenhum prompt foi alterado nem houve reparo manual:

|Fonte congelada|Antes|Após sugar|
|---|---|---|
|Clique1|SOURCE_EXPRESSION_NOT_ALLOWED|SUGAR_SINGLE_SUBSCRIPT_UNSUPPORTED|
|Clique2|SOURCE_STATEMENT_NOT_ALLOWED|SOURCE_STATEMENT_NOT_ALLOWED|
|Movimento1|SOURCE_EXPRESSION_NOT_ALLOWED|SUGAR_SINGLE_SUBSCRIPT_UNSUPPORTED|
|Movimento2|SOURCE_EXPRESSION_NOT_ALLOWED|SOURCE_STATEMENT_NOT_ALLOWED|

Resultado:0/4traduzidas/tipadas,0replays,0/8oportunidades pela mesma política global, condicional indefinida. O erro reportado é o primeiro bloqueio encontrado pelo traversal; não uma lista exaustiva de defeitos. Mudança de razão não equivale a correção semântica ou melhoria de taxa. Dois bloqueios são indexação unidimensional de listas/tuplas, não a indexação2Dda grade que foi acrescentada.

Esse experimento isola o efeito da nova tradução sobre propostas fixas. Não mede a capacidade do modelo de usar o contrato novo após recebê-lo no prompt. Um novo smoke de geração com a extensão seria outro experimento e não foi executado nesta rodada. Não ampliar a gramática durante uma coleta para fazer exemplos já vistos passarem sem declarar a adaptação.

## Correções ao diagnóstico do anexo

As quatro fontes são Python sintaticamente parseável por ast.parse. A rejeição original era no reconhecimento/tradução do subconjunto, não necessariamente no parser sintático Python nem no replay. Nunca inferimos comportamento executado dessas fontes.

Inventário AST das quatro fontes: nenhuma contém For ou While. Há If, Attribute, Subscript e Pass; a fonte clique2tem três If e um Pass. Logo a frase 'a rejeição de fluxo revela que o modelo tentou for/while' é factualmente incorreta para esses arquivos. O suporte for foi acrescentado como recurso prospectivo pedido, não como correção de um loop presente nessas amostras.

Atributos/subscritos observados não demonstram expectativas internas ou um viés geral do modelo. Permanecem observações de quatro respostas numa configuração. Tampouco0/4refuta capacidade geral; é ausência de sucesso neste teste. Mesmo se uma nova rodada melhorasse, isso não isolaria automaticamente o subconjunto como única causa. Se não melhorasse, não reduziria as causas possíveis apenas a modelo/prompt: traduções restantes, tipos, domínio de literais, combustível e orçamento ainda importam.

Manter o backend não significa manter o subconjunto de fonte: ele foi explicitamente ampliado, com restrições próprias. A expansão não implementa Python livre, TWIN ou aumento de expressividade do runtime.

## Evidência

D:/arkhe/output/arc3-python-sugar-archive-20261027/report.json e verification-receipt.json; fontes e testes em work/arc-agi-3. Zero novas chamadas, nenhum candidato admitido, nenhuma alteração Rust/Kaggle/produção. Classificação local LEMMA para execução e formas verificadas, sem conclusão sobre AGI ou causa interna do modelo.
