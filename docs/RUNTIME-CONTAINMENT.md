# Especificação da validação de contenção em runtime

Estado: **PARTIAL_PILOT_EXECUTED**. Este documento define os 22 vetores;
o piloto inicial está em [RUNTIME-TRIAL.md](RUNTIME-TRIAL.md), e o ensaio posterior
de arquivos em [FILESYSTEM-CONTAINMENT.md](FILESYSTEM-CONTAINMENT.md).
O ensaio de rede está em [NETWORK-CONTAINMENT.md](NETWORK-CONTAINMENT.md).
A suíte completa permanece não executada e runtime_verified=false. CI remoto e assinatura OIDC
também não foram demonstrados nesta árvore local.

## Perfil realmente encontrado

O ponto de integração é `sandboxArguments` e `sandboxReady` em
`apps/arkhe-intra/lib/development.mjs`, também usado pelo avaliador independente.
A imagem de testes é Rust/Debian (`packaging/sandbox/Containerfile`). O perfil
atual usa Podman rootless, imagem por ID sha256, pull=never, network=none,
read-only, cap-drop=ALL, no-new-privileges, UID/GID 10001, PID=128,
memória=1536 MiB, CPU=2, /input somente leitura, /work tmpfs executável de 1 GiB
e /tmp tmpfs noexec de 64 MiB. O cgroup-parent padrão é /arkhe-sandbox.

Não foi encontrado filtro seccomp próprio fixado por digest, runtime gVisor,
runwasi ou um worker WASM sem capacidades. O perfil padrão do engine NÃO DEVE
ser descrito como filtro constitucional verificado. Sua configuração efetiva
precisa ser observada e registrada antes de qualquer alegação sobre syscalls.

Este é um **perfil de build**: subprocessos, exec e FFI são necessários para o
compilador/testes e NÃO são proibidos de maneira geral. Criar sockets e comunicar
em loopback dentro do mesmo namespace também pode ser permitido; a propriedade
exigida é ausência de comunicação com outros namespaces/rede externa.

