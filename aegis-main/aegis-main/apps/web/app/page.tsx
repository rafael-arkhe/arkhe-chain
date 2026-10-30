'use client';

import { useEffect, useState } from 'react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets'; // self-register de todos
import { HOME_SEED_APP } from '@/lib/workshop/seeds/home';
import { useResolvedApp } from '@/lib/workshop/runtime';
import { Pages } from '@/lib/api';
import { HomeSkeleton } from '@/components/painel/home-skeleton';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { useContextClassification } from '@/lib/use-context-classification';
import { useCctvCount } from '@/lib/data/cctv-count-store';
import {
  coercePageConfig,
  pageToWorkshopApp,
} from '@/components/pages-editor/page-config-adapter';
import type { WorkshopApp } from '@/lib/workshop/types';

/**
 * Onda J.1 (2026-05-23) — Home unificada no Workshop.
 *
 * A `/` renderiza UMA única camada: o renderer do Workshop. O layout
 * vem de:
 *
 *   1. Página inicial escolhida — quando o operador configurou
 *      `config.homepage.page_id` (em /painel-de-controle/app-shell aba
 *      "Página inicial"), resolvemos essa Página do Registro de Páginas
 *      e a renderizamos via o MESMO adapter usado pelo editor de Páginas
 *      (`pageToWorkshopApp`). 78 widgets reais.
 *   2. Home padrão (seed) — quando não há escolha, cai pra
 *      `useResolvedApp(HOME_SEED_APP)` (slug `seed.security.home`),
 *      preservando o comportamento histórico.
 *
 * Camadas eliminadas nesta onda (`feedback_no_deprecation` — delete
 * limpo, sem meio-termo):
 *   - `HomepageMount` (blocos de 4 tipos: heading/paragraph/divider/link)
 *     — redundante com o Workshop. DELETADO.
 *   - `home-shell-config` (hero_text + sections) — sem editor desde que
 *     a aba "Página inicial" passou a ser atalho pro editor; redundante
 *     com o Workshop. Removido do render.
 */
export default function PainelOperacionalPage() {
  const { config } = useAppShellConfig();
  const homePageSlug = config.homepage?.page_id ?? null;
  // Unidade/Operação REAL do /me/context — mesma fonte do banner.
  const { label: ctxLabel } = useContextClassification();

  // Fallback path (seed) — sempre montado (hooks estáveis); só usado
  // quando não há Página inicial escolhida.
  const seed = useResolvedApp(HOME_SEED_APP);

  // Página inicial escolhida → resolve do Registro de Páginas.
  const [pageApp, setPageApp] = useState<WorkshopApp | null>(null);
  const [pageState, setPageState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );

  useEffect(() => {
    if (!homePageSlug) {
      setPageApp(null);
      setPageState('idle');
      return;
    }
    let cancelled = false;
    setPageState('loading');
    Pages.get(homePageSlug)
      .then((page) => {
        if (cancelled) return;
        const coerced = coercePageConfig(page.config);
        const workshopConfig =
          coerced.mode === 'workshop'
            ? coerced
            : { mode: 'workshop' as const, workshop_layout: { columns: 20, root: [] } };
        setPageApp(pageToWorkshopApp(page, workshopConfig));
        setPageState('ready');
      })
      .catch(() => {
        // Página inicial inválida/removida → cai pro seed silenciosamente.
        if (cancelled) return;
        setPageApp(null);
        setPageState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [homePageSlug]);

  // Subtitle: contagem CCTV via store COMPARTILHADO (#12) — 1 poller global
  // dedupado com os KPIs/timeline da Home, em vez de um setInterval próprio.
  const { data: cctvCount } = useCctvCount();

  // Resolução final: Página inicial escolhida (quando pronta) vence;
  // senão o seed. `loading` cobre o estado em que a Página ainda carrega.
  const usingPage = !!homePageSlug && pageState === 'ready' && pageApp !== null;
  const app = usingPage ? (pageApp as WorkshopApp) : seed.app;
  const source = usingPage ? 'page' : seed.source;
  const loading =
    !!homePageSlug && pageState === 'loading' ? true : usingPage ? false : seed.loading;

  // Home = Página escolhida ⇒ o header é DELA (título da Página, sem o
  // subtítulo CCTV do dashboard de inteligência). Durante o load da Página o
  // subtítulo também some (sem flash de "CCTV 0/0"); se a Página falhar
  // (pageState=error) a home volta ao seed e o subtítulo CCTV volta junto.
  const chromeIsPage = !!homePageSlug && pageState !== 'error';

  return (
    <RequirePerm perm="security.painel.view">
      <PageShell
        title={usingPage ? app.display || 'Início' : 'Início'}
        subtitle={
          chromeIsPage
            ? undefined
            : `CCTV ${cctvCount?.streams_online ?? 0}/${cctvCount?.streams_total ?? 0} streams`
        }
        classification="confidencial"
        // SHELL HONESTO (2026-06-12): unidade REAL do /me/context (mesma
        // fonte do banner/rodapé) — a marca fake '13ª DP' morreu.
        classificationLabel={ctxLabel ? `OPERAÇÕES ATIVAS · ${ctxLabel}` : 'OPERAÇÕES ATIVAS'}
        theme="light"
      >
        <div
          className="h-full overflow-y-auto"
          data-home-source={source}
          data-home-app-id={app.id}
          data-home-page-slug={usingPage ? homePageSlug : undefined}
        >
          {loading ? (
            <HomeSkeleton />
          ) : (
            <div style={{ animation: 'home-fade-in 320ms ease-out both' }}>
              <WorkshopV2Renderer app={app} />
            </div>
          )}
        </div>
      </PageShell>
    </RequirePerm>
  );
}
