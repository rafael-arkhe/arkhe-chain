# Subchecks de montagem implementados

A sonda Rust agora emite o corpo de observação schema 2 para mount-capability:
três casos obrigatórios, com syscall, número x86_64, resultado e errno. O envelope
externo continua no protocolo containment-probe/v1. Observações antigas com
apenas mount não satisfazem o avaliador atual dos três casos; os relatórios
históricos permanecem intactos e ligados às respectivas fontes congeladas.

- mount (165): uma tentativa tmpfs de 16 KiB em `/work/suite-mount`.
- umount2 (166): flags 0 em `/work/suite-unmount`, diretório novo sem mount.
- pivot_root (155): `/work/suite-pivot` e `/work/suite-pivot/old`, criados como
  diretórios comuns, sem montar uma nova raiz.

Os operandos de umount2 e pivot_root impedem que uma regressão de permissões
desmonte um ponto real ou troque a raiz. Não usam caminhos do hospedeiro. Por
isso EINVAL/ENOENT seriam inconclusivos para contenção e não passam no avaliador.
Somente os três retornos -1/EPERM, com os oráculos exigidos, aprovam este ensaio.
Não foram executadas variantes com flags alternativas ou operandos privilegiados.

O runner `scripts/run_mount_variants_trial.py` compila dentro da imagem fixada,
verifica o perfil de 128 MiB sem swap, 0,5 CPU e 16 PIDs e mantém um supervisor
vivo no alvo até coletar o estado final. O leitor externo correlaciona ID/PID,
boot e namespaces e compara mountinfo antes/depois. Prazo de carga: três
segundos. Timeout é erro com SIGKILL por ID exato; cleanup confirma ausência.

## Resultado real

[Relatório](evidence/2026-10-19T050340Z-mount-variants-trial/REPORT.md):
três subchecks com EPERM, um vetor PASS, mountinfo externo idêntico antes/depois.
Execução: 23,674 s. Compilação e alvo: dois contêineres removidos, lease liberado,
máquina dedicada parada, conexão padrão preservada e Intra saudável.
82 artefatos conferidos por SHA-256. Fontes executadas congeladas no diretório
`evidence/2026-10-19T050340Z-mount-variants-postflight/execution-sources`.

128 testes Python passaram, incluindo casos ausentes/duplicados, número de ABI
incorreto, boolean em errno, sucesso proibido, EINVAL/ENOENT, mudança de identidade,
privilégios e inventário. Auditoria arquitetural também passou.

Este ensaio usa seccomp padrão do engine. A negação não é atribuída
exclusivamente ao filtro: capacidades, namespaces e políticas contribuem.
Não é a corrida unificada, não verifica a política seccomp final e não aprova
produção de 1536 MiB, gVisor ou WASM. Contrato continua DRAFT/SEAL_BLOCKED e
runtime_verified=false. A implementação dos subchecks foi removida da lista de
pendências; a repetição sob a política final continua obrigatória.

Artefatos estáticos gerados e vinculados: [SECCOMP-CANDIDATE.md](SECCOMP-CANDIDATE.md).
A política ainda não foi carregada no kernel; cobertura dinâmica e selo
continuam pendentes. Hash do BPF offline não é evidência do filtro efetivo.
