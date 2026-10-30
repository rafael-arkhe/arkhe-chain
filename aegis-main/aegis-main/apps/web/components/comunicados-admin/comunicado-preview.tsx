'use client';

/**
 * Onda I.5 (2026-05-23) — ComunicadoPreview.
 *
 * Renderiza um Comunicado (draft do form OU ComunicadoOut salvo) na mesma
 * pegada visual do ComunicadosBanner do shell — para o operador admin ver
 * EXATAMENTE como o user final vai ver antes de salvar.
 *
 * Não usa o ComunicadosBanner direto porque o banner busca via API; aqui
 * recebe os campos via props (preview de draft sem id).
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · sem rounded-*, sem Sparkles.
 *  - feedback_no_emojis_in_ui · só ícones lucide.
 *  - feedback_ui_english_only (i18n) · strings curtas, sem traduções
 *    extras (a tela admin é pt-BR por escopo).
 */
import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ComunicadoKind } from '@/lib/api';

export interface ComunicadoPreviewProps {
  kind: ComunicadoKind;
  title: string;
  body: string;
  closable: boolean;
  cta_label: string | null;
  cta_href: string | null;
}

function kindStyles(kind: ComunicadoKind) {
  switch (kind) {
    case 'info':
      return {
        wrap: 'bg-info/10 border-info text-text-on-light',
        icon: 'text-info',
      };
    case 'warning':
      return {
        wrap: 'bg-warning/10 border-warning text-text-on-light',
        icon: 'text-warning',
      };
    case 'danger':
      return {
        wrap: 'bg-danger/10 border-danger text-text-on-light',
        icon: 'text-danger',
      };
    case 'success':
      return {
        wrap: 'bg-success/10 border-success text-text-on-light',
        icon: 'text-success',
      };
  }
}

function defaultIconFor(kind: ComunicadoKind) {
  switch (kind) {
    case 'info':
      return Info;
    case 'warning':
      return AlertTriangle;
    case 'danger':
      return CircleAlert;
    case 'success':
      return CircleCheck;
  }
}

/**
 * Markdown safe-subset — mesma lógica do ComunicadosBanner (não exportada
 * lá para evitar coupling cíclico; é pequena o suficiente para
 * duplicar com clareza).
 */
function renderSafeMarkdown(body: string): React.ReactNode {
  if (!body) return null;
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = body.split(re);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const safe =
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('/');
      if (!safe) return label;
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline focus:outline-none focus:ring-2 focus:ring-focus"
          onClick={(e) => e.preventDefault()}
        >
          {label}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function ComunicadoPreview({
  kind,
  title,
  body,
  closable,
  cta_label,
  cta_href,
}: ComunicadoPreviewProps) {
  const styles = kindStyles(kind);
  const IconCmp = defaultIconFor(kind);
  return (
    <div
      data-testid="comunicado-preview"
      data-kind={kind}
      role="status"
      className={cn(
        'border px-4 py-2 flex items-start gap-3 text-sm select-text',
        styles.wrap,
      )}
    >
      <IconCmp
        aria-hidden
        className={cn('w-4 h-4 mt-0.5 shrink-0', styles.icon)}
      />
      <div className="flex-1 min-w-0">
        <div
          data-testid="comunicado-preview-title"
          className="font-semibold text-[13px] leading-tight break-words"
        >
          {title || (
            <span className="opacity-50 italic">Título do comunicado</span>
          )}
        </div>
        {body && (
          <div
            data-testid="comunicado-preview-body"
            className="text-[12px] mt-0.5 leading-snug opacity-90 break-words"
          >
            {renderSafeMarkdown(body)}
          </div>
        )}
      </div>
      {cta_label && cta_href && (
        <span
          data-testid="comunicado-preview-cta"
          className={cn(
            'shrink-0 px-2 py-1 text-[12px] font-medium border',
            'inline-flex items-center gap-1',
            'border-current',
          )}
          aria-label={cta_label}
        >
          <span>{cta_label}</span>
          <ArrowRight aria-hidden className="w-3 h-3" />
        </span>
      )}
      {closable && (
        <span
          data-testid="comunicado-preview-dismiss"
          aria-hidden
          className="shrink-0 p-1 opacity-70"
        >
          <X aria-hidden className="w-4 h-4" />
        </span>
      )}
    </div>
  );
}
