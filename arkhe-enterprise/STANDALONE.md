# Empacotamento standalone

Validado em 2026-10-23 com Podman rootless, conexão `arkhe-runtime`. A imagem em formato Docker contém o `server.js` gerado por Next standalone, `.next/static`, public, WASM e motor Rust Linux. Docker Engine não estava instalado: os comandos Docker abaixo são reprodução compatível, não execução observada nesse engine.

## Construção

Gere os assets WASM pelo processo existente (`pnpm verify:wasm`) se ausentes. Execute `python scripts/prepare_enterprise_container.py`. O contexto explícito fica em `ops/local/enterprise-container-context`, com manifesto de hashes. O script exclui `.env*`, chaves, contas, SQLite, node_modules e builds locais e recusa sobrescrever um contexto já existente.

Comando executado:

```powershell
podman --connection arkhe-runtime build --format docker --layers -t localhost/arkhe-enterprise:review -f ops/local/enterprise-container-context/Dockerfile ops/local/enterprise-container-context
```

Equivalente Docker:

```powershell
docker build -t arkhe-enterprise:review -f ops/local/enterprise-container-context/Dockerfile ops/local/enterprise-container-context
docker volume create arkhe-enterprise-data
docker run --name arkhe-enterprise --read-only --cap-drop=ALL --security-opt=no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=64m -p 127.0.0.1:3003:3003 -e ARKHE_INTRA_ORIGIN=http://127.0.0.1:3003 -e ARKHE_ENTERPRISE_PHASE=internal -v arkhe-enterprise-data:/data arkhe-enterprise:review
```

O Dockerfile usa estágios Rust, build Next em Linux e runtime. Não usa `next start` nem servidor programático. O bootstrap cria contas locais em `/data` na primeira execução, sem imprimir senhas. O operador obtém e custodia as credenciais pelo canal administrativo privado. O banco e as chaves ficam no volume. A fase internal habilita somente autodeclaração para generic e não remove o gate Serpro.

Nenhum socket de Docker/Podman, diretório real do host ou segredo Serpro integra a imagem. Sandbox de desenvolvimento e Ollama não são provisionados pelo contêiner.

## Evidência executada

`scripts/enterprise_container_review.mjs` aceita `ARKHE_CONTAINER_ENGINE=docker` ou usa a conexão Podman existente; Playwright é resolvido por `ARKHE_BROWSER_NODE_MODULES`.

Passaram cinco verificações: user node e root filesystem read-only; login/SQLite/WASM; CNPJ alfanumérico e declaração no motor Rust Linux; bloqueio sem Serpro; três rotas e assets no Chromium; persistência após restart. O agrupamento exato está no relatório. Contêiner e volume temporários foram removidos ao final.

[Relatório com ID/digest da imagem](validation/2026-10-23/standalone/container-report.json), [log](validation/2026-10-23/standalone/server.log), screenshots de [dashboard](validation/2026-10-23/standalone/enterprise.png), [perfis](validation/2026-10-23/standalone/perfis.png) e [onboarding](validation/2026-10-23/standalone/onboarding.png).

Isso valida este perfil local de empacotamento e execução. Não valida TLS público, backup operacional, Serpro real, poderes de representação, multi-tenancy ou CI remoto.

## Operação após a revisão de resiliência

O HEALTHCHECK agora consulta `/api/ready`; `/api/health` continua sendo liveness. O entrypoint supervisiona o servidor gerado, encaminha sinais e permite até 20 segundos para o drain nativo do Next. Configure `podman stop --time 25` ou `docker stop --time 25` (ou prazo maior). A drenagem tem limite; ela não garante conclusão de operações mais longas. Novas validações são registradas em `validation/2026-10-23/resilience-standalone`, preservando a evidência da imagem anterior. O contexto pode ser gerado em novo diretório explícito: `python scripts/prepare_enterprise_container.py ops/local/enterprise-resilience-container-context`.


## Infraestrutura e recuperação

A imagem infrastructure inclui `apps/arkhe-intra/scripts/backup.mjs`. O [runbook](RUNBOOK.md) descreve uso de snapshot online e restore isolado, a configuração TLS Caddy e métricas protegidas. A [revisão de infraestrutura](INFRASTRUCTURE-REVIEW.md) registra cinco verificações HTTPS/recuperação no Podman e as pendências. Limites de memória/CPU/PIDs não foram validados neste host sem controllers cgroup delegados. O teste não publicou Next diretamente e usou somente proxy em loopback; não é deploy público.
