'use client';

/**
 * Ficha · Ações do tipo (`security.ficha.acoes`) — P5, multidomínio.
 *
 * Lista as AÇÕES declaradas no contrato do Object Type (`type_def.actions` do
 * objectTypeSchema) como botões e as executa pelo pipeline GOVERNADO da
 * plataforma — `ActionTypes.execute` (POST /platform/v23/action-types/{id}/
 * execute), o MESMO trilho que os apps AIP/Workshop usam: gates de
 * marking/clearance + LineageEvent + Plan/Act. Zero hardcode por fonte/vertical
 * — vale pra carro, país, empresa, evento, operação, conector, qualquer tipo.
 *
 * A ação opera sobre a instância da ficha via `object_id` (convenção dos
 * builtin_handlers do backend). O contrato expõe a ação pelo NOME; o execute
 * precisa do id da ActionType — resolvemos via catálogo (`ActionTypes.list`,
 * carregado on-demand no 1º execute), sem novo endpoint.
 */
import * as React from 'react';
import { Loader2, AlertCircle, CheckCircle2, ShieldAlert, Zap } from 'lucide-react';
import {
  ActionTypes,
  type ObjectTypeSchema,
  type ObjectTypeAction,
  type ActionExecuteResult,
} from '@/lib/api';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import { useTypeActions, coerceActionParam, type ActionCatalog } from '@/lib/ficha/type-actions';
import { useT } from '@/lib/i18n/provider';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';

type ObjLite = { id?: string; name?: string; entity_type?: string };
type Cfg = { note?: string };
type Outcome = { tone: 'ok' | 'warn' | 'deny' | 'err'; msg: string };

