# Sugar divulgado no prompt: quatro chamadas, nenhum programa executável

27/10/2026. Executado run_python_sugar_smoke.py com contrato explícito do sugar no campo python_frontend.extension, lower_fn=lower_sugar e schema uses_memory/source. Modelo local north-mini-code-1.0:latest, seed0/temperature0, contexto8192, saída1024, timeout180s; duas chamadas por controle e quatro totais. Mesmo treino conhecido, sem holdout independente, reparo manual ou mudança do subconjunto durante a coleta. A extensão e a gramática foram fixadas antes das chamadas.

## Resultado

|Fonte nova|Primeira rejeição da frente|Diagnóstico adicional|
|---|---|---|
|Clique1|SOURCE_SYNTAX|Chave } sem abertura correspondente, linha37; sem AST para inventário posterior|
|Clique2|SOURCE_EXPRESSION_NOT_ALLOWED|Compare na linha9; cinco ocorrências de atributos conhecidos|
|Movimento1|SOURCE_SYNTAX|Chave } sem abertura correspondente, linha52; sem AST para inventário posterior|
|Movimento2|SUGAR_LOOP_ITEM_ESCAPES|29ocorrências bloqueadoras conhecidas no inventário, incluindo condicionais, comparações, break e atributos não previstos|

Quatro respostas completas,0fontes traduzidas/tipadas,0replays. Score global de células exigidas0/8; grade inteira0/10pares; alvos estacionários0/4, por política de zero para rejeições. Não são previsões executadas erradas. Condicional indefinida, não0%. Stage NONE nos dois controles; nenhum candidato admitido. Ratification NOT_EVALUATED, nenhum efeito em produção.

O novo Movimento2contém dois For; isso é diferente das quatro fontes antigas, nas quais não havia For/While. O inventário detecta candidatos sintáticos de sugar, não certifica seus corpos. Esses loops novos usam formas fora do contrato, incluindo escape do item e break. Não inferimos um viés interno geral ou que o modelo aprendeu a usar o recurso.

## Diagnóstico com múltiplas localizações

source_diagnostics.diagnose percorre a AST inteira quando o parse Python funciona. Registra regras reconhecidas, linha e coluna, inclusive ocorrências após o primeiro bloqueio do compilador. Distingue known_blockers de observed_sugar: uma forma reconhecida pode ainda falhar por contexto, tipos, domínio de literal ou orçamento. O compilador continua fail-closed e reporta sua primeira rejeição; o inventário é um instrumento separado, não um mecanismo de reparo.

Nas fontes sintaticamente inválidas o diagnóstico inclui SyntaxError, linha, offset e mensagem. Não inventa AST ou lista de bloqueios posteriores. AST columns são zero-based e SyntaxError.offset segue a convenção do Python. A adição desse detalhe de localização foi feita na camada de relatório; o summary recalcula diagnósticos após a coleta. Não mudou tradução, prompt ou feedback no meio do experimento. O report conserva o inventário produzido pelo processo na época; summary é a versão enriquecida, explicitamente posterior.

Esse inventário é parcial, não enumeração exaustiva de erros de compilação. Não resolve todo escopo/tipagem, constraints de lambdas/for, limites de nós ou combustível. Duas tags podem se referir ao mesmo constructo, por exemplo If sem else e não final. Contagens não são número de defeitos independentes nem distância até um programa correto.

## Comparação sobre as mesmas fontes antigas

O mesmo coletor foi aplicado com regras v1 e v2 às quatro respostas congeladas, sem geração nem edição dessas fontes:

|Fonte congelada|Tags bloqueadoras v1|Tags bloqueadoras v2|Tags removidas|Tags novas|
|---|---:|---:|---:|---:|
|Clique1|47|34|13|0|
|Clique2|4|4|0|0|
|Movimento1|34|33|1|0|
|Movimento2|12|5|7|0|

São21tags de formas que o novo contrato reconhece, não21erros semânticos resolvidos. As quatro fontes continuam rejeitadas na reaplicação offline anterior. Usar as mesmas localizações/regra permite comparar o inventário; comparar totais entre gerações novas diferentes não isolaria a causa.

## Verificação e custo

159testes passaram, incluindo inventário posterior ao primeiro bloqueio, localização de erro de sintaxe, diferenciação de forma candidata e validação do sugar/frontend existentes. Todos os requests incluem o contrato divulgado. Quatro respostas completas e sem falha operacional reportada.

Usage reportado:6200tokens de entrada,2033de saída,208,68segundos somados de walltime de chamadas. Modelo descarregado e servidor iniciado pela tarefa encerrado. Não é comparação controlada de custo/velocidade com a rodada anterior.

## O que se conclui

Divulgar a extensão no prompt não produziu candidato executável neste smoke. Isso não identifica modelo, prompt, representação, subconjunto, domínio, budget ou erro de implementação como causa única. Também não prova que o modelo desconhecia a extensão antes: ela não estava declarada naquele prompt, mas conhecimento interno não foi medido.

Não houve comparação de Python livre com DSL, novo resultado ARC, generalização, melhoria de níveis ou evidência de AGI. A política de manter fronteira estrita e medir pipeline global/condicional foi preservada. Os próximos reparos da gramática, se decididos, devem ser outra condição declarada; não são feitos automaticamente para aceitar as fontes observadas.

Artefatos: D:/arkhe/output/arc3-python-sugar-smoke-20261027/plan.json, report.json, summary.json, verification-receipt.json e pastas de requests/respostas/usage. As listas de todas as ocorrências reconhecidas, não apenas o primeiro erro, estão em summary.json. Classificação LEMMA limitada à execução local.
