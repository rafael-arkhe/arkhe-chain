# Corrida unificada do candidato de 128 MiB

Estado: INCOMPLETE; SEAL_BLOCKED; sealed=false; runtime_verified=false.

18 PASS, 1 UNASSESSED (seccomp-inventory), 3 não executados por fail-closed (memory-bounded, cpu-bounded, pids-bounded). Nenhum PASS histórico foi importado.

A captura do filtro candidato e os testes de mount/umount2/pivot_root não equivalem à cobertura dinâmica completa das regras nem à revisão da cadeia herdada. Não há selo.

O receipt original de limpeza falhou na confirmação da rede e permanece preservado. Uma reconciliação suplementar confirmou ausência de contêineres/rede/tracers e liberou o lease do UUID exato. Foram removidos 28 contêineres, incluindo 19 alvos, 2 builds, 1 oráculo e 6 controles positivos. A correção de limpeza passou por smoke separado; não se transfere esse resultado à tupla do ensaio anterior.

228 testes Python e auditoria arquitetural PASS. 431 hashes conferidos no plano/snapshot e ensaio finais; cadeia do journal íntegra. O Intra já recusava conexão antes do ensaio; sua saúde não foi confirmada.

| Vetor | Resultado |
| --- | --- |
| identity | PASS |
| cgroup-enforcement | PASS |
| mount-inventory | PASS |
| image-read-control | PASS |
| writable-control | PASS |
| input-read-control | PASS |
| input-write | PASS |
| image-write | PASS |
| outside-mount-canary | PASS |
| traversal-and-symlink | PASS |
| tmp-noexec | PASS |
| socket-local-control | PASS |
| tcp-egress | PASS |
| udp-egress | PASS |
| dns-egress | PASS |
| subprocess-control | PASS |
| ffi-control | PASS |
| mount-capability | PASS |
| seccomp-inventory | UNASSESSED |
| memory-bounded | NOT_EXECUTED |
| cpu-bounded | NOT_EXECUTED |
| pids-bounded | NOT_EXECUTED |

Pós-voo: máquina dedicada desligada e snapshot atual revalidado.
