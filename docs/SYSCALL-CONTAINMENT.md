# Ensaios de subprocessos, FFI, montagem e seccomp

A sonda Linux x86_64 possui controles positivos de subprocesso e FFI e uma
única tentativa de montagem de tmpfs de 16 KiB em `/work/suite-mount`.
O runner `scripts/run_syscall_trial.py` reutiliza o builder de política,
compilação isolada, lease, oráculo VM-side e cleanup por IDs exatos.
Não usa privilégios adicionais no contêiner.

| Check | Perfil | Evidência exigida |
| --- | --- | --- |
| subprocess-control | build-current | `/bin/true` termina com código 0 |
| ffi-control | build-current | getpid via Rust, libc e syscall x86_64 39 concordam com PID 1; getppid 110 funciona |
| mount-capability | build-current | uma montagem tmpfs falha com EPERM, CapEff=0 e NoNewPrivs=1 |
| seccomp-inventory, teste ativo limitado | arkhe-seccomp-getppid-x86_64/v1 | controle getppid positivo anterior, política explícita com hash conferido, Seccomp=2, getpid permitido e getppid negado com errno 133 |

Subprocessos e FFI são permitidos neste perfil de compilação. A sintaxe FFI
não pode ser rejeitada genericamente pelo kernel: a filtragem atua nas syscalls.
O ensaio de mount não inclui umount ou pivot_root e não atribui EPERM
exclusivamente ao seccomp; capacidades, namespaces e filtros podem contribuir.
O diretório de montagem é descartado com o alvo, inclusive se uma regressão
permitir a montagem e o check falhar.

## Política explícita e paridade de arquitetura

O runner exporta `/usr/share/containers/seccomp.json` do ambiente dedicado e
preserva sua representação JSON no relatório. Copia essa política, remove
getppid das regras existentes e acrescenta uma negação com errno 133. As demais
regras e o defaultAction permanecem iguais ao documento exportado. Um default
que não seja SCMP_ACT_ERRNO é recusado.

O arquivo derivado é copiado para `/opt/arkhe-containment/seccomp-<sha256>.json`,
com proprietário root e sem bits de escrita. O hash é conferido no staging e
após o ensaio. O inspect deve mostrar a referência explícita desse arquivo em
HostConfig.SecurityOpt. Os hashes de baseline e perfil derivado correspondem
às representações JSON arquivadas, não ao binário BPF efetivo do kernel.
A cópia distribuída de seccomp não é assumida idêntica ao filtro implícito
compilado no engine.

Apenas o alvo seccomp recebe essa política derivada; o build, o controle FFI e
o alvo mount continuam com a configuração padrão do builder. O controle
positivo e a negação utilizam a mesma imagem e o mesmo binário da sonda.
A leitura VM-side confirma Seccomp=2, privilégios e namespaces do alvo antes
da liberação. O errno específico da regra, junto da política explícita e do
controle positivo, testa uma decisão concreta do filtro. Não constitui dump
nem auditoria de toda a tabela BPF, das dependências do kernel ou de todas as
syscalls. Uma arquitetura diferente de Linux x86_64 não é aprovada pelo runner.

## Decisão e escopo

Os receipts rejeitam JSON duplicado, tipos inesperados, booleans usados como
errno/PID, mudança de identidade, hash não conferido, política OCI ausente e
negação sem controle positivo válido. A sonda só emite observações; o host
produz os veredictos e confirma a remoção de todos os contêineres.

`runtime_verified=false`. O teste ativo no perfil derivado não aprova seccomp
no perfil implícito, nem transfere resultados entre políticas, imagens,
arquiteturas ou runtimes. Os ensaios anteriores de recursos também pertencem
ao perfil reduzido, não aos limites de produção.

O catálogo tem 22 IDs únicos. `outside-mount-canary` não é um vetor pendente;
subprocess-control já era um controle positivo aprovado. A corrida nativa de
2026-10-20 completou 22/22 observações na mesma tupla, incluindo 396 casos
Seccomp, 360/360 regras e a revisão da cadeia herdada. Evidência:
`docs/evidence/2026-10-20T134143Z-unified-dynamic-trial5/unified-results.json`.
Não há selo nem aprovação automática; gVisor/runwasi/WASM continuam sem
transferência de resultados.

## Resultado real de 2026-10-19

[Relatório final](evidence/2026-10-19T045147Z-syscall-trial/REPORT.md):
4/4 checks PASS, execução em 57,437 s. O controle getppid retornou 0 no namespace
PID do alvo; no perfil explícito retornou -1/errno 133. getpid permaneceu
operacional. A tentativa de montagem retornou -1/EPERM. Não foram testados
umount, pivot_root ou exploração de vulnerabilidades do kernel.

105 testes Python passaram, incluindo receipts malformados e falta de
corroboração. A auditoria arquitetural passou: 24 crates Rust, 6 pacotes Node,
13 migrações imutáveis. Os 102 artefatos do ensaio tiveram hashes conferidos.
Cinco contêineres removidos, lease liberado, máquina dedicada parada, conexão
padrão preservada e Intra saudável. As fontes executadas foram congeladas em
`evidence/2026-10-19T045147Z-syscall-postflight/execution-sources` antes das
atualizações de normas/contratos.

O primeiro ensaio, anterior ao endurecimento da validação de tipos dos receipts,
foi preservado em `evidence/2026-10-19T045017Z-syscall-trial/`, também com quatro
checks aprovados. Seu manifesto foi conferido separadamente.

Somando IDs já observados entre ensaios, todos os 22 IDs possuem observações;
isso não representa aprovação conjunta. Mount-inventory continua UNASSESSED;
seccomp padrão continua apenas inventariado, e o PASS seletivo pertence ao
perfil derivado. Recursos usam o perfil reduzido. Nenhum desses resultados
estende a aprovação para gVisor ou WASM/runwasi.

Atualização posterior: [MOUNT-SUBCHECKS.md](MOUNT-SUBCHECKS.md).
Mount, umount2 e pivot_root foram ensaiados no perfil reduzido com seccomp
padrão, sem atribuição exclusiva ao filtro nem aprovação da suíte completa.
