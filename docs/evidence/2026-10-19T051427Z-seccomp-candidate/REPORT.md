# Candidato seccomp e ABI

Estado: STATIC_CANDIDATE_BOUND_RUNTIME_NOT_VERIFIED.
sealed=false; runtime_verified=false; kernel_filter_loaded=false.

Perfil nativo Linux x86_64, tabela com 385 syscalls reconhecidas pelo resolvedor
libseccomp 2.6.1 e manifesto com 360 casos de regra. As 16 restrições do contrato
retornam errno 133 no candidato; getpid/getppid permanecem permitidos.

Três hashes estáticos vinculados ao contrato. BPF e PFC exportados offline;
esses arquivos não provam a política carregada pelo crun no kernel. A tabela
ABI não prova que o kernel implementa todas as syscalls reconhecidas pela lib.
O intérprete BPF verifica apenas os casos selecionados registrados no receipt;
não substitui a matriz dinâmica por regra e argumento.

Pré-selo continua SEAL_BLOCKED. Os dois UNBOUND_ARTIFACT restantes são o
manifesto final de montagens e a evidência da política compilada efetiva.
Bindings de execução e implementações pendentes também continuam bloqueando.
Nenhum contêiner ou syscall de ataque foi executado nesta geração; apenas
resolver/compilador offline na máquina dedicada, que foi parada ao término.
Conexão padrão preservada e Intra saudável.
