# Smoke check do candidato unificado

[Ensaio revisado](evidence/2026-10-19T052756Z-unified-smoke/REPORT.md).
Etapa de inicialização implementada em `scripts/run_unified_smoke.py`;
não é o runner unificado de 22 vetores. `sealed=false`; `runtime_verified=false`.

O alvo usa a imagem OCI fixada, seccomp candidato explícito, 128 MiB sem swap,
0,5 CPU, 16 PIDs e IPC privado. `/run` foi configurado com 4 MiB noexec/nosuid/nodev;
`/var/tmp`, com 8 MiB noexec/nosuid/nodev; `/dev/shm`, com 64 MiB. O binário foi
compilado em contêiner separado, com os limites da fase de build, e conferido
por hash. A aplicação e sua máquina não foram reconfiguradas.

## Resultados observados

Startup e limites efetivos corresponderam ao candidato. A comparação estrutural
do manifesto v2 encontrou os 38 mounts e 13 nós/links esperados, sem divergências;
flags, tamanhos, permissões e identidades de dispositivos declaradas foram
checados pelo leitor externo. Mountinfo e metadados de dispositivos permaneceram
iguais antes/depois. O controle inofensivo de identidade executou após essa
comparação; não foram executados os outros 21 vetores ou stress de recursos
sob esta política seccomp. Duração: 25,533 s.

Os hashes dos 83 artefatos deste ensaio foram conferidos. Dois contêineres
removidos, lease liberado e máquina dedicada parada. Conexão padrão preservada
e Intra saudável. 169 testes Python e auditoria arquitetural passaram.
Binário recém-compilado e imagem inspecionada foram adicionados aos bindings
estáticos; isso não constitui selo nem aprovação do ensaio completo.

## Revisão explícita do manifesto

A tentativa anterior foi preservada em `evidence/2026-10-19T052446Z-unified-smoke`.
O comparador reprovou o link `/dev/core` não declarado e os proprietários dos
seis dispositivos básicos. A sonda foi retida, sem auto-learning da allowlist.

O manifesto v2 registra o receipt e seu hash usados na revisão. `/dev/core`
só é admitido como link fixo para `/proc/kcore`, se este for mount read-only
mascarado pelo mesmo objeto de caractere `/dev/null`, major/minor 1:3. Os seis
nós básicos conservam rdev e modo 0666 exatos e exigem UID host 0 sem mapeamento;
o GID host é 0, exceto tty, que exige 5, também sem mapeamento. Não são descritos
como UID/GID interno 0. Os números overflow internos não foram presumidos.

O leitor continua root fora do namespace alvo. A classe mapped/unmapped é
calculada a partir dos mapas lidos independentemente; inode/device e rdev são
comparados sem seguir os links antes de validar seus destinos.

Uma primeira tentativa (`evidence/2026-10-19T052321Z-unified-smoke`) parou por erro
de sintaxe do coletor. Relatório e fontes foram preservados. Ambos os contêineres
foram removidos; o lease exato foi reconciliado após comprovar engine vazio,
antes de qualquer repetição. Os três ensaios possuem 239 artefatos de origem
com hashes conferidos, sem apagar ou reclassificar as tentativas anteriores.

## Hashes finais continuam bloqueados

O observador root obtido via WSL exec apresentou Seccomp=2. A API
[PTRACE_SECCOMP_GET_FILTER](https://man7.org/linux/man-pages/man2/ptrace.2.html)
exige tracer sem proteção seccomp. O coletor registrou BLOCKED_READER_SECCOMP,
sem tentar ptrace ou remover/reduzir a restrição herdada. Não há errno de ptrace
medido, dump BPF ou comparação com filtros efetivos. O BPF offline não foi
substituído como evidência. Compiled_filter_evidence_sha256 permanece null.

A comparação de montagens é estrutural. Ainda faltam resolver e validar todos
os vínculos de origem/root/inode, arquivos gerados e diretórios de máscara
contra observações independentes do engine; coletar lstat por si só não conclui
essa revisão. Final_manifest_sha256 permanece null e mount-inventory não recebe
PASS final. Os próximos passos são implementar essa resolução, disponibilizar
um observador de BPF que atenda aos requisitos sem enfraquecer o alvo e concluir
cobertura dinâmica por regra, runner/coletor unificados e os 22 vetores.

Atualização posterior: [RUNTIME-LOAD-EVIDENCE.md](RUNTIME-LOAD-EVIDENCE.md).
V3 verificou as 38 origens/máscaras e a instalação observada do candidato
seccomp (383 instruções, retorno 0). Os dois hashes finais foram vinculados;
sem aprovação da cadeia herdada, da matriz completa ou de runtime global.
