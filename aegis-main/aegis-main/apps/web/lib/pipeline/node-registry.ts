/**
 * Wave 1 inc2 — REGISTRO DE NÓ declarativo (o "nó = dado").
 *
 * Cada nó DECLARÁVEL do DAG vira DADO: um `NodeSpec` com `fields: NodeFieldSpec[]`
 * (espelho do `properties[]` do n8n) que o `NodeFieldsRenderer` genérico desenha —
 * matando o componente React à mão. Nós irredutivelmente BESPOKE (source/output/
 * if/switch/filter/set/http/join/code/loop/llm/aip_model/aip_tools/skill) NÃO
 * entram aqui: seguem no `custom` (componente próprio) do inspetor.
 *
 * O registro é a FONTE ÚNICA do inspetor desses nós + habilita o AIP-Arquiteto a
 * ler/emitir a config como dado. Migração INCREMENTAL: o inspetor consulta o
 * registro PRIMEIRO; op ausente → cai no switch bespoke de sempre.
 *
 * `label`/`help`/`placeholder`/`options[].name` são CHAVES i18n — `localizeFields`
 * resolve via `t()` antes do render (o renderer é i18n-agnóstico). Fontes dinâmicas
 * (`typeOptions.loadOptions`): resolvidas pelo caller via `resolveOptions` —
 * 'columns' (colunas de entrada), 'columns-right' (2º pai), 'columns-union' (A∪B).
 */
import type { NodeFieldSpec } from './node-fields';

export interface NodeSpec {
  /** Campos declarativos (editam o `config` do nó diretamente). */
  fields: NodeFieldSpec[];
  /** testid do container (preserva os `pb-cfg-<op>` históricos dos testes). */
  container: string;
  /**
   * Aditivo 7 — fusão FÍSICA dos metadados de palette: chave i18n do RÓTULO
   * canônico do nó/op. FONTE ÚNICA — o dropdown de ops (TRANSFORM_SELECT_OPTIONS),
   * o cabeçalho do inspetor e a palette (NODE_CATALOG) derivam DAQUI.
   */
  labelKey: string;
  /** Rótulo da PALETTE quando difere do canônico (ex.: set→"Editar campos"). */
  paletteLabelKey?: string;
  /** chave i18n de uma dica sob os campos (preserva os hints atuais). */
  hintKey?: string;
  /**
   * batch 3 — nó BESPOKE roteado pelo registro: `custom` aponta a chave do
   * componente rico (o próprio op). O registro vira a fonte COMPLETA de
   * enumeração (declarável = fields[]; bespoke = marker), e o inspetor despacha
   * o JSX rico pelo registro (`spec.custom === op`) em vez de `op === '...'`.
   * `fields` fica vazio — o componente próprio segue sendo a fonte da edição.
   */
  custom?: string;
}