Read-only não proíbe leitura da imagem. Podman pode criar tmpfs graváveis
implícitos, como /run, /var/tmp e /dev/shm. Portanto o perfil atual NÃO garante
que somente /tmp e /work sejam graváveis. O inventário de mounts deve registrar
essas exceções; um perfil mais restrito exigiria configuração e revisão próprias.
Referência: [podman-run](https://docs.podman.io/en/v6.1.3/markdown/podman-run.1.html).

## Artefatos e scripts

- `config/runtime-containment-vectors.json`: catálogo versionado de 22 vetores,
  expectativas, oráculos e limites máximos.
- `scripts/runtime_containment.py plan`: implementado; valida o catálogo e gera
  plan.json, PLAN.md e SHA256SUMS, sem invocar Podman, rede ou probes.
- `scripts/containment_probe.py prepare/collect`: estrutura implementada para
  requisições e observações não confiáveis, sem execução de containers.
- Executor parcial: `scripts/run_containment_trial.py`, usando o builder puro
  compartilhado com o runtime. O executor da suíte completa permanece pendente.
- Fonte Rust standalone: estrutura implementada em
  `packaging/sandbox/containment-probe/main.rs`, com 17 vetores implementados
  (incluindo sete de arquivos e quatro de rede) e cinco ainda UNSUPPORTED. Houve execução
  real dos controles e testes de arquivos em Linux dentro de containers rootless;
  FFI/mount e stress de recursos permanecem pendentes; o ensaio de rede é IPv4
  e limitado ao canário privado, sem aprovação geral de egress.
- Oráculos do host/VM e canário de rede: **a implementar**; resultados do probe
  não são aceitos como evidência única de contenção.

Comando implementado (usar diretório novo):

```sh
python scripts/runtime_containment.py plan --output docs/evidence/runtime-plan-001
```

O plano fixa hashes do catálogo, desta norma e da fonte do runtime. Um ID de
imagem lido da configuração é identificado como configurado, NÃO inspecionado.
Mudança de quaisquer desses artefatos invalida a identidade do plano para uma
execução posterior. O manifesto não é uma assinatura.

## Protocolo exigido do executor futuro

1. Reservar a bancada com o mesmo lock usado pelo desenvolvimento/avaliação.
   Recusar concorrência com outras cargas. Não parar aplicações ou containers
   alheios. Usar VM dedicada descartável, sem credenciais, sockets do engine,
   volumes de dados reais ou acesso de escrita ao workspace.
2. Validar engine rootless, imagem imutável local, versão/arquitetura/kernel,
   OCI runtime, cgroups v2 e delegação, antes de executar qualquer carga.
   Não iniciar nem reconfigurar serviços globais automaticamente.
3. Criar somente fixtures com nonce aleatório e hashes conhecidos. Montar um
   diretório específico em /input:ro. Manter outro sentinela da VM fora dos mounts.
   Não usar /etc do host, arquivos pessoais, tokens ou bancos reais.
4. Obter a política pelo mesmo builder do runtime, registrar argumentos efetivos,
   mounts, namespaces, capabilities, no-new-privileges e limites cgroup observados.
   Não afrouxar controles para fazer um probe passar. Ausência de controlador ou
   falha de inicialização é ERROR, nunca sucesso de um teste negativo.
5. Compilar probes dentro da sandbox, registrar digest dos binários e executar
   um vetor por container. Não usar shell para interpolar nomes ou conteúdo vindo
   do probe. Limitar stdout/stderr antes de materializá-los no relatório.
6. Executar controles positivos e negativos pareados; registrar errno, sinal,
   exit code, tempo, eventos cgroup e observações independentes do canário.
7. Coletar estado antes de remover o container. O watchdog do host deve forçar
   término no limite. Limpeza deve usar somente IDs criados nesta execução e
   prefixo único arkhe-containment-<uuid>. Nunca usar prune ou remoção por padrão
   genérico. Confirmar ausência dos containers e integridade dos sentinelas.
8. Limpeza incompleta, resultado truncado ou exceção gera ERROR. Persistir logs
   limitados e relatório inclusive em falhas; excluir segredos e conteúdo real.

A enumeração de mounts permite descrever o perfil, mas NÃO substitui os testes
comportamentais de escrita/execução. A inspeção de flags não é prova de enforcement.

## Rede: oráculo sem Internet

Criar um canário controlado em rede interna dedicada da VM, sem portas publicadas
no host e sem acesso à Internet. Um cliente positivo separado, ligado a essa
rede, deve provar recepção dos nonces TCP, UDP e DNS. Esse cliente NÃO é o perfil
sob avaliação, e sua diferença de rede deve constar do relatório.

O alvo mantém network=none. Tentativas usam apenas o endereço do canário. O host
observa que nenhum nonce do alvo chegou; a ausência de interfaces/rotas externas
é evidência complementar. Limites: uma tentativa por protocolo, mensagens de no
máximo 64 bytes para UDP, no máximo uma consulta DNS e timeout de 3 segundos.
Não consultar resolvedores públicos nem varrer portas. Um socket criado com
sucesso, sendto que retorna sucesso ou getaddrinfo que falha não decide o teste
isoladamente. Resolução de localhost por /etc/hosts é comportamento permitido.

## Sistema de arquivos e processos

Controles positivos leem fixture da imagem e /input e escrevem até 1 KiB em /tmp
e /work. Negativos tentam escrever no input, criar arquivo em /etc e acessar
sentinela não montado, inclusive por ../ e symlink criado somente em /work.
O oráculo do host verifica que os hashes originais permanecem idênticos.
O teste de /tmp noexec copia um executável conhecido e tenta exec direto;
interpretar um script não está coberto pela propriedade noexec.

O controle de subprocesso executa apenas /bin/true. O controle de FFI chama
somente getpid. Ambos devem funcionar neste perfil. Uma tentativa de mount tmpfs
em um diretório novo de /work deve falhar. EPERM pode decorrer de capabilities,
namespace ou seccomp; não atribuir causalidade sem evidência adicional.
Testes por syscall bloqueada exigem política seccomp fixada, por arquitetura,
com controle positivo funcional e errno/sinal esperado. Ausência disso é
UNSUPPORTED, não certificação do filtro. Não executar exploits conhecidos,
ROP, escrita em memória de outros processos ou tentativas reais de escape.

## Recursos: exaustão limitada ao container

Antes dos testes, confirmar os limites reais do perfil de produção pelo cgroup.
A carga exercita um perfil derivado **somente mais restritivo**, descrito
separadamente: memória 128 MiB com swap total limitado ao mesmo valor; CPU 0,5;
PIDs 16. Esses resultados NÃO demonstram capacidade sob os limites de produção.

- Memória: tocar blocos de 8 MiB, teto de tentativa 192 MiB, janela de 8 segundos.
  Correlacionar memory.events, estado OOMKilled e estatísticas do container.
  Exit 137 isolado não prova atuação do cgroup.
- CPU: no máximo duas threads durante 3 segundos, watchdog de 8 segundos.
  Confirmar quota e analisar cpu.stat/throttling; timeout não é prova de quota.
- PIDs: no máximo 24 tentativas de spawn de filhos curtos, sem forking recursivo,
  watchdog de 8 segundos; correlacionar EAGAIN com pids.events e reap dos filhos.

No máximo um alvo ativo; janela global de 180 segundos e saída por probe de
64 KiB. Desabilitar vetores de recursos se o engine ignorar limites ou se a VM
não tiver reserva suficiente; registrar ERROR/UNSUPPORTED e impedir PASS global.
Não remover limites, aumentar orçamento ou repetir cargas para obter aprovação.

## Resultados e critérios

Cada vetor precisa conter status (PLANNED, PASS, FAIL, ERROR ou UNSUPPORTED),
nonce, perfil, digest de imagem/probe/política, observações esperadas e reais,
fontes do oráculo, horários, errno/sinal, exit code, recursos e limpeza.

- PASS: controles positivos válidos e propriedade esperada observada pelo oráculo.
- FAIL: comportamento proibido observado ou controle positivo funcional negado.
- ERROR: preparação, engine, protocolo, timeout externo ou limpeza falhou.
- UNSUPPORTED: mecanismo/política exigida não pode ser verificado nessa plataforma.
- PLANNED: procedimento especificado, sem execução.

O resultado global só pode ser PASS quando todos os vetores obrigatórios do
perfil declarado passam, sem omissões. ERROR/UNSUPPORTED não se convertem em
PASS. Não declarar gVisor/runwasi/WASM a partir de um ensaio Podman. Não declarar
resistência a todos os escapes a partir de um conjunto finito de probes.

## Integração futura no CI

Manter a suíte em job com runner/VM descartável dedicado e sem OIDC ou segredos.
Publicar relatório, logs limitados, inventário e hashes mesmo em falha; integrar
os resultados como nova entrada explícita do coletor. A assinatura deve continuar
em job separado na branch confiável. Não alterar o coletor atual para aceitar
PLANNED como sucesso de runtime. A cadeia atual continua validando apenas SDK,
dependências e arquitetura; nenhum gate de runtime foi habilitado por esta norma.

Contrato e cobertura atuais do harness: [CONTAINMENT-PROBE.md](CONTAINMENT-PROBE.md).

Atualização de recursos: [RESOURCE-CONTAINMENT.md](RESOURCE-CONTAINMENT.md).
Três vetores aprovados em perfil reduzido Podman rootless; suíte global ainda
INCOMPLETE e runtime_verified=false. Evidências: `docs/evidence/2026-10-19T044610Z-resource-trial/results.json`.

Atualização de syscalls (2026-10-19): [SYSCALL-CONTAINMENT.md](SYSCALL-CONTAINMENT.md).
Controles de subprocesso/FFI e negação de mount ensaiados; teste seletivo de
getppid aprovado em perfil seccomp explícito distinto. Não há aprovação da
tabela completa nem transferência para o perfil implícito. Suíte INCOMPLETE;
runtime_verified=false.

Atualização posterior: [MOUNT-SUBCHECKS.md](MOUNT-SUBCHECKS.md).
Mount, umount2 e pivot_root foram ensaiados no perfil reduzido com seccomp
padrão, sem atribuição exclusiva ao filtro nem aprovação da suíte completa.
