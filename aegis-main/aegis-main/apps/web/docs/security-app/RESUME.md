# RESUME — onde paramos (2026-07-01, sessão nova retoma daqui)

> Auto-contexto: `MEMORY.md` carrega os ponteiros. Plano completo:
> `docs/security-app/plano-dag-n8n-redesign.md`.

## 🔴 ATIVO: **OVERHAUL DA TELA DE DADOS PARA NÍVEL n8n** — operador frustrado: funcional mas "morta/desconectada". **LER `docs/security-app/plano-dag-n8n-redesign.md`** (canvas vivo c/ cor/animação/cards ricos · conectores como nós testáveis que geram schema do response · triggers · visualizar dados entre nós · redesign Arquivos/Conexões/Datasets · remover "Básico (legado)" · SelectField dinâmico).

### Progresso do overhaul n8n
- **✅ Fase 0 — Investigação (2026-06-30):** `docs/security-app/fase0-dag-n8n-investigacao.md` (8 agentes source-level, wf_d3ba12a6). Design reconciliado e TRAVADO com o operador: cor/animação/vida em TODA `/dados` MAS **só borda, SEM GLOW, nível Palantir** (categoria=stripe esquerda; estado=perímetro+badge) — coincide com o modelo real do n8n. Ordem: progresso-backend → canvas-vivo → conectores→schema → triggers → redesigns.
- **✅ Fase 1 — Backend de progresso por nó (SSE) (2026-06-30):** `docs/security-app/dev-fase1-progresso-por-no-sse.md`. `_apply_steps_async(on_step=)` + `node_id` em `_extract_spec` + endpoint `GET /platform/v23/pipeline/{bid}/run/stream` (hello→node×N→done; governança antes do gerador; sessão dedicada+RLS; disconnect→cancel+rollback). **Cert: 102 testes pipeline verdes** (8 novos em `test_pipeline_node_progress.py`; endpoint roda o motor REAL + materializa instâncias). Repo `aegis-ontology-module` @ `feat/osint-br-dossie-conectores`.
- **✅ Fase 2 — Canvas vivo (2026-06-30):** `docs/security-app/dev-fase2-canvas-vivo.md`. `NodeStateContext`+`nodeRunState`, EventSource one-shot (fecha no done/erro; fallback POST), borda categoria(stripe esquerda)+estado(perímetro+badge) SEM GLOW, aresta `animated` real-driven, pulso `aegis-node-running`. **Cert: tsc + 45 jest** (`pipeline-board-sse` 5) **+ e2e AO VIVO** (`dados-fase2-canvas-vivo`: Executar → Fonte E Transformação acendem "Concluído"+linhas reais; antes só a Saída). Proxy Next já streamava SSE (sem mudança). `runStreamUrl` no SDK. Commit `security-app`.
- **✅ Fase 3 INVESTIGADA (2 agentes) + decisões travadas:** nó Fonte POLIMÓRFICO + MVP (GET público + amostra colada via `sync/preview`; auth=3b). Achados: motor só lê `DataAsset` materializado → conector testa→schema→**SNAPSHOT**→nó lê; `sync/preview`=motor do teste; `F2022SyncConnector`=órfão.
- **✅ Fase 3a-1 — nó Fonte conector + "Testar chamada"→schema→Gerar dataset (2026-06-30):** `docs/security-app/dev-fase3a-conector-schema.md`. **Novos:** `schema-field-tree.tsx` (árvore de campos selecionável, ícone neutro #/T + prévia), `http-source-config.tsx` (Testar chamada `syncPreview` → schema → Gerar dataset `SNAPSHOT` só-selecionados → vincula). Nó Fonte polimórfico (`pb-cfg-source-kind` dataset|http). **Cert: tsc + jest** (`schema-field-tree` 6, `http-source-config` 3, i18n 2 locales, regressão) **+ e2e AO VIVO** (`dados-fase3-conector-schema`: motor real sync/preview+SNAPSHOT; operador VALIDOU o visual da árvore de campos). Commit `security-app`.
- **✅ Fase 3a-2 — VER O DADO entre nós (2026-06-30):** `docs/security-app/dev-fase3a2-ver-o-dado.md`. Preview de dado também na FONTE (não só transform) + rótulo "N itens" na aresta pós-run (`edgeItemLabel`) + fix do bug pré-existente do `TransformPreview` (colunas vinham de `Object.keys(schema)` array → "0"/"1"/"—"; agora das chaves reais das linhas). **Cert: tsc + jest (edgeItemLabel, i18n, regressão) + e2e AO VIVO** (`dados-fase3-preview-itens`: Fonte preview linhas reais + aresta "3 itens"). Débito conhecido (não-regressão): warning dev-only React setState-in-render na seleção de nó (canvas↔provider, desde I2/I3; cleanup dedicado).
- **✅ Fase 3b-1 — conector AUTENTICADO no canvas (2026-06-30):** `docs/security-app/dev-fase3b-conector-autenticado.md`. Destrava o headline p/ fontes OSINT reais (auth+paginação). **Backend** (`aegis-ontology-module`, commits `e268104`+`8cf885a`): `collect_sample` (coleta capada SEM persistir; `_guarded_request` anti-SSRF endurecido `follow_redirects=False`+por-hop; ramo `if ctx.sample` em `run()`) + endpoints irmãos do `/test`: `POST .../skills/{skill_key}/sample` (amostra autenticada — `resolve_secret` escopado + audit `vault.secret.read`, nunca vaza segredo) e `POST .../materialize` (puxão real capado → keep-only-set → SNAPSHOT governado). Gate `_require_connectors`. **Frontend** (`security-app`, commits `70195a1`+`e947249`): SDK `Connectors.sample`/`materialize` + `Vault.listSecrets`/`upsertSkillSecret`; `HttpSourceConfig` 3º sub-modo "conector configurado" (picker + auth read-only + SelectField de limite); `SecretRefSelect` (picker do Vault, substitui o `secret_ref` texto-livre). **Decisões do operador:** "Gerar dataset" = puxão real capado (não só amostra) · 3b-1 agora, re-pull (3b-2) follow-on · picker do Vault agora. **Cert:** pytest `test_http_connector` 17 + `test_connector_sample_endpoint` 8 + sync_preview/skill_catalog 21 · tsc · jest http-source-config 5 + secret-ref-select 3 + i18n + conectores 39 · **e2e AO VIVO VERDE** (`dados-fase3b-conector-autenticado` 1 passed 52.6s contra httpbin/bearer: 401-sem-auth → uma árvore prova o segredo do Vault enviado).
- **✅ Fase 3b-1b — Progresso SSE por página no `/materialize` (2026-06-30):** `docs/security-app/dev-fase3b-progress-sse.md`. `GET .../materialize/stream` emite `hello` → `page` real via `collect_sample(on_page=...)` → `done`; sessão dedicada com RLS reaplicado, cancelamento/rollback em disconnect, fallback POST preservado. Frontend: `Connectors.materializeStreamUrl` + `HttpSourceConfig` com `EventSource`, barra determinada `page/max_pages`, texto mono e i18n `httpSrc.pulling`. **Cert:** backend `test_connector_sample_endpoint` 10/10 · frontend `http-source-config` 6/6 · `painel-i18n-keys` 20/20 · `npx tsc --noEmit --pretty false` · **e2e AO VIVO VERDE** `dados-fase3b-conector-autenticado` 1 passed 39.6s.
- **✅ Fase 3b-2 — re-pull agendado de Fonte conector (2026-06-30):** `docs/security-app/dev-fase3b2-repull-agendado.md`. Nó Fonte vinculado ganha select `schedule_preset` (presets `pbw.sched*`, sem cron cru) e o `Gerar dataset` salva `fields`+`max_pages` no `node.config`. Backend valida preset/permissão no graph; `tick_pipeline_source_nodes()` usa `is_due(last_repull_at)` + `_scheduler_principal` e enfileira `SyncRun(trigger='source_node_cron')` via `enqueue_run`; worker reconhece `__materialize_snapshot`, roda `collect_sample(ctx.sample=True)` e materializa SNAPSHOT governado, carimbando `last_repull_*` no nó. **NÃO usa `F2022SyncConnector` órfão. Cert:** backend 18/18 (`test_pipeline_source_repull_scheduler`+scheduler+sample endpoint) · frontend 27/27 (`http-source-config`+i18n) · `npx tsc --noEmit --pretty false` · **e2e AO VIVO VERDE** `dados-fase3b-conector-autenticado` 1 passed 23.5s.
- **✅ Fase 4 — Triggers do DAG (2026-06-30):** `docs/security-app/dev-fase4-triggers-dag.md`. **Backend:** `PipelineTrigger`+`PipelineTriggerLog` models + migration 0115 + webhook endpoint HMAC-SHA256 + `stop_at_node` (single-node execution via `_trim_graph_to_node()` BFS reverso) + event trigger (`graph.event_trigger.upstream_boards[]` → `_fire_downstream_boards()`) + `trigger_source` column on `F2022PipelineRun` (migration 0116). **Frontend:** `RunNodeContext` + play button per node (hover-only) + `runStreamUrl`/`run` com `stop_at_node` + API SDK triggers CRUD + i18n + `WebhookConfigPanel` (CRUD webhooks no BoardToolbar) + trigger attribution badge no run history. **Cert:** backend 9/9 triggers + 35/35 regressão · frontend 59/59 pipeline tests (14 suites) + 8/8 webhook tests + 2/2 play button · tsc clean.
- **✅ Fase 5 (parcial) — Redesigns e limpeza (2026-06-30):** `docs/security-app/dev-fase5-redesigns-limpeza.md`. **Gap A:** `ModelSelect` integrado ao nó LLM (`TransformConfig`), catálogo via `AIPModels.catalog()`, modelo/saída em `args.model`/`args.provider`. **Legado v22:** toggle `pb-v22-toggle` oculta "Básico (legado)" por padrão. **MediaWorkspace i18n:** 25+ chaves `media.*`, todas as hardcoded PT substituídas por `useT()`. **Cert:** frontend 59/59 pipeline + 8/8 webhook · tsc clean.
- **✅ Fase 6A — Hover Toolbar + Context Menu (2026-07-01):** Canvas nodes ganham toolbar flutuante no hover (`NodeHoverToolbar`: Run/Settings/Copy/Duplicate/Delete) + menu de contexto via click direito (`NodeContextMenu`: Open/Execute/Rename/Deactivate/Copy/Duplicate/Add After/Delete). PaneContextMenu (click direito no fundo vazio) lista tipos de nó com busca. Callbacks desacoplados via `NodeCallbacksContext` + `ReadOnlyContext`. **Cert:** 69 testes pipeline (15 suites) passam · TS 0 erros novos.
- **✅ Fase 6B — Empty State + Node Card Redesign (2026-07-01):** Canvas vazio mostra empty state com CTA "Adicionar nó" + "Criar trigger". Cards de nó com resumo humanizado (`nodeSummary`), badge de estado por nó (`NodeRunState` context-driven), e visual sharp (cantos retos, sem rounded). **Cert:** 69 testes pipeline (15 suites) passam.
- **✅ Fase 6C — 3-Column Config Panel Overlay (2026-07-01):** `NodeConfigOverlay` full-screen 3 colunas: LEFT (Input schema + sample data + "Execute previous nodes"), CENTER (Parameters/Settings tabs + "Execute step" + "Wish" input), OUTPUT (Schema/Table/JSON tabs + "Set mock data"). **Cert:** 69 testes pipeline (15 suites) passam.
- **✅ Fase 6D — Edge Interactions (2026-07-01):** `InteractiveEdge` custom edge com `EdgeHoverBar` no midpoint: + (insert node mid-edge), trash (delete), HTTP method label. Inserir nó no meio de uma aresta: desconecta source→target, insere novo nó transform, reconecta source→novo→target. **Cert:** 69 testes pipeline (15 suites) passam.
- **✅ Fase 6E — Trigger Nodes (2026-07-01):** Nó `op='trigger'` com fundo `#1a1a2e` (dark navy), ícone Zap, accent border `#2D77BE`, sem Handle input (só output). PALETTE_GROUPS: categoria "Triggers" no topo. NodeConfig adaptado: dropdown de tipo (manual/webhook/schedule/event) + schedule picker. i18n: `pipeCanvas.kind.trigger` + `pipeCanvas.trigger.*`. PaneContextMenu e NodeContextMenu incluem trigger. Empty canvas "Criar trigger" cria nó trigger. **Cert:** 71 testes pipeline (15 suites) passam · TS 0 erros novos.
- **✅ Fase 6F — Atalhos de teclado (2026-07-01):** `useEffect` no `PipelineCanvasInner` escuta `keydown` no document: Delete/Backspace = excluir nó selecionado (`onDelete`), Ctrl/Cmd+D = duplicar (`onDuplicate`), Ctrl/Cmd+C = copiar (`onCopy`), Escape = deselecionar (`onSelectNode(null)`). Guard: ignora em inputs/textareas, só ativo quando não readOnly e há nó selecionado + nodeCallbacks disponível. **Cert:** 71 testes pipeline (15 suites) passam · TS 0 erros novos.
- **▶ PRÓXIMO:** **Fase 6G** (sticky notes), **6H** (publish/export).

## ★ ESTADO ATUAL: **Fase 6F CONCLUÍDA** — 71 testes pipeline passam (15 suites), TS 0 erros novos. Canvas com hover toolbar, context menu, 3-column config overlay, edge interactions, trigger nodes, e atalhos de teclado. Próximo: 6G (sticky notes), 6H (publish).

### ✅ Onda 4b — busca semântica REAL (CÓDIGO A→D + CERTIFICADA AO VIVO com RunPod+Qdrant · 2026-06-30 · wf_cd34ef07-958)
Decisões do operador: guardrail **abortar antes · teto baixo (R$ 2,00/job)** + **bloquear sem preço** · job = **tabela de status dedicada**.
- **Cert AO VIVO ✅:** pipeline (`o4b_livecert`): dataset→embed REAL bge-m3 (succeeded)→5 pts Qdrant→busca **"carro levado por criminosos"
  → top-1 "furto de veículo" score 0.596 (zero token comum)** = SIGNIFICADO. Gesto navegador (`dados-o4b-embed` e2e 16.5s): "Tornar
  pesquisável"→embed RunPod real→"Pesquisável · 5 documentos". BUG pego ao vivo+fix: `_try_real_vector_search` get_collections lento sob
  timeout 2s→0 hits; fix=query_points direto+timeout 8s.
- **A** `dataset_embed_service.py`: collection `ds_{tenant}_{dataset}` (1024d), `guard_cost` (aborta antes do RunPod / bloqueia sem preço),
  embed em lote `aiometer.run_all`, upsert idempotente, `execute_embed_run` (orchestrador). Reusa `make_embed_fn`+`estimate_cost_brl`.
- **B** `DatasetEmbedRun` + mig `0114` + `POST/GET /datasets/{name}/embed[-status]` (in-process na api; governado) + perm `data.datasets.embed`.
- **C** `aip_rag._try_real_vector_search` (ADD-alongside, antes do scroll): query→`query_points` nas `ds_*` (cosine real); fallback honesto intacto.
- **D** `EmbedSection` no `DatasetInspector` (estado honesto + botão gated + confirmModal + poll) · SDK `embedDataset`/`getEmbedStatus` ·
  `list_collections` soma as `ds_*` sucedidas → aparecem no painel RAG · i18n `dsw.embed*`.
- **Governança:** `LineageEvent dataset.embed` + custo auditado (`InferenceLog`) + markings/ABAC herdados.
- **Cert mockada (0 crédito):** pytest 15+15 + sweep 40 · tsc · jest `dados-embed-section` 5/5 + 42 sem regressão · mig 0114 aplicada.
- **RESTA (gate de crédito):** cert e2e AO VIVO — dataset pequeno → "Tornar pesquisável" → coleção no RAG → query semântica = hit REAL.
  **SÓ com OK do operador + saldo RunPod.** GOTCHA: o embed roda IN-PROCESS na api (tem aiometer); worker durável = upgrade.
  Detalhe: plano §14.

### ✅ Onda 4a — Coleções enriquecido (FEITO · cert ao vivo 2026-06-30 · fecha o núcleo · investigação wf_5e62e028-e36)
Decisão do operador = **"100% integrado sem débito ou gaps" + profundidade em buckets**. Interpretação fiel = integração
COMPLETA com **dado 100% HONESTO** (zero `owner`/`tags` inventados — o filtro usa FACETAS REAIS; régua de honestidade).
- **Backend `aip_rag.py`:** `CollectionOut` ganhou `provenance`/`doc_count` (opcionais, ADD-alongside). `_provenance_for`
  deriva social_module/qdrant (espelha o caminho do `/query`); `_qdrant_doc_counts` = `client.count` best-effort por
  coleção Qdrant existente → `doc_count=None` quando desconhecido (Qdrant down / social sem endpoint de contagem) =
  **honesto, nunca 0 fabricado**. Helpers puros (`_provenance_for`/`_enriched_collections`) testáveis sem Qdrant.
- **Frontend `RagArtifactPanel`:** profundidade em BUCKETS (`DEPTH_TO_K` Foco/Equilíbrio/Amplo = 5/10/20; `aip-rag-depth`,
  nunca o top_k cru) → busca envia o top_k real. Por coleção: proveniência humanizada + doc_count real/`—`. Filtro por
  FACETA REAL (origem/source). Strings hardcoded → `useT()`.
- **SDK+i18n:** `AipRagCollection` +`provenance?`/`doc_count?`; chaves `aipRag.*` (depth/docCount/source/filter/contextBlock/…)
  pt-BR+en-US. `aipRag.contextBlock` separado do tooltip (preserva "Contexto RAG" do bloco inserido).
- **Cert:** pytest `test_aip_rag` 17 (+4 honestidade) + honesty sem regressão · tsc · jest 21 (novo
  `aip-rag-collections-enriched` 3 + RAG/threads sem regressão + `painel-i18n-keys` 2 locales) · **e2e AO VIVO 1/1**
  (`dados-o4a-colecoes`: Amplo → **top_k=20 no POST real** + metadados honestos + filtro por origem; 0 erro fatal).
- **GOTCHAS (ambiente):** `next dev` :3002 caiu por **OOM** → subir com `NODE_OPTIONS=--max-old-space-size=4096`. 1º hit em
  `/paginas/aip-threads/view` (Conversas via redirect de `/painel-de-controle/aip-threads`) = cold-compile pesado → esperar
  `aip-threads-page` timeout ≥20s; aquecido ~8s. `e2e/wave-d3-aip.spec.ts` STALE (testid `aip-threads-new` removido no W8 →
  "Nova conversa"; pré-existente, fora do escopo). Doc: plano §13.

### ✅ Onda 3 O3c — SandboxIDE INLINE no nó código (FEITO · cert ao vivo 2026-06-30 · headline da Onda 3)
O **mais arriscado**, fechado. As 3 travas da §4 cumpridas. **Contrato verificado e2e:** `_apply_code_step` (v22 router
:304) roda a Function 1× com `inputs={"rows": rows}` → sandbox grava em `input.json` → o source CRU lê e imprime
`{"rows":[...]}`. O preview fiel reproduz via `preview_batch` com `inputs_list=[{rows:amostra}]` (1 entrada = TODAS as linhas).
- **`SandboxIDE` `contract='batch'`** (ADD-alongside, default `'object'` = comportamento atual intocado): semeia
  `transformerSkeletonBatch`, prima o input com `{rows:[...]}` (= input.json), mostra painel de input + Preview no batch,
  preview fiel manda `inputs_list=[{rows:[...]}]`. Guardas em todo lugar → zero impacto no per-object (AIP enrich).
- **`CodeNodeConfig`** (pipeline-board) reusa o host do `ModalityAgentsSection:442-519`: picker + botão **"Editar/Novo
  código"** → `SandboxIDE` num Dialog (lazy `next/dynamic`, ssr:false → Monaco FORA do bundle do Quadro e dos testes que
  não abrem o editor) seed batch + `batchColumns`/`batchSampleRows` → **Salvar e vincular** = `Functions.create`→
  `args.function`. `inputCols` agora carrega `rows` (da `transformPreview` da cadeia, sem 2ª rede) além de `cols`.