export const NODE_REGISTRY: Record<string, NodeSpec> = {
  // ── Fluxo ────────────────────────────────────────────────────────────────
  wait: {
    container: 'pb-cfg-wait',
    labelKey: 'pbw.nodeWait',
    hintKey: 'pbw.waitHint',
    fields: [
      { key: 'seconds', label: 'pbw.waitSecondsLabel', help: 'pbw.waitSecondsTip',
        type: 'number', default: 5, testid: 'pb-cfg-wait-seconds',
        typeOptions: { minValue: 0, maxValue: 120 } },
    ],
  },
  stop_error: {
    container: 'pb-cfg-stop',
    labelKey: 'pbw.nodeStopError',
    hintKey: 'pbw.stopHint',
    fields: [
      { key: 'message', label: 'pbw.stopMessageLabel', help: 'pbw.stopMessageTip',
        type: 'string', default: '', testid: 'pb-cfg-stop-message',
        placeholder: 'pbw.stopMessagePlaceholder', typeOptions: { rows: 3 } },
    ],
  },
  merge: {
    container: 'pb-cfg-merge',
    labelKey: 'pbw.nodeMerge',
    fields: [
      { key: 'mode', label: 'pbw.mergeModeLabel', help: 'pbw.mergeModeTip',
        type: 'options', default: 'append', required: true, testid: 'pb-cfg-merge-mode',
        options: [
          { name: 'pbw.mergeModeAppend', value: 'append' },
          { name: 'pbw.mergeModeCombine', value: 'combine' },
        ] },
      // A dica só aparece no modo combine (paridade: ficava ENTRE os campos).
      { key: '_combineHint', label: '', help: 'pbw.mergeCombineHint', type: 'notice',
        displayOptions: { show: { mode: ['combine'] } } },
      { key: 'left_on', label: 'pbw.mergeLeftLabel', help: 'pbw.mergeLeftTip',
        type: 'column', default: '', testid: 'pb-cfg-merge-left',
        typeOptions: { loadOptions: 'columns' },
        displayOptions: { show: { mode: ['combine'] } } },
      { key: 'right_on', label: 'pbw.mergeRightLabel', help: 'pbw.mergeRightTip',
        type: 'column', default: '', testid: 'pb-cfg-merge-right',
        typeOptions: { loadOptions: 'columns-right' },
        displayOptions: { show: { mode: ['combine'] } } },
    ],
  },
  compare: {
    container: 'pb-cfg-compare',
    labelKey: 'pbw.nodeCompare',
    hintKey: 'pbw.comparePortsHint',
    fields: [
      { key: 'key', label: 'pbw.compareKeyLabel', help: 'pbw.compareKeyTip',
        type: 'column', default: '', testid: 'pb-cfg-compare-key',
        typeOptions: { loadOptions: 'columns-union' } },
    ],
  },
  // ── Correlação (Wave 2) — 1 nó, method-driven: cada método REUSA o motor do AEGIS
  // (multi-hop / espaço-temporal / entity-resolution / watchlist / identidade).
  // Campos por-método gated por displayOptions (paridade n8n operation+displayOptions).
  correlate: {
    container: 'pb-cfg-correlate',
    labelKey: 'pbw.nodeCorrelate',
    hintKey: 'pbw.correlateHint',
    fields: [
      { key: 'method', label: 'pbw.correlateMethodLabel', help: 'pbw.correlateMethodTip',
        type: 'options', default: 'chain', required: true, testid: 'pb-cfg-correlate-method',
        options: [
          { name: 'pbw.correlateMethodChain', value: 'chain' },
          { name: 'pbw.correlateMethodSpatiotemporal', value: 'spatiotemporal' },
          { name: 'pbw.correlateMethodResolveEntity', value: 'resolve_entity' },
          { name: 'pbw.correlateMethodWatchlist', value: 'watchlist' },
          { name: 'pbw.correlateMethodIdentity', value: 'identity' },
        ] },
      // chain (multi-hop): seed {tipo?, valor} + profundidade/orçamento.
      { key: 'seed_value', label: 'pbw.correlateSeedValueLabel', help: 'pbw.correlateSeedValueTip',
        type: 'string', default: '{{ $json.value }}', testid: 'pb-cfg-correlate-seed-value',
        placeholder: 'pbw.correlateSeedValuePlaceholder',
        displayOptions: { show: { method: ['chain'] } } },
      { key: 'seed_kind', label: 'pbw.correlateSeedKindLabel', help: 'pbw.correlateSeedKindTip',
        type: 'string', default: '', testid: 'pb-cfg-correlate-seed-kind',
        placeholder: 'pbw.correlateSeedKindPlaceholder',
        displayOptions: { show: { method: ['chain'] } } },
      { key: 'max_depth', label: 'pbw.correlateMaxDepthLabel', help: 'pbw.correlateMaxDepthTip',
        type: 'number', default: 2, testid: 'pb-cfg-correlate-max-depth',
        typeOptions: { minValue: 1, maxValue: 4 },
        displayOptions: { show: { method: ['chain'] } } },
      { key: 'budget_nodes', label: 'pbw.correlateBudgetLabel', help: 'pbw.correlateBudgetTip',
        type: 'number', default: 40, testid: 'pb-cfg-correlate-budget',
        typeOptions: { minValue: 1, maxValue: 200 },
        displayOptions: { show: { method: ['chain'] } } },
      // spatiotemporal: âncora + raio/janela EDITÁVEIS.
      { key: 'anchor_id', label: 'pbw.correlateAnchorLabel', help: 'pbw.correlateAnchorTip',
        type: 'string', default: '{{ $json.node_id }}', testid: 'pb-cfg-correlate-anchor',
        placeholder: 'pbw.correlateAnchorPlaceholder',
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      { key: 'radius_m', label: 'pbw.correlateRadiusLabel', help: 'pbw.correlateRadiusTip',
        type: 'number', default: 200, testid: 'pb-cfg-correlate-radius',
        typeOptions: { minValue: 1, maxValue: 50000 },
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      { key: 'window_s', label: 'pbw.correlateWindowLabel', help: 'pbw.correlateWindowTip',
        type: 'number', default: 300, testid: 'pb-cfg-correlate-window',
        typeOptions: { minValue: 1, maxValue: 604800 },
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      { key: 'limit', label: 'pbw.correlateLimitLabel', help: 'pbw.correlateLimitTip',
        type: 'number', default: 50, testid: 'pb-cfg-correlate-limit',
        typeOptions: { minValue: 1, maxValue: 500 },
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      { key: 'kinds', label: 'pbw.correlateKindsLabel', help: 'pbw.correlateKindsTip',
        type: 'string', default: '', testid: 'pb-cfg-correlate-kinds',
        placeholder: 'pbw.correlateKindsPlaceholder',
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      { key: 'materialize', label: 'pbw.correlateMaterializeLabel', help: 'pbw.correlateMaterializeTip',
        type: 'boolean', default: false, testid: 'pb-cfg-correlate-materialize',
        displayOptions: { show: { method: ['spatiotemporal'] } } },
      // resolve_entity: tipo + valor (canonicaliza) + enriquecimento opcional.
      { key: 'entity_kind', label: 'pbw.correlateEntityKindLabel', help: 'pbw.correlateEntityKindTip',
        type: 'string', default: '', testid: 'pb-cfg-correlate-entity-kind',
        placeholder: 'pbw.correlateEntityKindPlaceholder',
        displayOptions: { show: { method: ['resolve_entity'] } } },
      { key: 'entity_value', label: 'pbw.correlateEntityValueLabel', help: 'pbw.correlateEntityValueTip',
        type: 'string', default: '{{ $json.value }}', testid: 'pb-cfg-correlate-entity-value',
        placeholder: 'pbw.correlateSeedValuePlaceholder',
        displayOptions: { show: { method: ['resolve_entity'] } } },
      { key: 'enrich', label: 'pbw.correlateEnrichLabel', help: 'pbw.correlateEnrichTip',
        type: 'boolean', default: false, testid: 'pb-cfg-correlate-enrich',
        displayOptions: { show: { method: ['resolve_entity'] } } },
      // watchlist: placa procurada (lookup puro).
      { key: 'plate', label: 'pbw.correlatePlateLabel', help: 'pbw.correlatePlateTip',
        type: 'string', default: '{{ $json.plate }}', testid: 'pb-cfg-correlate-plate',
        placeholder: 'pbw.correlatePlatePlaceholder',
        displayOptions: { show: { method: ['watchlist'] } } },
      // identity: nome (+ UF) → possíveis identidades (busca governada).
      { key: 'nome', label: 'pbw.correlateNomeLabel', help: 'pbw.correlateNomeTip',
        type: 'string', default: '{{ $json.nome }}', testid: 'pb-cfg-correlate-nome',
        placeholder: 'pbw.correlateNomePlaceholder',
        displayOptions: { show: { method: ['identity'] } } },
      { key: 'uf', label: 'pbw.correlateUfLabel', help: 'pbw.correlateUfTip',
        type: 'string', default: '', testid: 'pb-cfg-correlate-uf',
        placeholder: 'pbw.correlateUfPlaceholder',
        displayOptions: { show: { method: ['identity'] } } },
      // Comuns (todos os métodos): modo + coluna de saída + teto de linhas.
      { key: 'mode', label: 'pbw.correlateModeLabel', help: 'pbw.correlateModeTip',
        type: 'options', default: 'per_row', testid: 'pb-cfg-correlate-mode',
        options: [
          { name: 'pbw.correlateModePerRow', value: 'per_row' },
          { name: 'pbw.correlateModeOnce', value: 'once' },
        ] },
      { key: 'output', label: 'pbw.correlateOutputLabel', help: 'pbw.correlateOutputTip',
        type: 'string', default: 'correlate_output', testid: 'pb-cfg-correlate-output' },
      { key: 'max_rows', label: 'pbw.correlateMaxRowsLabel', help: 'pbw.correlateMaxRowsTip',
        type: 'number', default: 20, testid: 'pb-cfg-correlate-max-rows',
        typeOptions: { minValue: 1, maxValue: 50 } },
    ],
  },
  // ── Reativa (Wave 2) — 1 nó, method-driven: reusa os motores de /alertas·/cercas
  // (geofence-eval / threshold-alarm / emit-alert / notify). "cerca→alerta→notificar"
  // = 3 nós reativos encadeados. Campos por-método gated por displayOptions.
  reactive: {
    container: 'pb-cfg-reactive',
    labelKey: 'pbw.nodeReactive',
    hintKey: 'pbw.reactiveHint',
    fields: [
      { key: 'method', label: 'pbw.reactiveMethodLabel', help: 'pbw.reactiveMethodTip',
        type: 'options', default: 'geofence_eval', required: true, testid: 'pb-cfg-reactive-method',
        options: [
          { name: 'pbw.reactiveMethodGeofence', value: 'geofence_eval' },
          { name: 'pbw.reactiveMethodThreshold', value: 'threshold_alarm' },
          { name: 'pbw.reactiveMethodEmitAlert', value: 'emit_alert' },
          { name: 'pbw.reactiveMethodNotify', value: 'notify' },
        ] },
      // geofence_eval: ponto (lat/lng) dentro das cercas ativas do tenant.
      { key: 'lat_field', label: 'pbw.reactiveLatLabel', help: 'pbw.reactiveLatTip',
        type: 'string', default: '{{ $json.lat }}', testid: 'pb-cfg-reactive-lat',
        placeholder: 'pbw.reactiveLatPlaceholder',
        displayOptions: { show: { method: ['geofence_eval'] } } },
      { key: 'lng_field', label: 'pbw.reactiveLngLabel', help: 'pbw.reactiveLngTip',
        type: 'string', default: '{{ $json.lng }}', testid: 'pb-cfg-reactive-lng',
        placeholder: 'pbw.reactiveLngPlaceholder',
        displayOptions: { show: { method: ['geofence_eval'] } } },
      // threshold_alarm: avalia as regras de alarme do nó contra o valor.
      { key: 'node_id', label: 'pbw.reactiveNodeIdLabel', help: 'pbw.reactiveNodeIdTip',
        type: 'string', default: '{{ $json.node_id }}', testid: 'pb-cfg-reactive-node-id',
        placeholder: 'pbw.reactiveNodeIdPlaceholder',
        displayOptions: { show: { method: ['threshold_alarm'] } } },
      { key: 'property_name', label: 'pbw.reactivePropertyLabel', help: 'pbw.reactivePropertyTip',
        type: 'string', default: '', testid: 'pb-cfg-reactive-property',
        placeholder: 'pbw.reactivePropertyPlaceholder',
        displayOptions: { show: { method: ['threshold_alarm'] } } },
      { key: 'value_field', label: 'pbw.reactiveValueLabel', help: 'pbw.reactiveValueTip',
        type: 'string', default: '{{ $json.value }}', testid: 'pb-cfg-reactive-value',
        placeholder: 'pbw.reactiveValuePlaceholder',
        displayOptions: { show: { method: ['threshold_alarm'] } } },
      // emit_alert: cria um Alert governado (kind/severidade/título/mensagem).
      { key: 'alert_kind', label: 'pbw.reactiveAlertKindLabel', help: 'pbw.reactiveAlertKindTip',
        type: 'string', default: 'dag', testid: 'pb-cfg-reactive-alert-kind',
        displayOptions: { show: { method: ['emit_alert'] } } },
      { key: 'severity', label: 'pbw.reactiveSeverityLabel', help: 'pbw.reactiveSeverityTip',
        type: 'options', default: 'medium', testid: 'pb-cfg-reactive-severity',
        options: [
          { name: 'pbw.reactiveSeverityLow', value: 'low' },
          { name: 'pbw.reactiveSeverityMedium', value: 'medium' },
          { name: 'pbw.reactiveSeverityHigh', value: 'high' },
          { name: 'pbw.reactiveSeverityCritical', value: 'critical' },
        ],
        displayOptions: { show: { method: ['emit_alert'] } } },
      { key: 'title', label: 'pbw.reactiveTitleLabel', help: 'pbw.reactiveTitleTip',
        type: 'string', default: '{{ $json.title }}', testid: 'pb-cfg-reactive-title',
        placeholder: 'pbw.reactiveTitlePlaceholder',
        displayOptions: { show: { method: ['emit_alert'] } } },
      { key: 'alert_message', label: 'pbw.reactiveAlertMsgLabel', help: 'pbw.reactiveAlertMsgTip',
        type: 'string', default: '', testid: 'pb-cfg-reactive-alert-msg', typeOptions: { rows: 2 },
        displayOptions: { show: { method: ['emit_alert'] } } },
      // notify: envia por um canal (log/webhook/whatsapp; config de rede = por-tenant).
      { key: 'channel', label: 'pbw.reactiveChannelLabel', help: 'pbw.reactiveChannelTip',
        type: 'options', default: 'log', testid: 'pb-cfg-reactive-channel',
        options: [
          { name: 'pbw.reactiveChannelLog', value: 'log' },
          { name: 'pbw.reactiveChannelWebhook', value: 'webhook' },
          { name: 'pbw.reactiveChannelWhatsapp', value: 'whatsapp' },
        ],
        displayOptions: { show: { method: ['notify'] } } },
      { key: 'to', label: 'pbw.reactiveToLabel', help: 'pbw.reactiveToTip',
        type: 'string', default: 'operations', testid: 'pb-cfg-reactive-to',
        placeholder: 'pbw.reactiveToPlaceholder',
        displayOptions: { show: { method: ['notify'] } } },
      { key: 'text', label: 'pbw.reactiveTextLabel', help: 'pbw.reactiveTextTip',
        type: 'string', default: '{{ $json.message }}', testid: 'pb-cfg-reactive-text', typeOptions: { rows: 2 },
        placeholder: 'pbw.reactiveTextPlaceholder',
        displayOptions: { show: { method: ['notify'] } } },
      // Comuns (todos os métodos): modo + coluna de saída + teto de linhas.
      { key: 'mode', label: 'pbw.correlateModeLabel', help: 'pbw.correlateModeTip',
        type: 'options', default: 'per_row', testid: 'pb-cfg-reactive-mode',
        options: [
          { name: 'pbw.correlateModePerRow', value: 'per_row' },
          { name: 'pbw.correlateModeOnce', value: 'once' },
        ] },
      { key: 'output', label: 'pbw.correlateOutputLabel', help: 'pbw.correlateOutputTip',
        type: 'string', default: 'reactive_output', testid: 'pb-cfg-reactive-output' },
      { key: 'max_rows', label: 'pbw.correlateMaxRowsLabel', help: 'pbw.correlateMaxRowsTip',
        type: 'number', default: 20, testid: 'pb-cfg-reactive-max-rows',
        typeOptions: { minValue: 1, maxValue: 50 } },
    ],
  },
  // ── Cluster AIP (root + sub-nós declaráveis) ──────────────────────────────
  aip_agent: {
    container: 'pb-cfg-aip-agent',
    labelKey: 'pbw.nodeAipAgent',
    hintKey: 'pbw.aipAgentHint',
    fields: [
      { key: 'prompt', label: 'pbw.aipAgentPromptLabel', help: 'pbw.aipAgentPromptTip',
        type: 'string', default: '', testid: 'pb-cfg-aip-prompt',
        placeholder: 'pbw.aipAgentPromptPlaceholder', typeOptions: { rows: 3 } },
      { key: 'system', label: 'pbw.aipAgentSystemLabel', help: 'pbw.aipAgentSystemTip',
        type: 'string', default: '', testid: 'pb-cfg-aip-system',
        placeholder: 'pbw.aipAgentSystemPlaceholder', typeOptions: { rows: 2 } },
      { key: 'output', label: 'pbw.aipAgentOutputLabel', help: 'pbw.aipAgentOutputTip',
        type: 'string', default: 'aip_output', testid: 'pb-cfg-aip-output' },
      { key: 'max_rows', label: 'pbw.aipAgentCapLabel', help: 'pbw.aipAgentCapTip',
        type: 'number', default: 20, testid: 'pb-cfg-aip-cap',
        typeOptions: { minValue: 1, maxValue: 50 } },
    ],
  },
  aip_memory: {
    container: 'pb-cfg-aip-memory',
    labelKey: 'pbw.nodeAipMemory',
    hintKey: 'pbw.aipMemoryHint',
    fields: [
      { key: 'window', label: 'pbw.aipMemoryWindowLabel', help: 'pbw.aipMemoryWindowTip',
        type: 'number', default: 10, testid: 'pb-cfg-aip-mem-window',
        typeOptions: { minValue: 1, maxValue: 50 } },
    ],
  },

  // ── Onda B — os 12 TOPS bespoke roteados pelo registro como `custom` ────────
  // Mesma técnica do batch 3 (transforms): o registro vira a fonte COMPLETA de
  // enumeração dos nós de TOPO (declarável = fields[]; bespoke = marker) e o
  // NodeConfig despacha o JSX rico por `spec.custom === op` em vez de comparar
  // `node.op === '...'` na mão. `fields` fica vazio — o componente próprio
  // segue sendo a fonte da edição (DOM idêntico byte-a-byte).
  source: { container: 'pb-cfg-source', labelKey: 'pbw.nodeSource', fields: [], custom: 'source' },
  trigger: { container: 'pb-cfg-trigger', labelKey: 'pbw.nodeTrigger', fields: [], custom: 'trigger' },
  note: { container: 'pb-cfg-note', labelKey: 'pbw.nodeNote', fields: [], custom: 'note' },
  output: { container: 'pb-cfg-output', labelKey: 'pbw.nodeOutput', fields: [], custom: 'output' },
  ontology_output: { container: 'pb-cfg-ontology-output', labelKey: 'pbw.nodeOutput', fields: [], custom: 'ontology_output' },
  if: { container: 'pb-cfg-if', labelKey: 'pbw.nodeIf', fields: [], custom: 'if' },
  switch: { container: 'pb-cfg-switch', labelKey: 'pbw.nodeSwitch', fields: [], custom: 'switch' },
  skill: { container: 'pb-cfg-skill', labelKey: 'pbw.nodeSkill', fields: [], custom: 'skill' },
  action: { container: 'pb-cfg-action', labelKey: 'pbw.nodeAction', fields: [], custom: 'action' },
  aip_model: { container: 'pb-cfg-aip-model', labelKey: 'pbw.nodeAipModel', fields: [], custom: 'aip_model' },
  aip_tools: { container: 'pb-cfg-aip-tools', labelKey: 'pbw.nodeAipTools', fields: [], custom: 'aip_tools' },
  aip_vector: { container: 'pb-cfg-aip-vector', labelKey: 'pbw.nodeAipVector', fields: [], custom: 'aip_vector' },
};

/**
 * Sub-registro dos TRANSFORM-ops declaráveis (batch 2b). Diferença do NODE_REGISTRY
 * de topo: estes vivem sob `op='transform'` com `c.op=<innerOp>` e editam
 * `config.args.*` (não `config` direto); o seletor de op (`pb-cfg-op`) permanece.
 * O `TransformConfig` consulta este registro PRIMEIRO; op ausente → switch bespoke.
 *
 * Só os DECLARÁVEIS entram. Ficam BESPOKE (serialização própria / pickers ricos):
 * filter/set/extract/join/sort/rename/agg/llm/code/loop/http_request/extract_file/
 * convert_file. Defaults batem 1:1 com `defaultArgsForTransform` (fonte única do seed).
 * Refs de coluna usam `column`/`column-multi` (loadOptions:'columns'); subworkflow
 * resolve `loadOptions:'boards'` (Quadros do provider, exceto o atual).
 */
export const TRANSFORM_REGISTRY: Record<string, NodeSpec> = {
  // ── Colunas ────────────────────────────────────────────────────────────────
  select: {
    container: 'pb-cfg-select',
    labelKey: 'pbw.op.select',
    fields: [
      { key: 'columns', label: 'pbw.columnsLabel', help: 'pbw.columnsTip', type: 'column-multi',
        testid: 'pb-cfg-columns', typeOptions: { loadOptions: 'columns' } },
    ],
  },
  dedupe: {
    container: 'pb-cfg-dedupe',
    labelKey: 'pbw.op.dedupe',
    fields: [
      { key: 'by', label: 'pbw.dedupeByLabel', help: 'pbw.dedupeByTip', type: 'column-multi',
        testid: 'pb-cfg-dedupe-by', typeOptions: { loadOptions: 'columns' } },
    ],
  },
  derive: {
    container: 'pb-cfg-derive',
    labelKey: 'pbw.op.derive',
    fields: [
      { key: 'name', label: 'pbw.deriveNameLabel', type: 'string', default: '',
        testid: 'pb-cfg-derive-name' },
      { key: 'inputs', label: 'pbw.deriveInputsLabel', help: 'pbw.deriveInputsTip', type: 'column-multi',
        testid: 'pb-cfg-derive-inputs', typeOptions: { loadOptions: 'columns' } },
    ],
  },
  // ── Data/limite ────────────────────────────────────────────────────────────
  datetime: {
    container: 'pb-cfg-datetime',
    labelKey: 'pbw.op.datetime',
    paletteLabelKey: 'pbw.nodeDateTime',
    fields: [
      { key: 'mode', label: 'pbw.datetimeModeLabel', help: 'pbw.datetimeModeTip', type: 'options',
        default: 'datetime', testid: 'pb-cfg-datetime-mode', options: [
          { name: 'pbw.datetimeModeDatetime', value: 'datetime' },
          { name: 'pbw.datetimeModeDate', value: 'date' },
          { name: 'pbw.datetimeModeTime', value: 'time' },
        ] },
      { key: 'output', label: 'pbw.datetimeOutputLabel', help: 'pbw.datetimeOutputTip', type: 'string',
        default: 'timestamp_utc', testid: 'pb-cfg-datetime-output' },
    ],
  },
  limit: {
    container: 'pb-cfg-limit',
    labelKey: 'pbw.op.limit',
    fields: [
      { key: 'count', label: 'pbw.limitCountLabel', help: 'pbw.limitCountTip', type: 'number',
        default: 100, testid: 'pb-cfg-limit-count', typeOptions: { minValue: 0 } },
      { key: 'offset', label: 'pbw.limitOffsetLabel', help: 'pbw.limitOffsetTip', type: 'number',
        default: 0, testid: 'pb-cfg-limit-offset', typeOptions: { minValue: 0 } },
    ],
  },
  splitout: {
    container: 'pb-cfg-splitout',
    labelKey: 'pbw.op.splitout',
    fields: [
      { key: 'field', label: 'pbw.splitoutFieldLabel', help: 'pbw.splitoutFieldTip', type: 'column',
        default: '', testid: 'pb-cfg-splitout-field', typeOptions: { loadOptions: 'columns' } },
      // placeholder estático 'item' (o antigo era dinâmico = nome do campo || 'item';
      // a parte dinâmica é inerente ao declarativo, como o subworkflow.board_id).
      { key: 'output', label: 'pbw.splitoutOutputLabel', help: 'pbw.splitoutOutputTip', type: 'string',
        default: '', testid: 'pb-cfg-splitout-output', placeholder: 'item' },
      { key: 'delimiter', label: 'pbw.splitoutDelimiterLabel', help: 'pbw.splitoutDelimiterTip', type: 'string',
        default: ',', testid: 'pb-cfg-splitout-delimiter' },
    ],
  },
  // ── Enriquecimento por coluna (crypto/html/xml/markdown) ────────────────────
  crypto: {
    container: 'pb-cfg-crypto',
    labelKey: 'pbw.op.crypto',
    fields: [
      { key: 'input', label: 'pbw.cryptoInputLabel', help: 'pbw.cryptoInputTip', type: 'column',
        default: '', testid: 'pb-cfg-crypto-input', typeOptions: { loadOptions: 'columns' } },
      { key: 'algo', label: 'pbw.cryptoAlgoLabel', help: 'pbw.cryptoAlgoTip', type: 'options',
        default: 'sha256', testid: 'pb-cfg-crypto-algo', options: [
          // rótulos literais (não-i18n) — `t()` devolve a chave no miss (paridade UI).
          { name: 'SHA-256', value: 'sha256' },
          { name: 'SHA-1', value: 'sha1' },
          { name: 'MD5', value: 'md5' },
        ] },
      { key: 'output', label: 'pbw.cryptoOutputLabel', help: 'pbw.cryptoOutputTip', type: 'string',
        default: 'hash', testid: 'pb-cfg-crypto-output' },
    ],
  },
  html: {
    container: 'pb-cfg-html',
    labelKey: 'pbw.op.html',
    fields: [
      { key: 'input', label: 'pbw.htmlInputLabel', help: 'pbw.htmlInputTip', type: 'column',
        default: '', testid: 'pb-cfg-html-input', typeOptions: { loadOptions: 'columns' } },
      { key: 'selector', label: 'pbw.htmlSelectorLabel', help: 'pbw.htmlSelectorTip', type: 'string',
        default: '', testid: 'pb-cfg-html-selector', placeholder: 'pbw.htmlSelectorPlaceholder' },
      // attr vazio == ausente no backend (`if attr` falsy → pega o texto).
      { key: 'attr', label: 'pbw.htmlAttrLabel', help: 'pbw.htmlAttrTip', type: 'string',
        default: '', testid: 'pb-cfg-html-attr', placeholder: 'href' },
      { key: 'output', label: 'pbw.htmlOutputLabel', help: 'pbw.htmlOutputTip', type: 'string',
        default: 'extraido', testid: 'pb-cfg-html-output' },
    ],
  },
  xml: {
    container: 'pb-cfg-xml',
    labelKey: 'pbw.op.xml',
    fields: [
      { key: 'input', label: 'pbw.xmlInputLabel', help: 'pbw.xmlInputTip', type: 'column',
        default: '', testid: 'pb-cfg-xml-input', typeOptions: { loadOptions: 'columns' } },
      { key: 'path', label: 'pbw.xmlPathLabel', help: 'pbw.xmlPathTip', type: 'string',
        default: '', testid: 'pb-cfg-xml-path', placeholder: './/name' },
      { key: 'attr', label: 'pbw.xmlAttrLabel', help: 'pbw.xmlAttrTip', type: 'string',
        default: '', testid: 'pb-cfg-xml-attr', placeholder: 'id' },
      { key: 'output', label: 'pbw.xmlOutputLabel', help: 'pbw.xmlOutputTip', type: 'string',
        default: 'extraido', testid: 'pb-cfg-xml-output' },
    ],
  },
  // Wave 2 — /geo referência → DAG: geometria GeoJSON (coluna) → geopoint {lat,lng}.
  geopoint: {
    container: 'pb-cfg-geopoint',
    labelKey: 'pbw.op.geopoint',
    hintKey: 'pbw.geopointHint',
    fields: [
      { key: 'input', label: 'pbw.geopointInputLabel', help: 'pbw.geopointInputTip', type: 'column',
        default: 'geometry', testid: 'pb-cfg-geopoint-input', typeOptions: { loadOptions: 'columns' } },
      { key: 'output', label: 'pbw.geopointOutputLabel', help: 'pbw.geopointOutputTip', type: 'string',
        default: 'geopoint', testid: 'pb-cfg-geopoint-output' },
    ],
  },
  markdown: {
    container: 'pb-cfg-markdown',
    labelKey: 'pbw.op.markdown',
    fields: [
      { key: 'input', label: 'pbw.markdownInputLabel', help: 'pbw.markdownInputTip', type: 'column',
        default: '', testid: 'pb-cfg-markdown-input', typeOptions: { loadOptions: 'columns' } },
      { key: 'mode', label: 'pbw.markdownModeLabel', help: 'pbw.markdownModeTip', type: 'options',
        default: 'text', testid: 'pb-cfg-markdown-mode', options: [
          { name: 'pbw.markdownModeText', value: 'text' },
          { name: 'pbw.markdownModeHtml', value: 'html' },
        ] },
      { key: 'output', label: 'pbw.markdownOutputLabel', help: 'pbw.markdownOutputTip', type: 'string',
        default: 'markdown', testid: 'pb-cfg-markdown-output' },
    ],
  },
  // ── Rede / composição ──────────────────────────────────────────────────────
  rss: {
    container: 'pb-cfg-rss',
    labelKey: 'pbw.op.rss',
    hintKey: 'pbw.rssHint',
    fields: [
      { key: 'url', label: 'pbw.rssUrlLabel', help: 'pbw.rssUrlTip', type: 'string',
        default: '', testid: 'pb-cfg-rss-url', placeholder: 'pbw.rssUrlPlaceholder' },
      { key: 'limit', label: 'pbw.rssLimitLabel', help: 'pbw.rssLimitTip', type: 'number',
        default: 20, testid: 'pb-cfg-rss-limit', typeOptions: { minValue: 1, maxValue: 100 } },
    ],
  },
  subworkflow: {
    container: 'pb-cfg-subworkflow',
    labelKey: 'pbw.op.subworkflow',
    hintKey: 'pbw.subworkflowHint',
    fields: [
      { key: 'board_id', label: 'pbw.subworkflowBoardLabel', help: 'pbw.subworkflowBoardTip', type: 'options',
        default: '', testid: 'pb-cfg-subworkflow-board', placeholder: 'pbw.subworkflowChooseBoard',
        typeOptions: { loadOptions: 'boards' } },
      // rótulo do checkbox = o hint histórico (o Field-label de topo some no renderer).
      { key: 'pass_rows', label: 'pbw.subworkflowPassHint', help: 'pbw.subworkflowPassTip', type: 'boolean',
        default: true, testid: 'pb-cfg-subworkflow-pass' },
    ],
  },
  // ── batch 3 — os 13 BESPOKE roteados pelo registro como `custom` ───────────
  // O registro vira a fonte COMPLETA de enumeração dos transform-ops (26). O
  // componente rico de cada um segue intacto no TransformConfig; o dispatch lá
  // passa a ler `spec.custom` em vez de comparar `op === '...'` na mão.
  filter: { container: 'pb-cfg-filter', labelKey: 'pbw.op.filter', fields: [], custom: 'filter' },
  set: { container: 'pb-cfg-set', labelKey: 'pbw.op.set', paletteLabelKey: 'pbw.nodeSet', fields: [], custom: 'set' },
  extract: { container: 'pb-cfg-extract', labelKey: 'pbw.op.extract', fields: [], custom: 'extract' },
  join: { container: 'pb-cfg-join', labelKey: 'pbw.op.join', fields: [], custom: 'join' },
  sort: { container: 'pb-cfg-sort', labelKey: 'pbw.op.sort', fields: [], custom: 'sort' },
  rename: { container: 'pb-cfg-rename', labelKey: 'pbw.op.rename', fields: [], custom: 'rename' },
  agg: { container: 'pb-cfg-agg', labelKey: 'pbw.op.agg', fields: [], custom: 'agg' },
  llm: { container: 'pb-cfg-llm', labelKey: 'pbw.op.llm', paletteLabelKey: 'pbw.nodeIA', fields: [], custom: 'llm' },
  code: { container: 'pb-cfg-code', labelKey: 'pbw.op.code', paletteLabelKey: 'pbw.nodeCodigo', fields: [], custom: 'code' },
  loop: { container: 'pb-cfg-loop', labelKey: 'pbw.op.loop', fields: [], custom: 'loop' },
  http_request: { container: 'pb-cfg-http', labelKey: 'pbw.op.httpRequest', fields: [], custom: 'http_request' },
  extract_file: { container: 'pb-cfg-extract-file', labelKey: 'pbw.op.extract_file', fields: [], custom: 'extract_file' },
  convert_file: { container: 'pb-cfg-convert-file', labelKey: 'pbw.op.convert_file', fields: [], custom: 'convert_file' },
};

/** Traduz as chaves i18n de um `fields[]` (label/help/placeholder/options[].name),
 *  recursando em `collection`. O renderer recebe texto já resolvido. */
export function localizeFields(
  fields: NodeFieldSpec[],
  t: (k: string) => string,
): NodeFieldSpec[] {
  return fields.map((f) => ({
    ...f,
    label: f.label ? t(f.label) : f.label,
    help: f.help ? t(f.help) : f.help,
    placeholder: f.placeholder ? t(f.placeholder) : f.placeholder,
    options: f.options?.map((o) => ({ ...o, name: t(o.name) })),
    typeOptions: f.typeOptions?.itemFields
      ? { ...f.typeOptions, itemFields: localizeFields(f.typeOptions.itemFields, t) }
      : f.typeOptions,
  }));
}

/**
 * Aditivo 7 — ORDEM canônica do dropdown de op de transform (`pb-cfg-op`).
 * A ordem é curadoria de UX (colunas→filtro→…→arquivos→subfluxo); os RÓTULOS
 * vêm do registro (fonte única). O teste de consistência exige que esta lista
 * cubra EXATAMENTE as chaves do TRANSFORM_REGISTRY — op nova sem entrada aqui
 * quebra no jest, não como no-op invisível no dropdown do operador.
 */
export const TRANSFORM_OP_ORDER = [
  'select', 'filter', 'set', 'datetime', 'extract', 'splitout', 'join', 'sort',
  'dedupe', 'limit', 'derive', 'rename', 'agg', 'llm', 'code', 'loop',
  'crypto', 'html', 'xml', 'rss', 'http_request', 'markdown', 'geopoint',
  'extract_file', 'convert_file', 'subworkflow',
] as const;

/** Dropdown de ops DERIVADO do registro (substitui o TRANSFORM_OPTIONS literal). */
export const TRANSFORM_SELECT_OPTIONS: ReadonlyArray<{ op: string; labelKey: string }> =
  TRANSFORM_OP_ORDER.map((op) => {
    const spec = TRANSFORM_REGISTRY[op];
    if (!spec) throw new Error(`TRANSFORM_OP_ORDER: op fora do registro: ${op}`);
    return { op, labelKey: spec.labelKey };
  });

/** Rótulo de PALETTE de um op (paletteLabelKey vence o canônico). */
export function paletteLabelKeyFor(op: string, inner?: string): string {
  const spec = inner ? TRANSFORM_REGISTRY[inner] : NODE_REGISTRY[op];
  const key = spec?.paletteLabelKey ?? spec?.labelKey;
  if (!key) throw new Error(`labelKey ausente no registro: ${inner ?? op}`);
  return key;
}
