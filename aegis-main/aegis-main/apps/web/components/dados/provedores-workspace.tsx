'use client';

/**
 * Provedores de Computação — Painel de Controle (V1 visão→georref→mapa, §5).
 *
 * Cadastro BYOM DIRETO NA UI (ressalva do operador): dropdown de vendor
 * (nunca texto livre), credencial → Vault (nunca volta), jurisdição/país e
 * certificações HONESTAS por provider, Testar conexão, habilitar/remover.
 * Multi-domínio: o registro é infraestrutura horizontal — o "o quê" computar
 * é dado da ontologia. i18n via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { HubHeader } from '@/components/dados/hub-header';
import { useT } from '@/lib/i18n/provider';
import {
  Compute,
  type ComputeProviderRow,
  type ComputeRelease,
  type ComputeEndpoint,
  type ComputeVendorPreset,
} from '@/lib/api';
import { Flame, Layers, Play, Rocket, Server, Snowflake } from 'lucide-react';

type Res = { ok: boolean; msg: string };

const INP =
  'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:outline-none focus:border-primary';

const KIND_KEY: Record<string, string> = {
  edge: 'provedores.kind.edge',
  cloud_inference: 'provedores.kind.cloud_inference',
  cloud_gpu: 'provedores.kind.cloud_gpu',
};

export function ProvedoresWorkspace({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const [list, setList] = React.useState<ComputeProviderRow[] | null>(null);
  const [vendors, setVendors] = React.useState<ComputeVendorPreset[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<Record<string, Res>>({});

  const [f, setF] = React.useState({
    display_name: '',
    vendor: '',
    api_key: '',
    base_url: '',
    jurisdictions: '',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const preset = vendors?.find((v) => v.vendor === f.vendor) || null;

  const refresh = React.useCallback(() => {
    setErr(null);
    Compute.list()
      .then(setList)
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar provedores'));
  }, []);
  React.useEffect(() => {
    refresh();
    Compute.catalog()
      .then((c) => setVendors(c.vendors))
      .catch(() => setVendors([]));
  }, [refresh]);

  const pickVendor = (vendor: string) => {
    const p = vendors?.find((v) => v.vendor === vendor);
    setF((prev) => ({
      ...prev,
      vendor,
      jurisdictions: (p?.jurisdictions || []).join(', '),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.display_name.trim() || !f.vendor) return;
    setBusy('create');
    setErr(null);
    try {
      await Compute.create({
        display_name: f.display_name.trim(),
        vendor: f.vendor,
        api_key: f.api_key.trim() || undefined,
        base_url: f.base_url.trim() || undefined,
        jurisdictions: f.jurisdictions
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      });
      setShowForm(false);
      setF({ display_name: '', vendor: '', api_key: '', base_url: '', jurisdictions: '' });
      refresh();
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Falha ao cadastrar provedor');
    } finally {
      setBusy(null);
    }
  };

  const test = async (p: ComputeProviderRow) => {
    setBusy(`test-${p.id}`);
    try {
      const r = await Compute.test(p.id);
      setRes((prev) => ({ ...prev, [p.id]: { ok: r.ok, msg: r.message } }));
      refresh(); // validation_status persiste no Vault
    } catch (e) {
      setRes((prev) => ({ ...prev, [p.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (p: ComputeProviderRow) => {
    setBusy(`toggle-${p.id}`);
    try {
      await Compute.update(p.id, { enabled: !p.enabled });
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'falha');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: ComputeProviderRow) => {
    setBusy(`del-${p.id}`);
    try {
      await Compute.remove(p.id);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'falha');
    } finally {
      setBusy(null);
    }
  };

  // F7.3c — embedded usa botão compacto (h-7) no HubHeader h-9 da casca.
  const actions = (compact = false) => (
    <button
      type="button"
      onClick={() => setShowForm((v) => !v)}
      data-testid="provedores-novo"
      className={(compact ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]') + ' bg-primary text-white hover:opacity-90 flex items-center gap-1.5'}
    >
      <Plus className="w-3.5 h-3.5" strokeWidth={2} />{' '}
      {showForm ? t('common.cancel') : t('provedores.register')}
    </button>
  );

  return (
    <>
      {embedded ? (
        <HubHeader label={t('provedores.title')}>{actions(true)}</HubHeader>
      ) : (
        <CpPageHeader
          title={t('provedores.title')}
          subtitle={t('provedores.subtitle')}
          actions={actions()}
        />
      )}
      <div className="p-6 max-w-4xl space-y-4">
        {err && (
          <div
            className="flex items-start gap-2 text-danger text-[13px]"
            role="alert"
            data-testid="provedores-error"
          >
            <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} /> <span>{err}</span>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={submit}
            data-testid="provedores-form"
            className="bg-canvas-light border border-border-light p-4 grid grid-cols-2 gap-3"
          >
            <Field label={t('provedores.f.vendor')}>
              <select
                data-testid="pf-vendor"
                value={f.vendor}
                onChange={(e) => pickVendor(e.target.value)}
                className={INP}
              >
                <option value="">{t('provedores.f.vendor_pick')}</option>
                {(vendors || []).map((v) => (
                  <option key={v.vendor} value={v.vendor}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('provedores.f.name')}>
              <input
                data-testid="pf-name"
                value={f.display_name}
                onChange={(e) => set('display_name', e.target.value)}
                placeholder={t('provedores.f.name_ph')}
                className={INP}
              />
            </Field>
            {preset?.requires_api_key && (
              <Field label={t('provedores.f.api_key')}>
                <input
                  data-testid="pf-api-key"
                  type="password"
                  value={f.api_key}
                  onChange={(e) => set('api_key', e.target.value)}
                  placeholder={t('provedores.f.api_key_ph')}
                  className={INP}
                  autoComplete="off"
                />
              </Field>
            )}
            {(preset?.requires_base_url || (preset?.capabilities || []).includes('embedding')) && (
              <Field label={t('provedores.f.base_url')}>
                <input
                  data-testid="pf-base-url"
                  value={f.base_url}
                  onChange={(e) => set('base_url', e.target.value)}
                  placeholder={
                    (preset?.capabilities || []).includes('embedding')
                      ? 'http://host:porta/v1 — /embeddings compatível com OpenAI (vazio = OpenAI)'
                      : 'https://api.runpod.ai/v2/<endpoint>'
                  }
                  className={INP}
                />
              </Field>
            )}
            <Field label={t('provedores.f.jurisdictions')}>
              <input
                data-testid="pf-jurisdictions"
                value={f.jurisdictions}
                onChange={(e) => set('jurisdictions', e.target.value)}
                placeholder={t('provedores.f.jurisdictions_ph')}
                className={INP}
              />
            </Field>
            {preset && (
              <div className="col-span-2 text-[11px] text-muted-on-light space-y-0.5" data-testid="pf-preset-notes">
                <p className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                  {preset.notes}
                </p>
                {preset.pricing_hint && <p>{t('provedores.pricing')}: {preset.pricing_hint}</p>}
                {Object.entries(preset.cert_metadata).map(([k, v]) => (
                  <p key={k}>
                    {k}: {String(v)}
                  </p>
                ))}
              </div>
            )}
            <div className="col-span-2">
              <button
                type="submit"
                disabled={busy === 'create' || !f.vendor || !f.display_name.trim()}
                data-testid="provedores-cadastrar"
                className="h-9 px-4 text-[13px] bg-primary text-white font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {busy === 'create' && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />}{' '}
                {t('provedores.register_submit')}
              </button>
            </div>
          </form>
        )}

        <div className="border border-border-light" data-testid="provedores-list">
          {list === null && (
            <div className="p-3 text-[12px] text-muted-on-light flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
            </div>
          )}
          {list && list.length === 0 && (
            <div className="p-3 text-[12px] text-muted-on-light italic">
              {t('provedores.empty')}
            </div>
          )}
          {list &&
            list.map((p) => {
              const r = res[p.id];
              return (
                <React.Fragment key={p.id}>
                <div
                  className="px-3 py-2.5 border-b border-border-light flex items-center gap-2 text-[12px]"
                  data-testid={`provedor-card-${p.slug}`}
                >
                  <Cpu className="w-4 h-4 text-primary shrink-0" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-text-on-light truncate flex items-center gap-2">
                      {p.display_name}
                      <span className="text-[10px] font-normal text-muted-on-light border border-border-light px-1">
                        {t(KIND_KEY[p.provider_kind] || 'provedores.kind.cloud_inference')}
                      </span>
                      {!p.enabled && (
                        <span className="text-[10px] font-normal text-danger border border-danger/40 px-1">
                          {t('provedores.disabled')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-on-light truncate flex items-center gap-1.5">
                      <Globe2 className="w-3 h-3" strokeWidth={1.5} />
                      {(p.jurisdictions || []).join(', ') || '—'}
                      {p.country ? ` · ${p.country}` : ''}
                      {p.pricing_hint ? ` · ${p.pricing_hint}` : ''}
                    </div>
                    {p.has_credential && (
                      <div className="text-[10px] text-muted-on-light flex items-center gap-1">
                        <KeyRound className="w-3 h-3" strokeWidth={1.5} />
                        {t('provedores.credential')}: {p.validation_status || 'unvalidated'}
                      </div>
                    )}
                    {r && (
                      <div
                        className={
                          'flex items-center gap-1 text-[11px] mt-0.5 ' +
                          (r.ok ? 'text-success' : 'text-danger')
                        }
                        data-testid={`provedor-res-${p.slug}`}
                      >
                        {r.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}{' '}
                        {r.msg}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => test(p)}
                    disabled={busy === `test-${p.id}`}
                    data-testid={`provedor-test-${p.slug}`}
                    className="h-7 px-2.5 text-[11px] border border-border-light hover:border-primary flex items-center gap-1"
                  >
                    {busy === `test-${p.id}` ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}{' '}
                    {t('provedores.test')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    disabled={busy === `toggle-${p.id}`}
                    data-testid={`provedor-toggle-${p.slug}`}
                    className="h-7 px-2.5 text-[11px] border border-border-light hover:border-primary"
                  >
                    {p.enabled ? t('provedores.disable') : t('provedores.enable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={busy === `del-${p.id}`}
                    data-testid={`provedor-del-${p.slug}`}
                    className="h-7 px-2.5 text-[11px] border border-border-light hover:border-danger text-danger flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('common.delete')}
                  </button>
                </div>
                {p.provider_kind === 'cloud_gpu' && p.enabled && (
                  <PistaPanel provider={p} />
                )}
                </React.Fragment>
              );
            })}
        </div>
      </div>
    </>
  );
}

/** V3 — pista programável: o que o AIP deployou neste provedor GPU. Mostra
 *  releases (com canal + eval) e endpoints vivos; opera deploy/limpeza sem
 *  shell. Colapsado por padrão (carrega sob demanda). */
