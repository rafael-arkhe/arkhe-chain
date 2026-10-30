'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MeContextApi } from '@/lib/api';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { useT } from '@/lib/i18n/provider';
import { iconByName } from '@/lib/icon-by-name';
import { cn } from '@/lib/cn';
import pkg from '../../package.json';

/**
 * Footer — Wave E.1 + H.4.Y + SHELL HONESTO (2026-06-12).
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  columns grid (legacy footer.columns)                            │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │  status_bar (left | center | right items + system metrics)       │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Wave H.4.Y: status_bar_items dinâmicos. type="system" → valor calculado
 * no front (cpu/ram/time/locale). type="custom" → operador grava label+
 * value+href.
 *
 * SHELL HONESTO: a faixa default NÃO mostra mais marca de domínio fake.
 *  - Unidade/organização vem do MESMO contexto real do banner
 *    (GET /me/context → project_name ?? organization_name); sem contexto,
 *    o campo simplesmente não aparece.
 *  - O identificador de instância fabricado ('srv-<tenant>-01') morreu.
 *  - Versão vem do package.json real do build (não literal solto).
 *  - 'conectado' só aparece depois do /me/context responder; falha →
 *    'sem conexão'; antes disso, 'verificando…'. Nunca verde por default.
 */

/** Versão real do build — única fonte: package.json. */
const APP_VERSION = `v${pkg.version}`;

interface SystemHook {
  value: string;
  label: string;
}

function useSystemMetrics() {
  // CPU/RAM via `navigator.deviceMemory` / `hardwareConcurrency` (fallback
  // determinístico — sem polling agressivo). Tempo BRT atualiza por
  // interval.
  const [time, setTime] = useState<string>('');
  const [cpu, setCpu] = useState<string>('');
  const [ram, setRam] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const local = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      });
      setTime(`${local} BRT`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const cores =
      (navigator as Navigator & { hardwareConcurrency?: number })
        .hardwareConcurrency ?? 0;
    if (cores) setCpu(`${cores}c`);
    const deviceMemory =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (deviceMemory) setRam(`${deviceMemory}GB`);
  }, []);

  return useMemo<Record<string, SystemHook>>(
    () => ({
      'system.cpu': { value: cpu || '—', label: 'CPU' },
      'system.ram': { value: ram || '—', label: 'RAM' },
      'system.time': { value: time, label: 'Hora' },
      'system.locale': { value: 'pt-BR', label: 'Locale' },
    }),
    [cpu, ram, time],
  );
}

type ConnState = 'checking' | 'online' | 'offline';

/**
 * Identidade REAL da sessão — mesma fonte do banner de classificação
 * (useContextClassification): GET /me/context. A resposta também é o
 * sinal honesto de conectividade com o backend.
 */
function useBackendIdentity(): { label: string; conn: ConnState } {
  const [label, setLabel] = useState('');
  const [conn, setConn] = useState<ConnState>('checking');

  useEffect(() => {
    let cancel = false;
    MeContextApi.get()
      .then((ctx) => {
        if (cancel) return;
        setLabel(ctx.project_name ?? ctx.organization_name ?? '');
        setConn('online');
      })
      .catch(() => {
        if (!cancel) setConn('offline');
      });
    return () => {
      cancel = true;
    };
  }, []);

  return { label, conn };
}

