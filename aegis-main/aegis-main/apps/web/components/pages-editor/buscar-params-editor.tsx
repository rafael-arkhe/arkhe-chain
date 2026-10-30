'use client';

/**
 * Parametrização da /buscar — editor de PARÂMETROS (não widgets).
 *
 * A /buscar é app_route (servida por código; widgets bloqueados, decisão fixa). Mas a
 * PARAMETRIZAÇÃO dela é editável aqui: as FINALIDADES (LGPD) do "Montar dossiê", que a
 * página lê via useDossierPurposes da WorkshopVariable static `dossier_purposes` no app
 * `security.buscar-config`. Este editor é a página limpa pra editar isso (em vez do painel
 * de variáveis enterrado). Salva → a /buscar reflete na hora. Default neutro (bases LGPD)
 * quando vazio.
 */
import * as React from 'react';
import { Plus, Trash2, Loader2, Check, SlidersHorizontal, ChevronDown } from 'lucide-react';

import { Workshop } from '@/lib/workshop/client';
import type { WorkshopApp, WorkshopVariable } from '@/lib/workshop/types';
import { useT } from '@/lib/i18n/provider';
import { registerExperienceConfig } from '@/lib/pages/experience-registry';
import {
  ACCESS_PURPOSE_DEFS,
  BUSCAR_CONFIG_SLUG,
  DOSSIER_PURPOSES_VAR,
  coercePurposes,
} from '@/lib/buscar/access-purposes';

/** ``experience_kind`` da /buscar (contrato do backend, seed canônico). */
export const BUSCAR_EXPERIENCE_KIND = 'buscar';

type LoadState = 'loading' | 'ready' | 'error';

