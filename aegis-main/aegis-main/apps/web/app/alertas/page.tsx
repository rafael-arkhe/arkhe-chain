'use client';

/**
 * /alertas — 100% parametrizável via editor de Páginas (2026-06-12).
 *
 * O JSX fixo antigo (3 painéis: canais fixos + lista + detalhe) MORREU
 * (ADD-ou-DELETE). A rota agora RESOLVE a página registrada `alertas`
 * (registered_pages do tenant — mesmo trilho de /paginas/[slug]/view)
 * e renderiza via WorkshopV2Renderer:
 *
 *  - seed default (backend pages.py): KPIs de pendentes por severidade
 *    (metric_card sobre variables count reais) + widget alert_list
 *    (API do inbox unificado) — SEM dado fake;
 *  - "Personalizar" (workspace.publish) abre o editor da página;
 *  - página registrada sumiu → fallback honesto: seed local com o
 *    alert_list real + aviso explícito (nunca silêncio, nunca fake);
 *  - 403 do backend (perm/marcação da página) → acesso negado.
 */
import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Lock, Pencil } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { useCan } from '@/lib/auth/useAuth';
import { Pages } from '@/lib/api';
import type { RegisteredPage } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets'; // registry populado
import {
  coercePageConfig,
  pageToWorkshopApp,
} from '@/components/pages-editor/page-config-adapter';
import { ALERTAS_FALLBACK_SEED } from '@/lib/workshop/seeds/alertas';
import { useT } from '@/lib/i18n/provider';
import type { WorkshopApp } from '@/lib/workshop/types';

type Resolution =
  | { state: 'loading' }
  | { state: 'page'; app: WorkshopApp }
  | { state: 'fallback' }
  | { state: 'denied' };

export default function AlertasPage() {
  const t = useT();
  const canPersonalizar = useCan('workspace.publish');
  const [res, setRes] = React.useState<Resolution>({ state: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    // enforce=true: o backend gateia iam_perm_required + marcações da
    // página e responde 403 real (mesma política da view de Páginas).
    Pages.get('alertas', { enforce: true })
      .then((page: RegisteredPage) => {
        if (cancelled) return;
        const config = coercePageConfig(page.config);
        if (config.mode === 'workshop' && config.workshop_layout.root.length > 0) {
          setRes({ state: 'page', app: pageToWorkshopApp(page, config) });
        } else {
          // Página existe mas sem layout montável → seed local honesto.
          setRes({ state: 'fallback' });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 403) {
          setRes({ state: 'denied' });
          return;
        }
        // 404 (página deletada) ou erro de rede → recria do seed local.
        setRes({ state: 'fallback' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RequirePerm perm="security.alertas.view">
      <PageShell
        title={t('alertas.title')}
        classification="restrito"
        classificationLabel={t('alertas.classification')}
        theme="light"
        toolbar={
          canPersonalizar ? (
            <Link
              href="/painel-de-controle/paginas/alertas/edit"
              data-testid="alertas-personalizar"
              className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.5} />
              {t('alertas.personalizar')}
            </Link>
          ) : null
        }
      >
        <div className="h-full overflow-y-auto bg-canvas-light">
          {res.state === 'denied' && (
            <div className="p-6" data-testid="alertas-denied">
              <div className="border border-border-light p-4 text-[11px] font-mono text-muted-on-light bg-white flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                <span>{t('alertas.detail.restricted')}</span>
              </div>
            </div>
          )}

          {res.state === 'fallback' && (
            <>
              <div
                data-testid="alertas-fallback-aviso"
                className="mx-4 mt-4 border border-warning/40 bg-white px-3 py-2 text-[11px] text-muted-on-light flex items-center gap-2"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" strokeWidth={1.5} />
                {t('alertas.fallbackSeed')}
              </div>
              <WorkshopV2Renderer app={ALERTAS_FALLBACK_SEED} />
            </>
          )}

          {res.state === 'page' && <WorkshopV2Renderer app={res.app} />}
        </div>
      </PageShell>
    </RequirePerm>
  );
}
