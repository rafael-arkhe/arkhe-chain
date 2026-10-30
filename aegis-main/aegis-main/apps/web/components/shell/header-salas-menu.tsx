'use client';

/**
 * <HeaderSalasMenu /> — Sprint UX-3.3 (2026-05-22).
 *
 * Dropdown no header global do app com Salas em destaque (promoted
 * workspaces) da Organização ativa do operador. Foundry pattern: o
 * Carbon menu bar oferece um Navigation Menu que lista os promoted
 * workspaces; aqui replicamos no shell para que o operador possa pular
 * para qualquer Sala promovida de qualquer lugar do AEGIS.
 *
 * Consome:
 *   - GET /me/context → identifica Organização ativa
 *   - GET /organizations/{org_id}/promoted-workspaces → lista
 */
import * as React from 'react';
import Link from 'next/link';
import { LayoutDashboard, ChevronDown } from 'lucide-react';
import {
  MeContextApi,
  WorkspacePromotions,
  type PromotedWorkspace,
} from '@/lib/api';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';

export function HeaderSalasMenu() {
  const [items, setItems] = React.useState<PromotedWorkspace[]>([]);
  const [open, setOpen] = React.useState(false);
  const [orgName, setOrgName] = React.useState<string | null>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  // Wave E.1: operador esconde Salas via config.context_switcher.
  const { config } = useAppShellConfig();
  const switcherVisible = config.context_switcher.visible;
  const showPromoted = config.context_switcher.show_promoted_workspaces;

  React.useEffect(() => {
    let cancelled = false;
    MeContextApi.get()
      .then((c) => {
        if (cancelled) return;
        setOrgName(c.organization_name);
        return WorkspacePromotions.listForOrganization(c.organization_id);
      })
      .then((rows) => {
        if (cancelled || !rows) return;
        setItems(rows);
      })
      .catch(() => {
        // Silently degrade — header não deve quebrar se endpoint falhar.
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Click outside fecha.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // Esc fecha.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Wave E.1: respeita override do operador antes da heurística antiga.
  if (!switcherVisible || !showPromoted) return null;
  // Não renderiza se a Org não tem Sala em destaque.
  if (items.length === 0) return null;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="header-salas-menu"
        aria-expanded={open}
        aria-haspopup="true"
        className="h-7 px-2.5 flex items-center gap-1.5 text-[11.5px] bg-canvas-light border border-border-light hover:border-primary text-text-on-light"
        title={`Salas em destaque · ${orgName ?? ''}`}
      >
        <LayoutDashboard className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
        Salas
        <span className="text-[10px] font-mono text-muted-on-light px-1 bg-white border border-border-light h-4 inline-flex items-center">
          {items.length}
        </span>
        <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="header-salas-popover"
          className="absolute top-9 right-0 z-50 w-[320px] bg-white border border-border-light shadow-lg text-text-on-light"
        >
          <header className="px-3 py-2 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-on-light">
              Em destaque
            </p>
            {orgName && (
              <p className="text-[10.5px] font-mono text-muted-on-light truncate">
                {orgName}
              </p>
            )}
          </header>
          <ul>
            {items.map((p) => (
              <li key={p.workspace_id}>
                <Link
                  href={`/sala/${p.workspace_slug}`}
                  onClick={() => setOpen(false)}
                  data-testid={`header-salas-item-${p.workspace_slug}`}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-canvas-light border-b border-border-light last:border-b-0"
                >
                  <span className="inline-flex w-6 h-6 items-center justify-center bg-canvas-light border border-border-light shrink-0">
                    <LayoutDashboard
                      className="w-3 h-3 text-primary"
                      strokeWidth={1.5}
                    />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">
                      {p.workspace_display_name}
                    </span>
                    <span className="block text-[10px] font-mono text-muted-on-light truncate">
                      {p.workspace_slug} · v{p.workspace_version}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <footer className="px-3 py-2 border-t border-border-light flex items-center justify-between">
            <Link
              href="/painel-de-controle/salas"
              onClick={() => setOpen(false)}
              className="text-[10.5px] text-primary hover:underline"
            >
              Gerenciar Salas →
            </Link>
            <span className="text-[10px] font-mono text-muted-on-light">
              {items.length} destaque
              {items.length === 1 ? '' : 's'}
            </span>
          </footer>
        </div>
      )}
    </div>
  );
}
