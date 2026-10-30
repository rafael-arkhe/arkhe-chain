'use client';

/**
 * UserMenuPreview — Onda I.2 (2026-05-23), Feedback #3.
 *
 * Renderiza o dropdown do menu do usuário "aberto", refletindo em tempo
 * real `items` editados no Inspector. O operador edita label/icon/href
 * e vê o resultado lado-a-lado, sem precisar abrir o avatar real.
 *
 * Filtragem espelha `components/shell/user-menu.tsx`:
 *  - visible=false → omitido
 *  - kind=divider  → linha
 *  - kind=link     → MenuItem
 *  - kind=logout   → forçado last, label="Sair", non-removable
 *
 * Memória honrada:
 *  - feedback_no_rounded_no_sparkles · feedback_no_emojis_in_ui.
 *  - feedback_no_palantir_product_names · strings UI são neutras.
 */

import * as React from 'react';
import { LogOut, User as UserIcon, ShieldCheck } from 'lucide-react';
import type { AppShellUserMenuItem } from '@/lib/api';
import { iconByName } from '@/lib/icon-by-name';

export interface UserMenuPreviewProps {
  items: AppShellUserMenuItem[];
  /** Exibe nome do operador no header do dropdown. */
  operatorName?: string;
  operatorRole?: string;
  className?: string;
  testId?: string;
}

export function UserMenuPreview({
  items,
  operatorName = 'Operador',
  operatorRole = 'analista',
  className,
  testId = 'user-menu-preview',
}: UserMenuPreviewProps) {
  const visible = items.filter((it) => it.visible !== false);
  const nonLogout = visible.filter((it) => it.kind !== 'logout');
  const hasLogout = items.some((it) => it.kind === 'logout');

  return (
    <div
      data-testid={testId}
      role="menu"
      aria-label="Pré-visualização do menu do operador"
      className={[
        'w-[260px] bg-canvas-light border border-border-light text-text-on-light',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Cabeçalho */}
      <div
        data-testid={`${testId}-header`}
        className="px-3 py-2.5 border-b border-border-light bg-panel-light"
      >
        <div className="flex items-center gap-2">
          <UserIcon className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
          <p className="text-[12px] font-medium truncate">{operatorName}</p>
        </div>
        <p className="text-[10px] font-mono text-muted-on-light mt-0.5 truncate">
          {operatorRole}
        </p>
      </div>

      {/* Itens config ao vivo */}
      <ul data-testid={`${testId}-items`}>
        {nonLogout.length === 0 && (
          <li
            data-testid={`${testId}-empty`}
            className="px-3 py-3 text-[11px] text-muted-on-light italic"
          >
            Nenhum item visível — adicione no inspetor.
          </li>
        )}
        {nonLogout.map((item, idx) => {
          if (item.kind === 'divider') {
            return (
              <li
                key={`ump-${item.key}-${idx}`}
                role="separator"
                data-testid={`${testId}-divider-${item.key}`}
                className="h-px bg-border-light/60 mx-3 my-1"
              />
            );
          }
          const Icon = iconByName(item.icon ?? 'circle');
          return (
            <li
              key={`ump-${item.key}-${idx}`}
              data-testid={`${testId}-item-${item.key}`}
              className="w-full px-3 py-2 text-left text-[12px] flex items-center gap-2 border-b border-border-light/60 last:border-b-0 text-text-on-light"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              <span data-testid={`${testId}-item-${item.key}-label`} className="flex-1 truncate">
                {item.label || <em className="text-muted-on-light not-italic">(sem rótulo)</em>}
              </span>
              {item.href && (
                <span
                  data-testid={`${testId}-item-${item.key}-href`}
                  className="text-[9px] font-mono text-muted-on-light truncate max-w-[80px]"
                >
                  {item.href}
                </span>
              )}
            </li>
          );
        })}

        {/* 2FA fixo (não-configurável) */}
        <li
          data-testid={`${testId}-totp`}
          className="w-full px-3 py-2 text-left text-[12px] flex items-center gap-2 border-b border-border-light/60 text-text-on-light"
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span className="flex-1 truncate">Configurar 2FA</span>
        </li>

        {/* Logout — sempre last, non-removable */}
        {(hasLogout || true) && (
          <li
            data-testid={`${testId}-logout`}
            className="w-full px-3 py-2 text-left text-[12px] flex items-center gap-2 text-danger"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="flex-1 truncate">Sair</span>
          </li>
        )}
      </ul>
    </div>
  );
}
