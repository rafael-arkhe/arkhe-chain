'use client';

/**
 * Dev (Safe Core) — M3.
 *
 * Área vendor-only: customização dos itens de navegação do Painel de Controle
 * + edição dos domínios licenciados do tenant (`allowed_domains`).
 *
 * Tudo é persistido server-side (ontology-module · Tenant.metadata_) — NUNCA
 * localStorage (memory feedback_no_localstorage_for_persistence). A seleção
 * de domínios é por checkbox de uma LISTA FECHADA vinda de GET /domains —
 * nunca texto livre (memory feedback_no_manual_technical_input).
 *
 * Gate de UI: RequirePerm perm="vendor.dev_mode". A barreira REAL é
 * server-side: os endpoints /vendor/* exigem role vendor + dev-mode ativo
 * (require_vendor_dev_mode) — admin não passa.
 */
import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { useT } from '@/lib/i18n/provider';
import { useAuth } from '@/lib/auth/useAuth';
import {
  CpPageHeader,
  CP_NAV_ITEMS,
  CP_NAV_SECTIONS,
} from '@/components/control-panel/control-panel-shell';
import { MODULAR_APP_NAV } from '@/lib/nav/modular-apps';
import { VendorApi, type DomainOption } from '@/lib/api';

export default function DevPage() {
  return (
    <RequirePerm perm="vendor.dev_mode">
      <DevInner />
    </RequirePerm>
  );
}

function DevInner() {
  const t = useT();
  const { principal, refresh } = useAuth();
  // Gap-fix (revisão M2/M3): o RequirePerm vendor.dev_mode é cosmético (admin
  // faz short-circuit), então admin chegava aqui e os fetches /vendor/* 403avam
  // (Promise.all rejeitava tudo → checkboxes vazios + erros no console). Gate
  // real da UI = dev-mode ATIVO; sem isso, painel inerte apontando pra Conta.
  // Os cards (que chamam /vendor/*) só montam com dev-mode ativo → fetch 200.
  const devActive = !!principal?.dev_mode?.enabled;

  return (
    <>
      <CpPageHeader title={t('dev.page.title')} subtitle={t('dev.page.subtitle')} />
      <div className="p-6 max-w-3xl space-y-4">
        {devActive ? (
          <>
            <DomainsCard onSaved={refresh} />
            <NavCard onSaved={refresh} />
          </>
        ) : (
          <section
            className="bg-canvas-light border border-border-light p-4"
            data-testid="dev-inactive"
          >
            <p className="text-[12px] font-medium text-text-on-light">
              {t('dev.page.inactiveTitle')}
            </p>
            <p className="text-[11px] text-muted-on-light mt-1 leading-relaxed">
              {t('dev.page.inactiveHint')}
            </p>
            <Link
              href="/painel-de-controle/conta"
              data-testid="dev-goto-conta"
              className="inline-flex mt-3 h-8 px-3 items-center text-[12px] bg-white border border-border-light text-text-on-light hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {t('dev.page.gotoConta')}
            </Link>
          </section>
        )}
      </div>
    </>
  );
}

