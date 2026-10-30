/**
 * Auto-registro de widgets do Workshop. Importar este barrel registra
 * tudo abaixo no `REGISTRY` do WorkshopV2Renderer.
 *
 * Cada arquivo chama `registerWidget('<type>', Component)` em top-level
 * — basta o import pra ficar registrado antes da 1ª render.
 */

import './markdown-v2';
import './counter';
import './property-list';
import './relation-list';
import './object-table';
import './tabs';
import './button-group';

// F4: widgets nativos da security-app sob namespace `security.*`.
// Falam direto com o `Cctv` client local — não dependem de
// Workshop evaluate / ponte Entity→OntologyNode (F4.5).
import './security-native';

// F5: macro-widget composto `security.home.layout` que reproduz a
// Home antiga bit a bit. Usado pela seed em lib/workshop/seeds/home.ts.
import './security-home';

// F6: macro-widget `security.ficha.layout` (legado — backward compat).
// As seeds atualizadas usam widgets atômicos + chrome fatiado abaixo.
import './security-ficha';

// F6.5: widgets ESTRUTURAIS da ficha — tabs/paleta/inspetor agora são
// widgets normais que o operador adiciona/remove/move via editor.
// Cada um declara seu `slot` default; o FichaWorkshopShell posiciona.
import './security-ficha-chrome';

// P5: ações do TIPO na ficha (security.ficha.acoes) — lista type_def.actions
// e executa pelo pipeline GOVERNADO (ActionType.execute → gates + lineage).
// Genérico/multidomínio: vale pra qualquer Object Type, zero hardcode.
import './ficha-acoes';

// F7: ficha de PARLAMENTAR — widgets dedicados pra mandato, mídia,
// cota CEAP, citações, correlações etc. Lê de `variables.properties`
// montada pelo flow security.parlamentar-360.
import './security-parlamentar';

// F8: widgets atômicos do "Detalhe da busca" — explodem o DetalheObjeto
// default em cabeçalho/meta/ações/payload. Surface=search_result.
import './security-detalhe';

// Sprint 1 (Workshop parity roadmap): filter_pills genérico.
import './filter-pills';

// Sprint 3 (Workshop parity roadmap): object_view + loop_layout.
import './object-view';
import './loop-layout';

// Sprint 4 (Workshop parity roadmap): embedded_app (workshop-in-workshop).
import './embedded-app';

// Tier B1 (Workshop parity roadmap): exploration_search.
import './exploration-search';

// Sprint 5 (Workshop parity roadmap): 9 widgets primitivos novos.
import './text-input';
import './dropdown';
import './date-picker';
import './iframe';
import './metric-card';
import './object-list';
import './pivot-table';
import './comments';
import './chart-xy';

// Sprint G1 (closure feedback operator, 2026-05-21): picker interativo
// que conecta widgets à ontologia AEGIS sem precisar pre-declarar variables.
import './object-picker';

// Sprint L7 (2026-05-23): Object Card — pick #1 da pesquisa R2 Slate.
// Card compacto de UM nó da ontologia + CTA pra ficha.
import './object-card';

// Sprint L17 (2026-05-23): Timeline — lista cronológica de eventos.
// Útil para audit logs e lineage por entidade.
import './timeline';

// Sprint L7 (2026-05-23, Slate parity): 6 widgets novos derivados da
// pesquisa R2 Foundry/Slate em docs/research/foundry/slate/. Cada um
// materializa uma capability do Slate sem cair em mock/stub.
import './object-action-button'; // widgets/platform.md
import './query-result';         // widgets/platform.md + read-write/queries.md
import './handlebars-text';      // logic/handlebars.md
import './slate-chart';          // widgets/chart.md
import './search-input';         // widgets/control.md
import './time-axis';            // widgets/time.md

// Sprint L16 (2026-05-23, Layout da Sala): 2 widgets viz novos —
// geo-map (Mercator SVG simples) + calendar (GitHub-style heatmap
// 52w × 7d). Sem dependências externas, render-everywhere.
import './geo-map';
import './calendar';

// Mapa de calor de MATRIZ (densidade por DUAS dimensões) — reusa a
// resolução/agregação row × col do pivot_table mas pinta células por
// intensidade. NÃO confundir com o calendar (52w × 7d fixo).
import './heatmap';

// Reprodutor de áudio — par sonoro do video_player. URL/propriedade do
// objeto + transcrição opcional read-only.
import './audio-player';

// Map (tempo real) — MapboxGL ligado a object set (Core display). ADD alongside
// do geo-map (SVG leve), sem deprecar. research: workshop/widgets-visualization/map.md
import './map-live';
import './layer-builder';

