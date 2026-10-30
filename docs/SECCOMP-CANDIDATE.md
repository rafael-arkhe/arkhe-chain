# Perfil seccomp candidato e tabela ABI

Estado: **candidato estático vinculado, não carregado e não verificado em runtime**.
[Perfil](../config/seccomp/arkhe-unified-x86_64-v1/profile.json),
[ABI](../config/seccomp/arkhe-unified-x86_64-v1/abi.json),
[regras](../config/seccomp/arkhe-unified-x86_64-v1/rules.json) e
[bindings destacados](../config/seccomp/unified-static-bindings.json).

O baseline vem do arquivo congelado no ensaio de syscalls e seu SHA-256 foi
conferido contra aquele manifesto. O coletor `scripts/vm_seccomp_abi.py` usa o
resolvedor da libseccomp 2.6.1 instalada na máquina WSL dedicada, registra o
hash da biblioteca e verifica o roundtrip nome/número para 385 entradas nativas
na faixa 0..1023. Números pseudo-negativos e nomes exclusivos de outras ABIs
não viram syscalls nativas. Esse inventário não demonstra disponibilidade no
kernel. Números desconhecidos ficam sujeitos à ação padrão.

## Derivação explícita

`scripts/generate_seccomp_candidate.py` avalia os seletores do baseline para
Linux x86_64 e capacidades vazias; condições desconhecidas são recusadas.
Regras ativas são expandidas por nome/número e argumentos EQ/NE. Regras de
arquiteturas/capacidades ausentes e nomes não nativos ficam registrados como
excluídos, com motivo. O perfil gerado não depende de includes/excludes ou
archMap implícitos do engine.

Default: SCMP_ACT_ERRNO/ENOSYS (38). As 16 syscalls restritas pelo contrato
recebem uma regra incondicional errno 133, removendo alternativas herdadas para
o mesmo número. Getpid/getppid continuam permitidos. São 360 casos de regra
expandidos, incluindo ações permitidas, negadas e condições de argumentos.
A lista de arquiteturas contém somente SCMP_ARCH_X86_64.

Isso é uma alteração candidata de política, não aprovação de produção. Em
particular, o errno 133 é diagnóstico e pode exigir revisão de compatibilidade
com compiladores e ferramentas. Não é a antiga regra artificial que negava
getppid: os bloqueios correspondem às restrições declaradas do contrato.

## Compilação e checks offline

`scripts/vm_compile_seccomp_candidate.py` constrói um contexto libseccomp nativo
com regras exact-array e exporta BPF/PFC, sem chamar seccomp_load.
`candidate.bpf` possui 3064 bytes; o arquivo e os receipts estão no bundle.
O hash profile_sha256 no receipt é da representação JSON normalizada daquele
compilador; profile_file_sha256 é o hash dos bytes do arquivo OCI. O contrato
vincula o segundo, sem confundir essas identidades.

O intérprete limitado `scripts/seccomp_bpf.py` recusa opcodes não suportados,
leituras/jumps inválidos e programas acima do orçamento. Nos casos selecionados:
16 restrições produzem ERRNO/133, getpid/getppid ALLOW, 385 variantes x32 são
negadas, duas arquiteturas estrangeiras são negadas e dois números desconhecidos
recebem ENOSYS. Isso testa o programa exportado offline, não o kernel nem todas
as combinações possíveis de argumentos/ABIs. O manifesto mantém os casos
dinâmicos NOT_EXECUTED e dynamic_coverage_complete=false.

A distinção entre exportar e carregar está na própria
[API da libseccomp](https://github.com/seccomp/libseccomp/blob/main/src/api.c):
as regras acumuladas só integram execução quando o filtro é carregado. Não
assumimos equivalência entre nosso contexto offline e a política que crun
carregará; opções do compilador, arquitetura e versão precisam ser observadas
no ensaio real. O BPF exportado não preenche compiled_filter_evidence_sha256.

## Vinculação e bloqueios restantes

Os três campos profile_file_sha256, abi_table_sha256 e expanded_rule_manifest_sha256
foram vinculados ao contrato. O auditor agora confere paridade com os bindings
destacados, além de verificar os bytes dos arquivos. Esses hashes removem três
UNBOUND_ARTIFACT; não substituem revisão semântica, cobertura dinâmica ou selo.

[Relatório desta geração](evidence/2026-10-19T051427Z-seccomp-candidate/REPORT.md).
O pré-selo ainda possui dez diagnósticos, com dois UNBOUND_ARTIFACT restantes:
manifesto final de montagens e evidência da política efetiva. Continuam também
faltando bindings de execução, runner unificado e validação dinâmica completa.
Não houve contêiner criado nem filtro carregado nesta etapa. A máquina dedicada
foi parada, conexão padrão preservada e Intra permaneceu saudável.

## Limites dos ensaios anteriores

Mount/umount2/pivot_root com EPERM mostram apenas os três operandos ensaiados.
Não esgotam as APIs de montagem, chroot, namespaces ou reconfiguração de VFS.
A comparação externa foi do mountinfo do alvo visto pelo observador; não uma
prova de invariância de todo o VFS do hospedeiro. EPERM não isola sozinho a
causa entre capacidades, namespaces e seccomp. Nada é transferido para gVisor,
WASM/runwasi ou produção de 1536 MiB. runtime_verified=false e sealed=false.

Especificação candidata de mounts/dispositivos: [MOUNT-DEVICE-MANIFEST.md](MOUNT-DEVICE-MANIFEST.md).
38 regras de mounts e 12 expectativas de nós/links; não observadas sob o
candidato final. Hash do rascunho vinculado separadamente, sem substituir
final_manifest_sha256.

Smoke posterior: [UNIFIED-SMOKE.md](UNIFIED-SMOKE.md). Manifesto v2 possui
38 mounts e 13 nós/links após revisão explícita. Comparação estrutural passou;
fontes/máscaras e dump BPF continuam pendentes, sem promoção dos hashes finais.

Atualização posterior: [RUNTIME-LOAD-EVIDENCE.md](RUNTIME-LOAD-EVIDENCE.md).
V3 verificou as 38 origens/máscaras e a instalação observada do candidato
seccomp (383 instruções, retorno 0). Os dois hashes finais foram vinculados;
sem aprovação da cadeia herdada, da matriz completa ou de runtime global.