- **Trava 1 preservada:** o editor inline só com `RequirePerm function.write`; sem autoria → picker de PUBLICADAS, sem editor.
- **i18n** `pbw.editCode/newCode/codeDrawerTitle/codeDrawerHint/codeSaveFn/codeSaveErr/codeFnDisplayName/codeFullscreen*`.
- **Cert:** tsc · jest `sandbox-ide` 43 (+4 batch) · `transformer-skeleton` batch · **novo `pipeline-board-code-ide` 3/3**
  (autor edita+Save→create+vincula · picker lista rascunho · leitor só publicadas, sem editor) · 12 suites/41 do board sem
  regressão · 51 modality/solutions (object-mode intacto) · **e2e AO VIVO 8/8** (`dados-o3c-ide` gesto completo +
  O3a/O3b/O3d/gating sem regressão). GOTCHA: e2e do 1º spec falha por cold-compile do `next dev` (overlap transiente);
  cada spec passa isolado/aquecido — re-rodar (conhecido na régua).

### ✅ Onda 3 O3a/O3b/O3d (FEITO · cert ao vivo 2026-06-30 · investigação wf_8440747e-375)
Faseado por valor×segurança (decisões §4 travadas; **sem animação de fluxo** = verdade-primeiro). Já-feito (NÃO redo):
SF5 badge · kindIcon de-rainbow · format-number · nodeSummary.
- **O3a Nós ricos:** PipelineCanvas kindIcon IA=`AudioLines`/código=`Code2` (op efetivo) · teclado tabIndex+Enter
  (`SelectNodeContext`) · `pipelineDensity` Compact/Comfortable · `edgeStyle` realce #2D77BE (`styledEdges`). pipeline-board:
  `addNode(op,innerOp)` + paleta 5 categorias (`pb-add-codigo/llm` novos, ADD-alongside) + `DensityToggle`. e2e `dados-o3a-canvas`.
