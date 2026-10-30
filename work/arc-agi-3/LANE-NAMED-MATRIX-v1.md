# Matriz Bugs × propriedade reproduzida no TLC

27/10/2026. Novo anexo preservado como formal/matrix-v3/LaneIsolation.tla; não substitui o módulo anterior com Buggy. Executado check_lane_named_matrix.py com TLC1.7.4, um worker, MaxVer3. Quarenta e duas verificações, uma por célula, sem -continue; mais Live1, Live2 e config com checagem padrão de deadlock. Quarenta e cinco resultados esperados confirmados. Sem geração LLM, sem mudança no runtime Rust/DEV.

|Bugs singleton|TypeOK|Isolation|AdmissionSound|HoldoutSealed|AdmissionBinding|EffectsAreVerified|AdmitOnlyViaGate|
|---|---|---|---|---|---|---|---|
|{}|PASS|PASS|PASS|PASS|PASS|PASS|PASS|
|leakExec|PASS|FALSIFIED|PASS|PASS|PASS|FALSIFIED|PASS|
|leakHoldout|PASS|PASS|PASS|FALSIFIED|PASS|PASS|PASS|
|unsoundAdmit|PASS|PASS|FALSIFIED|PASS|PASS|FALSIFIED|PASS|
|unbind|PASS|PASS|PASS|PASS|FALSIFIED|PASS|PASS|
|shortcut|PASS|PASS|FALSIFIED|PASS|PASS|FALSIFIED|FALSIFIED|

Matriz idêntica à fornecida:33PASS e9FALSIFIED. PASS significa ausência de contraexemplo na exploração limitada, não prova para qualquer MaxVer. Cada bug foi ativado isoladamente; combinações de Bugs não foram verificadas nesta matriz. Tipos continuam válidos sob todas essas mutações.

## Configuração e deadlock

Os dois configs colados são iguais e ativam somente Bugs={}. Não reproduzem as linhas mutantes por si só. Foram gerados os42configs separados no diretório formal/matrix-v3, com singleton apropriado, INVARIANT para estado e PROPERTY para AdmitOnlyViaGate.

Para a matriz e liveness, CHECK_DEADLOCK FALSE está declarado nos configs. Isso não altera as ações; separa a checagem de propriedades da política de tratar término sem sucessor como erro. Também executamos o config colado sem esse ajuste: TLC reporta Deadlock reached com ver3, stageCANDIDATE e todos os gates falsos. Portanto o config cru não termina como PASS global, apesar de os invariantes permanecerem verdadeiros até esse término. Não ocultamos o deadlock do resultado.

Spec permite stuttering por [][Next]_vars. Quando não há progresso, isso é uma execução admitida pela fórmula, mas o deadlock checker padrão ainda sinaliza ausência de sucessor Next não trivial. Desativá-lo para esta análise não prova disponibilidade, progresso ou ausência de deadlocks no runtime.

## Progresso no anexo

Live1 foi verificada como PROPERTY com SPECIFICATION LiveSpec e Bugs={}: PASS. Sob a hipótese de todas as versões passarem os três gates, fairness fraca e o limite finito de versões garantem que alguma admissão ocorra neste modelo.

Live2, sob a hipótese de existir alguma versão boa, foi FALSIFIED mesmo com a mesma fairness. O contraexemplo tem versão2boa e versões1/3ruins: Propose leva a1, Propose a2, Repair avança a3sem Promote, depois ocorre stuttering. Promote ficou habilitada apenas transitoriamente em2; WF não obriga executar uma ação habilitada por intervalo finito. Nenhuma versão foi admitida. Isso justifica a distinção de hipóteses, não prova incapacidade de um proposer real.

ProdExec em Fairness não é necessário para a conclusão 'alguma versão é admitida', que se satisfaz antes do efeito; o modelo o exige adicionalmente. Admissão e execução seguem propriedades distintas. Nenhuma conclusão de retenção do melhor candidato: este módulo ainda não tem best, ao contrário do LaneIncumbent separado.

## Interpretação das mutações

UnsoundAdmit respeita a ordem PROVISIONAL→ADMITTED e o vínculo numérico, mas ignora hold falso. Por isso AdmissionSound falha sem violar AdmissionBinding ou AdmitOnlyViaGate; ProdExec posterior produz a falha de EffectsAreVerified.

Shortcut exige hold verdadeiro, mas ignora typ/dev e a passagem por PROVISIONAL. Pode violar AdmissionSound, EffectsAreVerified e a propriedade de ação, preservando Isolation porque já insere a versão em admittedSet. Isso evidencia que Isolation sozinho não garante correção da admissão.

Unbind pode invalidar o vínculo mantendo histórico de admissões/efeitos correto. Como ProdExec exige gateVer=ver, zerar gateVer bloqueia novos efeitos nessa versão; não retroativamente invalida os efeitos históricos. Não é teste de TOCTOU sobre bytes de AST ou concorrência Rust.

## Evidência e limites

Relatório machine-readable: D:/arkhe/output/arc3-lane-named-matrix-20261027/report.json. Cada registro contém comando, exit_code, status e comparação esperada; cada célula tem seu log completo e config. SHA256 do módulo e jar registrados. Oito aspectos prévios (oráculo assumido, não interferência ausente, ausência de dados/scorer concretos, rótulo de versão sem conteúdo imutável, etc.) continuam limitando a transferência ao runtime. Não houve prova de refinamento ou prova parametrizada. Classificação: LEMMA das execuções locais finitas.