export function BuscarParamsEditor() {
  const t = useT();
  const neutral = React.useMemo(() => ACCESS_PURPOSE_DEFS.map((d) => t(d.labelKey)), [t]);

  const [app, setApp] = React.useState<WorkshopApp | null>(null);
  const [purposes, setPurposes] = React.useState<string[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Workshop.get(BUSCAR_CONFIG_SLUG)
      .then((a) => {
        if (cancelled) return;
        setApp(a);
        const v = a.variables?.find((x) => x.external_id === DOSSIER_PURPOSES_VAR);
        const list = coercePurposes(v?.default).map((p) => p.label);
        setPurposes(list.length ? list : neutral);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setApp(null); // ainda não criado → usa default neutro
        setPurposes(neutral);
        setState('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [neutral]);

  const setAt = (i: number, v: string) => {
    setSaved(false);
    setPurposes((p) => p.map((x, j) => (j === i ? v : x)));
  };
  const add = () => {
    setSaved(false);
    setPurposes((p) => [...p, '']);
  };
  const remove = (i: number) => {
    setSaved(false);
    setPurposes((p) => p.filter((_, j) => j !== i));
  };
  const resetNeutral = () => {
    setSaved(false);
    setPurposes(neutral);
  };

  async function save() {
    const clean = purposes.map((s) => s.trim()).filter(Boolean);
    setSaving(true);
    setErr(null);
    const varDef: WorkshopVariable = {
      id: 'var.dossier_purposes',
      external_id: DOSSIER_PURPOSES_VAR,
      label: 'Finalidades de acesso (LGPD)',
      type: 'Json',
      kind: 'static',
      recompute_mode: 'event_only',
      default: clean,
    };
    try {
      if (app) {
        const others = (app.variables ?? []).filter((v) => v.external_id !== DOSSIER_PURPOSES_VAR);
        const upd = await Workshop.update(app.id, { variables: [...others, varDef] });
        setApp(upd);
      } else {
        const created = await Workshop.create({
          display: 'Configuração da Busca',
          external_id: BUSCAR_CONFIG_SLUG,
          description: 'Parametrização da /buscar (finalidades LGPD).',
          variables: [varDef],
        } as Partial<WorkshopApp> & { display: string });
        setApp(created);
      }
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('buscar.params.save.error'));
    } finally {
      setSaving(false);
    }
  }

  const previewOption = (purposes.find((p) => p.trim()) || t('buscar.params.preview.fallbackOption')).trim();

  return (
    <div className="max-w-2xl w-full bg-white border border-border-light" data-testid="buscar-params-editor">
      <div className="h-10 px-3 border-b border-border-light flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-on-light">{t('buscar.params.header.title')}</span>
        <span className="ml-auto text-[10px] text-muted-on-light">{t('buscar.params.header.widgetsLocked')}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* O que é — contexto pra qualquer um entender sem manual. */}
        <div className="border border-border-light bg-canvas-light p-3">
          <p className="text-[12px] text-text-on-light leading-relaxed">
            <span className="font-semibold">{t('buscar.params.about.title')}</span>{' '}
            {t('buscar.params.about.body')}
          </p>
        </div>

        {state === 'loading' && (
          <p className="text-[11px] text-muted-on-light italic flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
          </p>
        )}

        {state === 'ready' && (
          <section className="space-y-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-on-light font-semibold">
                {t('buscar.params.finalidade.label')}
              </p>
              <p className="text-[12px] text-muted-on-light mt-1 leading-relaxed">
                {t('buscar.params.finalidade.help.pre')}{' '}
                <span className="font-semibold text-text-on-light">{t('buscar.params.finalidade.help.action')}</span>{' '}
                {t('buscar.params.finalidade.help.post')}
              </p>
            </div>

            {/* Pré-visualização: onde a lista aparece pro operador. */}
            <div className="border border-border-light bg-raised-light/50 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light mb-1.5">
                {t('buscar.params.preview.title')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-muted-on-light font-mono">{t('buscar.params.preview.montarDossie')}</span>
                <span className="text-muted-on-light">→</span>
                <span className="text-[11px] text-text-on-light">{t('buscar.params.preview.finalidadeLabel')}</span>
                <span className="inline-flex items-center gap-2 h-7 px-2 bg-white border border-border-light text-[11px] text-text-on-light">
                  {previewOption}
                  <ChevronDown className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                </span>
              </div>
            </div>

            {/* Editor da lista. */}
            <ul className="space-y-1.5">
              {purposes.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-5 text-[11px] text-muted-on-light font-mono text-right">{i + 1}.</span>
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => setAt(i, e.target.value)}
                    placeholder={t('buscar.params.finalidade.placeholder')}
                    data-testid={`buscar-param-finalidade-${i}`}
                    className="flex-1 h-8 px-2 text-[12px] bg-canvas-light border border-border-light outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    title={t('buscar.params.finalidade.remove')}
                    aria-label={t('buscar.params.finalidade.remove')}
                    className="w-7 h-7 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={add}
                className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 text-text-on-light"
              >
                <Plus className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} /> {t('buscar.params.finalidade.add')}
              </button>
              <button
                type="button"
                onClick={resetNeutral}
                className="h-7 px-2.5 text-[11px] text-muted-on-light hover:text-text-on-light underline-offset-2 hover:underline"
              >
                {t('buscar.params.finalidade.reset')}
              </button>
            </div>

            {err && <p className="text-[11px] text-danger">{err}</p>}

            <div className="pt-3 border-t border-border-light flex items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                data-testid="buscar-params-salvar"
                className="h-8 px-3 text-[12px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                ) : saved ? (
                  <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                ) : null}
                {saving ? t('buscar.params.save.saving') : saved ? t('buscar.params.save.saved') : t('buscar.params.save.cta')}
              </button>
              <span className="text-[11px] text-muted-on-light">
                {saved ? t('buscar.params.save.hint.saved') : t('buscar.params.save.hint.pending')}
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Auto-registro: importar este módulo torna a experiência `buscar`
// configurável pelo registry genérico (igual ao auto-registro de widgets
// e do registerAppRoute). A lista de Páginas e o editor roteiam pelo
// experience_kind, não pelo slug.
registerExperienceConfig(BUSCAR_EXPERIENCE_KIND, {
  ConfigEditor: BuscarParamsEditor,
  labelKey: 'pages.configureExperience',
});
