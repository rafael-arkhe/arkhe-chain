# Captura da instalação seccomp e resolução de origens

[Artefatos verificados](evidence/2026-10-19T055344Z-smoke-artifacts/REPORT.md).
[Pré-selo atualizado](evidence/2026-10-19T055345Z-captured-smoke-preseal/REPORT.md).
Ensaio de origem: `evidence/2026-10-19T054917Z-verified-captured-smoke`.

Os campos `mount_contract.final_manifest_sha256` e
`seccomp_contract.compiled_filter_evidence_sha256` foram preenchidos com os
artefatos verificados desse smoke. Não há mais UNBOUND_ARTIFACT no pré-selo.
Continuam quatro diagnósticos: contrato ainda DRAFT, binding do runner unificado,
snapshot de fontes para essa execução unificada e implementação/cobertura
pendentes. `sealed=false`; `runtime_verified=false`.

## Evidência de instalação

O executável strace 7.2 foi obtido pelo gerenciador de pacotes da bancada;
o RPM passou em `rpm --checksig`, e os hashes do pacote e binário foram
registrados. Somente o binário necessário foi extraído para `/opt/arkhe-containment`;
não houve instalação ou troca global do runtime da aplicação.

Um wrapper root-owned por run_id chama crun sob strace. O Podman local rootless
usa o mesmo storage dedicado e escolhe esse wrapper apenas por opção da chamada.
Nenhum arquivo de configuração global de runtime foi alterado. O build mantém
crun normal e limites de compilação separados; o alvo conserva 128 MiB sem swap,
0,5 CPU, 16 PIDs, capacidades vazias e o perfil seccomp explícito.

O trace externo contém, no PID do init correlacionado pelo leitor independente,
uma chamada completa de seccomp SET_MODE_FILTER com 383 instruções, flags 4 e
retorno 0. O parser reconstrói os sock_filter nativos sem eval, valida comprimento,
campos, flags, PID, container ID, sucesso e unicidade do evento. Os 3064 bytes
reconstruídos coincidem exatamente com o candidato offline, cujo SHA-256 é
`65c6f984d3959c65bc6923f8a79c86fe4421d59ef82e843af6df7c6578e3a9d3`.

A evidência atesta o programa fornecido pelo crun e a aceitação dessa instalação
observada; não é um dump posterior nem extração de todos os filtros herdados.
O observador continua sob Seccomp=2. A limitação de
[PTRACE_SECCOMP_GET_FILTER](https://man7.org/linux/man-pages/man2/ptrace.2.html)
é específica dessa operação e não implica que toda observação de syscalls via
ptrace seja proibida. Nenhuma restrição herdada foi removida para produzir o trace.
A instrumentação faz parte da identidade desse ensaio; a versão e hash do wrapper
precisam acompanhar execuções futuras. A cadeia herdada e a cobertura dinâmica
completa por regra e argumento permanecem não verificadas.

## Origens e máscaras

O leitor independente correlaciona init/conmon/container ID e lê a configuração
OCI da instância exata. As 38 origens e máscaras passaram antes/depois:

- Overlay: root OCI, imagem e upper/work dirs coincidem com inspect; lower layers
  são comparadas após resolver os aliases canônicos no storage do engine.
- Bind mounts: somente caminhos de fixture e userdata da instância, mais os seis
  nós de caractere explicitamente permitidos. Origem e destino concordam em
  filesystem/inode/tipo/modo; arquivos gerados também têm conteúdo/hash comparado.
- Pseudo-filesystems: tipo e root OCI, namespace do alvo e flags são conferidos;
  proc PID 1 corresponde ao namespace do init, e cgroup2 ao cgroup correlacionado.
- Máscaras: caminhos OCI masked/readonly, subárvores proc e objetos null/empty
  são conferidos sem ler conteúdo de arquivos sensíveis do proc.

A revisão v3 protege `/run/secrets` com tmpfs explícito de 4 KiB, ro/noexec/
nosuid/nodev e modo 0700. O diretório padrão do engine não estava vazio, portanto
não foi admitido automaticamente. Na repetição, a máscara explícita estava vazia.
Não foram expostos ou copiados conteúdos de secrets como parte dessa revisão.

O manifesto final congela a política candidata e sua observação de referência,
com 38 mounts e 13 expectativas de nós/links. Não permite reutilizar caminhos
transitórios ou o PASS de uma instância: cada novo alvo deve resolver seus próprios
IDs de container, fixture, namespaces e origens com o verificador fixado por hash.

## Resultado e higiene

Smoke final: 52,781 s, startup/cotas/identidade operacionais e snapshots estáveis.
194 testes Python passaram e a arquitetura manteve 24 crates Rust, 6 pacotes Node
e 13 migrações imutáveis. Os 90 artefatos do ensaio final tiveram hashes conferidos;
foram 420 verificações de arquivos nos cinco ensaios preparatórios preservados.

As duas primeiras tentativas instrumentadas pararam por falhas do wrapper gerado
(template e newline de shebang). Relatórios, código e reconciliações foram
preservados; os leases exatos só foram liberados após verificar engine vazio e
remoção dos contêineres. Uma etapa intermediária registrou bindings ainda
incompletos e motivou as verificações adicionais, sem aprovação de selo.

Dois contêineres do ensaio final foram removidos. Não restaram tracers ativos;
lease liberado, máquina dedicada parada, conexão padrão preservada e Intra saudável.
Não houve execução da matriz de 22 vetores nem atribuição de autoridade à cognição.
O próximo trabalho é completar o runner/coletor unificado, snapshot das fontes,
cobertura dinâmica e uma nova corrida integral sob a tupla declarada.
