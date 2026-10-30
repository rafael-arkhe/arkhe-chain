'use client';

/**
 * ConnectorRegistrationForm — formulário de cadastro de conector HTTP.
 *
 * Extraído de conectores-workspace.tsx (Fase 5B). Catalog-driven: skill do
 * catálogo real, form HTTP rico para connector.http, SchemaForm dinâmico para
 * outras skills. Inclui auth, paginação, query params, serializer/sync preview.
 *
 * Régua: cantos retos, #2D77BE único acento, useT() pt-BR+en-US.
 */
import * as React from 'react';
import {
  Plus, Loader2, ScanSearch, AlertCircle, X,
} from 'lucide-react';

import { SecretRefSelect } from '@/components/dados/secret-ref-select';
import { InfoTip } from '@/components/ui/info-tip';
import { DynamicRefSelect } from '@/components/ui/param-ref-select';
import { MarkingsSelect } from '@/components/ui/markings-select';
import { SchemaForm } from '@/components/ui/schema-form';
import { useT } from '@/lib/i18n/provider';
import { skillDesc, skillLabel } from '@/lib/i18n/skill-labels';
import {
  Connectors, Skills,
  type SyncPreviewResult,
  type SkillCatalogRow, type SkillParam,
} from '@/lib/api';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
const SERIALIZER_FORMATS = ['json', 'jsonl', 'csv', 'xml'] as const;
const HTTP_SKILL = 'connector.http';

const AUTH_MODES = [
  { v: 'none', labelKey: 'conectores.auth.none' },
  { v: 'api_key', labelKey: 'conectores.auth.api_key' },
  { v: 'api_key_query', labelKey: 'conectores.auth.api_key_query' },
  { v: 'bearer', labelKey: 'conectores.auth.bearer' },
  { v: 'basic', labelKey: 'conectores.auth.basic' },
  { v: 'oauth2_cc', labelKey: 'conectores.auth.oauth2_cc' },
];

const CRON = [
  { v: '', labelKey: 'conectores.cron.manual' },
  { v: '1min', labelKey: 'conectores.cron.1min' },
  { v: '2min', labelKey: 'conectores.cron.2min' },
  { v: '5min', labelKey: 'conectores.cron.5min' },
  { v: '15min', labelKey: 'conectores.cron.15min' },
  { v: '30min', labelKey: 'conectores.cron.30min' },
  { v: 'hourly', labelKey: 'conectores.cron.hourly' },
  { v: '2h', labelKey: 'conectores.cron.2h' },
  { v: '6h', labelKey: 'conectores.cron.6h' },
  { v: '12h', labelKey: 'conectores.cron.12h' },
  { v: 'daily', labelKey: 'conectores.cron.daily' },
];

const PAGINATION_MODES = ['none', 'page', 'offset', 'cursor', 'link'] as const;
const NUM_PARAM_TYPES = new Set(['int', 'float', 'integer', 'number']);

function isConnectorSkill(k: string): boolean {
  return k.startsWith('connector.') || k === 'camera.detect_tick' || k === 'camera.stream';
}
function isReadyConnectorSkill(r: SkillCatalogRow): boolean {
  return isConnectorSkill(r.skill_key) && r.source !== 'clawhub';
}
function skillParamDefaults(params: SkillParam[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    if (p.default !== undefined && p.default !== null) out[p.key] = p.default;
  }
  return out;
}