function PistaPanel({ provider }: { provider: ComputeProviderRow }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [releases, setReleases] = React.useState<ComputeRelease[] | null>(null);
  const [endpoints, setEndpoints] = React.useState<ComputeEndpoint[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setErr(null);
    Compute.listReleases()
      .then((r) => setReleases(r.releases.filter((x) => x.provider_slug === provider.slug || !x.provider_slug)))
      .catch((e) => setErr((e as Error)?.message ?? 'falha'));
    Compute.listEndpoints(provider.id)
      .then((r) => setEndpoints(r.endpoints))
      .catch(() => setEndpoints([]));
  }, [provider.id, provider.slug]);

  React.useEffect(() => { if (open) load(); }, [open, load]);

  const delEndpoint = async (eid: string) => {
    setBusy(`del-${eid}`);
    try { await Compute.deleteEndpoint(provider.id, eid); load(); }
    catch (e) { setErr((e as Error)?.message ?? 'falha'); }
    finally { setBusy(null); }
  };

  // "Manter aquecida" (workers_min 1/0): elimina o cold-start mas gera custo.
  const [warmBusy, setWarmBusy] = React.useState(false);
  const toggleWarm = async (warm: boolean) => {
    setWarmBusy(true); setErr(null);
    try { await Compute.visionWarm(warm, provider.slug); load(); }
    catch (e) { setErr((e as Error)?.message ?? 'falha'); }
    finally { setWarmBusy(false); }
  };

  // Teste de detecção ASSÍNCRONO: submete + POLLA mostrando o boot — NUNCA
  // estoura timeout (o cold-start do GPU leva minutos; a UI só avisa).
  type TestState = { phase: 'submitting' | 'booting' | 'running' | 'done' | 'error'; elapsed: number; count?: number; msg?: string };
  const [test, setTest] = React.useState<TestState | null>(null);
  const testRef = React.useRef(false);
  const testDetect = async (eid: string) => {
    if (testRef.current) return;
    testRef.current = true;
    setTest({ phase: 'submitting', elapsed: 0 });
    const t0 = Date.now();
    try {
      // imagem de amostra pública só p/ exercitar o endpoint + o boot.
      const sub = await Compute.visionJobSubmit({
        image_url: 'https://ultralytics.com/images/bus.jpg',
        instruction: 'detect',
        provider: provider.slug,
      });
      // polla até COMPLETED — sem teto rígido de UX (cap de segurança ~25min).
      for (let i = 0; i < 375; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await Compute.visionJobStatus(sub.provider_id, sub.endpoint_id, sub.job_id);
        const elapsed = Math.round((Date.now() - t0) / 1000);
        if (st.status === 'COMPLETED') {
          setTest({ phase: 'done', elapsed, count: st.count ?? 0 });
          return;
        }
        if (st.status === 'FAILED' || st.status === 'CANCELLED' || st.status === 'TIMED_OUT') {
          setTest({ phase: 'error', elapsed, msg: st.error || st.status });
          return;
        }
        setTest({ phase: st.status === 'IN_PROGRESS' ? 'running' : 'booting', elapsed });
      }
      setTest({ phase: 'error', elapsed: Math.round((Date.now() - t0) / 1000), msg: '25min' });
    } catch (e) {
      setTest({ phase: 'error', elapsed: Math.round((Date.now() - t0) / 1000), msg: (e as Error)?.message ?? 'falha' });
    } finally {
      testRef.current = false;
    }
  };

  return (
    <div className="px-3 py-2 border-b border-border-light bg-canvas-light/40" data-testid={`pista-${provider.slug}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`pista-toggle-${provider.slug}`}
        className="text-[11px] text-muted-on-light hover:text-primary flex items-center gap-1.5"
      >
        <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('provedores.pista')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 space-y-3 pl-1">
          {err && <p className="text-[11px] text-danger">{err}</p>}
          {/* Releases */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1 flex items-center gap-1">
              <Rocket className="w-3 h-3" strokeWidth={1.5} /> {t('provedores.releases')}
            </p>
            {releases === null && <p className="text-[11px] text-muted-on-light">{t('common.loading')}</p>}
            {releases?.length === 0 && <p className="text-[11px] text-muted-on-light italic">{t('provedores.noReleases')}</p>}
            {releases?.map((rel) => (
              <div key={rel.id} className="flex items-center gap-2 text-[11px] py-0.5" data-testid={`release-${rel.name}-${rel.version}`}>
                <span className="font-mono text-text-on-light">{rel.name} v{rel.version}</span>
                <span className={'px-1 border text-[10px] ' + (rel.channel === 'production' ? 'border-success/50 text-success' : 'border-border-light text-muted-on-light')}>
                  {rel.channel}
                </span>
                {rel.eval_score != null && <span className="text-muted-on-light">eval {rel.eval_score.toFixed(2)}</span>}
                {rel.endpoint_id && <span className="font-mono text-[10px] text-muted-on-light">→ {rel.endpoint_id}</span>}
              </div>
            ))}
          </div>
          {/* Endpoints vivos */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1 flex items-center gap-1">
              <Server className="w-3 h-3" strokeWidth={1.5} /> {t('provedores.endpoints')}
            </p>
            {endpoints === null && <p className="text-[11px] text-muted-on-light">{t('common.loading')}</p>}
            {endpoints?.length === 0 && <p className="text-[11px] text-muted-on-light italic">{t('provedores.noEndpoints')}</p>}
            {endpoints?.map((ep) => (
              <div key={ep.id} className="flex items-center gap-2 text-[11px] py-0.5" data-testid={`endpoint-${ep.id}`}>
                <span className="font-mono text-text-on-light">{String(ep.name || ep.id)}</span>
                <button
                  type="button"
                  onClick={() => delEndpoint(ep.id)}
                  disabled={busy === `del-${ep.id}`}
                  data-testid={`endpoint-del-${ep.id}`}
                  className="h-6 px-2 text-[10px] border border-border-light hover:border-danger text-danger flex items-center gap-1"
                >
                  {busy === `del-${ep.id}` ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> : <Trash2 className="w-3 h-3" strokeWidth={1.5} />}
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>

          {/* Aquecimento + teste com boot — só quando há endpoint de detecção */}
          {endpoints && endpoints.length > 0 && (
            <div className="border border-border-light p-2 space-y-2" data-testid={`warm-panel-${provider.slug}`}>
              {(() => {
                const warm = endpoints.some((e) => Number((e as Record<string, unknown>).workersMin ?? 0) > 0);
                return (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-on-light flex items-center gap-1.5">
                      {warm
                        ? <Flame className="w-3.5 h-3.5 text-warning" strokeWidth={1.5} />
                        : <Snowflake className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />}
                      {warm ? t('provedores.warmOn') : t('provedores.warmOff')}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleWarm(!warm)}
                      disabled={warmBusy}
                      data-testid={`warm-toggle-${provider.slug}`}
                      className="h-6 px-2 text-[10px] border border-border-light hover:border-primary text-text-on-light flex items-center gap-1"
                    >
                      {warmBusy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
                      {warm ? t('provedores.warmStop') : t('provedores.warmStart')}
                    </button>
                  </div>
                );
              })()}
              <p className="text-[10px] text-warning flex items-start gap-1">
                <AlertCircle className="w-3 h-3 mt-px shrink-0" strokeWidth={1.5} />
                {t('provedores.warmCost')}
              </p>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-light">
                <button
                  type="button"
                  onClick={() => testDetect(endpoints[0].id)}
                  disabled={test?.phase === 'submitting' || test?.phase === 'booting' || test?.phase === 'running'}
                  data-testid={`endpoint-test-${provider.slug}`}
                  className="h-6 px-2 text-[10px] border border-border-light hover:border-primary text-text-on-light flex items-center gap-1"
                >
                  <Play className="w-3 h-3" strokeWidth={1.5} /> {t('provedores.testDetect')}
                </button>
                {test && (
                  <span className="text-[10px] flex items-center gap-1" data-testid={`endpoint-test-status-${provider.slug}`}>
                    {(test.phase === 'submitting' || test.phase === 'booting' || test.phase === 'running') && (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-primary" strokeWidth={1.5} />
                        <span className="text-muted-on-light">
                          {test.phase === 'booting' ? t('provedores.testBooting') : t('provedores.testRunning')} · {test.elapsed}s
                        </span>
                      </>
                    )}
                    {test.phase === 'done' && <span className="text-success">{t('provedores.testDone')} · {test.count} · {test.elapsed}s</span>}
                    {test.phase === 'error' && <span className="text-danger">{t('provedores.testError')}: {test.msg}</span>}
                  </span>
                )}
              </div>
              {(test?.phase === 'booting' || test?.phase === 'submitting') && (
                <p className="text-[10px] text-muted-on-light italic">{t('provedores.testBootHint')}</p>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-on-light italic">{t('provedores.pistaHint')}</p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-on-light">{label}</span>
      {children}
    </label>
  );
}
