# Fase 3b-2 - Re-pull agendado de Fonte conector (2026-06-30)

Incremento do overhaul DAG nivel n8n: o no Fonte em modo **conector configurado** pode atualizar automaticamente o dataset que ele gerou, usando o mesmo conector, os mesmos campos selecionados e o mesmo teto de paginas.

## O que fechou

- Frontend: `HttpSourceConfig` mostra um select **Re-pull automatico** quando o no ja esta vinculado a um dataset gerado por conector.
- Frontend: ao gerar dataset por conector, o no passa a salvar `fields` e `max_pages` em `node.config`, para o re-pull repetir o mesmo keep-only-set.
- Backend: `platform_v23/pipeline.py` valida `node.config.schedule_preset` contra `PRESET_MIN` e exige `data.pipelines.schedule` para ligar agenda no no.
- Scheduler: `tick_pipeline_source_nodes()` varre `PipelineBoard.graph.nodes[]`, usa `is_due(schedule_preset, last_repull_at, now)` e enfileira `SyncRun(trigger='source_node_cron')` via `enqueue_run`.
- Worker: `runtime.execute_run()` reconhece `input_params.__materialize_snapshot`, roda `collect_sample(ctx.sample=True)`, materializa SNAPSHOT governado com `dataset_service` e registra `connector.materialize`.
- Governanca: o re-pull roda com `_scheduler_principal` do criador do board, falha fechado se o criador sumiu/inativou/cross-tenant, e carimba estado no proprio `node.config` (`last_repull_at`, `last_repull_status`, `last_repull_run_id`).
- Nao foi usado nem ativado `F2022SyncConnector`.

## Contrato salvo no no

```json
{
  "kind": "http",
  "dataset": "fonte_api",
  "connector_agent_id": "...",
  "connector_skill_key": "connector.http",
  "fields": ["id", "nome"],
  "max_pages": 20,
  "schedule_preset": "hourly"
}
```

## Certificacao

- `podman exec ontology-api pytest tests/unit/test_pipeline_source_repull_scheduler.py -q` - 3 passed.
- `podman exec ontology-api pytest tests/unit/test_pipeline_source_repull_scheduler.py tests/unit/test_pipeline_scheduler.py tests/unit/test_connector_sample_endpoint.py -q` - 18 passed.
- `npm test -- __tests__/http-source-config.test.tsx --runInBand` - 7 passed.
- `npm test -- __tests__/http-source-config.test.tsx __tests__/painel-i18n-keys.test.ts --runInBand` - 27 passed.
- `npx tsc --noEmit --pretty false` - passed.
- `npx playwright test e2e/dados-fase3b-conector-autenticado.spec.ts --reporter=list` - 1 passed.

## Proximo

- Fase 4: triggers do DAG (manual, agendado, webhook, evento).
- Fase 5: redesigns de Arquivos, Conexoes e Datasets; remover/ocultar ruido legado; auditoria restante de SelectField dinamico.
