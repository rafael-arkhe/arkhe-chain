# Arkhe Enterprise — tarefas e critérios de aceite

Versão: 1.0. Data: 2026-10-23. Estado do backlog, não autorização de contratação ou contato. [PROGRESS.md](PROGRESS.md) resume entregas; [VALIDATION.md](VALIDATION.md) registra evidências. Tarefas independentes não exigem serialização artificial; dependências de liberação estão explícitas.

## Resiliência concluída localmente

| Tarefa | Estado | Critério de aceite e evidência |
| --- | --- | --- |
| T1 — aquisição SQLite | [x] Local | BEGIN IMMEDIATE já existente; retry limitado. Dois escritores reais: espera recuperável e esgotamento, callback único e rollback. tests/store-resilience.test.mjs |
| T2 — índices e FK | [x] Local | FK e UNIQUE rejeitam violações; EXPLAIN QUERY PLAN usa índices direcionados de sessão, login e ordenação. Sem tenant_id e sem nova migração SQL imutável |
| T3 — Serpro | [x] Local | GET até três tentativas em 429/502/503/504; 200/400 ms+jitter, Retry-After limitado e orçamento global 10 s. Circuito após três operações transitórias falhas desde último sucesso, cooldown 30 s; duas simultâneas. Testes sintéticos, não serviço real |
| T4 — saúde e encerramento | [x] Local | Liveness, readiness e drain Next com supervisor de 20 s. No Linux, requisição em curso conclui HTTP 200 durante SIGTERM, saída 0 e dados persistem no reinício |
| T5 — idempotência | [x] Local | Header enviado pela UI, opcional no servidor; replay exato por até 15 min, conflito para dados divergentes ou preview substituído; chave vinculada ao usuário |

Os testes não garantem sucesso de todos os escritores sob lock indefinido, nem conclusão de toda requisição durante encerramento. Fontes e limites: [RESILIENCE-REVIEW.md](RESILIENCE-REVIEW.md). Suíte app: 72; Python: 235. Não reabrir T1–T5 só porque o texto-base usava parâmetros diferentes.

## Próximos requisitos do piloto externo

### T6 — confirmar contrato/habilitação e aceitar Serpro real

- [ ] Responsável pela conta confirma status privado, produto/ambiente e orçamento, sem publicar segredos.
- [ ] Configurar credenciais no servidor pelo responsável autorizado.
- [ ] Executar consulta de um CNPJ autorizado e guardar evidência minimizada, após aceite de consumo e critérios de [PROCUREMENT.md](PROCUREMENT.md).
- [ ] Confirmar dados cadastrais coincidentes e o gate de commit, somente com representação admitida; consulta cadastral sozinha não libera perfil externo.

Aceite: operação real demonstrada com contrato/habilitação confirmados e riscos de consumo conhecidos. Estado atual: **não confirmados**, não “não contratado”. Não foi enviada contratação ou chamada paga.

### T7 — verificação de representação externa

- [ ] Definir poderes, ato, signatário, organização, validade, revogação, escopo e eventual assinatura conjunta.
- [ ] Implementar fluxo de evidência/verificador PowerOfAttorney e revisão autorizada; autorização e-CAC não se estende automaticamente a atos privados Arkhe.
- [ ] Implementar e-CNPJ/ICP-Brasil na fase correspondente, incluindo cadeia, validade, vínculo e auditoria; certificado não basta para provar poderes concretos.
- [ ] Testar válido/inválido/expirado/revogado, limites do ato e tentativa de forjar flags pelo cliente; rejeições seguem a semântica dos erros, não 503 universal.

Aceite: política [REPRESENTATION-POLICY.md](REPRESENTATION-POLICY.md) demonstrada com dados e verificadores apropriados. Não desbloquear setor regulado apenas por nome da variante. Fase 0 atual continua generic/internal.

## Backlog dependente de decisão e evidência

| Tarefa | Próximo aceite / dependência |
| --- | --- |
| T8 — Speedrun | Preparar versão após requisitos do piloto; decisão já tomada. Publicação/submissão continua sendo ação separada |
| T9 — ACIEG | Preparar escopo de piloto após requisitos pertinentes; nenhum contato foi autorizado ou realizado nesta entrega |
| T10 — TLS/proxy | Definir domínio/topologia e validar antes da exposição pública; não depende de primeiro expor sem TLS |
| T11 — CI remoto | Identificar repositório e ambiente autorizado, executar checks remotos e registrar resultado; não exige repositório público |
| T12 — Multi-tenancy | Fora do escopo; exige decisão explícita e desenho de isolamento |
| T13 — Capacidade/custo | Definir corpus e carga, medir latência/volume/custo e paginação; não extrapolar testes funcionais para Growth |

Não há PR ou commit criado. A documentação não altera dados operacionais, contratos ou serviços externos.


## Infraestrutura — complemento

| Tarefa | Estado e aceite |
| --- | --- |
| T14 — métricas e logs HTTP | [x] Código/testes locais: Prometheus protegido por owner/token; JSON sem payloads; não constitui tracing ou monitoramento externo |
| T15 — snapshot e restore | [x] Snapshot WAL, hashes, FKs, integridade e auditoria; novo diretório, sem sobrescrita e sem sessões recuperadas |
| T16 — backup diário/off-host | [ ] Job/timer preparados; responsável deve configurar armazenamento separado, permissões, retenção, criptografia e ativar/verificar execução. Nenhum timer ativado |
| T17 — operação/incidentes | [x] Runbook entregue; [ ] responsáveis, escalonamento, exercícios e patching operacional ainda exigem definição |
| T18 — limites de recursos | [ ] Host de validação sem controllers cgroup delegados; memória/CPU/PIDs não validados, sem mudança na VM |

T10 continua pendente para domínio/certificado público: existe configuração Caddy e teste local, sem emissão pública ou DNS operacional. Os cinco itens de infraestrutura não substituem T6/T7 para liberar o piloto. Consulte [matriz](INFRASTRUCTURE-REVIEW.md) e [runbook](RUNBOOK.md).