function schemaIssue(
  schema: SkillParam[],
  values: Record<string, unknown>,
): { kind: 'required' | 'range'; p: SkillParam } | null {
  const missing = schema.find(
    (p) => p.required && (values[p.key] == null || values[p.key] === ''),
  );
  if (missing) return { kind: 'required', p: missing };
  const outOfRange = schema.find((p) => {
    if (!NUM_PARAM_TYPES.has(p.param_type) || (p.min == null && p.max == null)) return false;
    const raw = values[p.key];
    if (raw == null || raw === '') return false;
    const n = Number(raw);
    if (Number.isNaN(n)) return true;
    return (p.min != null && n < p.min) || (p.max != null && n > p.max);
  });
  if (outOfRange) return { kind: 'range', p: outOfRange };
  return null;
}
function schemaIssueMessage(
  t: (k: string) => string,
  issue: { kind: 'required' | 'range'; p: SkillParam },
): string {
  if (issue.kind === 'required') {
    return t('conectores.err.required_param').replace('{name}', issue.p.label || issue.p.key);
  }
  return t('conectores.err.param_range')
    .replace('{name}', issue.p.label || issue.p.key)
    .replace('{min}', String(issue.p.min ?? ''))
    .replace('{max}', String(issue.p.max ?? ''));
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] text-muted-on-light flex items-center gap-1">
        {label}
        {tip && <InfoTip text={tip} label={label} />}
      </span>
      {children}
    </div>
  );
}

type FormState = {
  slug: string; display_name: string; base_url: string; path: string; method: string; node_type: string;
  id_field: string; name_field: string; records_path: string; request_body: string;
  auth_mode: string; auth_secret_ref: string; auth_header: string; auth_username: string;
  auth_query_param: string; auth_token_url: string; auth_client_id: string; auth_scope: string;
  cron_preset: string; serializer_format: string; csv_delimiter: string;
};

type Props = {
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  form: FormState;
  setField: (k: string, v: string) => void;
  // Skill catalog
  connectorSkills: SkillCatalogRow[];
  skillKey: string;
  onSkillChange: (key: string) => void;
  selectedSkill: SkillCatalogRow | null;
  selectedSkillDesc: string;
  isHttp: boolean;
  skillParams: Record<string, unknown>;
  onSkillParamsChange: (k: string, v: unknown) => void;
  // Query params
  query: { k: string; v: string }[];
  setQuery: React.Dispatch<React.SetStateAction<{ k: string; v: string }[]>>;
  // Markings
  markings: string[];
  setMarkings: React.Dispatch<React.SetStateAction<string[]>>;
  // Pagination
  pag: { mode: string; page_param: string; size_param: string; page_size: string; start_page: string; offset_param: string; limit_param: string; cursor_param: string; cursor_path: string; max_pages: string };
  setPagField: (k: string, v: string) => void;
  // Sync preview
  sample: string;
  setSample: React.Dispatch<React.SetStateAction<string>>;
  preview: SyncPreviewResult | null;
  previewErr: string | null;
  onPreview: () => void;
  previewBusy: boolean;
};

