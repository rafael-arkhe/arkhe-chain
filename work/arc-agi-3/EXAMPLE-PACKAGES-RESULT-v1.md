# E0/E1/E2 executados: negativo do pipeline, sem ganho nas transformações

27/10/2026. Executadas as60chamadas do plano de pacotes, vinte por condição e dez por controle, ordem randomizada por blocos conforme arquivo materializado. E1L não participa. Hipótese: efeito dos pacotes de exemplos nesta configuração; não especificidade pura. Nenhuma ação ARC/submissão, nenhuma admissão, nenhuma alteração do gate/schema/DSL.

## Três desfechos globais

|Condição|Requests|Executadas|Células exigidas corretas|Grade inteira exata|Alvos estacionários corretos|Treino PASS|
|---|---:|---:|---:|---:|---:|---:|
|E0 genéricos|20|15|0/40|15/50|15/20|0|
|E1 auxiliares|20|0|0/40|0/50|0/20|0|
|E2 auxiliares + contraste|20|0|0/40|0/50|0/20|0|

Todas as60respostas foram completas e passaram na validação independente do JSONSchema. Houve45rejeições TYPECHECK_REJECTED: cinco em E0, vinte em E1, vinte em E2. Não houve falha HTTP nem proposta truncada registrada nesta rodada. Rejeições recebem zero nos três desfechos globais e permanecem no denominador.

Total primário0/120oportunidades repetidas: trinta células tiveram previsões executadas, noventa não tiveram previsão executável. Não chamar essas noventa de previsões erradas. Total150pares de avaliação atribuídos; apenas40foram executados. Não são150transições distintas: os mesmos controles conhecidos foram repetidos.

## Condicional e por controle

As15propostas executadas vieram de E0 e mantiveram a grade em todos os inputs examinados. Representam dois hashes de programa, não quinze hipóteses independentes. Condicional E0:0/30células exigidas,15/40grades exatas,15/15estacionários corretos. Esses acertos são os dez NOOPs do clique e cinco movimentos bloqueados; nenhuma transformação livre ou pintura exigida foi correta.

E0clique executou10/10requests: grade exata10/30, estacionários10/10, células0/20. E0movimento executou5/10requests: global grade exata5/20, estacionários5/10, células0/20; condicional grade5/10, estacionários5/5, células0/10. E1/E2 tiveram0/10executadas em cada controle. Suas taxas condicionais são indefinidas/null, não zero de identidade ou de desempenho preditivo.

Não dizer que E1/E2 'continuaram identidade': nenhuma de suas propostas foi executada. O resultado é falha de tipagem do pipeline nessas condições. Em uma AST de E1clique, eq_kind recebeu diretamente Action em vez de ActionKind, e option_default recebeu Action em vez de Option. Essa amostra também tem estrutura de retorno incorreta; não foi reparada manualmente. Esse diagnóstico pontual não classifica todas as45ASTs pela mesma causa específica.

Há três hashes de envelopes JSON em E1 e dois em E2, todos rejeitados; hash não mede ganho. A classificação executável continua separada de validade de schema. Sessenta respostas schema-válidas não provam garantia universal de forma para gerações futuras.

## Fatores preservados e medições

Mesmo north-mini-code-1.0:latest, seed0/temperature0, contexto8192, saída1024, timeout180s, schema e parser. Sem feedback em todas as condições, uma proposta por request, sem cadeia de reparo nem reposição. Os60prompts enviados foram comparados byte a byte com os seis prompts arquivados; schedule, treino, opções e schema conferidos por verify_example_packages.py. Não se alterou exemplo/target no meio da coleta.

O adapter reportou prompt_eval_count constante por controle/condição:

|Controle|E0|E1|E2|
|---|---:|---:|---:|
|Clique|1505|2117|2301|
|Movimento|1486|2098|2282|

São contagens efetivas reportadas pela API nesta execução, distintas dos tokens do texto bruto medidos antes; todos os valores são26maiores. Isso não reconstrói quais tokens pertencem ao template nem mede E1L. Não inferir igualdade de template em outra configuração apenas por essa diferença.

Usage reportado total:117890tokens de entrada,9789de saída;1152,19segundos somados de walltime das gerações. Não é custoCPU nem tempo total de trabalho. O serviço carregou o modelo e terminou sem erro operacional reportado. Modelo descarregado e servidor iniciado pela tarefa encerrado.

## Interpretação delimitada

Nesta execução os pacotes E1/E2 não trouxeram ganho global de transformação e tiveram menor aceitação de tipo que E0. O zero primário não implica igualdade de todos os desfechos: E0 teve acertos estacionários, E1/E2 foram rejeitados. O conjunto de exemplos auxiliares foi verificado antes da execução, mas a validade das demonstrações não garante a validade das propostas geradas.

É comparação de pacotes que diferem em conteúdo, formato, quantidade, comprimento e regras auxiliares; não efeito puro de especificidade ou contraste. Randomização de posição não elimina cache/backend, e vinte repetições com seed fixa não são vinte seeds independentes. Nenhum holdout novo, nenhum level real, nenhum teste de generalização independente. O resultado não demonstra incapacidade universal do modelo, inexpressividade da DSL ou inutilidade de exemplos.

Não executar automaticamente novas rodadas de volume. Uma investigação posterior pode examinar a construção de ASTs bem tipadas, mantendo o replay como requisito comportamental; essa é uma proposta de pesquisa, não conclusão causal de que o decoder seja a solução.

## Evidência

145testes passaram antes da coleta, incluindo score global de falhas e controle correto. Verificação final de sessenta requests/respostas, schema/options e cronograma passou. Artefatos: D:/arkhe/output/arc3-example-packages-20261027/report.json, summary.json, verification-receipt.json, plan.json e subpastas com todos os requests/respostas/usage. Classificação local: LEMMA, limitada a esta execução.
