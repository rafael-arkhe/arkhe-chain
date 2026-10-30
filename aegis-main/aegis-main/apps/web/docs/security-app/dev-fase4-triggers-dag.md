# Fase 4 - Triggers do DAG (2026-06-30)

Incremento do overhaul DAG nivel n8n: o operador pode executar um unico no, e o DAG ganha triggers de entrada - manual (play button), webhook (endpoint publico HMAC), e evento (upstream board completion cascade).

## O que fechou

### Backend - Triggers

- Model: `PipelineTrigger` (slug, secret_hmac, webhook_url, is_active, pipeline_board_id, tenant_id) + `PipelineTriggerLog` (trigger_id, delivered_at, status, status_detail, payload_preview).
- Migration: `0115_pipeline_triggers.py` - tabelas `pv23_pipeline_triggers` e `pv23_pipeline_trigger_logs`.
- Router: `pipeline_triggers.py` - `create_trigger`, `list_triggers`, `delete_trigger`, `deliver_webhook`.
- Webhook endpoint: `POST /platform/v23/pipeline/trigger/{slug}` - publico, valida HMAC-SHA256 (`X-Aegis-Signature`), loga aceitas/rejeitadas/falhas.
- RBAC: `iam.governance` necessario para CRUD de triggers.

### Backend - Single-node execution

- `stop_at_node` param em `BoardRunRequest` (POST) e `run_board_stream` (GET SSE).
- `_trim_graph_to_node()` faz BFS reverso a partir do target, preserva ancestrais, descarta downstream.
- Permite executar um sub-grafo isolado - util para debug e iteracao.

### Backend - Event trigger

- `graph.event_trigger.upstream_boards[]` no JSONB do board - lista de upstream board ids.
- `_fire_downstream_boards()` chamado apos `run.status == "OK"` - busca boards no mesmo tenant com upstream contendo o upstream board id atual.
- Non-blocking: falhas sao logadas mas nao impedem o run atual.

### Frontend

- `RunNodeContext` em `PipelineCanvas.tsx` - decoupled via React context.
- Botao `>` em cada no (hover-only, `-top-2 -right-2`, executa `runNode(nodeId)` via SSE `stop_at_node`).
- `PipelineBuilder.run()` e `runStreamUrl()` aceitam `stop_at_node`.
- API SDK: `createTrigger`, `listTriggers`, `deleteTrigger`.
- i18n: `pipeCanvas.runNode`, `pbw.webhookTitle/Create/Slug/Secret/Delete/Url/Empty`.

### Frontend - Webhook Config Panel (Fase 4 remaining)

- `WebhookConfigPanel` component: CRUD de webhooks no BoardToolbar (dropdown com lista, criacao, exclusao).
- Secret exibido UMA VEZ apos criacao (copiar/fechar).
- `trigger_source` column em `F2022PipelineRun` (migration 0116) + trigger attribution badge no run history.
- i18n: `pbw.webhookToggle/Copied/ConfirmDelete/Active/Inactive/SlugPlaceholder/CreateConfirm/CopyUrl/CopiedUrl` + `pbw.runTriggerManual/Webhook/Schedule/Event/Unknown`.

## Certificacao

### Backend

- `podman exec ontology-api pytest tests/unit/test_pipeline_triggers.py -v` - 9 passed (validate_graph, extract_spec, create_permission, webhook_hmac, bad_hmac, inactive, slug_conflict, stop_at_node_trim, event_trigger_fires_downstream).
- `podman exec ontology-api pytest tests/unit/test_pipeline_scheduler.py tests/unit/test_pipeline_source_repull_scheduler.py tests/unit/test_pipeline_board_execution.py tests/unit/test_pipeline_node_progress.py tests/unit/test_pipeline_triggers.py -v` - 35 passed (regressao).
- Migration 0116 applied: `trigger_source` column on `pv22_pipeline_runs`.

### Frontend

- `npx jest --testPathPattern="pipeline" --no-coverage` - 59 passed (14 suites).
- `npx jest --testPathPattern="webhook-config-panel" --no-coverage` - 8 passed (webhook CRUD).
- `npx jest --testPathPattern="pipeline-board-play-button" --no-coverage` - 2 passed (play button wiring).
- `npx tsc --noEmit` - clean.

## Proximo

- Fase 5: redesigns de Arquivos, Conexoes e Datasets; remover/ocultar ruido legado; auditoria restante de SelectField dinamico; gap A = seletor de modelo no no IA.
