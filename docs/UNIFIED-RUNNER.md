# Snapshot e núcleo do runner unificado

Estado: **NATIVE_ADAPTER_FULL_TRIAL_OBSERVED_PENDING_SEMANTIC_REVIEW**. `sealed=false`; `runtime_verified=false`.

`scripts/runtime_source_snapshot.py` congela uma lista explícita de fontes e
configurações, incluindo sonda, oráculo Rust, harness Python, testes, builder,
perfil Seccomp e contratos. Copia os bytes e registra tamanho e SHA-256 de cada
arquivo. Uma segunda leitura exige igualdade da árvore selecionada; a verificação
posterior rejeita alterações, exclusões, novas fontes e corrupção das cópias.
Isso detecta mudanças observadas nas leituras, sem prometer um snapshot atômico
do sistema de arquivos contra um escritor malicioso concorrente.

Saídas geradas e o arquivo de bindings destacados ficam fora da árvore, evitando
ciclos de digest. Os artefatos referenciados pelos bindings continuam sujeitos à
auditoria própria. O snapshot não autentica código nem certifica sua segurança.

Preparação reproduzível, usando um diretório novo:

```powershell
python scripts/prepare_unified_runner.py --output docs/evidence/NOVO-DIRETORIO
```

O comando gera `source/snapshot.json`, cópias das fontes, `plan.json`, relatório
e `SHA256SUMS`. Não inicia máquinas ou contêineres. O plano usa 22 nonces novos,
ordem fixa e a identidade de contrato, fonte, imagem, binário, perfil e runtime.

`scripts/unified_containment_runner.py` implementa o controle sequencial e o
coletor. O orçamento global é 900 segundos com reserva de 30 segundos para
limpeza. O adaptador recebe deadlines absolutos por chamada; precisa impor os
limites no runtime e terminar o alvo exato, pois um timeout Python não elimina
um processo remoto. A limpeza roda em `finally`, inclusive após falha de
pré-voo. O journal cria arquivos exclusivos, faz fsync e encadeia hashes; isso
não constitui assinatura nem protege contra substituição integral do diretório.

O coletor exige 22 receipts ordenados, subchecks completos, remoção dos alvos,
limpeza de auxiliares e tracers, lease liberado e fontes revalidadas. Rejeita
receipts ausentes, repetidos, de outra tupla e estados não PASS. Os subchecks
de Seccomp exigem todos os casos e revisão da cadeia herdada; os de montagem
exigem mount, umount2 e pivot_root, incluindo o errno 133 do candidato.

`scripts/native_unified_adapter.py` integra o Podman/crun instrumentado, snapshots
externos de montagens e fontes, avaliadores de arquivos, controles de rede
pareados e amostragem de cgroups. Os 22 alvos recebem as mesmas flags candidatas;
somente os controles positivos de rede usam a rede privada descartável. Build e
oráculo são auxiliares identificados. O avaliador de montagem exige errno 133;
o avaliador histórico mantém EPERM. FFI e subprocessos são controles positivos
permitidos pelo perfil, e não testes de bloqueio dessas interfaces.

Com a máquina dedicada já iniciada, fontes e bindings atuais:

```powershell
python scripts/run_native_unified.py --preparation docs/evidence/PREPARACAO --output docs/evidence/NOVO-SMOKE --mode smoke
python scripts/run_native_unified.py --preparation docs/evidence/PREPARACAO --output docs/evidence/NOVO-ENSAIO --mode trial
```

O smoke executa apenas identidade com o adaptador real. O modo trial segue os 22
vetores e interrompe no primeiro FAIL/ERROR/UNASSESSED. A carga de recursos tem
limite de oito segundos, dentro do orçamento de 30 segundos que inclui coleta e
remoção do alvo. A remoção de contêineres, canários, rede e tracers é verificada
antes de liberar o lease. O núcleo valida a estrutura e os hashes dos receipts;
o adaptador aplica os avaliadores às observações brutas. Adaptadores simulados
dos testes são apenas fixtures de controle de fluxo. Cada UUID de plano pode ser
consumido uma única vez: um claim exclusivo e persistido em
`ops/local/containment-vm/execution-claims/` impede reexecutar as mesmas nonces.
Um novo ensaio requer nova preparação. O oráculo de rede só é iniciado no bloco
de rede e registra eventos em `/work/events.jsonl`, lido pelo observador externo;
erros dessa coleta não impedem a limpeza em `finally`.

**Estado atual:** a corrida nativa de 2026-10-20 produziu 22/22 receipts na mesma
tupla, com limpeza confirmada. O vetor `seccomp-inventory` executou 396 casos,
cobriu 360/360 regras, avaliou o BPF candidato carregado e passou a revisão da
cadeia herdada (2 filtros no alvo, 1 no controlo, delta candidato de 1). A
evidência está em
`docs/evidence/2026-10-20T134143Z-unified-dynamic-trial5/unified-results.json`.

Mesmo 22 receipts estruturalmente válidos resultam em `OBSERVATIONS_COMPLETE`,
sem selo ou aprovação automática. Continuam necessárias avaliação semântica
independente e admissão explícita; resultados históricos não são importados como
aprovação desta corrida.
