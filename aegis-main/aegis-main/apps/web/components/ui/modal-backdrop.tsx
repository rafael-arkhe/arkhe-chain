'use client';

/**
 * ModalBackdrop — primitivo CANÔNICO de backdrop de modal/popup full-screen
 * (ELO BACKDROP).
 *
 * Invariantes DS ("A Sala de Situação Clara"):
 *   - scrim ESCURO SÓLIDO único (`.ds-overlay` = token `deep` @70%), idêntico
 *     em toda a app — nada de `bg-black/30`–`/80` divergentes;
 *   - SEM glassmorphism / `backdrop-blur` (BANIDO — só elementos que FLUTUAM
 *     dentro de um canvas usam blur, jamais o backdrop de um modal);
 *   - cantos retos (0px, herdado do tailwind.config);
 *   - cobre o chrome (banner de classificação + header branco) sem "linha
 *     branca no topo": o scrim é opaco o bastante para o #FFFFFF do header
 *     não vazar, e o z-index do overlay fica acima do chrome (base-level).
 *
 * Modais EXISTENTES adotam a classe `.ds-overlay` in-place (preserva estrutura
 * e ordem de empilhamento). NOVOS modais devem usar este componente.
 *
 * Dois modos:
 *   - `position="fixed"` (default): o próprio backdrop cobre a viewport. É
 *     renderizado num PORTAL para `document.body` (ELO PORTAL — ver
 *     `ModalPortal` abaixo) → escapa qualquer containing-block ancestral e o
 *     `position:fixed` volta a ser relativo à viewport (cobre header/banner/
 *     painéis irmãos). Passe a classe de z-index via `className` (ex.: "z-50");
 *     sem ela usa o default canônico, acima do chrome.
 *   - `position="absolute"`: scrim FILHO de um root já posicionado
 *     (`fixed inset-0 z-..`), o padrão dos drawers/dialogs em portal. Cobre o
 *     pai; o z-index é o do root. NÃO é portado (portar quebraria o
 *     ancoramento ao root).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * ModalPortal — ELO PORTAL. Renderiza `children` como filho DIRETO de
 * `document.body`, via React portal.
 *
 * Causa-raiz (corrigida 2026-06): um modal `fixed inset-0` declarado DENTRO de
 * `<main>` / de uma coluna de canvas ou chat herda o CONTAINING BLOCK de algum
 * ancestral que use `transform` / `filter` / `will-change` / `contain` /
 * `perspective`. Qualquer uma dessas propriedades faz o `position:fixed` se
 * ancorar NAQUELE ancestral — não na viewport. O scrim então "vaza" o header
 * (a linha branca no topo) e não cobre os painéis irmãos (ex.: o painel direito
 * do AIP). Portar o overlay p/ `document.body` remove todo ancestral → `fixed`
 * volta a cobrir a viewport inteira. (A CommandPalette nunca sofreu o bug
 * porque já era renderizada na RAIZ do AuthShell.)
 *
 * SSR-safe: sem `document` (servidor) renderiza nada. Modais só abrem por
 * interação no cliente, então não há mismatch de hidratação.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/** z-index default do overlay full-screen — acima do chrome (header/banner/
 *  footer são base-level; dropdowns do header são z-50). Só aplicado quando
 *  `position="fixed"` e o consumidor não passou nenhuma classe `z-`. */
const DEFAULT_FIXED_Z = 'z-[120]';

export interface ModalBackdropProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Clique no scrim (tipicamente fechar). */
  onClick?: () => void;
  /**
   * `fixed` (default) cobre a viewport; `absolute` cobre o pai posicionado
   * (scrim filho de um root `fixed inset-0`).
   */
  position?: 'fixed' | 'absolute';
  /** Conteúdo opcional empilhado sobre o scrim (ex.: o card do modal). */
  children?: React.ReactNode;
}

export function ModalBackdrop({
  onClick,
  position = 'fixed',
  className,
  children,
  ...rest
}: ModalBackdropProps) {
  // Só injeta o z default quando é overlay fixo E o consumidor não declarou
  // um z- próprio (não sobrescreve empilhamento intencional).
  const hasZ = !!className && /(^|\s)z-/.test(className);
  const el = (
    <div
      aria-hidden={children ? undefined : 'true'}
      data-ds-overlay="true"
      onClick={onClick}
      className={cn(
        'ds-overlay inset-0',
        position === 'fixed' ? 'fixed' : 'absolute',
        position === 'fixed' && !hasZ && DEFAULT_FIXED_Z,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
  // Overlay FIXO cobre a viewport → vai p/ portal em `document.body` (escapa
  // qualquer containing-block ancestral). Scrim `absolute` é filho de um root
  // já posicionado → renderiza in-place.
  if (position === 'fixed') return <ModalPortal>{el}</ModalPortal>;
  return el;
}
