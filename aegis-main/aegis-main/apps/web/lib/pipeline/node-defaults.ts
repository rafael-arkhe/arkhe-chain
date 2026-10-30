/**
 * A4/A5 (DAG não-linear) — defaults de config por op, FONTE ÚNICA.
 *
 * Antes havia 2 cópias divergentes (defaultNodeConfig no pipeline-board +
 * defaultTransformArgs no PipelineCanvas — esta sem o caso 'loop'). Vive em
 * lib/pipeline/* porque o pipeline-board NÃO pode importar símbolos novos do
 * módulo PipelineCanvas (os testes mockam o módulo inteiro). Puro → testável.
 */

/** Ops de FLUXO (topo, não innerOp de transform) — espelha o backend v23.
 * Onda 2 (A4): + compare (Compare Datasets, 4 portas de saída). */
export const FLOW_OPS: ReadonlySet<string> = new Set(['if', 'switch', 'merge', 'wait', 'stop_error', 'compare']);

/** Args default por op INTERNO de transform (cfg.op). */
export function defaultArgsForTransform(op: string): Record<string, unknown> {
  // inc3 — filtro nasce com o operador pré-definido (op='eq'): o guard do backend
  // exige campo+operador; sem isto o 'eq' aparecia no select mas não persistia.
  if (op === 'filter') return { predicate: { op: 'eq', value: '' } };
  if (op === 'set') return { fields: [{ key: '', value: '', type: 'text' }] };
  if (op === 'datetime') return { output: 'timestamp_utc', mode: 'datetime' };
  if (op === 'limit') return { count: 100, offset: 0 };
  if (op === 'splitout') return { field: '', output: '', delimiter: ',' };
  // S5 — lote default 100 (era 1): o corpo do loop roda transiente no backend
  // (sem run/versão por lote), mas lote 1 ainda é 1 invocação do motor POR
  // LINHA. Espelha o fallback do backend (pipelines._apply_step_loop_over).
  if (op === 'loop') return { batch_size: 100, annotate: false };
  // Onda 2 (A4) — steps essenciais novos (contrato do backend, não invente shapes):
  if (op === 'crypto') return { input: '', algo: 'sha256', output: 'hash' };
  if (op === 'html') return { input: '', selector: '', output: 'extraido' };
  if (op === 'xml') return { input: '', path: '', output: 'extraido' };
  if (op === 'rss') return { url: '', limit: 20 };
  if (op === 'http_request') return { url: '', method: 'GET', mode: 'per_row', output: 'resposta', parse: 'text' };
  // Onda 3 (A6) — mídia/arquivos + subfluxo (contrato do backend, não invente shapes):
  if (op === 'markdown') return { input: '', mode: 'text', output: 'markdown' };
  // Wave 2 — /geo referência → DAG: geometria GeoJSON → geopoint {lat,lng}.
  if (op === 'geopoint') return { input: 'geometry', output: 'geopoint' };
  if (op === 'extract_file') return { media_set: '', item: '', format: 'csv' };
  if (op === 'convert_file') return { media_set: '', filename: '', format: 'csv', gzip: false };
  if (op === 'subworkflow') return { board_id: '', pass_rows: true };
  return {};
}

/** Config default por op de TOPO (source/output/trigger/note/fluxo/transform). */
export function defaultNodeConfig(op: string, innerOp?: string): Record<string, unknown> {
  const transformOp = innerOp || 'select';
  return op === 'source' ? { dataset: '' }
    : op === 'output' || op === 'ontology_output' ? { target_node_type: '', id_field: '' }
    : op === 'trigger' ? { trigger_kind: 'manual' }
    : op === 'note' ? { note_text: '' }
    // A4/A5 — ops de fluxo (contrato do backend, não invente shapes):
    : op === 'if' ? { predicate: { path: '', op: 'eq', value: '' } }
    : op === 'switch' ? { rules: [{ name: 'caso1', predicate: { path: '', op: 'eq', value: '' } }] }
    : op === 'merge' ? { mode: 'append' }
    : op === 'wait' ? { seconds: 5 }
    : op === 'stop_error' ? { message: '' }
    // Onda 2 (A4) — compare: chave de casamento; 1ª aresta = lado A, demais = B.
    : op === 'compare' ? { key: '' }
    // A4 onda 4 — cluster AIP. Root roda por-linha via run_with_tools; sub-nodes
    // (modelo/ferramentas) alimentam o root pelas portas ai_*. O modelo grava
    // catalog_id (seleção do UI) + model_slug + provider REAIS (fix BYOM).
    : op === 'aip_agent' ? { prompt: '', output: 'aip_output', system: '', max_rows: 20 }
    : op === 'aip_model' ? { catalog_id: '', model: '', provider: '', temperature: 0.2, max_iterations: 3 }
    : op === 'aip_tools' ? { tools: [] }
    // 4b — memória run-scoped (janela em turnos) + base vetorial (RAG por linha).
    : op === 'aip_memory' ? { window: 10 }
    : op === 'aip_vector' ? { collection: '', top_k: 5 }
    // Wave 1 inc1 — nó de CAPACIDADE (skill/tool): despacha registry.get(skill_key)
    // .run(ctx) no DAG. innerOp carrega o skill_key pré-selecionado da palette.
    // mode 'per_row' (enriquece cada linha) | 'once' (roda 1× e produz linhas).
    : op === 'skill' ? { skill_key: innerOp || '', params: {}, mode: 'per_row', output: 'skill_output', max_rows: 20 }
    // Wave 1 inc6 — nó de AÇÃO: despacha dispatch_action(code_ref, input) por linha
    // (fecha o ciclo AGIR). code_ref vem de um ActionType escolhido no picker.
    : op === 'action' ? { code_ref: '', params: {}, mode: 'per_row', output: 'action_output', max_rows: 20 }
    // Wave 2 — nó de CORRELAÇÃO: despacha um motor de correlação (method) por linha,
    // reusando o serviço existente. Nasce no método 'chain' (multi-hop); os demais
    // campos são preenchidos pelo backend (defaults autoritativos) ao trocar de método.
    : op === 'correlate' ? { method: 'chain', mode: 'per_row', output: 'correlate_output', max_rows: 20, seed_value: '{{ $json.value }}', max_depth: 2, budget_nodes: 40 }
    // Wave 2 — nó REATIVO: despacha um motor de /alertas·/cercas (geofence_eval/
    // threshold_alarm/emit_alert/notify) por linha. Nasce em 'geofence_eval' (cerca).
    : op === 'reactive' ? { method: 'geofence_eval', mode: 'per_row', output: 'reactive_output', max_rows: 20, lat_field: '{{ $json.lat }}', lng_field: '{{ $json.lng }}' }
    : { op: transformOp, args: defaultArgsForTransform(transformOp) };
}
