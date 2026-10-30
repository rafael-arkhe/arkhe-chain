'use client';

/**
 * /workshop/kiosk/[id] — Sprint E4 do Parity Audit (2026-05-20).
 *
 * Renderiza um painel Workshop em modo "totem": fullscreen sem chrome
 * AEGIS (sem sidenav, sem header global). Pensado pra walls operacionais
 * / monitores fixos / displays de sala de operações onde só o painel deve
 * aparecer, sem distração de navegação interna.
 *
 * Diferenças vs `/workshop/view/[id]`:
 *   - NÃO usa `<PageShell>` (que injeta sidenav + header AEGIS).
 *   - Barra superior mínima de 40px: ícone do header_config + título.
 *   - Sem toolbar de user-views, sem botão Editar/Voltar.
 *   - Gate por permissão dedicada: `security.workshop.kiosk` (display only;
 *     o painel em si ainda pode ter `security.painel.view` por baixo).
 *
 * Bindings vindos da URL (`?var.foo=bar`) continuam funcionando — o
 * `WorkshopV2Renderer` faz a leitura/escrita do query string.
 */

import { useEffect, useState } from 'react';
import { RequirePerm } from '@/components/auth/require-perm';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
// importa registry — cada widget se auto-registra no module-init
import '@/components/workshop/widgets';
import { Workshop } from '@/lib/workshop/client';
import { getSeed } from '@/lib/workshop/seeds';
import type { WorkshopApp } from '@/lib/workshop/types';
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

export default function WorkshopKioskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [appId, setAppId] = useState<string | null>(null);
  const [app, setApp] = useState<WorkshopApp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setAppId(id));
  }, [params]);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    // Seeds locais carregam direto, sem chamar backend.
    if (appId.startsWith('seed.')) {
      const seed = getSeed(appId);
      if (seed) {
        setApp(seed);
        return;
      }
    }
    Workshop.get(appId)
      .then((a) => !cancelled && setApp(a))
      .catch(
        (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const headerIcon = app?.header_config?.icon;
  const HeaderIcon = headerIcon ? iconByName(headerIcon) : null;
  const titleColor = resolveHeaderColor(app?.header_config?.color);

  return (
    <RequirePerm perm="security.workshop.kiosk">
      <div
        className="h-screen w-screen bg-canvas-light flex flex-col overflow-hidden surface-light"
        data-testid="workshop-kiosk-root"
      >
        <header
          className="h-10 px-4 border-b border-border-light flex items-center gap-2 shrink-0 bg-panel-light"
          data-testid="workshop-kiosk-header"
        >
          {HeaderIcon && (
            <HeaderIcon
              className="w-4 h-4"
              strokeWidth={1.5}
              style={titleColor ? { color: titleColor } : undefined}
            />
          )}
          <h1
            className="text-[13px] font-semibold text-text-on-light truncate"
            style={titleColor ? { color: titleColor } : undefined}
          >
            {app?.display ?? 'Painel'}
          </h1>
          <div className="flex-1" />
          <p className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-on-light">
            Totem · somente leitura
          </p>
        </header>
        <main
          className="flex-1 overflow-y-auto"
          data-testid="workshop-kiosk-body"
        >
          {error && (
            <div className="m-4 p-3 border border-danger bg-danger/10 text-[12px] text-danger">
              Não foi possível abrir este painel. Detalhe técnico: {error}
            </div>
          )}
          {!app && !error && (
            <p className="m-4 text-[11px] text-muted-on-light italic">
              Carregando…
            </p>
          )}
          {app && <WorkshopV2Renderer app={app} />}
        </main>
      </div>
    </RequirePerm>
  );
}
