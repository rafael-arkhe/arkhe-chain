# Manifesto candidato de montagens e dispositivos

Especificação: [`runtime-mounts-candidate.json`](../config/runtime-mounts-candidate.json).
Estado **DRAFT_REQUIRES_CANDIDATE_OBSERVATION**. Sem execução, selo ou aprovação
de runtime. O SHA-256 do candidato está ligado separadamente ao contrato unificado;
`final_manifest_sha256` permanece null até validação do candidato real.

## Escopo declarado

São 38 regras de destino, derivadas do receipt histórico de FFI com digest
registrado. Cada uma especifica filesystem, acesso VFS, flags, propagação,
origem, root dentro do mount e justificativa. Os nomes temporários ainda devem
ser resolvidos contra run_id, container_id, PID correlacionado e imagem exata;
não são wildcards de autorização. Os campos observed_metadata estão vazios.

| Destino | Proposta |
| --- | --- |
| `/` | Overlay da imagem exata, somente leitura; execução de loader/binários permitida |
| `/input` | Snapshot exato somente leitura, com origem e root da fixture vinculados |
| `/work` | Tmpfs executável de 1 GiB, nosuid/nodev e cota cgroup de 128 MiB |
| `/tmp` | Tmpfs noexec/nosuid/nodev de 64 MiB |
| `/run` | Tmpfs explícito noexec/nosuid/nodev de 4 MiB |
| `/var/tmp` | Tmpfs explícito noexec/nosuid/nodev de 8 MiB |
| `/dev/shm` | Tmpfs privado explicitamente limitado a 64 MiB |
| `/dev`, devpts e mqueue | Exceções de infraestrutura declaradas, sem dispositivos extras |
| `/proc`, `/sys`, cgroup2 e submasks | Escopo do alvo, máscaras e permissões por ponto |
| Identidade/hostname gerados | Arquivos do contêiner exato, read-only e conteúdo conferido |

Os novos tamanhos e flags são propostas para o adaptador futuro. Não foram
aplicados ao builder atual nem observados em um alvo. Todos os 22 alvos deverão
seguir o manifesto final idêntico, com bindings individuais para suas fixtures;
a compilação ocorre separadamente. A soma dos limites tmpfs não significa
reserva de RAM nem substitui a checagem independente do cgroup.

A origem 9p de `/input` pode citar o drive de suporte. O verificador deve vincular
também o root exato da fixture dentro dele; não autorizar todo o drive nem
normalizar esse root para `/`.

## Dispositivos e links

O candidato contém sete expectativas de nós de caractere: null (1:3), zero
(1:5), full (1:7), tty (5:0), random (1:8), urandom (1:9) e devpts/ptmx (5:2).
Os modos e UID/GID internos são valores propostos que exigem confirmação;
não foram inferidos de mountinfo. Há cinco links com destino fixado: fd,
stdin, stdout, stderr e ptmx. Esses 12 itens não são um inventário já observado.

Usar lstat antes de seguir links e validar tipo, rdev, modo, UID/GID, destino e
mount correspondente. Traduzir IDs de host com os mapas de usuário/grupo lidos
independentemente; não comparar diretamente UID de host com UID interno.
Dispositivos de bloco, nós não listados e arquivos/sockets/FIFOs inesperados
fora do scratch explícito são erro. Shm/mqueue devem estar vazios no preflight;
PTYs dinâmicos exigiriam uma nova versão revisada do manifesto.

## Comparador exigido

O comparador runtime ainda precisa ser implementado. Deverá interpretar o
separador e escapes octais de mountinfo, rejeitar destinos duplicados e montar
a relação mount/source/root. Deve capturar flags VFS e opções de superbloco;
um mount VFS read-only pode ter filesystem de suporte rw, sem que isso por si
só seja divergência. As duas camadas devem ser avaliadas separadamente.

IDs de mount, parent ID e número do backing device podem ser tratados como
voláteis somente após conferir a identidade da origem. Não apagar de uma
comparação o modo de acesso, flags, root, propagação, tamanho ou identidade do
objeto. Converter unidades tmpfs em bytes com alinhamento de páginas explícito.

Propagação compartilhada/slave, host proc/sys, sockets do engine, segredos e
origens não vinculadas bloqueiam liberação. Metadata ausente/ambígua, mount
extra ou nó desconhecido são ERROR; identidade/permissão divergente é FAIL.
Esses estados não se tornam PASS por aprendizado automático da allowlist.

Manter o supervisor vivo para as leituras externas antes/depois. Hashes das
fixtures/canários e comprovação de limpeza complementam mountinfo. Essas
leituras descrevem o namespace do alvo visto pelo observador, não invariância
de toda a VFS do hospedeiro.

## Promoção ao manifesto final

1. Configurar o adaptador candidato com os tamanhos/flags declarados.
2. Coletar mountinfo e metadados de nós por observador externo independente.
3. Resolver cada origem, root, inode/conteúdo de máscara e dispositivo.
4. Revisar discrepâncias; corrigir a configuração ou versionar o candidato.
5. Executar smoke check com estado antes/depois e cleanup comprovado.
6. Congelar o manifesto revisado e só então preencher final_manifest_sha256.

Não preencher o hash final apenas com o hash deste rascunho. A evidência do
filtro efetivamente carregado, a cobertura dinâmica de regras e os bindings
restantes também são obrigatórios: este documento não torna o runner pronto
nem autoriza a corrida unificada. `sealed=false`; `runtime_verified=false`.
