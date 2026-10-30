# Reconciliação das três versões e teste adicional de fairness

27/10/2026. O novo anexo reúne descrições de arquivos e rodadas diferentes. Não foram alterados os módulos fornecidos nem os resultados históricos. Uma verificação TLC adicional foi executada.

## Identidade dos arquivos

|Arquivo real|Parâmetro|Origem/escopo|
|---|---|---|
|formal/LaneIsolation.tla|Buggy booleano|Primeiro anexo, dois mutantes; preservado|
|formal/LaneIsolationAudit.tla|EXTENDS LaneIsolation + FaultMode|Wrapper local acrescentando três mutantes ao original; não contém Bugs|
|formal/matrix-v3/LaneIsolation.tla|Bugs conjunto de cinco nomes|Segundo módulo fornecido, independente, preservado com o mesmo nome em outro diretório|

Logo 'BuggyFALSE desliga duas ações' permanece correto sobre o primeiro módulo e o audit correspondente. 'Bugs={} desliga cinco mutantes' é correto sobre matrix-v3. Não corrigimos duas para cinco no relatório de um módulo diferente. O arquivo novo não é LaneIsolationAudit.tla renomeado: ele declara sua própria especificação e acrescenta LiveSpec/Live1/Live2. Hashes dos três arquivos são distintos e estão registrados no recibo desta reconciliação.

## Liveness já executada e teste novo

O relatório arc3-lane-named-matrix-20261027/report.json registra Live1 PASS e Live2 FALSIFIED, ambos com LiveSpec, MaxVer3, Bugs={}. Esses resultados já constam de LANE-NAMED-MATRIX-v1.md; não estavam pendentes. O relatório mais antigo LANE-CONFIG-AUDIT-v1.md descrevia outro modelo, sem Live1/Live2.

Para testar a atribuição à falta de WF(Repair), criado LaneRepairFairness.tla, que estende matrix-v3 e acrescenta WF_vars(Repair) a LiveSpec. Resultado novo: **Live2 continua FALSIFIED**, exit13,5600estados distintos. A versão2tem todos os gates verdadeiros; Propose alcança2, Repair avança a3ruim antes de Promote, e a execução fica em stuttering. Repair efetivamente foi executada. Fairness fraca exige ações continuamente habilitadas, não preservação de uma versão boa nem processamento obrigatório antes da substituição. Acrescentar fairness de Repair não elimina esse contraexemplo.

Artefatos novos: D:/arkhe/output/arc3-lane-repair-fairness-20261027/tlc.log, exit-code.txt, report.json. Config Live2-repair-fair.cfg e wrapper em formal/matrix-v3/. Nenhuma nova chamada ao modelo ou alteração do runtime.

## Outras correções necessárias

- A frase 'cada um dos seis invariantes + propriedade é falsificado' contradiz a própria matriz: TypeOK passa em todas as linhas. Foram falsificados os cinco invariantes de safety substantivos e a propriedade de ação; TypeOK não tem mutante falsificador nesse conjunto. Isso não torna TypeOK vacuamente verdadeiro nem invalida a matriz, apenas limita sua cobertura de mutações.
- Sensibilidade de mutação não é sinônimo de não-vacuidade. Os antecedentes de admissão/efeito tinham testemunha positiva anterior; os mutantes testam detecção de violações diferentes.
- Não adicionar UNCHANGED repairReads a NewVersion. No primeiro Repair, repairReads={} e a composição exigiria simultaneamente repairReads'={} e repairReads'={dev}, impossível. O fragmento deliberadamente deixa essa variável para Propose/Repair restringirem. Não é necessário torná-lo uma ação completa se não é usado sozinho em Next.
- Os resultados de -continue permanecem válidos para TLC/configs executados: registrar a primeira falha por sucessor e terminar com exit0 não significa ausência de violações. Não classificamos uma observação de versão como teorema universal de toda implementação.
- MaxVer3 continua verificação limitada. Não foi produzida indução parametrizada, prova de refinamento Rust ou não interferência do holdout. O modelo ainda usa gates-oráculo.

## Estado

Matriz anterior intacta, identidade de arquivos esclarecida, Live1/Live2 já conferidas e controle adicional de WF(Repair) executado. O ponto de falha de Live2 é a possibilidade de descartar uma versão boa antes da promoção, não a mera ausência de fairness de Repair. Classificação: LEMMA de execução finita local.