- **O3b Linhagem:** backend `/lineage-graph?asset_id` (post-filtro `get_asset_provenance`) + `LineageGraph.get` overload ·
  grafo `?asset` deep-link + auto-center + atalho **"L"** + botão "Ver linhagem" no NodeDetail · micro-link `pb-link-lineage`
  no badge (só com `output_asset_id`). e2e `dados-o3b-lineage`.
- **O3d Teto de custo AIP (server-side):** `estimate_cost_brl` + `_apply_step_llm` aborta ANTES de chamar se >teto BRL
  (0=ilimitado; sem preço→warn). UI `pb-cfg-llm-cost`. e2e `dados-o3d-cost`. **94 testes pipeline backend sem regressão.**
- **Cert agregada:** tsc · jest (pipeline-canvas-summary 10 + grafo-page 44 + pipeline-builder 7 + painel-i18n) ·
  backend (`test_lineage_graph_asset_focus` 2 + `test_pipeline_llm_cost_ceiling` 3 + 94 pipeline) · e2e por incremento verde
  (flake conhecido = cold-compile do `next dev` ao rodar a suíte inteira; cada spec passa isolado).
- **O3c ✅ COMPLETO** (ver a seção O3c acima): fundação (`transformerSkeletonBatch` + trava-1 picker-gate) + editor inline
  (`SandboxIDE contract='batch'` + `CodeNodeConfig` host com Save→`Functions.create`→`args.function`). e2e `dados-o3c-ide` verde.

