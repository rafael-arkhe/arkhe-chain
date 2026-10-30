# Fase 3b-1b - Progresso SSE por pagina no Gerar dataset (2026-06-30)

Incremento do overhaul DAG nivel n8n: o botao **Gerar dataset** do no Fonte em modo **conector configurado** agora usa SSE para mostrar progresso determinado por pagina durante o puxao real capado.

## O que fechou

- Backend: `GET /governance/agents/{agent_id}/skills/{skill_key}/materialize/stream` emite `hello`, eventos `page` reais via `collect_sample(on_page=...)` e `done` com `OK`, `ERROR` ou `CANCELLED`.
- Governanca: o stream reaplica RLS em sessao dedicada, resolve segredo pelo Vault no mesmo escopo do conector, cancela e faz rollback quando o cliente desconecta.
- Frontend: `HttpSourceConfig` abre `EventSource` com credenciais, renderiza barra determinada por `page/max_pages` e mantem fallback POST quando `EventSource` nao existe.
- SDK: `Connectors.materializeStreamUrl` centraliza a URL SSE usada pelo canvas.
- UX: a barra usa `#2D77BE`, cantos retos e texto mono de dados. O movimento e apenas transicao de largura, dirigida por evento real.

## Certificacao

- `podman exec ontology-api pytest tests/unit/test_connector_sample_endpoint.py -q` - 10 passed.
- `npm test -- __tests__/http-source-config.test.tsx --runInBand` - 6 passed.
- `npm test -- __tests__/painel-i18n-keys.test.ts --runInBand` - 20 passed.
- `npx tsc --noEmit --pretty false` - passed.
- `npx playwright test e2e/dados-fase3b-conector-autenticado.spec.ts --reporter=list` - 1 passed.

## Observacoes

- O e2e ao vivo continua provando o gesto autenticado completo contra `httpbin.org/bearer`. A visibilidade instantanea da barra fica coberta no Jest com `EventSource` controlado, para evitar flake em fonte de uma pagina muito rapida.
- 3b-2 re-pull agendado foi fechado em `dev-fase3b2-repull-agendado.md`, sem ativar o `F2022SyncConnector` orfao.
