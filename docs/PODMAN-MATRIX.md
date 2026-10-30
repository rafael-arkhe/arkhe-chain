# Matriz histórica do Podman

[Relatório consolidado](evidence/2026-10-19T045545Z-podman-matrix/REPORT.md).

22 IDs observados; 21 com algum PASS parcial em perfis diferentes.
Mount-inventory continua UNASSESSED. Não houve execução unificada nem
aprovação 21/22 sob uma única tupla. Seccomp foi testado seletivamente em
perfil derivado; recursos em perfil reduzido. Apenas mount foi ensaiado,
sem umount ou pivot_root. Suíte INCOMPLETE; runtime_verified=false.

Contrato proposto da corrida unificada: [UNIFIED-CONTAINMENT-CONTRACT.md](UNIFIED-CONTAINMENT-CONTRACT.md).
Estado DRAFT, não selado e não executado. Candidato único de 128 MiB;
nenhuma aprovação automática do perfil de produção de 1536 MiB.
