# Frente de sintaxe Python: implementada, integração real negativa

27/10/2026. Recebidos módulo sequencial com comentários corrigidos e proposta de substituir JSON AST por código Python. Materializada uma frente de sintaxe Python restrita com tradução para o DSL existente; nenhum código-fonte recebido é executado. Não é Python livre, sandbox Python, implementação TWIN ou prova de que o gargalo de expressividade foi removido.

## Implementação concreta

python_dsl_frontend.py usa ast.parse para reconhecer uma função step(g,a,s). Aceita retorno, tupla pair, atribuições locais como let, if/else final com retornos, expressões condicionais, lambdas e chamadas aos intrinsics registrados. Helpers offset/color/count/kind/key/boolean/coord_literal declaram tipos dos literais. bind representa let em forma de expressão. and_/or_/not_/if_ são aliases dos nós correspondentes.

A fonte é traduzida para AST do DSL e passa pelo mesmo parser/typechecker e interpretador. Não há eval, exec, compilação para bytecode ou execução de chamadas host. Imports, atributos, subscritos, loops, funções extras, decoradores, parâmetros gerais e expressões fora do subconjunto são rejeitados. Limites:32KiB de fonte UTF8,512nós sintáticos Python e os24nós de AST originais, com combustível original de execução. Isso limita a superfície, mas não constitui prova universal de resistência a DoS do parser Python ou isolamento de processo.

PythonSyntaxProposer adapta o callback a run_dev: encaminha o incumbent como fonte canônica, feedback DEV e razões anteriores da frente. O schema de saída passa a uses_memory/source; o provider precisa usar output_schema() desta frente, não o schema de AST. O contrato do runtime permanece igual. Erros da frente são journalados e convertidos em rejeição do loop, sem executar fonte nem perder um incumbent anterior.

É uma notação Python para um DSL simbólico: os intrinsics obedecem ao interpretador, inclusive avaliação lazy de if/Options. Não alegamos semântica equivalente à execução de um arquivo Python com funções comuns nem compilação de Python arbitrário. A sintaxe de fonte amplia formas de escrita, não o conjunto de operações/programas aceitos pelo backend. Há29primitivas registradas, não40.

## Verificação local e fixtures

151testes passaram: round-trip canônico dos controles e memória, bindings/branches, rejeição de construções host, integração com incumbent e não admissão em erro. O primeiro teste de round-trip comparava tuple Coord com list após serialização JSON e falhou; a comparação foi corrigida para a representação canônica, sem relaxar tipos/domínios.

Fixtures manuais identidade→controle correto de clique e movimento passaram no treino e chegaram a PROVISIONAL. São MANUAL_FIXTURE_NOT_MODEL_SYNTHESIS, zero chamadas ao modelo. Ratification segue NOT_EVALUATED. Fonte e requests estão em D:/arkhe/output/arc3-python-frontend-fixture-20261027/report.json. Não são evidência de descoberta de regras por LLM.

## Smoke real, orçamento declarado

Mesmo modelo local north-mini-code-1.0:latest, seed0/temperature0, contexto8192, saída1024, timeout180s. Duas chamadas por controle, quatro totais. Nenhum reparo manual, ampliação de gramática durante a execução, novo download ou holdout. Uma rodada de integração que muda interface/prompt/incumbent/schema de saída; não ablação isolada de linguagem ou comparação justa de desempenho com as60chamadas anteriores.

|Controle|Requests completos|Fontes traduzidas/tipadas|Replay executado|Células corretas globais|Condicional|
|---|---:|---:|---:|---:|---|
|Clique|2|0|0|0/4|Indefinida|
|Movimento|2|0|0|0/4|Indefinida|

Quatro respostas completas, nenhuma falha operacional reportada. Três rejeições SOURCE_EXPRESSION_NOT_ALLOWED e uma SOURCE_STATEMENT_NOT_ALLOWED. Exemplos incluem atributos/métodos e fluxo imperativo fora do subconjunto declarado. Não classificamos o comportamento das fontes rejeitadas por execução, não chamamos de identidade e não afirmamos incapacidade universal do modelo. Os callbacks tiveram acesso às razões de rejeição anteriores, mas nenhum incumbent executável foi obtido nesta rodada. Stage final NONE nos dois controles; nenhum candidato admitido.

Desfecho global0/8oportunidades por política de zero para rejeições, zero previsões executadas. Não são oito pixels distintos nem oito previsões executadas erradas. Com3pares de clique e2de movimento por request, os desfechos globais de grade exata são0/10pares e estacionários0/4. Todas essas falhas são de pipeline antes do replay; taxas condicionais indefinidas.

Usage reportado:5120tokens de entrada,2469de saída,253,17segundos somados de walltime das chamadas. Modelo descarregado e servidor iniciado pela tarefa encerrado. Artefatos em D:/arkhe/output/arc3-python-frontend-smoke-20261027/: plano, inventário, requests, respostas, usage, report e summary. Nenhuma ação ARC, Kaggle, produção ou relaxamento do gate.

## Correções ao diagnóstico recebido

- TLA verifica o protocolo abstrato sob gates-oráculo e limites declarados; não prova selagem real de H, ausência de TOCTOU Rust ou correção empírica dos gates. TLA também não é condição necessária universal para resolver ou proteger um agente.
- Incumbent e reparo com contraexemplos já existem. O antigo run_loop já fornecia feedback; run_dev acrescentou retenção/ranking explícito da melhor AST. As fixtures não provam benefício com LLM real.
- As60chamadas de exemplos tiveram0/120ITT e0/30condicional;0/80pertence à reanálise da rodada anterior de feedback. Não comparar oportunidades em controles repetidos com RHAE/jogos resolvidos na literatura.
- Controles escritos à mão demonstram expressibilidade dessas transformações pelo DSL. Os negativos de síntese não isolam a linguagem, o modelo, o prompt e o orçamento como causa. ASTs do DSL já são programas executáveis pelo interpretador.
- Resultados agregados TWIN/Memento/OPINE são reportados sob configurações próprias; não demonstram que escrever Python sozinho explica diferenças, nem ausência de erros de proposta nesses sistemas. Não reproduzimos seus métodos neste smoke.
- Python livre continua fora do escopo implementado. Uma comparação de expressividade exigiria backend de execução independente e protocolo próprio; esta frente não preenche essa lacuna.

## Revisão sequencial recebida

Preservada em formal/seq-v2/LaneIsolationSeq.tla. reconcile_seq_revision.py compara com seq-v1 após retirar comentários/espaços e ordenar apenas disjuntos Next/conjuntos de fairness; definições normalizadas iguais. Não é verificador geral de equivalência TLA. A revisão corrige os comentários Live1/Live2 para PASS; não há nova lógica de candidato que exija repetir a matriz inteira. O modelo com best permanece separado e já existente. Recibo seq-revision-comparison.json na pasta da fixture.

## Estado

Frente e integração materializadas e testadas. Smoke real negativo antes do replay. Isso aproxima uma experiência com representação em fonte, mas não entrega solver ARC funcional, progresso em níveis, ganho preditivo, Python livre ou evidência de AGI. Classificação local LEMMA para artefatos/execuções descritos; atribuições causais permanecem abertas.