// Sprint Wave D.4 (2026-05-23): 5 widgets Slate parity restantes.
// - writeback-form  read-write/writeback.md + osdk.md
// - video-player    widgets/advanced.md
// - container-group widgets/container.md
// - status-pill     widgets/visualization.md
// - sankey-flow     widgets/visualization.md
import './writeback-form';
import './video-player';
import './container-group';
import './status-pill';
import './sankey-flow';

// Wave G.3 (2026-05-23): 3 widgets restantes da pesquisa R2.
// - pdf-viewer                widgets/advanced.md
// - vega-chart                widgets/chart.md + visualization.md
// - exploration-filter-pills  widgets/exploration-search.md + control.md
import './pdf-viewer';
// PERF #5 (2026-06-28): vega_chart entra LAZY (next/dynamic ssr:false) — a
// META fica registrada eager (paleta), mas o bundle pesado do Vega (vega-embed
// → vega-canvas) só carrega quando um vega_chart renderiza e NUNCA no server.
// Ver vega-chart.lazy.tsx + vega-chart.meta.ts.
import './vega-chart.lazy';
import './exploration-filter-pills';

// Onda K.2 (2026-05-23): Form Widget RICO (editor de Páginas/Workshop).
// 16 tipos de campo (incl. lookup ontológico), validação, regras
// condicionais nível Salesforce, valores dinâmicos, políticas de
// visibilidade (public/requires_auth/requires_perm) e write-back via
// ActionType OU criação de nó. Editor visual dos campos no Inspetor
// (form-fields / perm-key / action-type FieldKinds) — JAMAIS JSON manual.
// research: workshop/widgets-event-nav/inline-action.md + slate/widgets/control.md
import './form-builder';

// V1 visão→georref→mapa (2026-06-04, spec ontology-module/docs/arquiteto/
// visao-georref-mapa-spec.md): upload governado (E5, porte do web-app) +
// contagem por imagem com revisão do operador (B1/B3) → bulk create (E4).
import './media-uploader';
import './vision-count';
// Análise multidomínio hospedada (Roboflow serverless) como AÇÃO componível —
// versão widget do gesto que existe como modal na /cameras (egress opt-in).
import './multidomain-detect';

// V2 — editor de item (edita lat/lng + metadata / remove a instância
// selecionada no mapa; governado via PUT/DELETE + lineage). Compõe com
// map_live/globe_live via overlay (select_change → set_variable → open_overlay).
import './instance-editor';
// V2 — globo 3D Cesium GENÉRICO, par 3D do map_live (mesmo object set, mesmo
// select_change). Decisão do operador: os DOIS renderers.
import './globe-live';
// F3 — grafo de rede genérico (force-graph), proposável; clicar num nó emite
// select_change.
// F3 — imagem/galeria genérica (par visual do audio/video player).
import './image';
// 4A — status/gestão de conectores dentro de apps: lê o ObjectSet de nós
// 'conector' (espelho WP-E) e roda/pausa pelo MESMO trilho governance/agents
// da central (perm connectors.manage; sem perm = somente-leitura).
import './connector-status';
// Inbox unificado (2026-06-12) — lista de alertas do tenant via API real
// do núcleo (GET /alerts/inbox); ack inline auditado, gated por perm.
// É o coração da página /alertas parametrizável (seed em pages.py).
import './alert-list';

// Gestão das buscas monitoradas (SearchFeeds) — par do "Salvar busca + monitorar"
// do /buscar: lista/pausa/edita cadência/exclui via API real (/alerts/feeds).
// Seção da página /alertas (config-driven).
import './buscas-monitoradas';

// T3-F (2026-06-29) — blocos-base de editor de documento (presentational):
// aviso/destaque, separador, citação. Usados nos compositores /relatorios e
// /briefings (e em qualquer app/página).
import './callout';
import './divider';
import './quote';

// T3-F2 (2026-06-29) — mais blocos-base estilo Google Docs.
import './checklist';
import './code-block';
import './page-break';
import './figure';
import './signature';

// Vertical Câmara Municipal (SISCAM) — painel de GARGALOS ancorado em evidência.
// Substitui o "muro de texto" markdown por linhas escaneáveis: demanda (mono),
// barra de atendimento, sparkline de recorrência por ano, chips de autores/bairros
// e links clicáveis ao SISCAM. Dado 100% assado pelo skill camara.dashboard.
import './camara-gargalos';
// Ranking de demandas (barras: volume + atendimento + tendência) e autores (quem cobra
// + os temas que puxa = vínculo). Mesmo tratamento de "ativação" dos gargalos.
import './camara-demandas';
import './camara-autores';
