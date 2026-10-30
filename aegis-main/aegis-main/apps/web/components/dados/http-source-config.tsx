'use client';

/**
 * HttpSourceConfig (Fase 3a/3b · overhaul DAG n8n) — o nó Fonte no modo CONECTOR/HTTP.
 *
 * Absorve no canvas o "criar fonte / dataset / upload" (a dor do operador):
 *  - **URL pública** (GET anti-SSRF) ou **amostra colada** → `sync/preview` (3a);
 *  - **Conector configurado** (auth + paginação reais) → `Connectors.sample` (3b):
 *    roda a chamada AUTENTICADA em modo amostra (sem persistir) COM o segredo do
 *    Vault, e o "Gerar dataset" faz um **puxão REAL capado** (`Connectors.materialize`)
 *    → SNAPSHOT governado. O segredo nunca aparece aqui (vive no binding/Vault).
 *
 * "Testar chamada" → response vira **árvore de campos selecionável** → "Gerar dataset"
 * (só os campos selecionados, "keep only set") → o nó passa a apontar p/ o dataset.
 * i18n via useT(); proibido diálogo nativo (msg inline) / input técnico manual (picker).
 */
import * as React from 'react';
import { Loader2, PlayCircle, Boxes, CheckCircle2, AlertCircle, Plug, Plus, Trash2 } from 'lucide-react';

import { Connectors, Datasets, type SyncSchemaField, type ConnectorAgent } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { slugify } from '@/lib/slug';

import { SchemaFieldTree } from './schema-field-tree';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
// html = raspar página server-rendered (SISCAM das câmaras) via serializer no-code abaixo.
const FORMATS = ['json', 'jsonl', 'csv', 'xml', 'html'] as const;

/** Campo do serializer HTML: chave lógica → seletor CSS (+ attr/contains/regex opcionais). */
type HtmlField = { key: string; selector: string; attr?: string; contains?: string; regex?: string };
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
// Teto de páginas do "Gerar dataset" (puxão capado) — dropdown, nunca número cru.
const PAGE_CAPS = [5, 10, 20, 50] as const;
const SOURCE_SCHEDULE_PRESETS: ReadonlyArray<{ v: string; labelKey: string }> = [
  { v: '', labelKey: 'pbw.schedManual' },
  { v: '15min', labelKey: 'pbw.sched15min' },
  { v: 'hourly', labelKey: 'pbw.schedHourly' },
  { v: '6h', labelKey: 'pbw.sched6h' },
  { v: 'daily', labelKey: 'pbw.schedDaily' },
];

/** A skill efetiva de um conector (connector.http e família); nunca texto livre. */
function connSkillKey(a: ConnectorAgent): string {
  return (a.skill_keys ?? []).find((k) => k.startsWith('connector.')) ?? 'connector.http';
}

type Mode = 'url' | 'sample' | 'connector';

