'use client';

/**
 * Dropdown do operador no header — espelha o padrão consumido em outros
 * módulos AEGIS, adaptado pro tema Palantir-sharp do security-app.
 *
 * Itens vêm da config persistida em ``app_shell.user_menu.items``
 * (Wave H.4.Y). Logout é sempre o último, não removível: mesmo que o
 * operador apague no editor, o backend reinjeta.
 *
 * Sprint H1 (2026-05-22): Painel de Controle ficou full-bleed (Palantir-
 * style); saiu do sidenav e passou a ser atalho exclusivo deste dropdown.
 *
 * Sprint H1.3 (2026-05-22): item "Painel de Controle" renomeado pra
 * "Configurações" (com ícone Cog). O antigo link standalone
 * "Configurações" → /configuracoes foi removido — todo o conteúdo de
 * /configuracoes migrou pra /painel-de-controle/preferencias.
 *
 * Sem shadcn Popover: dropdown próprio com click-outside listener.
 */
import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth, useCan } from '@/lib/auth/useAuth';
import { TotpDialog } from '@/components/iam/TotpDialog';
import { iconByName } from '@/lib/icon-by-name';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import type { AppShellUserMenuItem } from '@/lib/api';

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  testId?: string;
}

function MenuItem({
  icon: Icon,
  label,
  href,
  onClick,
  variant = 'default',
  testId,
}: MenuItemProps) {
  const cls = cn(
    'w-full px-3 py-2 text-left text-[12px] flex items-center gap-2 border-b border-border-light/60 last:border-b-0',
    variant === 'danger'
      ? 'text-danger hover:bg-danger/10'
      : 'text-text-on-light hover:bg-raised-light',
  );
  if (href) {
    return (
      <Link href={href} className={cls} data-testid={testId} onClick={onClick}>
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
        <span className="flex-1 truncate">{label}</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      data-testid={testId}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

function Divider({ testId }: { testId?: string }) {
  return (
    <div
      role="separator"
      data-testid={testId}
      className="h-px bg-border-light/60 mx-3 my-1"
    />
  );
}

export function UserMenu() {
  const { principal, logout } = useAuth();
  const canConfiguracoes = useCan('painel.home.view');
  const { config } = useAppShellConfig();
  const [open, setOpen] = React.useState(false);
  const [totpOpen, setTotpOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Click-outside fecha o menu.
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Esc fecha o menu.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!principal) {
    return (
      <Link
        href="/login"
        data-testid="header-login"
        className="h-8 px-2 flex items-center gap-2 text-[12px] hover:bg-raised-light transition-colors"
      >
        <UserIcon className="w-4 h-4" strokeWidth={1.5} />
        <span className="hidden md:inline">Entrar</span>
      </Link>
    );
  }

  const display = principal.display_name || principal.username;
  const role = principal.roles[0] ?? 'sem papel';

  // Filtra itens config: invisíveis ignorados; logout reposicionado pro
  // fim e marcado como non-removable. Se config.items vazio, usa o
  // fallback hardcoded (mantém compat com tests pré-H.4.Y).
  const items = (config.user_menu?.items ?? []) as AppShellUserMenuItem[];
  const visibleItems = items.filter((it) => it.visible !== false);
  const nonLogout = visibleItems.filter((it) => it.kind !== 'logout');
  const hasLogout = items.some((it) => it.kind === 'logout');
  const useConfigItems = visibleItems.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu do operador"
        data-testid="header-user-menu"
        className={cn(
          'h-8 px-2 flex items-center gap-2 hover:bg-raised-light transition-colors',
          open && 'bg-raised-light',
        )}
      >
        {/* Feedback #16 (2026-05-24) — removido o ícone lucide `User` do
            gatilho do dropdown do operador; o gatilho mostra o nome +
            chevron, mantendo o estilo do header. */}
        <span
          className="text-[12px] hidden md:inline"
          data-testid="header-user"
        >
          {display}
        </span>
        <ChevronDown
          className={cn(
            'w-3 h-3 transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          data-testid="header-user-dropdown"
          className="absolute right-0 top-full mt-1 w-[260px] bg-canvas-light border border-border-light text-text-on-light z-50"
        >
          {/* ─── Cabeçalho ─────────────────────────── */}
          <div className="px-3 py-2.5 border-b border-border-light bg-panel-light">
            <p className="text-[12px] font-medium truncate">{display}</p>
            <p className="text-[10px] font-mono text-muted-on-light mt-0.5 truncate">
              {principal.username} · {role}
            </p>
            {principal.tenant?.display_name && (
              <p className="text-[10px] font-mono text-muted-on-light mt-0.5 truncate">
                {principal.tenant.display_name}
              </p>
            )}
            {principal.clearances && principal.clearances.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {principal.clearances.slice(0, 4).map((c) => (
                  <span
                    key={c}
                    className="h-4 px-1 text-[9px] font-mono uppercase tracking-wider border border-border-light text-muted-on-light flex items-center"
                  >
                    {c.replace('CLEARANCE_', '')}
                  </span>
                ))}
                {principal.clearances.length > 4 && (
                  <span className="h-4 px-1 text-[9px] font-mono text-muted-on-light flex items-center">
                    +{principal.clearances.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─── Itens (config) ──────────────────────── */}
          {useConfigItems ? (
            <>
              {nonLogout.map((item) => {
                if (item.kind === 'divider') {
                  return (
                    <Divider
                      key={`um-${item.key}`}
                      testId={`header-user-divider-${item.key}`}
                    />
                  );
                }
                const Icon = iconByName(item.icon ?? 'circle');
                if (item.key === 'configuracoes' && !canConfiguracoes) {
                  return null;
                }
                return (
                  <MenuItem
                    key={`um-${item.key}`}
                    icon={Icon}
                    label={item.label}
                    href={item.href ?? undefined}
                    onClick={() => setOpen(false)}
                    testId={`header-user-${item.key}`}
                  />
                );
              })}
              {/* 2FA — não-configurável, sempre presente */}
              <MenuItem
                icon={ShieldCheck}
                label={
                  principal.totp_enabled
                    ? 'Reconfigurar 2FA'
                    : 'Configurar 2FA'
                }
                onClick={() => {
                  setOpen(false);
                  setTotpOpen(true);
                }}
                testId="header-user-totp"
              />
              {/* Logout — sempre last, non-removable */}
              {(hasLogout || true) && (
                <MenuItem
                  icon={LogOut}
                  label="Sair"
                  variant="danger"
                  onClick={() => {
                    setOpen(false);
                    void logout();
                  }}
                  testId="header-user-logout"
                />
              )}
            </>
          ) : (
            <UserMenuFallback
              canConfiguracoes={canConfiguracoes}
              totpEnabled={!!principal.totp_enabled}
              onTotp={() => {
                setOpen(false);
                setTotpOpen(true);
              }}
              onLogout={() => {
                setOpen(false);
                void logout();
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      )}

      <TotpDialog open={totpOpen} onOpenChange={setTotpOpen} />
    </div>
  );
}

function UserMenuFallback({
  canConfiguracoes,
  totpEnabled,
  onTotp,
  onLogout,
  onClose,
}: {
  canConfiguracoes: boolean;
  totpEnabled: boolean;
  onTotp: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const Cog = iconByName('cog');
  const Activity = iconByName('activity');
  return (
    <>
      {canConfiguracoes && (
        <MenuItem
          icon={Cog}
          label="Configurações"
          href="/painel-de-controle"
          onClick={onClose}
          testId="header-user-configuracoes"
        />
      )}
      <MenuItem
        icon={Activity}
        label="Auditoria"
        href="/iam/auditoria"
        onClick={onClose}
        testId="header-user-auditoria"
      />
      <MenuItem
        icon={ShieldCheck}
        label={totpEnabled ? 'Reconfigurar 2FA' : 'Configurar 2FA'}
        onClick={onTotp}
        testId="header-user-totp"
      />
      <MenuItem
        icon={LogOut}
        label="Sair"
        variant="danger"
        onClick={onLogout}
        testId="header-user-logout"
      />
    </>
  );
}