### ✅ Onda 2 follow-ons a+b (FEITO · cert ao vivo 2026-06-30)
- **(a) Painel Classificação & Marcações** — decisão do operador = **AMBOS os eixos reais no floor**. **Eixo 1**
  (classificação→clearance): `sync_classification_marking` espelha `classification_level`→marking canônico
  (RESTRITO/CONFIDENCIAL/SECRETO; sigiloso→SECRETO) no inline `markings[]` que o `check_read` lê
  (`classification_service.py`, em `validate_and_set_asset`). **Eixo 2** (open-vocab→elegibilidade): novos
  `GET/POST/DELETE /datasets/{name}/markings` (tenant-scoped via `_head_asset`; POST=`markings.apply`,
  DELETE=`markings.expand_access`) + `user_can_access_resource` fiado no `/sample` (admin curto-circuita).
  UI: `MarcacoesSection` no `DatasetInspector` (aplica por dropdown, remove via `confirmModal`). SDK TS+python.
- **(b) Chips de governança no Acervo** — `GET /datasets` devolve `classification_level`/`file_classification`/
  `marking_count` por linha (query **set-based** sem N+1); `DatasetsList` ganha badge + contagem por linha + chips que
  **filtram a lista de verdade**. SDK TS (`DatasetListItem`).
