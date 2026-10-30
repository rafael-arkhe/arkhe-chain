# Seleção entre hipóteses tipadas: movimento ajusta o DEV, clique falha

27/10/2026. Implementado typed_candidate_bank.py e controle real de seleção sobre os dois controles DEV conhecidos. O modelo escolhe candidate_id, não escreve código nem AST. Algoritmos foram fornecidos manualmente; não é síntese livre, solver ARC novo ou comparação causal isolada de linguagem.

## Banco congelado e protocolo

Quatorze candidatos: identidade, nove cores finitas para pintar CLICK e quatro deslocamentos fixos do primeiro objeto com bloqueio. Todas as ASTs são verificadas pelo parser/typechecker e obedecem ao limite24nós. O mesmo banco é usado nos dois controles. Testes locais confirmam exatamente um candidato com fit total por controle: H06pinta cor5e H10move à direita. Esses scores vencedores não são fornecidos ao LLM.

As descrições do banco declaram os algoritmos completos. H10explicitamente ignora tipo/direção da ação: faz deslocamento fixo dx1,dy0quando possível. Seu fit não demonstra inferência de uma regra genérica de movimento. Não rebatizar seleção de hipótese fornecida como descoberta do algoritmo.

O adapter devolve a AST congelada correspondente à seleção e a submete ao mesmo run_dev, com incumbent e feedback de contraexemplo. IDs desconhecidos, campos extras e chaves duplicadas são rejeitados. Schema contém enum dos14IDs. Aceitação de tipo é garantida pela construção do banco, não código correto gerado pelo modelo. A gramática de seleção e as descrições reduzem substancialmente a tarefa; não são um fator único em relação aos smokes de fonte.

Até duas chamadas por controle/quatro totais, mesmas seed0/temperature0, contexto8192, saída1024, timeout180s, modelo north-mini-code-1.0:latest. Encerramento antecipado em fit DEV completo. Sem holdout, mudança no gate, reparo manual de resposta, score-oráculo no prompt ou ampliação do banco durante o teste.

## Resultado real

|Controle/tentativa|Escolha|Grades DEV exatas|Células exigidas corretas|
|---|---|---:|---:|
|Clique1|H03, pinta cor2|1/3|0/2|
|Clique2|H03, pinta cor2novamente após contraexemplo|1/3|0/2|
|Movimento1|H10, desloca primeiro objeto para a direita com bloqueio|2/2|2/2|

Três chamadas completas, três seleções válidas/tipadas e três replays executados. Não houve quarta chamada porque movimento passou no treino na primeira tentativa. O orçamento não consumido não é falha e não entra no denominador global.

Por request: células exigidas2/6, grade inteira4/8pares, estacionários3/3. Todos os requests executaram, portanto os denominadores globais/condicionais coincidem nesta rodada. São controles repetidos, não seis células ou oito transições independentes.

Por incumbent final: clique0/2células e1/3grades, stageCANDIDATE; movimento2/2células e2/2grades, stagePROVISIONAL. Combinar esses finais daria2/4células e3/5grades, mas não é a mesma métrica dos requests. Um dos dois controles teve fit completo. Ratification NOT_EVALUATED em ambos, nenhum admitido em produção.

O controle de movimento é evidência de seleção correta dentro do banco fornecido para dois pares DEV. O erro de clique mostra que remover escrita/tipagem não assegura escolher a hipótese correta, mesmo presente. Repetir H03não explica seu mecanismo interno nem prova que o modelo ignorou feedback por incapacidade.

## O que mudou e não mudou

O pipeline finalmente executou uma hipótese selecionada por LLM que reproduz uma transformação não identidade nos controles desta linha de testes. Os programas foram escritos por nós e oferecidos nas descrições; não houve síntese do conteúdo da AST pelo LLM, avaliação independente, novos níveis resolvidos ou generalização medida. Não atribuir o ganho a uma única alteração: tarefa, prompt, espaço de candidatos e schema mudaram juntos.

A política de seleção é um componente utilizável com vocabulário fechado, mas o banco atual é estreito e específico destes controles. Não foi integrado a arkhe_agent, ações ARC/Kaggle ou gate nativo. Não representa solução para regras desconhecidas fora das14hipóteses, nem evidência de AGI. O próximo experimento, se realizado, deve congelar o candidato e separar dados de teste; não consultar/adaptar contra um holdout repetidamente.

## Verificação e artefatos

161testes passaram, incluindo cobertura tipada do banco/controles e rejeição de seleção desconhecida. Verificação final confirma as mesmas descrições nos três prompts, schemas válidos, nenhum score de candidato anexado, nenhum efeito de produção e cleanup. Usage reportado:2533tokens de entrada,27de saída;66,05segundos somados de walltime. Modelo descarregado e servidor iniciado pela tarefa encerrado.

D:/arkhe/output/arc3-candidate-bank-smoke-20261027/ contém plan.json com banco/ASTs congelados, report.json, summary.json, verification-receipt.json e requests/respostas/usage. Modelos recebem descrições e treino; o plano completo com ASTs é artefato de auditoria, não prompt. Classificação local LEMMA para execução de seleção/fit DEV descrita, sem conclusão causal universal.
