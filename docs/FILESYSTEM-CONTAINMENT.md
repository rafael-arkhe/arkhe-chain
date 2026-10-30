# Contenção de arquivos: implementação e ensaio real

O perfil `filesystem-v1` foi executado em Podman rootless/crun, na distribuição
WSL dedicada arkhe-containment, com a mesma imagem OCI identificada por SHA-256
do piloto anterior. O kernel WSL2 é compartilhado entre distribuições; não é
uma aprovação para gVisor, runwasi ou WASM.

Resultado: **10/10 checks PASS**, dos quais oito são vetores de arquivos e dois
são controles de pré-voo (identidade e limites cgroup observados). Sete vetores
foram acrescentados à cobertura anterior. Não houve stress de recursos.

| Vetor de arquivos | Evidência observada |
| --- | --- |
| image-read-control | /etc/debian_version coincide com cópia obtida pelo engine fora da sonda |
| writable-control | Arquivos próprios criados, lidos e removidos em /tmp e /work |
| input-read-control | Bytes do sentinela correspondem à fixture |
| input-write | Overwrite, criação e rename negados com EROFS (30) |
| image-write | Criação em /etc e / negada com EROFS (30) |
| outside-mount-canary | Leitura e escrita no caminho VM-native não montado retornam ENOENT (2) |
| traversal-and-symlink | Symlink interno funciona; travessia e symlink para canário externo retornam ENOENT (2) |
| tmp-noexec | Mesmo binário executa em /work e recebe EACCES (13) em /tmp |

Os errno são os efetivamente observados. noexec não exige EPERM; o avaliador
aceita a negação relevante e exige também controle positivo funcional e flag
noexec no inventário externo. Falha de inicialização, caminho errado em um
teste de escrita RO ou controle positivo inválido não recebe PASS.

## Implementação

- Sonda: packaging/sandbox/containment-probe/main.rs.
- Avaliador e snapshot de fixtures: scripts/containment_filesystem.py.
- Runner: scripts/run_filesystem_trial.py, reutilizando ciclo de vida e política
  de scripts/run_containment_trial.py e sandbox-policy.mjs.
- Contrato wire continua v1: observações de arquivos são uma lista JSON dentro
  do campo observations, nunca uma decisão declarada pela sonda.

Tentativas usam somente nomes fixos com nonce e fixtures descartáveis. Nenhum
caminho de credenciais, banco ou arquivo pessoal é usado. A imagem não foi
alterada; a sonda é compilada dentro dela, com fonte e binário identificados.

O supervisor verifica nomes, tipos sem seguir symlinks, hashes, inodes, modo e
mtime das entradas do input antes/depois. Apenas o flag go criado pelo próprio
host é uma adição permitida. O canário externo é criado na VM, fora do bind
mount, e possui verificação independente de conteúdo, tipo, inode, modo, mtime e
entradas do diretório. Modificações ou entradas inesperadas impedem aprovação.

Symlinks e ../ não são proibidos em geral: os caminhos continuam resolvendo
dentro do namespace do alvo. O que foi ensaiado é a inacessibilidade do canário
fora dos mounts. Integridade de hash não prova ausência de leitura por si só;
este resultado combina tentativa observada, namespace/mounts e oráculo externo,
sem alegar resistência a todos os escapes.

Podman ainda pode oferecer tmpfs graváveis implícitos. O ensaio não afirma que
somente /tmp e /work sejam graváveis. noexec cobre execução direta de binário,
sem proibir um interpretador de ler um script do diretório.

## Evidências

- [Relatório da execução](evidence/2026-10-19T041747Z-filesystem-trial/REPORT.md).
- [Resultados, comandos e identidades](evidence/2026-10-19T041747Z-filesystem-trial/results.json).
- [Observações brutas](evidence/2026-10-19T041747Z-filesystem-trial/observations/).
- [Oráculos externos](evidence/2026-10-19T041747Z-filesystem-trial/host-receipts/).
- [Verificação final e fontes preservadas](evidence/2026-10-19T041747Z-filesystem-postflight/results.json).

Início em 19/10/2026, aproximadamente 01:17 America/Sao_Paulo; duração de
128,352 s dentro do orçamento de 180 s. Hashes de 143 artefatos conferidos.
Onze containers e dez canários removidos, lease liberado e máquina de teste
encerrada. O aplicativo permaneceu saudável e a conexão padrão foi preservada.
O archive OCI previamente retido não foi objeto de nova tentativa de exclusão.

A suíte Python passou em 69 testes, incluindo 12 testes do avaliador de arquivos.
Esses testes sintéticos validam o avaliador; os receipts acima documentam
separadamente o ensaio real. Nenhum resultado sintético substitui observação OCI.

## Limites e repetição

`suite.status=INCOMPLETE`, **runtime_verified=false**. Há nove vetores ainda
sem implementação/ensaio (rede, FFI/mount e recursos); os dois inventários do
piloto também não equivalem a aprovação completa de política. A aprovação não
é transferida entre perfis, imagens ou runtimes e não certifica a arquitetura
inteira. CI remoto e assinatura OIDC continuam pendentes.

Com máquina exclusiva, imagem local e delegação preparados explicitamente,
usar diretório novo:

```sh
python scripts/run_filesystem_trial.py --machine arkhe-containment --output docs/evidence/new-filesystem-trial
```

O runner não inicia a máquina ou altera controles implicitamente. O catálogo
mantém orçamentos finitos: duas execuções curtas para comparar /work e /tmp e
até três tentativas de arquivo por vetor; não há fork bomb ou exploits de kernel.
