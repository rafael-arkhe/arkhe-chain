'use client';

/**
 * Cenários de App — Painel de Controle (Workshop Scenario Manager, Onda 10).
 *
 * What-if por app: o operador cria um cenário, adiciona deltas (ações do app) e
 * faz COMMIT — que APLICA de verdade (dispatcha os handlers da Onda 9) e devolve
 * quantos deltas aplicaram / falharam. Ou descarta. Consome /workshop/apps/{id}/
 * scenarios* (workshop_scenarios.py). Distinto do /scenarios (platform_v23).
 */
import * as React from 'react';
import { GitFork, Plus, Play, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { OPERACIONAL_CENARIOS_TABS } from '@/components/control-panel/hub-tabs';
import { useT } from '@/lib/i18n/provider';
import { Workshop } from '@/lib/workshop/client';
import type { WorkshopApp, ActionType, ActionParam } from '@/lib/workshop/types';
import {
  WorkshopScenarios,
  type WorkshopScenario,
  type WorkshopScenarioDelta,
  type WorkshopScenarioCommit,
} from '@/lib/api';

const SELECT = 'h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary';

export default function CenariosAppPage() {
  return (
    <RequirePerm perm="ontology.objects.write">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const t = useT();
  const [apps, setApps] = React.useState<WorkshopApp[]>([]);
  const [appId, setAppId] = React.useState('');
  const [actions, setActions] = React.useState<ActionType[]>([]);
  const [deltaParams, setDeltaParams] = React.useState<Record<string, unknown>>({});
  const [scenarios, setScenarios] = React.useState<WorkshopScenario[]>([]);
  const [sel, setSel] = React.useState<string | null>(null);
  const [deltas, setDeltas] = React.useState<WorkshopScenarioDelta[]>([]);
  const [newName, setNewName] = React.useState('');
  const [addAction, setAddAction] = React.useState('');
  const [commit, setCommit] = React.useState<WorkshopScenarioCommit | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => { Workshop.list().then(setApps).catch(() => {}); }, []);

  const loadScenarios = React.useCallback((id: string) => {
    WorkshopScenarios.list(id).then(setScenarios).catch((e) => setErr((e as Error)?.message ?? 'falha'));
  }, []);

  // Ao trocar de app: carrega cenários + extrai as AÇÕES declaradas no app.
  React.useEffect(() => {
    setScenarios([]); setSel(null); setDeltas([]); setCommit(null); setActions([]);
    if (!appId) return;
    loadScenarios(appId);
    const app = apps.find((a) => a.id === appId);
    // Ações declaradas no app (ActionType[] — id + label + params tipados).
    setActions((app?.actions ?? []).filter((a) => a.id));
  }, [appId, apps, loadScenarios]);

  const loadDeltas = React.useCallback((id: string) => {
    if (!appId) return;
    WorkshopScenarios.deltas(appId, id).then(setDeltas).catch(() => setDeltas([]));
  }, [appId]);

  const selectScenario = (id: string) => { setSel(id); setCommit(null); loadDeltas(id); };

  const create = async () => {
    if (!appId || !newName.trim()) return;
    setBusy('create'); setErr(null);
    try {
      const s = await WorkshopScenarios.create(appId, newName.trim());
      setNewName(''); loadScenarios(appId); selectScenario(s.id);
    } catch (e) { setErr((e as Error)?.message ?? 'falha'); } finally { setBusy(null); }
  };

  const selectedAction = React.useMemo(() => actions.find((a) => a.id === addAction) ?? null, [actions, addAction]);

  // Troca de ação → reseta os params (sementeados com defaults declarados).
  const pickAction = (id: string) => {
    setAddAction(id);
    const a = actions.find((x) => x.id === id);
    const seed: Record<string, unknown> = {};
    for (const p of a?.params ?? []) if (p.default !== undefined) seed[p.name] = p.default;
    setDeltaParams(seed);
  };
  const setParam = (name: string, v: unknown) => setDeltaParams((p) => ({ ...p, [name]: v }));

  const addDelta = async () => {
    if (!appId || !sel || !addAction) return;
    setBusy('delta'); setErr(null);
    try {
      await WorkshopScenarios.applyAction(appId, sel, addAction, deltaParams);
      setAddAction(''); setDeltaParams({}); loadDeltas(sel); loadScenarios(appId);
    } catch (e) { setErr((e as Error)?.message ?? 'falha'); } finally { setBusy(null); }
  };

  const doCommit = async () => {
    if (!appId || !sel) return;
    setBusy('commit'); setErr(null);
    try {
      setCommit(await WorkshopScenarios.commit(appId, sel));
      loadScenarios(appId); loadDeltas(sel);
    } catch (e) { setErr((e as Error)?.message ?? 'falha'); } finally { setBusy(null); }
  };

  const doDiscard = async () => {
    if (!appId || !sel) return;
    setBusy('discard'); setErr(null);
    try {
      await WorkshopScenarios.discard(appId, sel);
      setSel(null); setDeltas([]); setCommit(null); loadScenarios(appId);
    } catch (e) { setErr((e as Error)?.message ?? 'falha'); } finally { setBusy(null); }
  };

  return (
    <>
      <CpPageHeader title={t('cenapp.title')} subtitle={t('cenapp.subtitle')} />
      <CpHubSubnav group="Cenários" tabs={OPERACIONAL_CENARIOS_TABS} />
      <div className="p-6 max-w-4xl space-y-4">
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-muted-on-light w-16">{t('cenapp.app')}</span>
          <select data-testid="cenapp-app" value={appId} onChange={(e) => setAppId(e.target.value)} className={SELECT + ' w-80'}>
            <option value="">{t('cenapp.appPlaceholder')}</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.display || a.id}</option>)}
          </select>
        </label>

        {err ? <p className="text-[12px] text-danger" data-testid="cenapp-error">{err}</p> : null}

        {appId ? (
          <div className="grid grid-cols-[260px_1fr] gap-4">
            {/* Coluna esquerda: cenários + criar */}
            <div className="space-y-2">
              <div className="flex gap-1">
                <input
                  data-testid="cenapp-new-name" value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('cenapp.newPlaceholder')}
                  className="flex-1 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                />
                <button type="button" onClick={create} disabled={busy === 'create' || !newName.trim()} data-testid="cenapp-create"
                  className="h-8 px-2.5 text-[11px] bg-primary text-white hover:opacity-90 flex items-center gap-1 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" strokeWidth={2} /> {t('cenapp.create')}
                </button>
              </div>
              <div className="border border-border-light" data-testid="cenapp-list">
                {scenarios.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] text-muted-on-light italic">{t('cenapp.empty')}</p>
                ) : scenarios.map((s) => (
                  <button key={s.id} type="button" onClick={() => selectScenario(s.id)} data-testid={`cenapp-scenario-${s.id}`}
                    className={'w-full text-left px-3 py-2 border-b border-border-light/60 text-[12px] ' + (sel === s.id ? 'bg-primary/5' : 'hover:bg-canvas-light')}>
                    <div className="flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                      <span className="font-medium text-text-on-light truncate">{s.name}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-on-light shrink-0">{s.delta_count} · {s.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Coluna direita: deltas + commit/discard do cenário selecionado */}
            <div className="space-y-2">
              {!sel ? (
                <p className="text-[12px] text-muted-on-light italic">{t('cenapp.selectHint')}</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <select data-testid="cenapp-add-action" value={addAction} onChange={(e) => pickAction(e.target.value)} className={SELECT + ' flex-1'}>
                      <option value="">{t('cenapp.addActionPlaceholder')}</option>
                      {actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <button type="button" onClick={addDelta} disabled={busy === 'delta' || !addAction} data-testid="cenapp-add-delta"
                      className="h-8 px-2.5 text-[11px] border border-border-light hover:border-primary flex items-center gap-1 disabled:opacity-50">
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('cenapp.addDelta')}
                    </button>
                  </div>

                  {/* Form dos parâmetros da ação escolhida (tipado; nunca JSON cru) */}
                  {selectedAction && selectedAction.params.length > 0 ? (
                    <div className="border border-border-light bg-canvas-light p-2 space-y-1.5" data-testid="cenapp-params">
                      {selectedAction.params.map((p) => (
                        <ParamField key={p.name} param={p} value={deltaParams[p.name]} onChange={(v) => setParam(p.name, v)} />
                      ))}
                    </div>
                  ) : null}

                  <div className="border border-border-light" data-testid="cenapp-deltas">
                    {deltas.length === 0 ? (
                      <p className="px-3 py-3 text-[12px] text-muted-on-light italic">{t('cenapp.noDeltas')}</p>
                    ) : deltas.map((d) => (
                      <div key={d.id} className="px-3 py-1.5 border-b border-border-light/60 flex items-center gap-2 text-[11px]" data-testid={`cenapp-delta-${d.id}`}>
                        <span className="font-mono text-text-on-light truncate flex-1">{actions.find((a) => a.id === d.action_id)?.label ?? d.action_id}</span>
                        <span className={'shrink-0 ' + (d.status === 'applied' ? 'text-success' : d.status === 'failed' ? 'text-danger' : 'text-muted-on-light')}>{d.status}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={doCommit} disabled={busy === 'commit' || deltas.length === 0} data-testid="cenapp-commit"
                      className="h-8 px-3 text-[12px] bg-primary text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50">
                      {busy === 'commit' ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Play className="w-3.5 h-3.5" strokeWidth={1.5} />} {t('cenapp.commit')}
                    </button>
                    <button type="button" onClick={doDiscard} disabled={busy === 'discard'} data-testid="cenapp-discard"
                      className="h-8 px-2.5 text-[11px] border border-border-light hover:border-danger text-danger flex items-center gap-1 disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('cenapp.discard')}
                    </button>
                  </div>

                  {commit ? (
                    <div className={'flex items-center gap-2 text-[12px] px-3 py-2 border ' + (commit.deltas_failed > 0 ? 'border-warning/40 bg-warning/5' : 'border-success/40 bg-success/5')} data-testid="cenapp-commit-result">
                      {commit.deltas_failed > 0 ? <AlertCircle className="w-4 h-4 text-warning" strokeWidth={1.5} /> : <CheckCircle2 className="w-4 h-4 text-success" strokeWidth={1.5} />}
                      <span><strong>{commit.deltas_applied}</strong> {t('cenapp.applied')} · <strong>{commit.deltas_failed}</strong> {t('cenapp.failed')}</span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ActionParam;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (param.label || param.name) + (param.required ? ' *' : '');
  const base = 'h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
  let input: React.ReactNode;
  if (param.type === 'Boolean') {
    input = (
      <input
        type="checkbox"
        data-testid={`cenapp-param-${param.name}`}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4"
      />
    );
  } else if (param.type === 'Numeric') {
    input = (
      <input
        type="number"
        data-testid={`cenapp-param-${param.name}`}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={base + ' w-40'}
      />
    );
  } else {
    // String / Date / ObjectRef / ObjectSet → texto (Date com type=date).
    input = (
      <input
        type={param.type === 'Date' ? 'date' : 'text'}
        data-testid={`cenapp-param-${param.name}`}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={base + ' w-48'}
      />
    );
  }
  return (
    <label className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wide text-muted-on-light w-28 truncate">{label}</span>
      {input}
    </label>
  );
}
