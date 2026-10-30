# Matriz consolidada do Podman rootless/WSL2

Consolidação histórica; nenhuma nova execução de sonda.
Suíte: INCOMPLETE; runtime_verified=false.

22 IDs observados; 21 possuem algum PASS parcial em perfis distintos.
789 hashes de artefatos conferidos nos sete ensaios de origem.

| ID | Último perfil | Último resultado | Evidência |
| --- | --- | --- | --- |
| identity | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| cgroup-enforcement | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| mount-inventory | build-current | UNASSESSED | [receipt](../2026-10-19T040641Z-runtime-first-trial/results.json) |
| socket-local-control | build-current | PASS | [receipt](../2026-10-19T043018Z-network-trial/results.json) |
| tcp-egress | build-current | PASS | [receipt](../2026-10-19T043018Z-network-trial/results.json) |
| udp-egress | build-current | PASS | [receipt](../2026-10-19T043018Z-network-trial/results.json) |
| dns-egress | build-current | PASS | [receipt](../2026-10-19T043018Z-network-trial/results.json) |
| image-read-control | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| writable-control | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| input-read-control | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| input-write | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| image-write | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| outside-mount-canary | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| traversal-and-symlink | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| subprocess-control | build-current | PASS | [receipt](../2026-10-19T045147Z-syscall-trial/results.json) |
| ffi-control | build-current | PASS | [receipt](../2026-10-19T045147Z-syscall-trial/results.json) |
| mount-capability | build-current | PASS | [receipt](../2026-10-19T045147Z-syscall-trial/results.json) |
| seccomp-inventory | arkhe-seccomp-getppid-x86_64/v1 | PASS | [receipt](../2026-10-19T045147Z-syscall-trial/results.json) |
| tmp-noexec | build-current | PASS | [receipt](../2026-10-19T041747Z-filesystem-trial/results.json) |
| memory-bounded | resource-reduced | PASS | [receipt](../2026-10-19T044610Z-resource-trial/results.json) |
| cpu-bounded | resource-reduced | PASS | [receipt](../2026-10-19T044610Z-resource-trial/results.json) |
| pids-bounded | resource-reduced | PASS | [receipt](../2026-10-19T044610Z-resource-trial/results.json) |

Não há aprovação 21/22 sob uma única tupla. Os três testes de recursos usam
resource-reduced; o PASS de seccomp pertence ao perfil derivado. O perfil
build-current mantém o inventário seccomp sem aprovação do filtro completo.
Mount-inventory permanece UNASSESSED. Umount e pivot_root não foram ensaiados.

Para um ensaio unificado: definir contrato de mounts, selar política seccomp
e matriz por arquitetura, explicitar subperfis de recursos, integrar oráculos
e controles pareados, planejar orçamento global e validar cleanup. Somente
depois decidir aprovação da suíte pelos critérios desse contrato.

A migração gVisor exige disponibilidade do runtime e uma execução independente
da matriz; não herda PASS do Podman.