- **Cert:** backend `tests/unit/test_classification_marking_sync` 6/6 + `tests_expansion/test_datasets_marking_floor`
  3/3 ao vivo + `test_datasets_list_governance` + **79 testes** dataset/marking/cbac sem regressão · frontend
  `datasets-page` **11/11** + `painel-i18n-keys` (chaves novas 2 locales) + tsc limpo · **e2e ao vivo**
  `dados-marcacoes` + `dados-chips` + suíte dados completa verde. Doc: `dev-marcacoes-floor-reconciliation.md`.
- **GOTCHA do ambiente (novo):** o `compose.yaml` roda a `api` com `uvicorn ... --reload --reload-dir app` →
  editar `app/**.py` **auto-recarrega** (não precisa recreate; só esperar ~10s + `/health` 200). Passwords de teste:
  `ferreira`=`CertPass-2026!`, `admin`=`AGS-Root-2026-nTTsm_pGWUvtCO2eFy8y` (no `e2e/helpers/login.ts`); rodar pytest
  no container com `-e AEGIS_DEMO_PASSWORD_FERREIRA='CertPass-2026!'`. CUIDADO: logins errados TRANCAM o user (423);
  destrancar via `UPDATE users SET failed_login_count=0, locked_until=NULL`.

### ✅ v22 Fácil → adapter read-only (FEITO · cert ao vivo 2026-06-30)
- Decisão do operador = **unificar e DELETAR o Fácil** + **DAG read-only no canvas**. Toggle Fácil/Avançado REMOVIDO;
  a seção Pipelines é sempre o Quadro com lista UNIFICADA: boards v23 (editáveis) + pipelines v22 LEGADO (badge "básico",
  read-only) na mesma `BoardsList`. `v22SpecToGraph` converte o spec linear num grafo; selecionar v22 → `PipelineCanvas`
  `readOnly` (sem paleta/arrastar/conectar/salvar) + `BoardToolbar` só "Executar" (`Pipelines.build`) + `V22Inspector`
  (resumo+runs) no RIGHT. "Criar"=v23. **DELETADO** `pipelines-workspace.tsx` (create v22 sai de propósito);
  `pipelines-page.test` reescrito p/ o adapter; `?modo=`/toggle removidos.
- **Cert:** tsc + jest 13 suites/61 (`pipelines-page` reescrito 3/3; 7 pipeline-builder — `Pipelines.list` DEFENSIVO p/
  mocks `Promise.resolve().then(()=>Pipelines.list())`; i18n valida `pbw.v22*`) · **e2e 8/8 ao vivo** (7 sem regressão +
  novo `dados-v22-adapter`: SEMEIA um v22 via API `/api/platform/v22/pipelines` → abre read-only: sem `pb-add-*` ·
  `pb-v22-inspector` · `pb-v22-run` · canvas travado).

### ✅ I4 — Arrastar Fonte → canvas (FEITO · cert ao vivo 2026-06-30)
- Decisão do operador = **posição EXATA do drop**. O canvas só existe em Pipelines/Avançado → a **palette de Fontes**
  (datasets arrastáveis) vive no Acervo dessa seção, abaixo dos boards (`FontesPalette` em `pipeline-board.tsx`, reusa
  `datasets` já buscado). Arrastar um chip → `PipelineCanvas.onDrop` (novo) lê o dataset do `dataTransfer`
  (`DATASET_DRAG_MIME`) + projeta a posição via `screenToFlowPosition` (`ReactFlowProvider` adicionado ao canvas) →
  `addSourceFromDataset(name, pos)` cria nó Fonte na posição EXATA, pré-preenchido + selecionado. Standalone + casca
  renderizam a mesma `FontesPalette`.
- **Cert:** tsc + jest 12 suites/58 (novo `pipeline-board-drag`: palette arrastável + drop→nó Fonte; 7 pipeline-builder
  preservados; `painel-i18n-keys` valida `pbw.fontes*`) · **e2e 7/7 ao vivo** (6 sem regressão + novo `dados-i4-drag`:
  GESTO completo — `dragTo` o canvas → nó Fonte `pb-node-*` + `pb-cfg-dataset` no inspetor).

### ✅ I3 — Inspetor de DADO decomposto (FEITO · cert ao vivo 2026-06-30)
- Decisão do operador = **grade no CENTRO** + **busca agora, chips depois**. Espelha o I2: estado+slots do
  `DatasetsWorkspace` extraídos p/ `components/dados/dataset-browser.tsx` (`DatasetBrowserProvider`/
  `useDatasetBrowser` + `DatasetsList`/`DatasetContent`/`DatasetInspector`; hook `useDatasetBrowserState(enabled)`).
  Na seção Datasets a casca compõe: **lista (busca+criar) → 2º nível do Acervo** (`contextualSlot`) · **grade/schema
  + branches + transações → CENTER** · **Classificação&Marcações + ações → RIGHT** (`w-[320px]`). `DatasetsWorkspace`
  standalone compõe os MESMOS slots → `datasets-page` 7/7 verde SEM repontar.
- **Chips de governança ADIADOS:** a `Datasets.list` não carrega classificação → o chip-filtro precisa do endpoint
  de lista expor isso (pequena adição backend); por ora só **busca por nome** (sem UI morta). A classificação
  aparece no inspetor RIGHT ao selecionar (`getClassification`).
- **Cert:** tsc + jest 4 suites/21 (`dados-page` assere stub-ds-list@Acervo/stub-ds-content@centro/stub-ds-inspector@right;
  `datasets-page` 7/7; gating+marcacoes com stub do Provider) · **e2e 6/6 ao vivo** + GESTO no smoke
  (`acervo-nav` contém `ds-search`; selecionar dataset → `ds-detail`@centro + `ds-inspector`@right).

