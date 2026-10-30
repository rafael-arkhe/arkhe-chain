# Ciclos: contagem de consultas verificada; Live2 falha e Live3 passa

27/10/2026. Materializado LaneIsolationCycles.tla a partir do módulo enviado, preservando definições e guardas. Acrescentado LaneCyclesAudit.tla como instrumentação separada com contadores históricos e mutantes. Nenhuma chamada ao modelo, mudança do runtime ou admissão real.

## Modelo fornecido: quatro execuções

Limites MaxCyc2,MaxVer2:4096tabelas iniciais de veredictos,74712estados distintos,83168gerados, profundidade14 na exploração completa do modelo.

|Config|Resultado|
|---|---|
|Safety: TypeOK, Isolation, AdmissionSound, HoldoutSealed, AdmissionBinding, EffectsAreVerified, HoldQPerCycle e AdmitOnlyViaGate|PASS|
|Live1 sob LiveSpec|PASS|
|Live2 sob LiveSpec|FALSIFIED|
|Live3 sob LiveSpec|PASS|

Live2 não herda o PASS do modelo sequencial sem ciclos. No trace, os dois candidatos do primeiro ciclo falham DEV. No segundo ciclo, o primeiro candidato passa DEV, falha H e termina o ciclo; o segundo candidato desse ciclo passa todos os gates, mas nunca é proposto. O protocolo respeita a decisão terminal e a fairness, sem admitir ninguém.

Live3 é logicamente implicada por Live2, mas é uma garantia mais fraca útil: exige um primeiro artefato bom em algum ciclo. Ela passa onde Live2 falha, portanto removê-la perderia informação sobre o progresso que este protocolo realmente garante. Não confundir implicação lógica entre propriedades com redundância operacional num conjunto em que a propriedade mais forte foi falsificada.

## Contadores e onze verificações adicionais

O wrapper mantém readCount por ID global de artefato e cycleCount por ciclo. Admit e RejectHold atualizam ambos; outras ações originais os preservam, inclusive NewCycle. HoldoutReadOncePerArtifact, HoldoutOncePerCycle e CounterBinding=holdQ=cycleCount[cyc] passam no modelo correto, junto com os invariantes originais e CounterTypes.

Os cinco mutantes pedidos foram implementados em wrapper, ligados isoladamente por Bug. LeakExec viola Isolation; LeakHoldout viola HoldoutSealed; UnsoundAdmit viola AdmissionSound; Unbind viola AdmissionBinding; Shortcut viola a propriedade de ação. Cada caso tem config/log focado. Não alegamos uma matriz exaustiva de todos os invariantes por todos os mutantes nesta rodada.

Mutante RepeatQuery conta uma segunda consulta no último ciclo, preservando indevidamente holdQ=1. Ele incrementa os contadores históricos e qTotal, com qTotal ainda <=MaxCyc. Foram confirmados:

- HoldoutReadOncePerArtifact FALSIFIED.
- HoldoutOncePerCycle FALSIFIED.
- CounterBinding FALSIFIED.
- HoldQPerCycle PASS, apesar da repetição.
- HoldQPerCycle => HoldoutReadOncePerArtifact FALSIFIED no mesmo modelo mutado.

Isso demonstra a insuficiência do bound agregado isolado. Não é um contraexemplo ao protocolo original: a repetição é uma ação nova injetada para testar sensibilidade. No modelo seguro, os contadores passam por causa dos guardas holdQ=0 e da decisão terminal, não apenas por existir uma variável ver corrente.

## Correções à auditoria anexada

**Por ciclo versus por artefato.** Uma consulta por ciclo corretamente contabilizada implica no máximo uma por cada artefato desse ciclo, e é mais restritiva. Permitir uma por artefato permitiria até MaxVer consultas por ciclo. Portanto readCount não é uma política 'mais forte de selagem' que o orçamento real de uma por ciclo; é instrumentação mais detalhada que revela erros de contabilização. holdQ/qTotal sozinhos não expressam todos os históricos possíveis.

**Sequencialidade não basta.** Um único PROVISIONAL de cada vez ainda permitiria várias consultas sequenciais no mesmo ciclo se o protocolo retornasse a DEV após a decisão. O limite aqui depende da guarda e da terminalidade de RejectHold/Admit, não apenas da ausência de concorrência. Um modelo concorrente também pode impor orçamento compartilhado de uma consulta por ciclo, se desejar.

**admittedSet não é incumbent.** Ele preserva histórico de IDs admitidos; não seleciona ou retém a melhor AST. gateVer é o último admitido, e ProdExec depende do estágio/artefato corrente. Não é produção concorrente independente de DEV nem recuperação automática da melhor versão anterior.

**Ausência de mutantes não implica vacuidade.** Invariantes em modelos seguros precisam ser verificados; descrever ações pretendidas não garante que interajam corretamente. Controles negativos testam sensibilidade a falhas específicas, não transformam ausência de bug em prova parametrizada. TypeOK não recebeu mutante próprio.

## Holdout fresco continua sem garantia estatística

O modelo não contém datasets, amostragem ou distribuição probabilística. Os veredictos estáticos abrangem combinações arbitrárias; não são prova de independência estatística entre H de ciclos diferentes. Acrescentar cycleSeed diferente ou FreshVerdict sem definição não estabelece independência, ausência de sobreposição de casos ou desconhecimento pelo proposer. Seeds diferentes podem produzir datasets correlacionados e até reutilizados.

Não implementamos um FreshVerdict fictício nem afirmamos selagem de dados reais. Uma formalização de identidades/casos disjuntos pode testar não reutilização sob seus pressupostos, mas ainda não demonstraria independência ou representatividade. Para a operação real faltam origem/partições dos dados, controle de acesso, scorer congelado e trilha completa de consultas. A rejeição terminal elimina novo reparo no mesmo ciclo após H; decisões entre ciclos ainda podem influenciar a estratégia global.

## Artefatos e escopo

Quinze execuções TLC nesta rodada: quatro do módulo e onze do wrapper; todas com resultados esperados nos respectivos reports. CHECK_DEADLOCK FALSE explicitamente usado para separar safety/liveness de estados terminais. Nenhuma prova de ausência de deadlock, de universalidade para outros limites, de correção dos gates-oráculo ou de refinamento Rust.

Reports: D:/arkhe/output/arc3-lane-cycles-20261027/report.json e D:/arkhe/output/arc3-cycle-counters-20261027/report.json; comandos, hashes, configs e logs preservados. Classificação LEMMA limitada às execuções finitas locais. Nenhuma evidência nova de capacidade de síntese/ARC/AGI.
