'use client';

import * as React from 'react';
import { useClassification } from '@/lib/store';
import {
  CLASSIFICATION_BG,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TEXT,
  type ClassificationLevel,
} from '@/lib/classification';
import { cn } from '@/lib/cn';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { ArrowLeftRight, Clock, X } from 'lucide-react';
import { MeContextApi, type MeContext } from '@/lib/api';
import { CpContextSwitcher } from '@/components/control-panel/cp-context-switcher';

const DISMISS_KEY = 'aegis.shell.banner.dismissed';

/**
 * Onda M1.b (2026-05-23, Feedback #11) — truncamento por SLOT.
 *
 * O shape de `config.banner.truncate` é semeado pelo agente da config
 * (M1.a) em `defaults.ts` + tipos em `lib/api`. Aqui (renderer) consumimos
 * de forma DEFENSIVA: se o campo ainda não existir em runtime (config antiga
 * ou agente de config em paralelo), caímos no default abaixo. Assim o banner
 * nunca quebra nem regride — e quando os tipos pousarem o consumo continua
 * idêntico.
 */
interface BannerTruncateConfig {
  enabled: boolean;
  max_chars_per_slot: number;
  responsive: boolean;
}

const DEFAULT_BANNER_TRUNCATE: BannerTruncateConfig = {
  enabled: true,
  max_chars_per_slot: 24,
  responsive: true,
};

function resolveTruncate(banner: unknown): BannerTruncateConfig {
  const raw = (banner as { truncate?: Partial<BannerTruncateConfig> } | null)
    ?.truncate;
  if (!raw) return DEFAULT_BANNER_TRUNCATE;
  const max = Number(raw.max_chars_per_slot);
  return {
    enabled: raw.enabled ?? DEFAULT_BANNER_TRUNCATE.enabled,
    max_chars_per_slot:
      Number.isFinite(max) && max > 0
        ? max
        : DEFAULT_BANNER_TRUNCATE.max_chars_per_slot,
    responsive: raw.responsive ?? DEFAULT_BANNER_TRUNCATE.responsive,
  };
}

function readDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function setDismissed(v: boolean) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DISMISS_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Classification + Context Banner.
 *
 * Wave E.1: visibility + subtitle override via `config.banner`.
 * Wave H.4.Y (2026-05-23): extended — operator can pin a classification,
 * inject custom_text (override the level label), choose position
 * (top|bottom — UI hint), show a clock, and mark the banner as dismissible.
 *
 * Onda K.4 (2026-05-23, Feedback #3): o banner deixou de ser texto estático
 * e virou uma **barra de contexto viva**. Ele lê o contexto operacional
 * atual via `MeContextApi.get()` (Organização · Espaço · Operação) e
 * renderiza os SLOTS ligados em `config.banner.context_slots` + um botão
 * "Trocar" que abre o Context Switcher existente (`CpContextSwitcher`).
 * A duplicação "Texto customizado" + "Subtítulo (legacy)" foi removida —
 * só resta `custom_text` (texto livre opcional).
 *
 * No modo preview do composer (`isPreview`), o banner NÃO faz fetch de
 * contexto (usa placeholders) nem abre o switcher — evita efeitos colaterais.
 */
export function ClassificationBanner() {
  const { level: storeLevel, label } = useClassification();
  const { config, isPreview } = useAppShellConfig();
  const banner = config.banner;
  const slots = banner.context_slots ?? {
    organization: true,
    space: false,
    project: false,
    classification: true,
  };
  const showSwitcher = banner.show_context_switcher !== false;
  // Onda M1.b (Feedback #11) — truncamento por slot (defensivo, ?? default).
  const truncate = resolveTruncate(banner);

  const [dismissed, setDismissedState] = React.useState(false);
  const [now, setNow] = React.useState<string>('');
  const [ctx, setCtx] = React.useState<MeContext | null>(null);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);

  // Slots de contexto pedem dados? Só busca quando algum slot dinâmico está
  // ligado e não estamos no preview do composer.
  const needsContext =
    !isPreview && (slots.organization || slots.space || slots.project);

  React.useEffect(() => {
    if (!needsContext) return;
    let cancel = false;
    MeContextApi.get()
      .then((c) => {
        if (!cancel) setCtx(c);
      })
      .catch(() => {
        /* best-effort — sem contexto, os slots simplesmente não aparecem */
      });
    return () => {
      cancel = true;
    };
  }, [needsContext]);

  React.useEffect(() => {
    if (banner.dismissible) {
      setDismissedState(readDismissed());
    } else if (dismissed) {
      setDismissedState(false);
      setDismissed(false);
    }
  }, [banner.dismissible, dismissed]);

  React.useEffect(() => {
    if (!banner.show_clock) return;
    const update = () => {
      const d = new Date();
      const opts: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      };
      setNow(d.toLocaleTimeString('pt-BR', opts));
    };
    update();
    const id = setInterval(update, 15_000);
    return () => clearInterval(id);
  }, [banner.show_clock]);

  if (!banner.visible || !banner.enabled) {
    return null;
  }
  if (dismissed) {
    return null;
  }

  // classification_default overrides the store level when set.
  const effectiveLevel: ClassificationLevel = (banner.classification_default ??
    storeLevel) as ClassificationLevel;
  const knownLevel = effectiveLevel in CLASSIFICATION_LABEL
    ? effectiveLevel
    : storeLevel;

  // Onda K.4 — `custom_text` é a única fonte de texto livre EDITÁVEL.
  // `subtitle` legado é lido como fallback (configs antigas) e, por fim,
  // o `label` derivado da página atual (PageShell classificationLabel) —
  // preserva o comportamento histórico do banner.
  const freeText = banner.custom_text || banner.subtitle || label || null;

  // Valores dos slots de contexto. No preview usamos placeholders pra o
  // operador ver o layout sem precisar de dados reais.
  const orgValue = isPreview ? 'Organização' : ctx?.organization_name ?? null;
  const spaceValue = isPreview ? 'Espaço' : ctx?.space_name ?? null;
  const projectValue = isPreview ? 'Operação' : ctx?.project_name ?? null;

  // Estilo de truncamento por slot. Tailwind não gera classes arbitrárias
  // dinâmicas (`max-w-[Nch]` com N variável), então o limite vem por
  // inline-style + a utility `truncate` (overflow-hidden + ellipsis +
  // whitespace-nowrap). `title` carrega o texto completo (tooltip no hover).
  const slotTruncateClass = truncate.enabled ? 'truncate min-w-0' : '';
  const slotMaxStyle: React.CSSProperties | undefined = truncate.enabled
    ? { maxWidth: `${truncate.max_chars_per_slot}ch` }
    : undefined;

  const ContextSlot = ({
    testId,
    value,
    /** Slots menos críticos somem antes em telas estreitas (responsive). */
    hideOnNarrow,
  }: {
    testId: string;
    value: string;
    hideOnNarrow?: boolean;
  }) => (
    <>
      <span
        aria-hidden
        className={cn(
          'opacity-50 shrink-0',
          hideOnNarrow && truncate.responsive && 'hidden md:inline',
        )}
      >
        ·
      </span>
      <span
        className={cn(
          'opacity-95 font-medium tracking-[0.16em] normal-case',
          slotTruncateClass,
          hideOnNarrow && truncate.responsive && 'hidden md:inline-block',
        )}
        style={slotMaxStyle}
        title={truncate.enabled ? value : undefined}
        data-testid={testId}
      >
        {value}
      </span>
    </>
  );

  return (
    <>
      <div
        data-testid="classification-banner"
        data-level={knownLevel}
        data-position={banner.position}
        data-dismissible={banner.dismissible ? 'true' : 'false'}
        className={cn(
          'h-6 px-3 flex items-center gap-2 font-mono text-[10px] font-semibold tracking-[0.22em] uppercase select-none',
          // Onda M1.b (#11) — `min-w-0 overflow-hidden` permite os slots
          // encolherem dentro do header sem transbordar horizontalmente. Com
          // truncate desligado preservamos o comportamento legado (nowrap).
          truncate.enabled ? 'min-w-0 overflow-hidden' : 'whitespace-nowrap',
          CLASSIFICATION_BG[knownLevel],
          CLASSIFICATION_TEXT[knownLevel],
        )}
        data-truncate={truncate.enabled ? 'true' : 'false'}
        style={
          banner.bg || banner.text
            ? {
                backgroundColor: banner.bg ?? undefined,
                color: banner.text ?? undefined,
              }
            : undefined
        }
        title={`Nível atual: ${CLASSIFICATION_LABEL[knownLevel]}`}
      >
        {/* Classificação — slot MAIS crítico: nunca some no responsivo,
            apenas trunca o rótulo se exceder o limite por slot. */}
        {slots.classification && (
          <>
            <span aria-hidden className="w-2 h-2 bg-current opacity-90 shrink-0" />
            <span
              data-testid="classification-banner-level"
              className={slotTruncateClass}
              style={slotMaxStyle}
              title={truncate.enabled ? CLASSIFICATION_LABEL[knownLevel] : undefined}
            >
              {CLASSIFICATION_LABEL[knownLevel]}
            </span>
          </>
        )}

        {/* Onda K.4 — slots de contexto dinâmico vivos.
            Onda M1.b (#11) — org permanece (alta prioridade); espaço/operação
            são menos críticos e somem antes em telas estreitas (responsive). */}
        {slots.organization && orgValue && (
          <ContextSlot testId="banner-context-org" value={orgValue} />
        )}
        {slots.space && spaceValue && (
          <ContextSlot testId="banner-context-space" value={spaceValue} hideOnNarrow />
        )}
        {slots.project && projectValue && (
          <ContextSlot
            testId="banner-context-project"
            value={projectValue}
            hideOnNarrow
          />
        )}

        {/* Texto livre — menos crítico que a classificação: trunca e some
            antes dela em telas estreitas (responsive). */}
        {freeText && (
          <>
            <span
              aria-hidden
              className={cn(
                'opacity-50 shrink-0',
                truncate.responsive && 'hidden md:inline',
              )}
            >
              ·
            </span>
            <span
              className={cn(
                'opacity-95 font-medium tracking-[0.16em]',
                slotTruncateClass,
                truncate.responsive && 'hidden md:inline-block',
              )}
              style={slotMaxStyle}
              title={truncate.enabled ? freeText : undefined}
              data-testid="classification-banner-text"
            >
              {freeText}
            </span>
          </>
        )}

        {/* Botão "Trocar" — abre o Context Switcher existente. */}
        {showSwitcher && !isPreview && (
          <button
            type="button"
            data-testid="banner-context-switch"
            onClick={() => setSwitcherOpen(true)}
            aria-label="Trocar contexto (Organização, Espaço, Operação)"
            className="inline-flex shrink-0 items-center gap-1 border border-current px-1 ml-1 hover:opacity-80 normal-case tracking-[0.1em]"
          >
            <ArrowLeftRight className="w-2.5 h-2.5" strokeWidth={1.5} aria-hidden />
            Trocar
          </button>
        )}

        {/* Relógio ancorado à direita (`ml-auto`). `shrink-0` garante que ele
            NUNCA é comprimido nem empurrado pra fora: os slots do meio
            truncam, o relógio fica sempre visível dentro do header. */}
        {banner.show_clock && (
          <span
            data-testid="classification-banner-clock"
            className="ml-auto shrink-0 inline-flex items-center gap-1 opacity-90 tracking-[0.14em]"
            suppressHydrationWarning
          >
            <Clock className="w-3 h-3" strokeWidth={1.5} aria-hidden="true" />
            {now}
            {banner.show_timezone && <span className="opacity-70">BRT</span>}
          </span>
        )}
        {!banner.show_clock && (
          <span aria-hidden className="w-2 h-2 bg-current opacity-90 ml-auto shrink-0" />
        )}
        {banner.dismissible && (
          <button
            type="button"
            aria-label="Dispensar banner"
            data-testid="classification-banner-dismiss"
            onClick={() => {
              setDismissedState(true);
              setDismissed(true);
            }}
            className="inline-flex shrink-0 w-4 h-4 items-center justify-center hover:opacity-80"
          >
            <X className="w-3 h-3" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {switcherOpen && (
        <CpContextSwitcher
          onClose={() => setSwitcherOpen(false)}
          onSwitched={(updated) => setCtx(updated)}
        />
      )}
    </>
  );
}