### ✅ I2 — Quadro decomposto (Acervo 2-tier · FEITO · cert ao vivo 2026-06-30)
- Estado+slots do Quadro extraídos p/ `components/dados/pipeline-board.tsx` (`PipelineBoardProvider`/
  `usePipelineBoard` + `BoardsList`/`BoardToolbar`/`BoardCanvas`/`NodeInspectorPanel`; hook
  `usePipelineBoardState(enabled)`). Na seção Pipelines/Avançado a casca DISSOLVE o 3-pane aninhado: **boards →
  2º nível do Acervo** (`AcervoNav.contextualSlot`, testid `acervo-contextual`, + toggle Fácil/Avançado) ·
  **canvas → CENTER** · **inspetor de nó+runs → RIGHT** (`w-[320px]`, antes oculto). Fetches gated por `enabled`.
- `PipelineBuilderWorkspace` vira composição fina dos MESMOS slots no 3-pane standalone → os 7 testes do
  pipeline-builder seguem verdes SEM repontar. Fácil segue embarcando PipelinesWorkspace (unificação v22 = #12).
- **Cert:** tsc + jest 10 suites/35 (`dados-page` assere stub-boards@Acervo/stub-canvas@centro/stub-inspector@right;
  gating + marcacoes-tab com stub do Provider) · **e2e 6/6 ao vivo** + GESTO no smoke (`acervo-nav` contém `pb-new`).


### ✅ I1b — casca 3-pane + Acervo + deep-link + redirects (FEITO · cert ao vivo 2026-06-30)
- **Acervo** novo (`components/dados/acervo-nav.tsx`, LEFT `w-[280px] bg-panel-light border-r`): nav vertical
  em 2 grupos — Acervo (Fontes·Datasets·Arquivos·Pipelines·Marcações) + Infra de IA (Provedores·Modelos,
  transitório até o hub próprio — NÃO orfana). Busca filtra itens por rótulo; gating POR SEÇÃO (item sem
  perm some; admin curto-circuita); `#2D77BE` só na seleção; ícone Modelos=AudioLines (nunca Brain). i18n
  `acervo.*` (pt-BR+en-US) em `dict-tela-dados.ts`. Decisão do operador = **nav de seções (incremental)**.
- **Casca** (`app/painel-de-controle/dados/page.tsx`): `h-full min-h-0 flex overflow-hidden` → LEFT Acervo ·
  CENTER `flex-1 min-w-0` workspace embarcado da seleção (scroll FIX#1 preservado; toggle Fácil/Avançado
  das Pipelines mantido) · RIGHT `w-[320px]` Inspetor **declarado mas OCULTO** (emerge no I2/I3). Deep-link
  `?aba=` lê+ESCREVE (padrão `grafo selectAba`, NUNCA localStorage) + `?modo=avancado`; `?board&node&ds`
  pass-through reservado p/ I2/I3.
- **Redirects** (feedback_no_deprecation_of_existing_code): `/conectores`,`/datasets`,`/pipelines`,
  `/pipeline-builder`(+`modo=avancado`),`/media` → `router.replace` p/ `/dados?aba=<seção>`. O `/conectores`
  da RAIZ (saúde das fontes) NÃO tocado. ~10 testes-host repontados p/ o WORKSPACE direto via alias de
  import (`{ XxxWorkspace as XxxPage }`) — mínima alteração; os 7 testes de `conectores-*` já o faziam.
- **Cert:** jest 14 suites/70 testes (1 flaky `media-page` passa isolado, `gotcha_security_app_jest_flaky`) ·
  tsc limpo · **e2e 6/6 AO VIVO** (Playwright CLI) — `dados-gating` 4/4 + `tela-dados-clareza` 1/1 + novo
  `dados-redirects` 1/1 (5 rotas → seção certa, sidenav ativa, modo preservado). Testids `dd-tab-*`→
  `acervo-item-*` em TODOS os consumidores. `dados-page.test` estava 100% RED (mock `useAuth` stale
  pré-Onda-0) → reescrito p/ a casca.

### ▶ PRÓXIMA SESSÃO — Fase 6F-H + redesigns restantes
1. **Subir o ambiente** (receita abaixo, seção "Cert e2e"): `podman start ontology-api` (se :8002→000, cheque
   CRLF no `api-boot.sh` ANTES do port-forward; senão é o port-forward → confirme curl INTERNO 200 nos logs,
   `machine restart`/`compose up -d`). Se o e2e falhar "do nada", mate o `next dev` ZUMBI em :3002.
2. **Design SSOT:** `IMPECCABLE_CONTEXT_DIR=.claude node .claude/skills/impeccable/scripts/context.mjs`
   (PRODUCT.md/DESIGN.md vivem em `.claude/`, NÃO na raiz — `gotcha_impeccable_product_md_in_dot_claude`).
3. **Fase 6F — Atalhos de teclado:** keyboard shortcuts para ações do canvas (Delete nó selecionado, Ctrl+D duplicar, Ctrl+C copiar, Ctrl+Z undo, Space para executar). `useKeyboardShortcuts` hook no `PipelineCanvas`.
4. **Fase 6G — Sticky Notes:** nó `op='note'` para anotações livres no canvas (texto multiline, cor customizável, sem handles). Usado para documentação visual do fluxo.
5. **Fase 6H — Publish/Export:** exportar grafo como PNG/SVG, compartilhar link, publicar como template.
6. Régua: skill `impeccable`, cantos retos, `#2D77BE` único acento, `useT()` pt-BR+en-US, dual-surface
   (claro=analítico). Reusar (NUNCA reconstruir): `pipeline-board.tsx` + `dataset-browser.tsx` (padrão Provider/slots),
   `AcervoNav.contextualSlot`, `PipelineCanvas`, `ResourceMarkings` SDK + `MarcacoesPropriedadeWorkspace`, deep-link
   via searchParams. TDD + e2e ao vivo por mudança.

---
- **Cert e2e AO VIVO ✅ (2026-06-30):** `npx playwright test e2e/dados-gating.spec.ts` → **3/3 verdes**
  contra backend real + login real (admin + ferreira). Gating do hub `/dados` provado: sidenav "Dados"
  visível/href, admin vê as 7 abas sem "Sem permissão" nem crash de console, e abas espelham as perms
  REAIS (abas sem perm somem). Onda 0 fechada de ponta a ponta.
- **Boot fix (novo gotcha):** a `ontology-api` estava em crash-loop por **CRLF** no `api-boot.sh`
  (autocrlf no checkout Windows → dash quebra em `set -e\r`). Resolvido: working-tree → LF +
  `ontology-module/.gitattributes` (`*.sh text eol=lf`) p/ matar a recorrência. Ver
  `gotcha_crlf_breaks_mounted_shell_scripts`. **Primeiro passo de toda sessão nova:** se host:8002 → 000,
  cheque `podman logs --tail 5 ontology-api` por "Illegal option -" ANTES de culpar o port-forward.

## Onda 0 (conformidade de acesso) — COMPLETA + verificada por testes
- **#1** RBAC pipelines: `require_permission(data.pipelines.write)` nas mutações v22/v23 (run/build/
  update/delete) DEPOIS de `_load`/`assert_readable`; `data.pipelines.schedule` (perm nova no catálogo)
  ao ligar preset recorrente. Perm-fantasma `ontology.pipelines.build` → `data.pipelines.write`.
