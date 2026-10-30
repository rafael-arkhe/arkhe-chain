'use client';

/**
 * CpCommandPalette — overlay tipo ⌘J (Cmd/Ctrl+J).
 *
 * Sprint H6 (2026-05-22). Lista flat de TODAS as settings do Painel de
 * Controle, filtrável por substring. Atalho global registrado em
 * `ControlPanelShell` via `keydown` listener.
 *
 * Items vêm hard-coded (mesma lista do shell). Pra futura expansão,
 * trocar por `ControlPanel.search()` backend.
 */
import * as React from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';

interface SearchItem {
  label: string;
  href: string;
  group: string;
}

// Sprint H1.2 (2026-05-22): Comunicações + Atividade migraram do Geral
// pros grupos Unidade/Organização (espelho Foundry). Lineage adicionado
// como novo item da Unidade (ex-Fluxos do sidenav).
//
// Sprint H1.3 (2026-05-22): "Configurações da unidade" → /configuracoes
// substituído por 3 entries "Preferências · X" → /painel-de-controle/
// preferencias[/...] (Geral, Browser, Notificações).
const ITEMS: SearchItem[] = [
  { label: 'Início', href: '/painel-de-controle', group: 'Geral' },
  { label: 'Aprovações', href: '/painel-de-controle/aprovacoes', group: 'Geral' },
  { label: 'Catálogo de apps', href: '/workshop', group: 'Unidade' },
  { label: 'Catálogo de agentes', href: '/agentes', group: 'Unidade' },
  { label: 'Tipos de objeto', href: '/ontologia/tipos', group: 'Unidade' },
  { label: 'Instâncias da ontologia', href: '/ontologia/instancias', group: 'Unidade' },
  { label: 'Grafo da ontologia', href: '/ontologia/grafo', group: 'Unidade' },
  { label: 'Comunicações', href: '/painel-de-controle/comunicacoes', group: 'Unidade' },
  { label: 'Lineage', href: '/fluxos', group: 'Unidade' },
  { label: 'Equipe', href: '/iam/equipe', group: 'Organização' },
  { label: 'Papéis', href: '/iam/papeis', group: 'Organização' },
  { label: 'Permissões', href: '/iam/permissoes', group: 'Organização' },
  { label: 'Auditoria', href: '/iam/auditoria', group: 'Organização' },
  // Sprint H1.5: items renomeados (Preferências dupliva categoria).
  { label: 'Conta', href: '/painel-de-controle/conta', group: 'Organização' },
  { label: 'Browser do servidor', href: '/painel-de-controle/browser', group: 'Organização' },
  { label: 'Notificações', href: '/painel-de-controle/notificacoes', group: 'Organização' },
  { label: 'Atividade dos usuários', href: '/painel-de-controle/atividade', group: 'Organização' },
];

export function CpCommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => setHighlight(0), [query]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results = q ? ITEMS.filter((i) => i.label.toLowerCase().includes(q)) : ITEMS;

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar no Painel de Controle"
      data-testid="cp-command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={() => setOpen(false)}
    >
      {/* Sprint H1.5: text-text-on-light explícito — body default é
          text-text-on-dark (globals.css). Sem isso, input fica branco
          no fundo branco. Mesmo bug do ControlPanelShell root. */}
      <div
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl flex flex-col text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-3 py-2 border-b border-border-light flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const it = results[highlight];
                if (it) {
                  const target = it.href.startsWith('/painel-de-controle')
                    ? it.href
                    : it.href.includes('?')
                      ? `${it.href}&cp=1`
                      : `${it.href}?cp=1`;
                  window.location.href = target;
                  setOpen(false);
                }
              }
            }}
            placeholder="Buscar configurações…"
            data-testid="cp-command-palette-input"
            className="flex-1 h-7 text-[13px] outline-none bg-transparent text-text-on-light placeholder:text-muted-on-light"
          />
          <kbd className="text-[10px] font-mono text-muted-on-light/70">Esc</kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>
        <ul className="max-h-[380px] overflow-y-auto" data-testid="cp-command-palette-list">
          {results.length === 0 && (
            <li className="px-3 py-4 text-[12px] text-muted-on-light italic">
              Nenhuma configuração encontrada.
            </li>
          )}
          {results.map((it, i) => {
            // Sprint H1.4: hrefs externos ganham ?cp=1 (mesma lógica do
            // CpNavLink — AuthShell envelopa no ControlPanelShell).
            const decorated = it.href.startsWith('/painel-de-controle')
              ? it.href
              : it.href.includes('?')
                ? `${it.href}&cp=1`
                : `${it.href}?cp=1`;
            return (
              <li key={it.href}>
                <Link
                  href={decorated}
                  data-testid={`cp-command-palette-result-${it.href.replace(/\//g, '-')}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-3 h-9 text-[12.5px] border-b border-border-light/40 last:border-b-0',
                    highlight === i ? 'bg-primary/5 text-primary' : 'text-text-on-light hover:bg-canvas-light',
                  )}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="flex-1 truncate">{it.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light shrink-0">
                    {it.group}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <footer className="px-3 py-1.5 border-t border-border-light/60 bg-canvas-light text-[10px] text-muted-on-light flex items-center gap-3">
          <span>
            <kbd className="font-mono">↑↓</kbd> navegar
          </span>
          <span>
            <kbd className="font-mono">Enter</kbd> abrir
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> fechar
          </span>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
