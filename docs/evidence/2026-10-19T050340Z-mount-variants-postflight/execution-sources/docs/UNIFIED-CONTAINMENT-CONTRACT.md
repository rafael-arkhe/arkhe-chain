# Contrato da corrida unificada no Podman

Estado: **DRAFT_NOT_SEALED_NOT_EXECUTED**. Contrato legível por máquina:
[`runtime-unified-contract.json`](../config/runtime-unified-contract.json).
A execução está desabilitada e `runtime_verified=false`. Este documento não
aprova produção nem altera o builder da aplicação ou os ensaios anteriores.

## Identidade do candidato

Os 22 IDs do catálogo permanecem únicos. Cada ID pode conter subchecks
obrigatórios; três chamadas de montagem continuam dentro de mount-capability.
Aprovar 22 IDs sem aprovar seus subchecks não aprova a corrida.

Todos os 22 alvos devem usar **o mesmo perfil candidato**: UID/GID 10001,
CapEff=0, NoNewPrivs=1, root read-only, network=none, 128 MiB de memória sem swap,
0,5 CPU e 16 PIDs. Imagem OCI, binário, montagens e política seccomp serão
fixados por hash. Nenhum alvo pode recorrer silenciosamente ao perfil do engine.

Isso exige adaptar cgroup-enforcement: os valores antigos de 1536 MiB, 2 CPUs
e 128 PIDs não se aplicam a este candidato. A compilação permanece em uma fase
isolada com esses limites maiores; não integra os veredictos dos 22 alvos.
Somente o binário conferido por hash é transferido aos alvos.

A escolha de 128 MiB mantém o teste de memória dentro do teto de alocação já
especificado, 192 MiB. **Não verifica o perfil de produção de 1536 MiB**.
Validar esse perfil exige outra tupla e revisão explícita dos limites da carga;
192 MiB não pode demonstrar OOM sob uma cota de 1536 MiB. Também não basta
somar os PASS do perfil reduzido aos PASS do perfil atual.

## Montagens e dispositivos

O contrato inclui os 38 pontos encontrados no receipt histórico de FFI como
**referência não aprovada**. O manifesto final deverá declarar cada ponto,
tipo de filesystem, origem vinculada ao ensaio, root dentro do mount, modo,
flags VFS/superbloco, propagação e exceções de dispositivos/masking.

IDs de mounts, números de dispositivos e caminhos temporários podem ser
normalizados somente pelas regras do contrato. A normalização não poderá
apagar permissões, destinos, identidade da origem ou propagação. Hashes dos
arquivos de entrada/canários e inspeção independente complementam mountinfo.

- `/`: imagem somente leitura; nenhuma escrita em `/etc` ou raiz.
- `/input`: origem exata do ensaio, somente leitura e sentinela íntegra.
- `/work`: tmpfs executável, nosuid/nodev e limite de 1 GiB; consumo continua
  sujeito à cota de memória de 128 MiB.
- `/tmp`: tmpfs noexec/nosuid/nodev, limite de 64 MiB.
- `/run` e `/var/tmp`: configurar explicitamente noexec/nosuid/nodev e selar
  limites de tamanho; a configuração implícita histórica não aprova isso.
- `/dev`, dispositivos individuais, devpts, mqueue, `/dev/shm`, `/proc`, `/sys`
  e cgroup2: exceções explícitas por ponto, identidade, permissões e masks.
  Não alegar que apenas `/tmp` e `/work` são graváveis.

Origem desconhecida, destino duplicado, montagem extra, flag divergente,
propagação compartilhada, socket do engine, credenciais ou visão do proc/sys
do hospedeiro bloqueiam a liberação. O observador externo deve conferir o
inventário antes e após os subchecks, mantendo o alvo vivo até a coleta final.
A rotina de cleanup só pode tocar IDs e fixtures pertencentes ao ensaio.

## Mount, umount2 e pivot_root

Cada chamada terá um receipt separado, com número/nome da syscall, ABI,
argumentos fixos, errno, estado de capacidades, inventário antes/depois e
integridade dos canários. Usar somente diretórios descartáveis em `/work`.

Mount tentará um tmpfs de 16 KiB. Umount2 usará apenas um caminho descartável
local ao alvo. Pivot_root usará dois diretórios preparados nesse namespace,
sem caminhos do hospedeiro. A forma exata e segura dos operandos precisa ser
revisada e selada antes de habilitar esses dois novos subchecks; ainda não
foram implementados nem executados.

Sucesso de uma operação proibida é FAIL. EINVAL/ENOENT não demonstram bloqueio
da operação: podem apenas revelar operandos inválidos. EPERM com CapEff=0
registra negação observada, mas não atribui sozinho a causa ao seccomp.
A atribuição ao filtro pertence à verificação de regra descrita abaixo.
Não elevar capacidades nem usar contêiner privilegiado para controles positivos.

