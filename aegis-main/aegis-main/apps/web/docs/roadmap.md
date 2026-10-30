# Roadmap

> Estado: a plataforma passou muito além do plano original de 10 PRs (painel policial de 11 páginas). Hoje é uma **plataforma horizontal de digital twin** classe-Foundry (~85/100 no scorecard `aegis-vs-foundry-2026-06.md`). Este roadmap reflete **o que foi entregue** e **o que está em aberto**.
>
> Toda entrega fecha com TDD + e2e ([[tdd-e2e-required]]), documenta em `docs/security-app/` + reflexo em `/docs` da UI ([[sync-docs-to-ui]]), e termina com Devil's Advocate Review ([[devils-advocate-and-quality-bar]]).

---

## Parte I — Entregue e certificado

### Fundação (PR-1 a PR-8 originais)
- Shell completo (header com banner de classificação, sidenav consolidada ~29 itens via hubs por intenção, paleta ⌘K, rodapé tenant/versão) + design system.
- Páginas de domínio de segurança pública: `/`, `/buscar` (3-pane filtros à esquerda), `/ficha/[id]`, `/explorador`, `/rede`, `/geo`, `/cameras`, `/alertas`, `/briefings`, `/relatorios`, `/admin`.
- Auth + IAM portados do `politicians-app` (httpOnly + JWT).
- i18n pt-BR (default) + en-US (peer) via `useT()`.

### Ontologia & dados
- Object types / instâncias / grafo; datasets, Pipeline Builder (5 verbos), `transform.code` em sandbox, builds incrementais (watermark), agendamento cron, branches de experimento, lineage assinado.
- **Plano "100% plataforma" — 6 ondas horizontais, todas entregues:**
  - ① RowPolicy em todos os read-paths + máscara de propriedade
  - ② CodeFunction `strict_signature` + `allow_network` por Function
  - ③ auditoria de leitura (`AccessAuditEvent`)
  - ④ apagamento genérico LGPD (redact/delete domain-neutral)
  - ⑤ alarme durável (`AlarmRule`→`AlarmEvent`→`fire_action` real, fim do dry-run)
  - ⑥ retenção/TTL (`RetentionPolicy`, pruning BRIN, tick diário + run-now)
- TSDB / timeseries (CRUD de séries + chart).

### AIP
- **AIP Arquiteto** multiagente (Coordenador → N agentes paralelos → Montador); materialização atômica de app RODÁVEL; refactor de estrutura existente (diff aditivo/destrutivo, confirma-e-aplica no chat).
- Modalidades reais: visão (moondream/SAM/open-vocab, multi-provider), áudio (whisper-large-v3 + diarização), `aip.enrich_objects`, **geração de imagem** (Flux via WaveSpeed).
- **Solution Designer** (canvas de diagrama 6 fases com execução real), **Web IDE** (Monaco + sandbox + autocomplete SDK), **Autopilot**, **Pilots**, threads.

### Workshop & geração de apps
- Catálogo de ~17 widgets `proposable` com `config_schema`; **Variables Engine** maduro (`runtime.ts` + `/evaluate`).
- Widgets: counter, markdown_v2, property_list, button_group, object_table_v2, tabs, map_live (MapboxGL + clustering), geo_map, timeline, mini_map (Cesium), contagem por classe, **charts Vega reais + construtor (F3)**, **network_graph**, **image**, **form widget** (16 tipos de campo + write-back).
- Salas/Workspace (CRUD + publicar + soft-delete + versão assinada + republicar), **Carbon Composer** (3-pane GUI/YAML), app-shell/styles-configurator, homepage customizável, lixeira + bulk-delete.

### Governança (paridade Foundry A–L)
- Organizações / Espaços / Operações; papéis canônicos + convidados; classificação 4 níveis (LAI/Decreto 7.724); **marcações** (AND/OR + por propriedade); **CBAC** invariante; restrições de projeto; modo apresentação/Kiosk; **IAM Groups**; **Tours guiados**; **Loja/marketplace** (wizard de instalação).
- Catálogo de permissões 40+ keys com defaults por role.

### Digital twin (M1–M6) + visão/geo
- M1 geofence + ciclo de GuestToken; M2 mapa MapboxGL + superfície pública `/m/{token}` + `useDeviceLocation`; M4 connector.http genérico + agendador + painel de conectores; M5 portão/kiosk/reserva por composição; M6 insight auditável.
- Loop WhatsApp (`issue_token.share` → whapi.cloud) + `aegis.notify.send`.
- **V1/V2 visão → georreferência → mapa** (contagem → lat/lng → pinos OntologyNode, editar/remover no pino) + **RunPod control-plane pleno** + registry de compute providers (BYOM, gate por país/datacenter).
- CCTV ↔ ontologia (Entity/EntityLink/Evidence; cctv-worker = LPR + face).

### SDK / codegen
- `aegis-python-sdk` + **OSDK** (tipos TS por snapshot, versionado, sync por feature); PRs sobre Functions + repositórios + branches; validação de escrita de ActionType (`temporal_exclusivity`).

---

## Parte II — Em aberto

### Planejado (especificado, não shipado)
- **OCR** como modalidade AIP (`ready=False` — requer backend OCR).
- **V3 — fábrica de detectores de imagem** (AIP builda o próprio detector, além de consumir modelos prontos).
- **Destaque de Sala** e **restringir navegação por Sala** (paridade Foundry I/J).

### Débitos conhecidos
- Budget de LLM por tenant (rastreio/teto cumulativo).
- Join simétrico (2 fontes) no PipelineBoard.
- Terminal xterm e Browser VM (KasmVNC) — funcionais, não production-grade.
- Docs de M1–M6 a consolidar; espelho `/docs` da UI a re-sincronizar após esta atualização.

### Verticais (fora do core — build-out por conector/Function)
FHIR (saúde), OPC-UA (indústria/energia), track-fusion (defesa), billing. Nunca entram no core — herdam dos primitivos horizontais via conector + Function + ontologia.

---

## Critério "pronto" por entrega

1. Todos os testes (unit + e2e) verdes; AIP e2e usa LLM real (sem mock).
2. Doc em `docs/security-app/` adicionada/atualizada + reflexo em `/docs` da UI ([[sync-docs-to-ui]]).
3. Nenhuma string visível menciona marca/produto de terceiro ([[no-palantir-product-names]]); runtime interno = "AIP" ([[ui-aip-not-openclaw]]).
4. pt-BR + en-US via `useT()` ([[ui-english-only]]); nenhuma string hardcoded.
5. Nenhum `Sparkles` / `rounded-*` ([[no-rounded-no-sparkles]]); nenhum emoji ([[no-emojis-in-ui]]).
6. Nenhum "Fase X"/"scaffold"/"em construção" em string de operador ([[no-phase-status-in-ui]]).
7. Operador não precisa de CLI/shell para nada ([[no-shell-commands-for-operator]]).
8. Página nova: `perm_key` no catálogo + role + `RequirePerm` + sidenav ([[new-pages-link-iam]]).
9. Nada hardcoda domínio — vem da ontologia ([[no-hardcoded-domain-use-ontology]]).
10. Devil's Advocate Review ao final ([[devils-advocate-and-quality-bar]]).
