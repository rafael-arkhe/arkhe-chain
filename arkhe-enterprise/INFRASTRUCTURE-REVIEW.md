# Infraestrutura Enterprise — revisão dos 19 tópicos

Data: 2026-10-23. Escopo: portal single-org em apps/arkhe-intra, SQLite, standalone Linux em Podman rootless. Esta revisão não descreve todos os serviços/crates do workspace Arkhe: há, por exemplo, código PostgreSQL, workflows e diretórios de observabilidade fora deste runtime. Não se infere contratação, recursos cloud ou execução remota a partir de arquivos presentes.

## Matriz corrigida

O anexo numera 19 tópicos mas divide o oitavo em cloud/IaC; não adotamos totais fixos LEMMA/N/A. Existência de scripts, configuração, teste local e operação externa são níveis diferentes.

| # | Tópico | Evidência ou pendência no portal |
| --- | --- | --- |
| 1 | Linux | App user node, raiz read-only e drain já testados; limits CPU/memória/PIDs não puderam ser validados por ausência de controllers cgroup delegados neste host. Templates systemd de backup preparados, não instalados |
| 2 | Networking | HTTP privado por rede de containers e TLS local via Caddy; certificado local verificado com CA explícita no Node. Domínio, DNS, emissão pública/renovação e firewall operacional pendentes |
| 3 | Scripting | Scripts Python/Node existentes, 235 testes Python; novo backup/restore e harness de infraestrutura |
| 4 | Git | Metadados Git não disponíveis em D:/arkhe nesta sessão. Não afirmar histórico/repositório local ou público sem acesso; nenhum commit/PR criado |
| 5 | Banco | SQLite/WAL no portal, índices/FK/retry já validados. PostgreSQL existe no workspace, mas não é o banco do portal. Replicação/failover não entregues |
| 6 | Cache | React Query e invalidação no cliente; API no-store. Sem Redis/cache backend neste caminho; não declarar ausência de todo cache |
| 7 | Containers | Build Linux e Podman rootless; app com volume persistente, usuário node e raiz read-only. Docker Engine não executado |
| 8a | Cloud | Não houve deploy público desta instalação; não pressupor contas/provedores do usuário |
| 8b | IaC | Templates operacionais locais adicionados; Terraform não exigido pelo escopo |
| 9 | CI/CD | Workflows já presentes em .github/workflows; checks locais passam. Execução remota e implantação automatizada não demonstradas; não depende de repo público |
| 10 | Kubernetes | Não adicionado; não é requisito automático de multi-tenancy ou escala |
| 11 | GitOps | Não introduzido neste portal |
| 12 | Monitoring | /api/health e /api/ready já existentes; /api/metrics Prometheus adicionado, protegido e bloqueado pelo proxy público. Sem stack/alertas de produção |
| 13 | Logging | Logs HTTP JSON com rota limitada e operation_id gerado; stdout. Startup Next/avisos podem continuar texto; retenção/centralização ainda exigem operação |
| 14 | Tracing | OpenTelemetry/Jaeger não adicionados. ID de log não é tracing distribuído; utilidade de tracing não depende apenas de número de serviços |
| 15 | Debugging | Harness usa Node HTTP/HTTPS, Chromium e Podman; comandos de triagem no runbook. Não alegar execuções de curl/dig/ss/strace/tcpdump não registradas |
| 16 | Incidentes | RUNBOOK.md entregue; contatos, escala de plantão e exercício operacional pendentes, sem presumir founder disponível 24/7 |
| 17 | Confiabilidade | Métricas locais e RPO/RTO propostos; SLO/SLI podem ser definidos antes de tráfego, mas não existe baseline ou garantia medida |
| 18 | Segurança | RBAC, contexto sem segredos, usuário mínimo no app e métricas protegidas. Scanner, patching, retenção e hardening de host ainda pendentes; não limitados a clientes regulados |
| 19 | Recovery | Snapshot online com WAL, verificação e restore isolado implementados. Restart sozinho não prova backup. Job diário preparado mas não ativado; armazenamento off-host e failover não demonstrados |

## Entregas desta revisão

- [observability.mjs](../apps/arkhe-intra/lib/observability.mjs): contadores/histogramas Prometheus por rota normalizada, método e classe de status, uptime/RSS. Sem payloads, IDs pessoais, CNPJ, URL/query ou segredos em labels/logs. Não há tenant_id real; usa installation_scope=single-org.
- [http.mjs](../apps/arkhe-intra/lib/http.mjs): integração dos logs e rota GET /api/metrics com sessão owner ou token interno de pelo menos 32 caracteres. Não foi criado endpoint público /metrics.
- [backup.mjs](../apps/arkhe-intra/scripts/backup.mjs): snapshot consistente SQLite, accounts.json, checksums, integridade, FKs e auditoria BLAKE3; restauração em diretório novo e limpeza de sessões. Original, dados posteriores e diretórios existentes são preservados.
- [store.mjs](../apps/arkhe-intra/lib/store.mjs): integrity_check antes da inicialização de schema; falha não apaga/repara automaticamente o arquivo. O check é por processo, não para cada requisição.
- [ops/enterprise](../ops/enterprise/): Caddy público/local e templates de job diário/systemd. Sem instalação de serviços, alteração de confiança do host ou publicação de domínio.
- [RUNBOOK.md](RUNBOOK.md): triagem, restart, TLS, métricas, backup/restore, credenciais e distinção de prova local/ancoragem externa.

## Evidência e limites

Testes locais de aplicação: 72 passaram, incluindo WAL, exclusão de chave privada, restauração isolada, sessão eliminada, recusa de sobrescrita/checksum alterado/banco inválido, histogramas, privacidade e acesso das métricas. Passaram TypeScript, arquitetura e 235 testes Python. Build Linux passou com a imagem identificada no relatório de infraestrutura.

O [harness](../scripts/enterprise_infrastructure_review.mjs) usa containers, volumes e rede descartáveis, um domínio localhost e dados sintéticos; não chama Serpro. A [evidência de infraestrutura](validation/2026-10-23/infrastructure/report.json) registra o resultado observado e as imagens usadas; [resource-limits.json](validation/2026-10-23/infrastructure/resource-limits.json) conserva a limitação de cgroups. Não extrapolar o resultado para certificado público, limites de recursos, backups agendados, perda de host, capacidade Growth ou produção.

A presença de TLS/monitoramento/backup não basta para liberar o piloto: Serpro real, poderes, escopo do ato e critérios de procurement continuam pendentes. Também não existe uma migração obrigatória para Postgres/Redis/K8s no segundo cliente ou em determinado ano; cada decisão depende de isolamento, carga e operação.

## Fontes primárias

- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): upstream e health checks.
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https): diferença entre CA local e certificado público.
- [Node SQLite backup](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#sqlitebackupsource-db-path-options): API de snapshot usada no Node 24, também exercitada pelos testes.

[RUNBOOK.md](RUNBOOK.md), [TASKS.md](TASKS.md), [MATURITY.md](MATURITY.md) e [PROCUREMENT.md](PROCUREMENT.md) detalham operação, aceite e bloqueadores.