export function HttpSourceConfig({
  config,
  set,
}: {
  config: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [format, setFormat] = React.useState(String(config.format ?? 'json'));
  const [mode, setMode] = React.useState<Mode>(config.connector_agent_id ? 'connector' : 'url');
  const [sourceUrl, setSourceUrl] = React.useState(String(config.source_url ?? ''));
  const [method, setMethod] = React.useState(String(config.method ?? 'GET').toUpperCase());
  const [headersText, setHeadersText] = React.useState(formatHeaders((config.headers as Record<string, unknown> | undefined) ?? {}));
  const [requestBody, setRequestBody] = React.useState(String(config.request_body ?? ''));
  const [sample, setSample] = React.useState('');
  // modo conector (3b)
  const [connectors, setConnectors] = React.useState<ConnectorAgent[] | null>(null);
  const [connId, setConnId] = React.useState(String(config.connector_agent_id ?? ''));
  const [maxPages, setMaxPages] = React.useState(10);
  const [authSummary, setAuthSummary] = React.useState('');
  const [progress, setProgress] = React.useState<{ page: number; max: number; rows: number } | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<{ schema: SyncSchemaField[]; sample_rows: Record<string, unknown>[] } | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [dsName, setDsName] = React.useState(String(config.dataset ?? ''));
  const [generating, setGenerating] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  // D6 — serializer HTML no-code (row_selector + fields). Hidrata de config.options.
  const _initOpts = (config.options as Record<string, unknown> | undefined) ?? {};
  const [rowSelector, setRowSelector] = React.useState(String(_initOpts.row_selector ?? ''));
  const [htmlFields, setHtmlFields] = React.useState<HtmlField[]>(
    Array.isArray(_initOpts.fields) && (_initOpts.fields as unknown[]).length > 0
      ? (_initOpts.fields as HtmlField[])
      : [{ key: '', selector: '' }],
  );
  const setField = (i: number, patch: Partial<HtmlField>) =>
    setHtmlFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addField = () => setHtmlFields((fs) => [...fs, { key: '', selector: '' }]);
  const removeField = (i: number) => setHtmlFields((fs) => (fs.length > 1 ? fs.filter((_, j) => j !== i) : fs));
  // Serializer options canônicas (só campos com chave+seletor; opcionais omitidos se vazios).
  const htmlOptions = React.useMemo(() => ({
    row_selector: rowSelector.trim(),
    fields: htmlFields
      .filter((f) => f.key.trim() && f.selector.trim())
      .map((f) => ({
        key: f.key.trim(),
        selector: f.selector.trim(),
        ...(f.attr?.trim() ? { attr: f.attr.trim() } : {}),
        ...(f.contains?.trim() ? { contains: f.contains.trim() } : {}),
        ...(f.regex?.trim() ? { regex: f.regex.trim() } : {}),
      })),
  }), [rowSelector, htmlFields]);

  const linkedDataset = String(config.dataset ?? '');

  // Conectores JÁ configurados (lazy — só quando o operador entra no modo conector).
  React.useEffect(() => {
    if (mode !== 'connector' || connectors !== null) return;
    Connectors.list()
      .then((rows) => setConnectors(rows.filter((a) => (a.skill_keys ?? []).some((k) => k.startsWith('connector.')))))
      .catch(() => setConnectors([]));
  }, [mode, connectors]);

  const selectedConn = connectors?.find((a) => a.id === connId) ?? null;
  const skillKey = selectedConn ? connSkillKey(selectedConn) : 'connector.http';

  // Resumo READ-ONLY de auth/paginação herdado do binding (sem editar no nó).
  React.useEffect(() => {
    if (mode !== 'connector' || !connId) { setAuthSummary(''); return; }
    let alive = true;
    Connectors.bindings(connId)
      .then((bs) => {
        const b = bs.find((x) => (x.skill_key ?? '').startsWith('connector.')) ?? bs[0];
        const cfg = (b?.config ?? {}) as Record<string, unknown>;
        const auth = ((cfg.auth as Record<string, unknown>)?.mode as string) ?? 'none';
        const pag = ((cfg.pagination as Record<string, unknown>)?.mode as string) ?? 'none';
        if (alive) setAuthSummary(`${t('httpSrc.authLabel')}: ${auth} · ${t('httpSrc.pagLabel')}: ${pag}`);
      })
      .catch(() => { if (alive) setAuthSummary(''); });
    return () => { alive = false; };
  }, [mode, connId, t]);

  const test = React.useCallback(async () => {
    setTesting(true);
    setMsg(null);
    setResult(null);
    try {
      let r: { schema: SyncSchemaField[]; sample_rows: Record<string, unknown>[]; row_count: number };
      if (mode === 'connector') {
        if (!connId) { setMsg({ ok: false, text: t('httpSrc.pickConnector') }); setTesting(false); return; }
        r = await Connectors.sample(connId, skillKey);
        if (!dsName.trim() && selectedConn) setDsName(`fonte_${slugify(selectedConn.slug || selectedConn.display_name)}`);
      } else {
        const htmlOpts = format === 'html' ? htmlOptions : undefined;
        const body = mode === 'url'
          ? buildPreviewBody({ format, sourceUrl: sourceUrl.trim(), method, headersText, requestBody, options: htmlOpts })
          : { format, sample, ...(htmlOpts ? { options: htmlOpts } : {}) };
        r = await Connectors.syncPreview(body);
        if (!dsName.trim()) setDsName(suggestName(mode === 'url' ? sourceUrl : ''));
      }
      setResult({ schema: r.schema, sample_rows: r.sample_rows });
      setSelected(r.schema.map((f) => f.key)); // default: tudo marcado (n8n)
      setMsg({ ok: true, text: `${r.row_count} ${t('httpSrc.rowsInferred')}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('httpSrc.testErr') });
    } finally {
      setTesting(false);
    }
  }, [mode, format, sourceUrl, method, headersText, requestBody, sample, dsName, connId, skillKey, selectedConn, htmlOptions, t]);

  const generate = React.useCallback(async () => {
    if (!result) return;
    const name = slugify(dsName.trim());
    if (!name) { setMsg({ ok: false, text: t('httpSrc.nameRequired') }); return; }
    if (selected.length === 0) { setMsg({ ok: false, text: t('httpSrc.pickField') }); return; }
    setGenerating(true);
    setMsg(null);
    try {
      if (mode === 'connector') {
        // Puxão REAL capado no backend → projeta os campos selecionados →
        // SNAPSHOT versionado/governado (o segredo do Vault fica no servidor).
        const onOk = (rows: number, truncated: boolean) => {
          set({
            kind: 'http', dataset: name, connector_agent_id: connId,
            connector_skill_key: skillKey, format, fields: selected, max_pages: maxPages,
          });
          const tail = truncated ? ` — ${t('httpSrc.truncated')}` : '';
          setMsg({ ok: true, text: `${t('httpSrc.generated')} '${name}' (${rows} ${t('httpSrc.rows')}${tail}).` });
        };
        if (typeof EventSource !== 'undefined') {
          // SSE: barra de progresso REAL por página (hello → page×N → done).
          setProgress({ page: 0, max: maxPages, rows: 0 });
          const streamUrl = Connectors.materializeStreamUrl(
            connId, skillKey, { dataset: name, fields: selected, max_pages: maxPages });
          await new Promise<void>((resolve) => {
            const es = new EventSource(streamUrl, { withCredentials: true });
            let settled = false;
            const finish = () => { if (!settled) { settled = true; es.close(); resolve(); } };
            es.addEventListener('page', (e: MessageEvent) => {
              try {
                const p = JSON.parse(e.data);
                setProgress({ page: p.page ?? 0, max: maxPages, rows: p.rows ?? 0 });
              } catch { /* ignora linha parcial */ }
            });
            es.addEventListener('done', (e: MessageEvent) => {
              try {
                const d = JSON.parse(e.data);
                if (d.status === 'OK') onOk(d.rows ?? 0, !!d.truncated);
                else setMsg({ ok: false, text: d.error || t('httpSrc.genErr') });
              } catch { setMsg({ ok: false, text: t('httpSrc.genErr') }); }
              finish();
            });
            es.onerror = () => { if (!settled) { setMsg({ ok: false, text: t('httpSrc.genErr') }); finish(); } };
          });
        } else {
          // Fallback sem EventSource (jsdom/SSR): POST bloqueante.
          const r = await Connectors.materialize(
            connId, { dataset: name, fields: selected, max_pages: maxPages }, skillKey);
          onOk(r.rows, r.truncated);
        }
      } else {
        // só os campos SELECIONADOS, na ordem do schema (estilo "Keep only set").
        const rows = result.sample_rows.map((row) => {
          const out: Record<string, unknown> = {};
          for (const k of selected) out[k] = row[k];
          return out;
        });
        const tx = await Datasets.beginTransaction(name, 'SNAPSHOT', 'main');
        const committed = await Datasets.commitTransaction(name, tx.id, { payload: { rows } });
        if (!committed.status || committed.status === 'COMMITTED') {
          set({
            kind: 'http', dataset: name, source_url: mode === 'url' ? sourceUrl.trim() : '', format,
            // HTML: grava as opções do serializer no nó → o RE-PULL público
            // (_repull_public_http_sources) raspa a fonte com os MESMOS seletores.
            ...(format === 'html' ? { options: htmlOptions } : {}),
            ...(mode === 'url' ? buildSourcePatch({ method, headersText, requestBody }) : {}),
          });
          setMsg({ ok: true, text: `${t('httpSrc.generated')} '${name}' (${rows.length} ${t('httpSrc.rows')}).` });
        } else {
          setMsg({ ok: false, text: `${committed.status}: ${committed.error || t('httpSrc.genErr')}` });
        }
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('httpSrc.genErr') });
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, [result, dsName, selected, mode, sourceUrl, format, method, headersText, requestBody, connId, skillKey, maxPages, htmlOptions, set, t]);

  const testDisabled =
    testing ||
    (mode === 'url' ? !sourceUrl.trim() : mode === 'sample' ? !sample.trim() : !connId);

  return (
    <div className="space-y-2" data-testid="http-source-config">
      {linkedDataset && (
        <p className="flex items-center gap-1.5 text-[10px] text-success" data-testid="http-src-linked">
          <Boxes className="w-3 h-3" strokeWidth={1.75} aria-hidden />
          {t('httpSrc.linkedPrefix')} <span className="font-mono">{linkedDataset}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] text-muted-on-light">
          {t('httpSrc.format')}
          <select value={format} data-testid="http-src-format" onChange={(e) => setFormat(e.target.value)} className={INP}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-muted-on-light">
          {t('httpSrc.mode')}
          <select value={mode} data-testid="http-src-mode" onChange={(e) => setMode(e.target.value as Mode)} className={INP}>
            <option value="url">{t('httpSrc.modeUrl')}</option>
            <option value="sample">{t('httpSrc.modeSample')}</option>
            <option value="connector">{t('httpSrc.modeConnector')}</option>
          </select>
        </label>
      </div>

      {mode === 'url' && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[90px_1fr] gap-1.5">
            <label className="text-[10px] text-muted-on-light">
              {t('httpSrc.method')}
              <select value={method} data-testid="http-src-method" onChange={(e) => setMethod(e.target.value)} className={INP}>
                {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-muted-on-light">
              {t('httpSrc.url')}
              <input
                type="text" data-testid="http-src-url" value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)} className={INP}
                placeholder={t('httpSrc.urlPlaceholder')}
              />
            </label>
          </div>
          <label className="block text-[10px] text-muted-on-light">
            {t('httpSrc.headers')}
            <textarea
              data-testid="http-src-headers" value={headersText}
              onChange={(e) => setHeadersText(e.target.value)} rows={2}
              className={INP + ' h-auto py-1 font-mono resize-y'}
              placeholder={t('httpSrc.headersPlaceholder')}
            />
          </label>
          {method !== 'GET' && method !== 'DELETE' && (
            <label className="block text-[10px] text-muted-on-light">
              {t('httpSrc.body')}
              <textarea
                data-testid="http-src-body" value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)} rows={4}
                className={INP + ' h-auto py-1 font-mono resize-y'}
                placeholder={t('httpSrc.bodyPlaceholder')}
              />
            </label>
          )}
        </div>
      )}
      {mode === 'sample' && (
        <textarea
          data-testid="http-src-sample" value={sample}
          onChange={(e) => setSample(e.target.value)} rows={4}
          className={INP + ' h-auto py-1 font-mono resize-y'}
          placeholder={t('httpSrc.samplePlaceholder')}
        />
      )}
      {mode === 'connector' && (
        <div className="space-y-1.5">
          <select
            value={connId} data-testid="http-src-connector"
            onChange={(e) => { setConnId(e.target.value); setResult(null); }}
            className={INP}
          >
            <option value="">{t('httpSrc.pickConnector')}</option>
            {(connectors ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.display_name || a.slug}</option>
            ))}
          </select>
          {connId && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-on-light" data-testid="http-src-auth-summary">
              <Plug className="w-3 h-3" strokeWidth={1.75} aria-hidden />
              {authSummary || t('httpSrc.inheritedHint')}
            </p>
          )}
        </div>
      )}

      {mode === 'connector' && linkedDataset && connId && (
        <label className="block text-[10px] text-muted-on-light">
          {t('httpSrc.repullSchedule')}
          <select
            value={String(config.schedule_preset ?? '')}
            data-testid="http-src-schedule"
            onChange={(e) => set({ schedule_preset: e.target.value || null })}
            className={INP}
          >
            {SOURCE_SCHEDULE_PRESETS.map((p) => (
              <option key={p.v || 'manual'} value={p.v}>{t(p.labelKey)}</option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] text-muted-on-light">{t('httpSrc.repullScheduleHint')}</span>
        </label>
      )}

      {format === 'html' && mode !== 'connector' && (
        <div className="space-y-1.5 border border-border-light p-2 bg-canvas-light" data-testid="http-src-html">
          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{t('httpSrc.htmlEditor')}</p>
          <p className="text-[10px] text-muted-on-light leading-snug">{t('httpSrc.htmlHint')}</p>
          <label className="block text-[10px] text-muted-on-light">
            {t('httpSrc.htmlRowSelector')}
            <input
              type="text" data-testid="http-src-html-rowsel" value={rowSelector}
              onChange={(e) => setRowSelector(e.target.value)} className={INP + ' font-mono'}
              placeholder={t('httpSrc.htmlRowSelectorPlaceholder')}
            />
          </label>
          <p className="text-[10px] text-muted-on-light">{t('httpSrc.htmlFields')}</p>
          <div className="space-y-1.5">
            {htmlFields.map((f, i) => (
              <div key={i} className="space-y-1 border border-border-light/60 p-1.5" data-testid={`http-src-html-field-${i}`}>
                <div className="grid grid-cols-[1fr_1.4fr_28px] gap-1">
                  <input value={f.key} onChange={(e) => setField(i, { key: e.target.value })}
                    className={INP} placeholder={t('httpSrc.htmlKey')} data-testid={`http-src-html-key-${i}`} />
                  <input value={f.selector} onChange={(e) => setField(i, { selector: e.target.value })}
                    className={INP + ' font-mono'} placeholder={t('httpSrc.htmlSelector')} data-testid={`http-src-html-sel-${i}`} />
                  <button type="button" onClick={() => removeField(i)} aria-label={t('httpSrc.htmlRemoveField')}
                    className="h-7 w-7 flex items-center justify-center border border-border-light text-muted-on-light hover:border-danger hover:text-danger">
                    <Trash2 className="w-3 h-3" strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <input value={f.attr ?? ''} onChange={(e) => setField(i, { attr: e.target.value })}
                    className={INP + ' font-mono'} placeholder={t('httpSrc.htmlAttr')} />
                  <input value={f.contains ?? ''} onChange={(e) => setField(i, { contains: e.target.value })}
                    className={INP + ' font-mono'} placeholder={t('httpSrc.htmlContains')} />
                  <input value={f.regex ?? ''} onChange={(e) => setField(i, { regex: e.target.value })}
                    className={INP + ' font-mono'} placeholder={t('httpSrc.htmlRegex')} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addField} data-testid="http-src-html-add"
            className="h-7 px-2 text-[10px] flex items-center gap-1 border border-border-light text-muted-on-light hover:border-primary hover:text-primary">
            <Plus className="w-3 h-3" strokeWidth={1.75} aria-hidden />{t('httpSrc.htmlAddField')}
          </button>
        </div>
      )}

      <button
        type="button" onClick={test} disabled={testDisabled}
        data-testid="http-src-test"
        className="h-7 px-3 w-full text-[11px] flex items-center justify-center gap-1.5 bg-primary text-white disabled:opacity-50"
      >
        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <PlayCircle className="w-3.5 h-3.5" strokeWidth={2} />}
        {t('httpSrc.testCall')}
      </button>

      {msg && (
        <p className={'flex items-center gap-1.5 text-[10px] ' + (msg.ok ? 'text-success' : 'text-danger')} role="status" data-testid="http-src-msg">
          {msg.ok ? <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} /> : <AlertCircle className="w-3 h-3" strokeWidth={1.75} />}
          {msg.text}
        </p>
      )}

      {result && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light">{t('httpSrc.pickFields')}</p>
          <SchemaFieldTree fields={result.schema} selected={selected} onChange={setSelected} sampleRows={result.sample_rows} />
          <input
            type="text" data-testid="http-src-dsname" value={dsName}
            onChange={(e) => setDsName(e.target.value)} className={INP}
            placeholder={t('httpSrc.datasetNamePlaceholder')}
          />
          {mode === 'connector' && (
            <label className="block text-[10px] text-muted-on-light">
              {t('httpSrc.pageLimit')}
              <select
                value={maxPages} data-testid="http-src-maxpages"
                onChange={(e) => setMaxPages(Number(e.target.value))} className={INP}
              >
                {PAGE_CAPS.map((n) => (
                  <option key={n} value={n}>{n} {t('httpSrc.pagesUnit')}</option>
                ))}
              </select>
            </label>
          )}
          {mode === 'connector' && generating && progress && (
            <div data-testid="http-src-progress" className="space-y-1">
              {/* barra REAL dirigida pelos eventos SSE por página (cantos retos) */}
              <div className="w-full h-1.5 bg-border-light">
                <div className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, Math.round((progress.page / Math.max(1, progress.max)) * 100))}%` }} />
              </div>
              <p className="text-[10px] text-muted-on-light font-mono">
                {t('httpSrc.pulling')} {progress.page}/{progress.max} · {progress.rows} {t('httpSrc.rows')}
              </p>
            </div>
          )}
          <button
            type="button" onClick={generate} disabled={generating || selected.length === 0 || !dsName.trim()}
            data-testid="http-src-generate"
            className="h-7 px-3 w-full text-[11px] flex items-center justify-center gap-1.5 border border-border-light bg-white disabled:opacity-50 hover:border-primary"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Boxes className="w-3.5 h-3.5" strokeWidth={1.75} />}
            {t('httpSrc.generateDataset')}
          </button>
        </div>
      )}
    </div>
  );
}