- **#2** perm Conectores: embed `/dados` `iam.governance` → `connectors.manage` (canônica; backend
  `agents.py` aceita as duas; zero lockout — governance_officer tem ambas).
- **#3** over-gate `/dados` morto: `app/painel-de-controle/dados/page.tsx` reescrito — sem RequirePerm
  externo; gating por aba via `useAuth` `has()`; abas sem perm somem; default na 1ª acessível.
- **#4** `record_read` em `datasets.py::sample_dataset` + `platform_v23/media.py::list_items/list_sets`
  (resource_id = UUID do asset; só grava se governança engaja).
- **#5** sidenav `anyPerm`: novo `components/control-panel/nav-visibility.ts` (`principalCanSeeNav` +
  `DATA_NAV_ANYPERM`); item "Dados" do `control-panel-shell.tsx` usa `anyPerm`; `canSee` delega.
- **#6** `verify_chain` (core_loop/lineage.py): `tail=N` (cauda via índice → 4ms) + `verify_chain_cached`
  (TTL+lock) no hot path `/core-loop/metrics`; full no `/lineage/verify`. **#6b** índice em
  `target_asset_id` (get_asset_provenance era seq-scan 2,4GB).
- **Migrações aplicadas:** `0112_lineage_seq_idx` (tenant_id,chain_seq), `0113_lineage_target_idx`
  (target_asset_id parcial).
- **Testes VERDES:** jest `dados-gating` 5/5 · `nav-visibility` 9/9 · tsc limpo · pytest
  `test_pipeline_rbac` 9/9 · `test_pipeline_scheduler` 5/5 · `test_read_audit` 3/3 ·
  `test_lineage_verify_chain` 3/3 · `test_dataset_sample` 4/4 (zero regressão) · EXPLAIN (67s→4ms, 296k→8).
- **LIVE:** logs da api mostram `/datasets`, `/platform/v22+v23/pipeline` servindo **200** (Onda 0 rodando).
- Docs: plano §9 + `docs/dev/fix-lineage-verify-chain-hotpath.md`.

## ✅ Cert e2e AO VIVO — FEITA. Receita de subida (sessão nova) que provou funcionar:
- **Diretriz permanente: e2e SEMPRE via Playwright CLI** (ver `feedback_e2e_via_playwright_cli`).
  Spec: `security-app/e2e/dados-gating.spec.ts` (auto-verificável: lê perms reais, assere abas).
- **Receita (executar nesta ordem):**
  1. `cd ontology-module && podman start ontology-api` (ou `podman-compose up -d` p/ re-aplicar mapeamentos)
  2. **se host:8002 → 000:** `podman logs --tail 5 ontology-api` → se "Illegal option -", é CRLF
     (`gotcha_crlf_breaks_mounted_shell_scripts`): `sed -i 's/\r$//' scripts/api-boot.sh` + `podman start`.
     Senão, é o port-forward (`gotcha_podman_host_portforward_drops_on_restart`): `podman machine restart`.
  3. confirmar: `curl -m6 -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8002/openapi.json` == **200**.
  4. dev server: `cd security-app && NODE_OPTIONS=--max-old-space-size=2048 npx next dev -H 0.0.0.0 -p 3002`
     (background; ~18s p/ "Ready"; login e2e default = `admin`).
  5. `npx playwright test e2e/dados-gating.spec.ts --reporter=list` → **3/3** (Onda 0 certificada).

## ONDA 1 — Clareza nº1: **núcleo COMPLETO + certificado** (2026-06-30)
Decisão travada: badges de estado **honestos** (só nó de Saída + chip do Fluxo; nós intermediários NÃO
recebem badge fabricado — o backend não reporta estado por nó). Investigação multiagente: run
`wf_c7152cbc-7be` (6 mapas file:line). 5 sub-features, TDD + tsc por mudança:
- **SF1 ✅** fix `"backend: none · N matches"` → rótulo humano via `useT()` (`aipRag.backendStatus.*` +
  contagem singular/plural; nunca expõe o backend técnico). Jest `aip-rag-backend-label` 3/3.
- **SF2 ✅** inspetor de transform: `ColumnSelect`/`ColumnMultiSelect` (novo `components/dados/column-select.tsx`)
  do schema do nó a montante (cheap `upstreamSig` evita storm de rede) em select/filter/join/sort/dedupe/
  derive/rename/agg; **extract** Simples(split)=default / Avançado(regex); **branch** `<select>`+"Outra…".
  Fallback texto honesto quando o schema é desconhecido. Jest `pipeline-builder-column-dropdowns` 4/4 + 6 suites sem regressão.
- **SF3 ✅** row-builder dirigido por `payload_keys` (SNAPSHOT/APPEND) → mata o `<textarea>` JSON; UPDATE/
  DELETE seguem no JSON avançado. Jest `datasets-page` (3 novos).