export function Footer() {
  const { config } = useAppShellConfig();
  const systemMetrics = useSystemMetrics();
  const identity = useBackendIdentity();
  const t = useT();

  if (!config.footer.visible) {
    return null;
  }

  const columns = config.footer.columns ?? [];
  const statusItems = config.footer.status_bar_items ?? [];
  const copyright = config.footer.copyright_text;
  const versionVisible = config.footer.version_visible !== false;

  // Group status items by position. The default (no config) uses the
  // honest legacy strip.
  const itemsByPos = {
    left: statusItems.filter((i) => i.position === 'left'),
    center: statusItems.filter((i) => i.position === 'center'),
    right: statusItems.filter((i) => i.position === 'right'),
  };
  const useCustomStatus = statusItems.length > 0;

  return (
    <footer
      data-testid="footer"
      className="bg-panel-dark border-t border-border-dark text-muted-on-dark shrink-0 select-none"
      // Onda brand2 (2026-07-09) — cores de região do tenant (fallbacks =
      // tokens DS panel-dark/muted-on-dark → default idêntico). `--footer-text`
      // é a cor base; herdada por links/status; os títulos usam --footer-accent.
      style={{
        backgroundColor: 'var(--footer-bg, #14181E)',
        color: 'var(--footer-text, #8A93A0)',
      }}
    >
      {columns.length > 0 && (
        <div
          data-testid="footer-columns"
          className="px-6 py-3 grid gap-6 text-[11px]"
          style={{
            gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {columns.map((col, ci) => (
            <div key={`col-${ci}`} data-testid={`footer-column-${ci}`}>
              <p
                className="text-[10px] uppercase tracking-[0.18em] text-text-on-dark font-semibold mb-1.5"
                style={{ color: 'var(--footer-accent, #E6E9EE)' }}
              >
                {col.title}
              </p>
              <ul className="space-y-1">
                {col.links.map((link, li) => (
                  <li key={`link-${ci}-${li}`}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`footer-link-${ci}-${li}`}
                        className="text-muted-on-dark hover:text-text-on-dark"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        data-testid={`footer-link-${ci}-${li}`}
                        className="text-muted-on-dark hover:text-text-on-dark"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {useCustomStatus ? (
        <div
          data-testid="footer-status-bar"
          className="h-6 flex items-center px-3 gap-3 font-mono text-[10px] border-t border-border-dark"
        >
          <StatusGroup
            items={itemsByPos.left}
            systemMetrics={systemMetrics}
            align="left"
          />
          <div className="flex-1 flex items-center justify-center gap-3">
            <StatusGroup
              items={itemsByPos.center}
              systemMetrics={systemMetrics}
              align="center"
            />
          </div>
          <StatusGroup
            items={itemsByPos.right}
            systemMetrics={systemMetrics}
            align="right"
          />
          {(copyright || versionVisible) && (
            <span
              data-testid="footer-extras"
              className="ml-3 opacity-70 flex items-center gap-3"
            >
              {copyright && <span>{copyright}</span>}
              {versionVisible && (
                <span data-testid="footer-version">{APP_VERSION}</span>
              )}
            </span>
          )}
        </div>
      ) : (
        <LegacyFooterStrip />
      )}
    </footer>
  );

  function LegacyFooterStrip() {
    return (
      <div className="h-6 flex items-center px-3 gap-4 font-mono text-[10px] border-t border-border-dark">
        {identity.label && (
          <>
            <span data-testid="footer-context-label">{identity.label}</span>
            <span className="opacity-40">·</span>
          </>
        )}
        <span suppressHydrationWarning>{systemMetrics['system.time'].value}</span>
        {versionVisible && (
          <>
            <span className="opacity-40">·</span>
            <span data-testid="footer-version">{APP_VERSION}</span>
          </>
        )}
        <span
          data-testid="footer-conn"
          className="ml-auto flex items-center gap-1.5"
        >
          <span
            className={cn(
              'w-1.5 h-1.5',
              identity.conn === 'online'
                ? 'bg-success'
                : identity.conn === 'offline'
                  ? 'bg-danger'
                  : 'bg-border-dark',
            )}
          />
          <span>
            {identity.conn === 'online'
              ? t('footer.connected')
              : identity.conn === 'offline'
                ? t('footer.offline')
                : t('footer.checking')}
          </span>
        </span>
      </div>
    );
  }
}

function StatusGroup({
  items,
  systemMetrics,
  align,
}: {
  items: Array<{
    key: string;
    label: string;
    icon?: string | null;
    type: 'system' | 'custom';
    value?: string | null;
    href?: string | null;
  }>;
  systemMetrics: Record<string, { value: string; label: string }>;
  align: 'left' | 'center' | 'right';
}) {
  if (items.length === 0) {
    if (align === 'left' || align === 'right') {
      return <span aria-hidden className="inline-block" />;
    }
    return null;
  }
  return (
    <div
      data-testid={`footer-status-${align}`}
      className="flex items-center gap-3"
    >
      {items.map((item, idx) => {
        const Icon = item.icon ? iconByName(item.icon) : null;
        const value =
          item.type === 'system'
            ? systemMetrics[item.key]?.value ?? '—'
            : item.value ?? '';
        const content = (
          <>
            {Icon && <Icon className="w-3 h-3" strokeWidth={1.5} aria-hidden />}
            <span className="opacity-80">{item.label}</span>
            {value && <span suppressHydrationWarning>{value}</span>}
          </>
        );
        const cls = cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap',
          item.href && 'hover:text-text-on-dark',
        );
        if (item.href) {
          return (
            <Link
              key={`fs-${align}-${item.key}-${idx}`}
              href={item.href}
              data-testid={`footer-status-item-${item.key}`}
              className={cls}
            >
              {content}
            </Link>
          );
        }
        return (
          <span
            key={`fs-${align}-${item.key}-${idx}`}
            data-testid={`footer-status-item-${item.key}`}
            className={cls}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