/* ── Domínios licenciados (multi-select de lista fechada) ─────────────────── */
function DomainsCard({ onSaved }: { onSaved: () => Promise<void> }) {
  const t = useT();
  const [catalog, setCatalog] = React.useState<DomainOption[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [opts, current] = await Promise.all([
          VendorApi.listDomains(),
          VendorApi.getTenantDomains(),
        ]);
        if (cancelled) return;
        setCatalog(opts);
        setSelected(new Set(current.allowed_domains));
      } catch {
        if (!cancelled) setError(t('common.retry'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const toggle = (slug: string) => {
    setSavedMsg(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await VendorApi.setTenantDomains([...selected]);
      setSavedMsg(true);
      await onSaved();
    } catch {
      setError(t('common.retry'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-canvas-light border border-border-light"
      data-testid="dev-domains"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
          {t('dev.domains.title')}
        </p>
      </header>
      <div className="p-4 space-y-3">
        <p className="text-[11px] text-muted-on-light leading-relaxed">
          {t('dev.domains.help')}
        </p>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('dev.domains.title')}>
          {catalog.map((d) => {
            const on = selected.has(d.slug);
            return (
              <button
                key={d.slug}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(d.slug)}
                data-testid={`dev-domain-${d.slug}`}
                className={
                  'h-9 px-3 flex items-center gap-2 text-[12px] border transition-colors text-left ' +
                  (on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-light bg-white text-text-on-light hover:border-primary/50')
                }
              >
                <span
                  className={
                    'inline-flex w-4 h-4 items-center justify-center border shrink-0 ' +
                    (on ? 'bg-primary border-primary' : 'border-border-light')
                  }
                >
                  {on && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                </span>
                <span className="truncate">{d.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            data-testid="dev-domains-save"
            className="h-8 px-3 text-[11px] bg-primary text-white border border-primary disabled:opacity-50 hover:bg-primary/90"
          >
            {t('dev.domains.save')}
          </button>
          {savedMsg && (
            <span className="text-[11px] text-success" data-testid="dev-domains-saved">
              {t('dev.domains.saved')}
            </span>
          )}
          {error && (
            <span className="text-[11px] text-danger" role="alert">
              {error}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Customização de NAV_ITEMS (mostrar/esconder) ─────────────────────────── */
function NavCard({ onSaved }: { onSaved: () => Promise<void> }) {
  const t = useT();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [savedMsg, setSavedMsg] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await VendorApi.getNavOverrides();
        if (!cancelled) setHidden(new Set(body.hidden));
      } catch {
        if (!cancelled) setError(t('common.retry'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Itens elegíveis (exclui o próprio "dev" pra não causar auto-lockout).
  const items = CP_NAV_ITEMS.filter((i) => i.id !== 'dev');
  const sectionOf = (key: string) =>
    CP_NAV_SECTIONS.find((s) => s.key === key)?.label ?? key;
  // Agrupa por seção, preservando ordem das seções (top primeiro).
  const grouped: Record<string, typeof items> = {};
  for (const it of items) {
    (grouped[it.section] ??= []).push(it);
  }
  const sectionOrder = ['top', ...CP_NAV_SECTIONS.map((s) => s.key)];

  const tNav = (id: string, fallback: string) => {
    const out = t(`nav.${id}`);
    return out === `nav.${id}` ? fallback : out;
  };
  const tKey = (key: string, fallback: string) => {
    const out = t(key);
    return out === key ? fallback : out;
  };

  const toggle = (id: string) => {
    setSavedMsg(false);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await VendorApi.setNavOverrides([...hidden]);
      setSavedMsg(true);
      await onSaved();
    } catch {
      setError(t('common.retry'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-canvas-light border border-border-light"
      data-testid="dev-nav"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center bg-raised-light/40">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
          {t('dev.nav.title')}
        </p>
      </header>
      <div className="p-4 space-y-3">
        <p className="text-[11px] text-muted-on-light leading-relaxed">
          {t('dev.nav.help')}
        </p>
        <div className="space-y-3 max-h-[360px] overflow-y-auto">
          {sectionOrder.map((skey) => {
            const list = grouped[skey];
            if (!list || list.length === 0) return null;
            return (
              <div key={skey}>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold mb-1">
                  {skey === 'top' ? '—' : sectionOf(skey)}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {list.map((it) => {
                    const isHidden = hidden.has(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        role="switch"
                        aria-checked={!isHidden}
                        onClick={() => toggle(it.id)}
                        data-testid={`dev-nav-${it.id}`}
                        className={
                          'h-8 px-3 flex items-center justify-between gap-2 text-[12px] border transition-colors text-left ' +
                          (isHidden
                            ? 'border-border-light bg-white text-muted-on-light line-through'
                            : 'border-primary/40 bg-primary/5 text-text-on-light')
                        }
                      >
                        <span className="truncate">{tNav(it.id, it.label)}</span>
                        <span className="text-[9px] uppercase tracking-wider shrink-0">
                          {isHidden ? t('dev.nav.hidden') : t('dev.nav.visible')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* LOTE2 (#1): as 3 Páginas modulares do shell do OPERADOR
              (Conversas/Agentes/Soluções) também são alternáveis pelo vendor.
              Os ids (`app-route-${slug}`) são os MESMOS de use-nav-tree, então
              esconder aqui (cp_nav_hidden) remove o item do sidenav do operador. */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold mb-1">
              {tKey('dev.nav.modularGroup', 'Aplicações')}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {MODULAR_APP_NAV.map((it) => {
                const isHidden = hidden.has(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    role="switch"
                    aria-checked={!isHidden}
                    onClick={() => toggle(it.id)}
                    data-testid={`dev-nav-${it.id}`}
                    className={
                      'h-8 px-3 flex items-center justify-between gap-2 text-[12px] border transition-colors text-left ' +
                      (isHidden
                        ? 'border-border-light bg-white text-muted-on-light line-through'
                        : 'border-primary/40 bg-primary/5 text-text-on-light')
                    }
                  >
                    <span className="truncate">{tNav(it.id, it.label)}</span>
                    <span className="text-[9px] uppercase tracking-wider shrink-0">
                      {isHidden ? t('dev.nav.hidden') : t('dev.nav.visible')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            data-testid="dev-nav-save"
            className="h-8 px-3 text-[11px] bg-primary text-white border border-primary disabled:opacity-50 hover:bg-primary/90"
          >
            {t('dev.nav.save')}
          </button>
          {savedMsg && (
            <span className="text-[11px] text-success" data-testid="dev-nav-saved">
              {t('dev.nav.saved')}
            </span>
          )}
          {error && (
            <span className="text-[11px] text-danger" role="alert">
              {error}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