## Seccomp: definição de cobertura completa

O candidato precisa de um arquivo explícito, deny-by-default, arquitetura
Linux x86_64 e regra de rejeição para ABIs de compatibilidade, incluindo x32.
A antiga negação artificial de getppid não será política de produção:
getpid/getppid, subprocessos e FFI inofensiva serão controles permitidos.

“Completo” significa cobertura do **manifesto fechado de regras dessa política**:
expandir grupos de nomes, ações, condições por arquitetura, capacidades,
argumentos e fallback. Fixar também a tabela ABI usada para resolver nomes e
números. O conjunto mínimo de restrições inclui a família de montagens,
unshare/setns, ptrace, bpf, perf_event_open, keyctl e userfaultfd; não representa
por si só a política final. Todas as demais restrições do manifesto também
precisam de casos, não apenas essa lista mínima.

Cada regra e ramo obrigatório deverá ter um caso seguro revisado e evidência
independente da decisão efetiva. Não executar operações destrutivas, exploits,
alvos reais do host ou probes sem operandos previamente limitados. Caso inseguro,
indisponível ou não implementado será UNSUPPORTED e bloqueará verificação;
não será omitido para produzir PASS. Uma negação genérica por falta de
capacidade não conta como prova isolada de uma regra seccomp.

O plano de evidência deve vincular arquivo OCI, hash antes/depois, arquitetura,
versão do engine/runtime, modo/filtros observados e evidência da política
compilada efetiva. Um hash do JSON não será descrito como dump BPF. O formato
concreto dessa última evidência e o verificador ainda precisam ser implementados.
Não se exige nem se alega prova formal de todo comportamento do kernel.

## Uma corrida, evidências novas

Selar contrato, imagem, probe, fontes, builder, manifesto de mounts, política,
tabela ABI, manifesto de regras, runner e oráculo. Registrar versões do engine,
runtime OCI, kernel e boot ID; bind de run/vector/nonce/container em cada receipt.
Qualquer mudança de fonte/política invalida a identidade da corrida.

Os sete ensaios anteriores são histórico, não entradas de aprovação da nova
corrida. Usar lease exclusivo e bancada dedicada, sem takeover automático.
Manter os controles positivos pareados de rede e as leituras de cgroups fora
dos alvos. O escopo inicial de rede continua IPv4 com canário privado; não
aprova IPv6 ou resolvedor do sistema.

Orçamento proposto: 900 s globais, preflight 30 s, build 60 s, startup 10 s
por alvo, sondas comuns 3 s, recursos 8 s, casos de syscalls até 60 s cumulativos
e reserva de cleanup de 30 s. Essa proposta não altera os 180 s dos runners
parciais. O runner unificado deverá validar o orçamento antes da liberação,
com um alvo por vez e até dois auxiliares. Timeout gera ERROR e encerramento
por ID exato; nunca vira prova de contenção. Limites de saída: 64 KiB da sonda
e 1 MiB por receipt externo. A expansão de casos pode exigir nova versão do
orçamento, nunca aumento silencioso durante o ensaio.

## Critério de conclusão

Só admitir avaliação final com os 22 IDs PASS, todos os subchecks obrigatórios,
cobertura completa do manifesto selado, controles positivos válidos, eventos
externos correspondentes e cleanup confirmado. UNASSESSED, UNSUPPORTED, falta
de receipt, divergência de identidade ou limpeza parcial bloqueiam aprovação.

Nenhum script existente recebe autorização automática para trocar
runtime_verified para true por este documento. O coletor unificado ainda
precisa ser implementado e validado. A aprovação posterior será limitada ao
candidato selado de 128 MiB; produção de 1536 MiB e gVisor/runwasi/WASM exigem
suas próprias admissões e execuções.

## Trabalho necessário antes da execução

1. Selar o manifesto completo de mounts e dispositivos e configurar as
   alterações candidatas no builder/adaptador.
2. Implementar os novos subchecks seguros de umount2/pivot_root.
3. Revisar e selar política seccomp, tabela ABI, casos por regra e verificação
   independente da política efetiva.
4. Adaptar os 22 vetores ao mesmo candidato e testar startup sob 16 PIDs.
5. Implementar runner/coleção unificados, watchdog, budget e falhas de cleanup.
6. Executar o ensaio completo e submeter seus receipts à decisão de governança.

## Pré-selamento auditado

O contrato atual foi congelado por SHA-256, sem selo de execução.
[Relatório de bloqueios](evidence/2026-10-19T050127Z-unified-preseal/REPORT.md).
O auditor `scripts/audit_runtime_seal.py` é somente leitura em relação ao
runtime e retorna código 2 para indicar que não admite execução. Não transforma
hashes em validação semântica nem inicia uma máquina ou contêiner.