function formatHeaders(headers: Record<string, unknown>): string {
  return Object.entries(headers)
    .filter(([k, v]) => k.trim() && v != null && String(v).trim())
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n');
}

function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function buildPreviewBody({
  format,
  sourceUrl,
  method,
  headersText,
  requestBody,
  options,
}: {
  format: string;
  sourceUrl: string;
  method: string;
  headersText: string;
  requestBody: string;
  options?: Record<string, unknown>;
}) {
  const headers = parseHeaders(headersText);
  return {
    format,
    source_url: sourceUrl,
    ...(options ? { options } : {}),
    ...(method !== 'GET' ? { method } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(method !== 'GET' && method !== 'DELETE' && requestBody.trim() ? { request_body: requestBody } : {}),
  };
}

function buildSourcePatch({ method, headersText, requestBody }: { method: string; headersText: string; requestBody: string }) {
  const headers = parseHeaders(headersText);
  return {
    ...(method !== 'GET' ? { method } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(method !== 'GET' && method !== 'DELETE' && requestBody.trim() ? { request_body: requestBody } : {}),
  };
}

/** Sugere um nome de dataset a partir do host da URL (label amigável, não técnico). */
function suggestName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    return host ? `fonte_${host}` : 'fonte_http';
  } catch {
    return 'fonte_http';
  }
}
