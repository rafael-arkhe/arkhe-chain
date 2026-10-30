'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Layers, Trash2 } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { ConfirmProvider } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
// importa registry — cada widget se auto-registra no module-init
import '@/components/workshop/widgets';
import { Workshop } from '@/lib/workshop/client';
import { getSeed } from '@/lib/workshop/seeds';
import type { WorkshopApp, WorkshopHeaderConfig } from '@/lib/workshop/types';
import { UserViewsToolbar } from '@/components/workshop/user-views-toolbar';
import { iconByName } from '@/lib/icon-by-name';

const HEADER_PRESETS: Record<string, string> = {
  primary: '#2d77be',
  success: '#22863a',
  warning: '#d97706',
  danger: '#cc2939',
  info: '#0ea5e9',
};

function resolveHeaderColor(c: string | undefined): string | undefined {
  if (!c) return undefined;
  if (c.startsWith('#')) return c;
  return HEADER_PRESETS[c];
}

// Ações do header do app — modal sharp próprio (sem window.confirm).
// "Editar no AIP" (reabre no designer) + "Excluir app". Quando o app é uma
// CONSTRUÇÃO do AIP (tem source_diagram_id), o modal oferece remover TAMBÉM a
// construção materializada inteira (teardown governado), com inventário do que sai.
type TeardownPlan = {
  available: boolean;
  counts: Record<string, number>;
  ontology_types: string[];
};

function AppHeaderActions({ app }: { app: WorkshopApp }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [withBuild, setWithBuild] = useState(false);
  const [plan, setPlan] = useState<TeardownPlan | null>(null);

  async function openModal() {
    setWithBuild(false);
    setPlan(null);
    setOpen(true);
    if (app.source_diagram_id) {
      try {
        const p = await Workshop.teardownPlan(app.id);
        setPlan({ available: p.available, counts: p.counts, ontology_types: p.ontology_types });
      } catch {
        setPlan({ available: false, counts: {}, ontology_types: [] });
      }
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await Workshop.delete(app.id, withBuild ? { teardownBuild: true } : undefined);
      router.push('/painel-de-controle');
    } catch {
      setBusy(false);
    }
  }

  const planLines = plan
    ? ([
        ['workshop.teardown.ontologyTypes', plan.counts.ontology_types],
        ['workshop.teardown.actions', plan.counts.action_types],
        ['workshop.teardown.agents', plan.counts.agents],
        ['workshop.teardown.flows', plan.counts.flows],
        ['workshop.teardown.functions', plan.counts.logic_functions],
        // Inventário COMPLETO: Operação + Espaço + Páginas também caem.
        ['workshop.teardown.operacao', plan.counts.operacao],
        ['workshop.teardown.espaco', plan.counts.espaco],
        ['workshop.teardown.paginas', plan.counts.paginas],
      ] as const).filter(([, n]) => (n ?? 0) > 0)
    : [];

  return (
    <div className="flex items-center gap-2">
      {app.source_diagram_id && (
        <Link
          href={`/paginas/solutions/view?diagram=${app.source_diagram_id}&app=${app.id}`}
          data-testid="workshop-edit-in-aip"
          className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] border border-border-light text-text-on-light hover:bg-panel-light"
        >
          <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('workshop.editInAip')}
        </Link>
      )}
      <button
        type="button"
        onClick={openModal}
        disabled={busy}
        data-testid="workshop-delete-app"
        className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('workshop.deleteApp')}
      </button>

      {open && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center ds-overlay p-4">
          <div
            className="w-full max-w-md bg-white border border-border-light shadow-lg"
            data-testid="workshop-delete-modal"
          >
            <div className="px-4 py-3 border-b border-border-light">
              <p className="text-[13px] font-semibold text-text-on-light">
                {t('workshop.deleteAppTitle').replace('{name}', app.display)}
              </p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              <p className="text-[11px] text-muted-on-light">{t('workshop.deleteAppDesc')}</p>

              {plan?.available && (
                <label
                  className="flex items-start gap-2 p-2.5 border border-danger/30 bg-danger/5 cursor-pointer"
                  data-testid="workshop-teardown-optin"
                >
                  <input
                    type="checkbox"
                    checked={withBuild}
                    onChange={(e) => setWithBuild(e.target.checked)}
                    className="mt-0.5 accent-danger"
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-text-on-light">
                      {t('workshop.teardown.optin')}
                    </span>
                    {planLines.length > 0 && (
                      <span className="text-[10px] text-muted-on-light">
                        {planLines.map(([k, n]) => `${n} ${t(k)}`).join(' · ')}
                      </span>
                    )}
                    <span className="text-[10px] text-danger">{t('workshop.teardown.irreversible')}</span>
                  </span>
                </label>
              )}
            </div>
            <div className="px-4 py-3 border-t border-border-light flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="h-8 px-3 text-[11px] border border-border-light hover:bg-panel-light disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                data-testid="workshop-delete-confirm"
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] bg-danger text-white border border-danger hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                {withBuild ? t('workshop.teardown.confirmWithBuild') : t('workshop.deleteApp')}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}

function CustomTitle({ display, header }: { display: string; header?: WorkshopHeaderConfig }) {
  const color = resolveHeaderColor(header?.color);
  if (!header?.icon && !color) return <span>{display}</span>;
  const Icon = header?.icon ? iconByName(header.icon) : null;
  return (
    <span className="inline-flex items-center gap-2" style={color ? { color } : undefined}>
      {Icon && <Icon className="w-4 h-4" strokeWidth={1.5} />}
      <span>{display}</span>
    </span>
  );
}

export default function WorkshopViewPage({ params }: { params: Promise<{ id: string }> }) {
  const [appId, setAppId] = useState<string | null>(null);
  const [app, setApp] = useState<WorkshopApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setAppId(id));
  }, [params]);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    // Seeds locais (`seed.*`) carregam direto, sem chamar backend
    // (que exige bearer token até F4.5).
    if (appId.startsWith('seed.')) {
      const seed = getSeed(appId);
      if (seed) {
        setApp(seed);
        return;
      }
    }
    Workshop.get(appId)
      .then((a) => !cancelled && setApp(a))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [appId]);

  return (
    <RequirePerm perm="security.painel.view">
     <ConfirmProvider>
      <PageShell
        title={app ? <CustomTitle display={app.display} header={app.header_config} /> : 'Painel'}
        subtitle={app ? app.description ?? `Painel · ${app.id}` : 'Carregando…'}
        theme="light"
        toolbar={app ? <AppHeaderActions app={app} /> : undefined}
      >
        <div className="h-full overflow-y-auto">
          {error && (
            <div className="m-4 p-3 border border-danger bg-danger/10 text-[12px] text-danger">
              Não foi possível abrir este painel. Detalhe técnico: {error}
            </div>
          )}
          {/* Seeds locais não têm UUID → não suportam persistência server.
              Pula a toolbar nesses casos. */}
          {app && appId && !appId.startsWith('seed.') && (
            <UserViewsToolbar
              appId={appId}
              appNameSingular={app.state_saving_config?.display_name}
              appNamePlural={app.state_saving_config?.display_name_plural}
            />
          )}
          {app && <WorkshopV2Renderer app={app} />}
          {!app && !error && (
            <p className="m-4 text-[11px] text-muted-on-light italic">Carregando…</p>
          )}
        </div>
      </PageShell>
     </ConfirmProvider>
    </RequirePerm>
  );
}