- **SF4 ✅** seção "Conteúdo": grade (`Datasets.sample`) + schema (`payload_keys`), leitura ≤2 cliques
  sem DAG, ABAC-graceful (403→vazio honesto). Jest `datasets-page` (1 novo).
- **SF5 ✅** badges honestos no canvas (output node do `lastRun`: status+rows_out+instâncias+"há N min")
  + chip do Fluxo + `nodeSummary` humanizado + i18n do `PipelineCanvas` (`dict-tela-dados.ts`) +
  `lib/format-number.ts` (Intl). Jest `pipeline-canvas-summary` 7/7.
- **Cert ao vivo:** `e2e/tela-dados-clareza.spec.ts` (smoke: /dados + datasets + pipelines-avançado
  renderizam sem erro fatal de console) **verde** + `dados-gating` 3/3 (Onda 0 sem regressão). tsc limpo.

**i18n sweep dos 2 workspaces ✅ (2026-06-30)** — `datasets-workspace.tsx` (85 chaves `dsw.*`,
`lib/i18n/dict-dsw.ts`) + `pipeline-builder-workspace.tsx` (119 chaves `pbw.*` + 8 de schedule/branch,
`lib/i18n/dict-pbw.ts`) → tudo via `useT()` pt-BR+en-US (gerados via workflow `wf_5c70a5d1-4ab`,
2 agentes Opus; cross-check provou 0 chaves usadas sem entrada no dict). tsc limpo · jest 49/49
(`painel-i18n-keys` valida ambos locales) · e2e ao vivo 4/4. **ONDA 1 — 100% COMPLETA.**
- Régua: TDD + e2e (Playwright) por mudança · skill `impeccable` · cantos retos · #2D77BE único acento.
- **Gotcha de cert:** se o e2e falhar "do nada", cheque um `next dev` ZUMBI segurando :3002 (o "killed"
  do background deixa o node filho vivo → EADDRINUSE no novo + serve estado wedged). Fix:
  `netstat -ano | grep :3002` → `taskkill //PID <pid> //F` → suba fresco → aqueça `/dados` antes do e2e.

## ONDA 2 — A Tela de Dados (re-wiring + re-IA, plano §5/§11) — EM ANDAMENTO
- **De-rainbow + Bot→AudioLines ✅ (pré-condição, 2026-06-30)** — PipelineCanvas: kind neutro
  (`border-border-light bg-white shadow-sm` + `kindIcon` Database/Boxes/Workflow + `#2D77BE` só seleção);
  lineage `/grafo`: `Bot`/`Brain`→`AudioLines`, eixo 'general' color-by-kind PRESERVADO (é color-as-data,
  não decoração — teste assere). tsc + jest 43/43 + smoke verdes. GAP: PRODUCT.md/DESIGN.md não existem na
  raiz (impeccable `NO_PRODUCT_MD`); SSOT real = `.impeccable/design.json`+CLAUDE.md; preencher via `/impeccable init`.
- **3-pane: investigação ✅ (`wf_767db763-6c7`) + decisão do operador = 3-pane VERDADEIRO (decompõe os
  workspaces).** Caminho incremental: I1 casca+Acervo+plumbing · I2 decompõe Quadro · I3 decompõe Inspetor
  de dado · I4 arrastar Fonte→canvas. Espelhar `/buscar` (LEFT `w-[280px] bg-panel-light border-r` · CENTER
  `flex-1 min-w-0` · RIGHT `w-[320px] border-l`).
  - **I1a ✅** `NAV_CLUSTERS 'dados'` (control-panel-shell.tsx) — active-state por ROTA; e2e aria-current
    em `/dados?aba=datasets`. tsc + 89/89 CP shell.
  - **I1b ✅ (2026-06-30)** casca 3-pane (`dados/page.tsx`) + **Acervo** (`components/dados/acervo-nav.tsx`,
    nav de seções em 2 grupos: Acervo + Infra de IA) + deep-link `?aba=`/`?modo=` (lê+escreve) + **5 redirects**
    das rotas-irmãs → `/dados?aba=<seção>`. ~10 testes-host repontados p/ o workspace direto via alias. Cert:
    jest 14 suites/70 + tsc + **e2e 6/6 ao vivo** (`dados-gating`+`tela-dados-clareza`+novo `dados-redirects`).
  - **I2 ✅ (2026-06-30)** Quadro decomposto (Acervo 2-tier): boards→Acervo · canvas→CENTER · inspetor de nó→RIGHT;
    estado+slots em `pipeline-board.tsx`. **I3 ✅ (2026-06-30)** Inspetor de DADO decomposto: lista→Acervo ·
    grade/branches/txs→CENTER · Classificação&Marcações+ações→RIGHT; estado+slots em `dataset-browser.tsx`.
  - **I4 ✅ (2026-06-30)** Arrastar Fonte→canvas (posição EXATA): `FontesPalette` (datasets arrastáveis) no Acervo
    de Pipelines/Avançado → `PipelineCanvas.onDrop`+`screenToFlowPosition` (`ReactFlowProvider`) → `addSourceFromDataset`
    cria nó Fonte na posição do drop, pré-preenchido. **★ NÚCLEO 3-PANE COMPLETO (I1→I4).**
  - **v22 adapter ✅ (2026-06-30)** Fácil DELETADO → lista UNIFICADA: boards v23 + pipelines v22 LEGADO read-only
    (badge "básico", canvas travado + Executar); `v22SpecToGraph`+`V22Inspector` em `pipeline-board.tsx`.
  - **RESTA Onda 2 (follow-ons):** painel Classificação&Marcações (backend, markings[] inline⇄ResourceMarking) ·
    chips de governança no Acervo (depende de `Datasets.list` expor classificação/marcação = pequena adição backend).

## Régua operacional (lições desta sessão — NÃO repetir)
- NÃO reiniciar `ontology-api` em loop (quebra o port-forward host; ver gotcha). Health-check da app =
  LOGS (`podman logs`), não `curl host:porta` isolado.
- Testes de backend brigam com o stack vivo (scans de lineage saturavam); rodar com DB quieto. Pytest
  com `tail`/pipe bufferiza → usar `PYTHONUNBUFFERED=1`, ler o arquivo de output direto.
- pytest some da imagem ontology-api em recreate → `pip install pytest pytest-asyncio`.