function ParamInput({
  type,
  value,
  placeholder,
  onChange,
}: {
  type: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const t = (type || '').toLowerCase();
  const cls =
    'h-7 px-2 text-[11px] font-mono border border-border-light bg-white w-full focus:outline-none focus:border-primary';
  if (t === 'boolean' || t === 'bool') {
    return (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  const isNum = t === 'number' || t === 'integer' || t === 'int' || t === 'float' || t === 'double';
  return (
    <input
      type={isNum ? 'number' : 'text'}
      className={cls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FichaAcoes({ config, variables }: WidgetRenderProps) {
  const t = useT();
  const cfg = (config ?? {}) as Cfg;
  const typeDef = (variables?.type_def as ObjectTypeSchema | null) ?? null;
  const obj = (variables?.obj as ObjLite | undefined) ?? undefined;
  const objectId = typeof obj?.id === 'string' ? obj.id : '';
  const { actions, loading } = useTypeActions(typeDef, obj?.entity_type);

  // name→id (catálogo de ActionTypes; resolvido on-demand no 1º execute).
  const catalogRef = React.useRef<ActionCatalog | null>(null);
  const ensureCatalog = React.useCallback(async (): Promise<ActionCatalog> => {
    if (catalogRef.current) return catalogRef.current;
    const list = await ActionTypes.list();
    const map: ActionCatalog = {};
    for (const a of list) map[a.name] = a.id;
    catalogRef.current = map;
    return map;
  }, []);

  const [openName, setOpenName] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, Record<string, string>>>({});
  const [busyName, setBusyName] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, Outcome>>({});

  const setParam = (action: string, key: string, v: string) =>
    setValues((prev) => ({ ...prev, [action]: { ...(prev[action] ?? {}), [key]: v } }));

  const run = React.useCallback(
    async (action: ObjectTypeAction) => {
      if (!objectId) {
        setResults((r) => ({ ...r, [action.name]: { tone: 'err', msg: t('ficha.acoes.semObjeto') } }));
        return;
      }
      const ok = await confirmModal({
        title: t('ficha.acoes.confirmTitulo'),
        description: `${action.name} · ${obj?.name ?? objectId}`,
        confirmLabel: t('ficha.acoes.executar'),
      });
      if (!ok) return;
      setBusyName(action.name);
      setResults((r) => {
        const next = { ...r };
        delete next[action.name];
        return next;
      });
      try {
        const map = await ensureCatalog();
        const id = map[action.name];
        if (!id) throw new Error(t('ficha.acoes.semId'));
        const params = values[action.name] ?? {};
        const input: Record<string, unknown> = { object_id: objectId };
        for (const p of action.parameters ?? []) {
          const v = coerceActionParam(p.type, params[p.key] ?? '');
          if (v !== undefined) input[p.key] = v;
        }
        const res: ActionExecuteResult = await ActionTypes.execute(id, input, cfg.note);
        if (res.status === 'SUCCESS') {
          setResults((r) => ({ ...r, [action.name]: { tone: 'ok', msg: t('ficha.acoes.sucesso') } }));
        } else if (res.status === 'PENDING_APPROVAL') {
          setResults((r) => ({ ...r, [action.name]: { tone: 'warn', msg: t('ficha.acoes.pendente') } }));
        } else if (res.status === 'POLICY_DENIED') {
          setResults((r) => ({ ...r, [action.name]: { tone: 'deny', msg: t('ficha.acoes.negado') } }));
        } else {
          setResults((r) => ({ ...r, [action.name]: { tone: 'err', msg: t('ficha.acoes.falha') } }));
        }
        setOpenName(null);
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setResults((r) => ({ ...r, [action.name]: { tone: 'err', msg: humanizeApiError(raw) } }));
      } finally {
        setBusyName(null);
      }
    },
    [objectId, obj?.name, ensureCatalog, values, cfg.note, t],
  );

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2"
      data-testid="ficha-acoes"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1">
        <Zap className="w-3 h-3" strokeWidth={1.5} />
        {t('ficha.acoes.titulo')}
      </p>

      {loading && (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          {t('ficha.acoes.carregando')}
        </p>
      )}

      {!loading && actions.length === 0 && (
        <p className="text-[11px] text-muted-on-light italic" data-testid="ficha-acoes-empty">
          {t('ficha.acoes.vazio')}
        </p>
      )}

      {actions.map((a) => {
        const hasParams = (a.parameters?.length ?? 0) > 0;
        const isOpen = openName === a.name;
        const busy = busyName === a.name;
        const outcome = results[a.name];
        return (
          <div
            key={a.name}
            className="border border-border-light bg-canvas-light"
            data-testid="ficha-acoes-action"
            data-action={a.name}
          >
            <button
              type="button"
              disabled={busy}
              data-testid={`ficha-acoes-trigger-${a.name}`}
              onClick={() => {
                if (busy) return;
                if (hasParams) setOpenName((n) => (n === a.name ? null : a.name));
                else void run(a);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-left text-[11px] hover:bg-white transition-colors"
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" strokeWidth={1.5} />
              ) : (
                <Zap className="w-3 h-3 shrink-0 text-muted-on-light" strokeWidth={1.5} />
              )}
              <span className="font-medium truncate flex-1">{a.name}</span>
              {a.rule && a.rule !== 'custom' && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light border border-border-light px-1 py-0.5">
                  {a.rule}
                </span>
              )}
              {hasParams && (
                <span className="text-[9px] font-mono text-muted-on-light">
                  {a.parameters.length} {t('ficha.acoes.parametros')}
                </span>
              )}
            </button>

            {isOpen && hasParams && (
              <div className="px-2.5 pb-2.5 pt-1 flex flex-col gap-1.5 border-t border-border-light">
                {a.parameters.map((p) => (
                  <label key={p.key} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
                      {p.title || p.key}
                    </span>
                    <ParamInput
                      type={p.type}
                      value={values[a.name]?.[p.key] ?? ''}
                      placeholder={p.type}
                      onChange={(v) => setParam(a.name, p.key, v)}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  data-testid={`ficha-acoes-run-${a.name}`}
                  onClick={() => void run(a)}
                  className="h-7 px-3 self-start text-[11px] border bg-primary text-white border-primary hover:bg-primary-hover disabled:opacity-40"
                >
                  {t('ficha.acoes.executar')}
                </button>
              </div>
            )}

            {outcome && (
              <p
                data-testid={`ficha-acoes-result-${a.name}`}
                className={`px-2.5 pb-1.5 text-[10px] flex items-center gap-1 ${
                  outcome.tone === 'ok'
                    ? 'text-primary'
                    : outcome.tone === 'warn'
                      ? 'text-warning'
                      : 'text-danger'
                }`}
              >
                {outcome.tone === 'ok' ? (
                  <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                ) : outcome.tone === 'warn' ? (
                  <ShieldAlert className="w-3 h-3" strokeWidth={1.5} />
                ) : (
                  <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
                )}
                {outcome.msg}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

registerWidget('security.ficha.acoes', FichaAcoes, {
  fichaTab: 'acoes',
  group: 'ficha',
  label: 'Ficha · ações do tipo',
  description:
    'Ações declaradas no contrato do tipo (objectTypeSchema.actions) executadas pelo pipeline governado da plataforma (gates + lineage). Genérico para qualquer Object Type.',
  icon: 'zap',
  defaultColSpan: 20,
  mockVariables: {
    obj: { id: 'demo-node-1', name: 'Alvo de exemplo', entity_type: 'imovel' },
    type_def: {
      kind: 'imovel',
      display_name: 'Imóvel',
      title_property: 'nome',
      count: 0,
      properties: [],
      links: [],
      actions: [
        { name: 'Atualizar status', rule: 'custom', parameters: [{ key: 'novo_status', type: 'string', title: 'Novo status' }] },
        { name: 'Arquivar', rule: 'custom', parameters: [] },
      ],
    },
  },
  config_schema: [
    {
      name: 'note',
      label: 'Observação da execução',
      description: 'Justificativa registrada na auditoria (LineageEvent) de cada execução.',
      field: 'string',
      placeholder: 'Justificativa registrada na auditoria',
    },
  ],
});
