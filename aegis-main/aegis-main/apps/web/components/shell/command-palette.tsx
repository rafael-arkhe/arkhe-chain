'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  FileText,
  Filter,
  LayoutDashboard,
  LayoutTemplate,
  Map,
  Search,
  Share2,
  Shield,
  User,
  Video,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCommandPalette } from '@/lib/store';
import { Entities } from '@/lib/api';
import type { Entity } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';

const ROTAS = [
  { href: '/', label: 'Ir para — Início', icon: LayoutDashboard },
  { href: '/buscar', label: 'Ir para — Buscar', icon: Search },
  { href: '/explorador', label: 'Ir para — Explorador', icon: Filter },
  { href: '/rede', label: 'Ir para — Rede', icon: Share2 },
  { href: '/geo', label: 'Ir para — Mapa', icon: Map },
  { href: '/cameras', label: 'Ir para — Câmeras', icon: Video },
  { href: '/alertas', label: 'Ir para — Alertas', icon: Bell },
  { href: '/briefings', label: 'Ir para — Briefings', icon: LayoutTemplate },
  { href: '/relatorios', label: 'Ir para — Relatórios', icon: FileText },
  { href: '/admin', label: 'Ir para — Administração', icon: Shield },
];

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  // SHELL HONESTO (2026-06-12): objetos vêm do backend REAL
  // (Entities.list, debounce 250ms). O corpus fabricado MOCK_OBJECTS
  // morreu — offline a paleta lista só rotas, nunca fichas inventadas.
  const [objects, setObjects] = useState<Entity[]>([]);
  const router = useRouter();

  useEffect(() => {
    const q = query.trim();
    if (!open || !q) {
      setObjects([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      Entities.list({ q, limit: '6' })
        .then((d) => {
          if (!cancelled) setObjects(d.slice(0, 6));
        })
        .catch(() => {
          if (!cancelled) setObjects([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const matchingRoutes = q
    ? ROTAS.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.href.toLowerCase().includes(q),
      )
    : ROTAS;
  const all = [
    ...matchingRoutes.map((r) => ({ kind: 'rota' as const, ...r })),
    ...objects.map((o) => ({
      kind: 'objeto' as const,
      href: `/ficha/${o.id}`,
      label: `Abrir ficha — ${o.name}`,
      icon: User,
    })),
  ];

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-label="Paleta de comandos"
      data-testid="command-palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 ds-overlay"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[640px] max-w-[92vw] bg-panel-dark border border-border-dark shadow-panel-dark"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-10 border-b border-border-dark">
          <Search className="w-4 h-4 text-muted-on-dark" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, all.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = all[highlight];
                if (target) {
                  router.push(target.href);
                  setOpen(false);
                }
              }
            }}
            placeholder="Buscar comando, rota, objeto…"
            className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-muted-on-dark"
          />
          <span className="font-mono text-[10px] text-muted-on-dark">ESC</span>
        </div>

        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {all.length === 0 ? (
            <li className="px-3 py-6 text-center text-muted-on-dark text-[12px]">
              Nenhum resultado para "{query}"
            </li>
          ) : (
            all.map((item, i) => {
              const Icon = item.icon;
              return (
                <li key={`${item.kind}-${item.href}-${i}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => {
                      router.push(item.href);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-left transition-colors',
                      highlight === i
                        ? 'bg-raised-dark text-text-on-dark'
                        : 'text-muted-on-dark hover:bg-raised-dark/60',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{item.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-on-dark opacity-60">
                      {item.kind === 'rota' ? 'rota' : 'objeto'}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
    </ModalPortal>
  );
}
