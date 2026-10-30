# Contenção de recursos em Podman rootless

O runner `scripts/run_resource_trial.py` compila a sonda dentro da imagem OCI
fixada e executa três cargas limitadas no perfil `resource-reduced`.
A política deriva do builder da aplicação e apenas reduz permissões/recursos:
128 MiB de memória, memória+swap de 128 MiB (`memory.swap.max=0`), 0,5 CPU e
16 PIDs. A compilação mantém o perfil original; seus limites não são usados
como evidência dos alvos reduzidos.

O supervisor Windows adquire o lease exclusivo da máquina dedicada. Antes de
liberar cada carga, um leitor root no hospedeiro WSL correlaciona o PID do engine
com NSpid e o cgroup do ID exato do contêiner. Confere os quatro limites efetivos.
O observador permanece fora do cgroup alvo e amostra seus contadores a cada
50 ms. A carga termina em até oito segundos; o watchdog registra erro e solicita
SIGKILL pelo ID pertencente ao ensaio se esse prazo expirar. O cleanup remove
somente IDs registrados, confirma ausência e libera o lease quando não há erros.

Um shell supervisor dentro do alvo mantém o cgroup existente até a coleta final.
Seu código de saída é apenas uma observação; a decisão depende dos contadores
independentes do hospedeiro. O arquivo de saída da sonda tem limite de 64 KiB.

| Vetor | Carga máxima | Critério de aprovação |
| --- | --- | --- |
| memory-bounded | 24 blocos de 8 MiB, total máximo 192 MiB | limite 128 MiB, saída 137 e incremento de `memory.events:oom_kill` |
| cpu-bounded | dois threads por três segundos | quota 0,5 CPU, trabalho observado e incremento de `nr_throttled` e `throttled_usec` |
| pids-bounded | 24 tentativas não recursivas de `/bin/sleep` | EAGAIN, incremento de `pids.events:max` e espera confirmada dos filhos criados |

A execução real também registra o indicador `State.OOMKilled` do engine, sem
substituir a leitura do evento do kernel por esse indicador. Timeout, ausência
de amostras ou observador no cgroup alvo não aprovam o teste. A saída 137
isolada tampouco aprova memória.

A delegação de controladores ocorre antes do ensaio e fica restrita ao ambiente
dedicado. O runner não habilita execução privilegiada nem usa a máquina da
aplicação. WSL2 compartilha o kernel da utility VM entre distribuições.

Resultados válidos apenas para o perfil, imagem e runtime ensaiados. O perfil
reduzido não certifica limites de produção. Continuam pendentes os vetores de
FFI/mount, identificação e testes da política seccomp efetiva, decisão completa
da suíte e integração do gate de runtime ao CI. `runtime_verified=false` e
suíte global `INCOMPLETE`; nenhuma aprovação se transfere a gVisor/runwasi/WASM.

## Resultado real de 2026-10-19

Ensaio final: [REPORT.md](evidence/2026-10-19T044610Z-resource-trial/REPORT.md).
Os três vetores passaram em 49,384 s. Memória: `oom_kill=1`, pico de 128 MiB e
`OOMKilled=true`. CPU: incremento dos contadores de throttling durante a carga.
PIDs: EAGAIN e evento externo de limite, com reap confirmado dos filhos.
Quatro contêineres removidos, lease liberado e máquina dedicada parada.
95 artefatos do ensaio conferidos por SHA-256. Aplicação permaneceu saudável;
conexão padrão preservada. Suíte Python: 90 testes aprovados; arquitetura:
24 crates Rust, 6 pacotes Node e 13 migrações imutáveis.

O primeiro ensaio também foi preservado em
`evidence/2026-10-19T044454Z-resource-trial/`. Após revisar a contabilização de
reap e tornar explícito o SIGKILL do watchdog, os três vetores foram repetidos
com a versão final. As fontes de cada execução foram congeladas nos respectivos
diretórios `resource-postflight/execution-sources` antes de atualizar as normas.

Atualização de syscalls (2026-10-19): [SYSCALL-CONTAINMENT.md](SYSCALL-CONTAINMENT.md).
Controles de subprocesso/FFI e negação de mount ensaiados; teste seletivo de
getppid aprovado em perfil seccomp explícito distinto. Não há aprovação da
tabela completa nem transferência para o perfil implícito. Suíte INCOMPLETE;
runtime_verified=false.
