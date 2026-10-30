# Auditoria dos configs: resultados reais e limite de -continue

Executado check_lane_original_audit.py com TLC1.7.4, um worker. O módulo original LaneIsolation.tla permanece byte a byte igual ao anexo fornecido. Novo LaneIsolationAudit.tla estende o original com FaultMode e três mutantes independentes; não altera Next do arquivo original. Configs explícitos LaneIsolationAudit-*.cfg. Sem LLM, sem mudança Rust/Python DEV ou efeito de produção.

## Oito verificações finais

|Config|Modelo/checagem|Resultado observado|
|---|---|---|
|safe|MaxVer3, BuggyFALSE, FaultMode0, seis invariantes e propriedade de ação|Sem erro;5600estados distintos|
|first|MaxVer1, BuggyTRUE, FaultMode0, todos os invariantes|Primeira falha HoldoutSealed|
|continue|Mesmo caso, -continue|Log registra HoldoutSealed e Isolation|
|continue-reordered|-continue, EffectsAreVerified antes de Isolation|Log registra HoldoutSealed e EffectsAreVerified|
|effects|Só EffectsAreVerified, BuggyTRUE|Contraexemplo encontrado|
|unsound|Mutante admite com hold falso; só AdmissionSound|Contraexemplo encontrado|
|unbind|Mutante zera gateVer após admissão; só AdmissionBinding|Contraexemplo encontrado|
|shortcut|Mutante CANDIDATE→ADMITTED; PROPERTY AdmitOnlyViaGate|Contraexemplo de propriedade de ação encontrado|

Todos os oito resultados esperados foram confirmados no report final. Casos negativos usam uma versão, suficiente para os contraexemplos apresentados; isso não constitui teorema de corte universal.

## -continue não enumera todas as falhas simultâneas

Na implementação utilizada, doNextCheckInvariants percorre os invariantes e retorna após registrar o primeiro falso daquele estado sucessor, mesmo com continuation ativada. Logo Isolation, listado antes de EffectsAreVerified e implicado pela negação relevante neste modelo, oculta a segunda falha no mesmo estado. Trocar a ordem e executar o config focado confirma EffectsAreVerified. Não inferir 'não falsificável' a partir de ausência de seu nome no log conjunto.

Além disso, ambos os testes -continue retornaram código0 e a mensagem final 'Model checking completed. No error has been found.', apesar dos erros anteriores no log. O executor varre os eventos de violação e compara o conjunto com o esperado. Usar só exit_code ou a mensagem final produziria PASS indevido. Este resultado é delimitado ao TLC/version/config executados.

Fonte primária conferida: https://raw.githubusercontent.com/tlaplus/tlaplus/v1.7.4/tlatools/org.lamport.tlatools/src/tlc2/tool/ModelChecker.java , método doNextCheckInvariants, linhas459–487; o retorno ocorre após imprimir a violação no ramo continuation. Não é necessário citar documentação genérica para extrapolar comportamento observado.

A primeira rodada do executor esperava que -continue reportasse os três nomes. Essa expectativa foi contrariada: encontrou dois. O teste focado já encontrou o terceiro. A rodada v2 preservou o modelo, corrigiu a expectativa de log e adicionou a permutação da ordem para verificar a explicação. O report inicial inesperado foi preservado, não contado como ausência de bug no modelo.

## Correções ao anexo

- Em BFS, LeakHoldout pode ocorrer diretamente de Init; LeakExec precisa de Propose primeiro. Na execução real a primeira falha foi HoldoutSealed, não Isolation. A ordem dos invariantes só decide qual nome aparece quando vários falham no mesmo estado, não qual profundidade é explorada primeiro.
- Um controle negativo não falsificar um invariante não o torna vacuamente verdadeiro. Sensibilidade a mutações e alcançabilidade do antecedente são questões diferentes. Já existe testemunha positiva de admissão/efeito no modelo original; agora há também mutantes focados para as três propriedades citadas.
- BuggyFALSE apenas desliga duas ações de injeção; isso, sozinho, não demonstra que as demais ações são corretas. O PASS é resultado da checagem finita, não consequência automática do nome do parâmetro.
- MaxVer3 não implica PASS para qualquer limite apenas por uniformidade aparente. Isso exige indução ou argumento de corte adequado. Um contraexemplo para3 também não precisa existir para limites menores. Nenhuma prova parametrizada foi produzida nesta rodada.
- AdmitOnlyViaGate é safety sobre transições, configurada como PROPERTY; não requer fairness. Liveness é outra propriedade. A rodada LaneIncumbent anterior já tem progresso condicionado e controle sem fairness; não substituímos isso por []<>(stage=ADMITTED) incondicional.
- Os configs originais já incluíam teste separado de HoldoutSealed e PROPERTY explícita. O anexo descreve uma seleção de configs que não corresponde ao conjunto atual completo; nenhum resultado pendente anterior foi presumido executado.

## Escopo

Evidência final: D:/arkhe/output/arc3-lane-original-audit-v2-20261027/report.json e logs. Arquivos fonte/configs têm hashes no report; original conferido com o anexo. Classificação LEMMA para execuções finitas locais. Não demonstra não interferência do holdout, refinamento de Rust, solidez de avaliadores ou aprendizagem. Nenhuma nova rodada de síntese realizada.