export function ConnectorRegistrationForm({
  onSubmit, onCancel, busy, error, form, setField,
  connectorSkills, skillKey, onSkillChange, selectedSkill, selectedSkillDesc, isHttp,
  skillParams, onSkillParamsChange,
  query, setQuery, markings, setMarkings,
  pag, setPagField,
  sample, setSample, preview, previewErr, onPreview, previewBusy,
}: Props) {
  const t = useT();
  return (
    <form onSubmit={onSubmit} noValidate data-testid="conectores-form" className="bg-canvas-light border border-border-light p-4 grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Field label={t('conectores.f.skill')} tip={t('conectores.tip.skill')}>
          <select data-testid="cf-skill" value={skillKey} onChange={(e) => onSkillChange(e.target.value)} className={INP}>
            {connectorSkills.map((c) => (
              <option key={c.skill_key} value={c.skill_key}>{skillLabel(t, c.skill_key, c.label)}</option>
            ))}
          </select>
        </Field>
        {selectedSkillDesc ? (
          <p className="text-[11px] text-muted-on-light mt-1" data-testid="cf-skill-desc">
            {selectedSkillDesc}
          </p>
        ) : null}
      </div>
      <Field label={t('conectores.f.slug')}><input data-testid="cf-slug" value={form.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="ex.: enderecos-cep" className={INP} /></Field>
      <Field label={t('conectores.f.name')}><input value={form.display_name} onChange={(e) => setField('display_name', e.target.value)} placeholder="ex.: API de Endereços" className={INP} /></Field>
      {isHttp && (
        <>
          <Field label={t('conectores.f.base_url')}><input data-testid="cf-base-url" value={form.base_url} onChange={(e) => setField('base_url', e.target.value)} placeholder="https://api.exemplo.com" className={INP} /></Field>
          <Field label={t('conectores.f.path')}><input value={form.path} onChange={(e) => setField('path', e.target.value)} placeholder="/v1/registros" className={INP} /></Field>
          <Field label={t('conectores.f.method')}>
            <select data-testid="cf-method" value={form.method} onChange={(e) => setField('method', e.target.value)} className={INP}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </Field>
        </>
      )}
      <Field label={t('conectores.f.schedule')}>
        <select data-testid="cf-cron" value={form.cron_preset} onChange={(e) => setField('cron_preset', e.target.value)} className={INP}>
          {CRON.map((m) => <option key={m.v} value={m.v}>{t(m.labelKey)}</option>)}
        </select>
      </Field>
      {!isHttp && (
        <div className="col-span-2" data-testid="conectores-skill-params">
          <SchemaForm
            params={selectedSkill?.param_schema ?? []}
            values={skillParams}
            onChange={(k, v) => onSkillParamsChange(k, v)}
            testidPrefix="cf-skill-param"
          />
        </div>
      )}
      {isHttp && form.method === 'POST' && (
        <div className="col-span-2">
          <Field label={t('conectores.f.body')}>
            <textarea data-testid="cf-body" value={form.request_body} onChange={(e) => setField('request_body', e.target.value)}
              placeholder='{"filtro": "ativos"}' rows={3} spellCheck={false}
              className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-border-light focus:outline-none focus:border-primary resize-y" />
          </Field>
        </div>
      )}
      {isHttp && (
        <>
          <Field label={t('conectores.f.node_type')} tip={t('conectores.tip.node_type')}>
            <DynamicRefSelect source="object_types" value={form.node_type} onChange={(v) => setField('node_type', v)} testid="cf-node-type" />
          </Field>
          <Field label={t('conectores.f.id_field')} tip={t('conectores.tip.id_field')}>
            <DynamicRefSelect source="properties" dependsOnValue={form.node_type} value={form.id_field} onChange={(v) => setField('id_field', v)} testid="cf-id-field" />
          </Field>
          <Field label={t('conectores.f.name_field')}>
            <DynamicRefSelect source="properties" dependsOnValue={form.node_type} value={form.name_field} onChange={(v) => setField('name_field', v)} testid="cf-name-field" />
          </Field>
          <Field label={t('conectores.f.serializer')} tip={t('conectores.tip.serializer')}>
            <select data-testid="cf-serializer" value={form.serializer_format} onChange={(e) => setField('serializer_format', e.target.value)} className={INP}>
              {SERIALIZER_FORMATS.map((fmt) => <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>)}
            </select>
          </Field>
          {form.serializer_format === 'csv' && (
            <Field label={t('conectores.f.csv_delimiter')}><input data-testid="cf-csv-delimiter" value={form.csv_delimiter} onChange={(e) => setField('csv_delimiter', e.target.value)} maxLength={1} className={INP} /></Field>
          )}
          <Field label={t('conectores.f.records_path')} tip={t('conectores.tip.records_path')}><input value={form.records_path} onChange={(e) => setField('records_path', e.target.value)} placeholder="vazio = resposta é o array" disabled={form.serializer_format !== 'json'} className={INP + (form.serializer_format !== 'json' ? ' opacity-50' : '')} /></Field>
          <Field label={t('conectores.f.markings')} tip={t('conectores.tip.markings')}>
            <MarkingsSelect value={markings} onChange={setMarkings} testid="cf-markings" />
          </Field>
          <Field label={t('conectores.f.auth')}>
            <select data-testid="cf-auth-mode" value={form.auth_mode} onChange={(e) => setField('auth_mode', e.target.value)} className={INP}>
              {AUTH_MODES.map((m) => <option key={m.v} value={m.v}>{t(m.labelKey)}</option>)}
            </select>
          </Field>
          {form.auth_mode !== 'none' && (
            <Field label={t('conectores.f.secret')}>
              <SecretRefSelect value={form.auth_secret_ref} onChange={(v) => setField('auth_secret_ref', v)} />
            </Field>
          )}
          {form.auth_mode === 'api_key' && (
            <Field label={t('conectores.f.header')}><input value={form.auth_header} onChange={(e) => setField('auth_header', e.target.value)} className={INP} /></Field>
          )}
          {form.auth_mode === 'api_key_query' && (
            <Field label={t('conectores.f.query_param')}><input data-testid="cf-auth-query-param" value={form.auth_query_param} onChange={(e) => setField('auth_query_param', e.target.value)} className={INP} /></Field>
          )}
          {form.auth_mode === 'basic' && (
            <Field label={t('conectores.f.username')}><input value={form.auth_username} onChange={(e) => setField('auth_username', e.target.value)} className={INP} /></Field>
          )}
          {form.auth_mode === 'oauth2_cc' && (
            <>
              <Field label={t('conectores.f.token_url')}><input data-testid="cf-auth-token-url" value={form.auth_token_url} onChange={(e) => setField('auth_token_url', e.target.value)} placeholder="https://auth.exemplo.com/oauth/token" className={INP} /></Field>
              <Field label={t('conectores.f.client_id')}><input data-testid="cf-auth-client-id" value={form.auth_client_id} onChange={(e) => setField('auth_client_id', e.target.value)} className={INP} /></Field>
              <Field label={t('conectores.f.scope')}><input data-testid="cf-auth-scope" value={form.auth_scope} onChange={(e) => setField('auth_scope', e.target.value)} placeholder="read:registros" className={INP} /></Field>
            </>
          )}
          <div className="col-span-2 space-y-1.5" data-testid="conectores-query">
            <span className="text-[11px] text-muted-on-light flex items-center gap-1">
              {t('conectores.f.query')}
              <InfoTip text={t('conectores.tip.query')} label={t('conectores.f.query')} />
            </span>
            {query.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input data-testid={`cf-query-key-${i}`} value={row.k} placeholder={t('conectores.f.query_key')}
                  onChange={(e) => setQuery((p) => p.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))} className={INP} />
                <input data-testid={`cf-query-val-${i}`} value={row.v} placeholder={t('conectores.f.query_value')}
                  onChange={(e) => setQuery((p) => p.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} className={INP} />
                <button type="button" data-testid={`cf-query-del-${i}`} aria-label={t('common.remove')}
                  onClick={() => setQuery((p) => p.filter((_, j) => j !== i))}
                  className="h-8 px-2 border border-border-light hover:border-danger text-muted-on-light hover:text-danger shrink-0">
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ))}
            <button type="button" data-testid="cf-query-add" onClick={() => setQuery((p) => [...p, { k: '', v: '' }])}
              className="h-7 px-2.5 text-[11px] border border-border-light hover:border-primary flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('conectores.query_add')}
            </button>
          </div>
          <div className="col-span-2 border-t border-border-light pt-3 mt-1 space-y-2" data-testid="conectores-pagination">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-text-on-light">{t('conectores.f.pagination')}</span>
              <InfoTip text={t('conectores.tip.pagination')} label={t('conectores.f.pagination')} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('conectores.pag.mode')}>
                <select data-testid="cf-pag-mode" value={pag.mode} onChange={(e) => setPagField('mode', e.target.value)} className={INP}>
                  {PAGINATION_MODES.map((m) => <option key={m} value={m}>{t(`conectores.pag.${m}`)}</option>)}
                </select>
              </Field>
              {pag.mode === 'page' && (
                <>
                  <Field label={t('conectores.pag.page_param')}><input data-testid="cf-pag-page_param" value={pag.page_param} onChange={(e) => setPagField('page_param', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.size_param')}><input data-testid="cf-pag-size_param" value={pag.size_param} onChange={(e) => setPagField('size_param', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.page_size')}><input data-testid="cf-pag-page_size" type="number" value={pag.page_size} onChange={(e) => setPagField('page_size', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.start_page')}><input data-testid="cf-pag-start_page" type="number" value={pag.start_page} onChange={(e) => setPagField('start_page', e.target.value)} className={INP} /></Field>
                </>
              )}
              {pag.mode === 'offset' && (
                <>
                  <Field label={t('conectores.pag.offset_param')}><input data-testid="cf-pag-offset_param" value={pag.offset_param} onChange={(e) => setPagField('offset_param', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.limit_param')}><input data-testid="cf-pag-limit_param" value={pag.limit_param} onChange={(e) => setPagField('limit_param', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.page_size')}><input data-testid="cf-pag-page_size" type="number" value={pag.page_size} onChange={(e) => setPagField('page_size', e.target.value)} className={INP} /></Field>
                </>
              )}
              {pag.mode === 'cursor' && (
                <>
                  <Field label={t('conectores.pag.cursor_param')}><input data-testid="cf-pag-cursor_param" value={pag.cursor_param} onChange={(e) => setPagField('cursor_param', e.target.value)} className={INP} /></Field>
                  <Field label={t('conectores.pag.cursor_path')}><input data-testid="cf-pag-cursor_path" value={pag.cursor_path} onChange={(e) => setPagField('cursor_path', e.target.value)} placeholder="meta.next_cursor" className={INP} /></Field>
                </>
              )}
              {pag.mode !== 'none' && (
                <Field label={t('conectores.pag.max_pages')}><input data-testid="cf-pag-max_pages" type="number" value={pag.max_pages} onChange={(e) => setPagField('max_pages', e.target.value)} className={INP} /></Field>
              )}
            </div>
          </div>
          <div className="col-span-2 border-t border-border-light pt-3 mt-1 space-y-2" data-testid="conectores-sync">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-text-on-light">{t('conectores.sync.title')}</span>
              <InfoTip text={t('conectores.sync.intro')} label={t('conectores.sync.title')} />
            </div>
            <p className="text-[11px] text-muted-on-light">{t('conectores.sync.intro')}</p>
            <Field label={t('conectores.sync.sample')}>
              <textarea
                data-testid="cf-sample" value={sample} onChange={(e) => setSample(e.target.value)}
                placeholder={t('conectores.sync.samplePlaceholder')} rows={4}
                className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-border-light focus:outline-none focus:border-primary"
              />
            </Field>
            <button type="button" onClick={onPreview} disabled={previewBusy} data-testid="conectores-preview"
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5">
              {previewBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <ScanSearch className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('conectores.sync.preview')}
            </button>
            {previewErr && (
              <p className="text-[11px] text-danger flex items-center gap-1" data-testid="conectores-preview-err">
                <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> {previewErr}
              </p>
            )}
            {preview && (
              <div className="border border-border-light bg-white" data-testid="conectores-preview-res">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light">
                  {t('conectores.sync.schema')} · {t('conectores.sync.rowCount').replace('{n}', String(preview.row_count))}
                </div>
                {preview.row_count === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-warning">{t('conectores.sync.empty')}</p>
                ) : (
                  <div className="px-2 py-2 flex flex-wrap gap-1.5">
                    {preview.schema.map((s) => (
                      <span key={s.key} className="text-[11px] border border-border-light px-1.5 py-0.5" data-testid={`schema-field-${s.key}`}>
                        <span className="font-mono text-text-on-light">{s.key}</span>
                        <span className="text-muted-on-light"> · {s.type}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      <div className="col-span-2 flex items-center gap-2">
        <button type="submit" disabled={busy} data-testid="conectores-registrar"
          className="h-9 px-4 text-[13px] bg-primary text-white font-semibold flex items-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />} {t('conectores.register_submit')}
        </button>
        <button type="button" onClick={onCancel} className="h-9 px-3 text-[12px] border border-border-light hover:border-primary">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
