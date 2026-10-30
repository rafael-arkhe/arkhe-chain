'use client';

/**
 * Onda I.5 (2026-05-23) — ComunicadoForm.
 * Mission #10 (2026-05-24) — form mais visual/seccionado para operadores.
 *
 * Editor central do CRUD admin. Mostra o draft do ComunicadoOut + toggles
 * + ScheduleEditor + AudienceEditor. Markdown editor é um simples
 * <textarea> com toggle "Editar/Preview" — a preview vivo no painel
 * direito já mostra o resultado renderizado, então aqui o operador foca
 * em escrita.
 *
 * Estrutura Mission #10 — 5 seções com cabeçalho (ícone + título + dica),
 * agrupamento de campos e espaçamento consistente, para o form não ler
 * como uma lista de inputs "pelada":
 *   1. Conteúdo      · tipo + título + corpo + ícone
 *   2. Comportamento · dispensável + auto-fechar
 *   3. Botão de ação · rótulo + URL (opcional)
 *   4. Agenda        · ScheduleEditor
 *   5. Audiência     · AudienceEditor
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · sem rounded-*, sem Sparkles.
 *  - feedback_no_localstorage_for_persistence · draft sobe via prop ao
 *    parent; parent chama Comunicados.create/patch.
 *  - feedback_no_emojis_in_ui · zero emoji.
 *  - feedback_ui_english_only (i18n) · strings de seção via useT().
 */
import * as React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Eye,
  Info,
  MousePointerClick,
  Pencil,
  SlidersHorizontal,
  Type,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import type { ComunicadoKind } from '@/lib/api';
import { ScheduleEditor } from './schedule-editor';
import { AudienceEditor } from './audience-editor';

export interface ComunicadoFormValue {
  kind: ComunicadoKind;
  title: string;
  body: string;
  icon: string | null;
  closable: boolean;
  duration_s: number;
  audience_roles: string[] | null;
  audience_iam_perms: string[] | null;
  audience_groups: string[] | null;
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days_of_week: number[] | null;
  cta_label: string | null;
  cta_href: string | null;
}

export const EMPTY_FORM: ComunicadoFormValue = {
  kind: 'info',
  title: '',
  body: '',
  icon: null,
  closable: true,
  duration_s: 0,
  audience_roles: null,
  audience_iam_perms: null,
  audience_groups: null,
  schedule_start: null,
  schedule_end: null,
  schedule_days_of_week: null,
  cta_label: null,
  cta_href: null,
};

/** Cada tipo carrega ícone + cor de acento — espelha o banner real. */
const KIND_OPTIONS: {
  value: ComunicadoKind;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** classe de acento quando selecionado (borda + texto + fundo suave). */
  selected: string;
  /** cor do ícone (sempre, mesmo deselecionado). */
  iconCls: string;
}[] = [
  {
    value: 'info',
    label: 'Informativo',
    icon: Info,
    selected: 'border-info text-info bg-info/10',
    iconCls: 'text-info',
  },
  {
    value: 'warning',
    label: 'Atenção',
    icon: AlertTriangle,
    selected: 'border-warning text-warning bg-warning/10',
    iconCls: 'text-warning',
  },
  {
    value: 'danger',
    label: 'Crítico',
    icon: CircleAlert,
    selected: 'border-danger text-danger bg-danger/10',
    iconCls: 'text-danger',
  },
  {
    value: 'success',
    label: 'Sucesso',
    icon: CircleCheck,
    selected: 'border-success text-success bg-success/10',
    iconCls: 'text-success',
  },
];

/**
 * Cabeçalho de seção — ícone (cor de texto padrão) + título + dica curta.
 * Dá densidade/estrutura ao form sem virar JSON-editor.
 */
function SectionHeader({
  icon: Icon,
  title,
  hint,
  badge,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  hint?: string;
  badge?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <Icon
          className="w-3.5 h-3.5 text-text-on-light"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-on-light">
          {title}
        </span>
        {badge && (
          <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted-on-light border border-border-light px-1 py-px">
            {badge}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-on-light">{hint}</p>}
    </div>
  );
}

/**
 * Seção visual — um cartão sharp (sem rounded) com cabeçalho e corpo.
 * Substitui o `<fieldset>` solto por uma superfície coesa.
 */
function Section({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <section className="border border-border-light bg-white">
      <div className="px-3 py-2.5 border-b border-border-light bg-panel-light">
        {header}
      </div>
      <div className="px-3 py-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold block"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-on-light">{hint}</p>}
    </div>
  );
}

export function ComunicadoForm({
  value,
  onChange,
}: {
  value: ComunicadoFormValue;
  onChange: (v: ComunicadoFormValue) => void;
}) {
  const t = useT();
  const [bodyMode, setBodyMode] = React.useState<'edit' | 'preview'>('edit');

  const patch = (p: Partial<ComunicadoFormValue>) =>
    onChange({ ...value, ...p });

  return (
    <form
      data-testid="comunicado-form"
      onSubmit={(e) => e.preventDefault()}
      className="space-y-4"
    >
      {/* ── 1 · Conteúdo ─────────────────────────────────────────────── */}
      <Section
        header={
          <SectionHeader
            icon={Type}
            title={t('comunicadosAdmin.sectionContent')}
            hint={t('comunicadosAdmin.sectionContentHint')}
          />
        }
      >
        <Field label={t('comunicadosAdmin.appearanceLabel')} hint="Define a cor + ícone padrão do banner.">
          <div
            data-testid="comunicado-form-kind"
            className="grid grid-cols-2 sm:grid-cols-4 gap-1.5"
          >
            {KIND_OPTIONS.map((k) => {
              const KIcon = k.icon;
              const active = value.kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => patch({ kind: k.value })}
                  data-testid={`comunicado-form-kind-${k.value}`}
                  aria-pressed={active}
                  className={cn(
                    'h-9 px-2 text-[11.5px] border font-medium flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    active
                      ? k.selected
                      : 'border-border-light text-text-on-light hover:border-primary bg-white',
                  )}
                >
                  <KIcon
                    className={cn('w-3.5 h-3.5 shrink-0', active ? '' : k.iconCls)}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="truncate">{k.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          htmlFor="comunicado-form-title"
          label="Título"
          hint="Visível em negrito no banner."
        >
          <input
            id="comunicado-form-title"
            type="text"
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Janela de manutenção · 23h às 01h"
            data-testid="comunicado-form-title"
            aria-label="Título do comunicado"
            maxLength={200}
            className="w-full h-9 px-2 text-[13px] bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
          <div className="text-[10px] text-muted-on-light font-mono text-right">
            {value.title.length}/200
          </div>
        </Field>

        <Field
          label="Corpo (markdown safe-subset)"
          hint="Suporta **negrito**, *itálico* e [link](https://...)."
        >
          <div className="flex border border-border-light bg-canvas-light w-fit">
            <button
              type="button"
              onClick={() => setBodyMode('edit')}
              data-testid="comunicado-form-body-mode-edit"
              aria-pressed={bodyMode === 'edit'}
              className={cn(
                'h-7 px-3 text-[11px] flex items-center gap-1 border-r border-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                bodyMode === 'edit' ? 'bg-primary text-white' : 'hover:bg-white',
              )}
            >
              <Pencil className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => setBodyMode('preview')}
              data-testid="comunicado-form-body-mode-preview"
              aria-pressed={bodyMode === 'preview'}
              className={cn(
                'h-7 px-3 text-[11px] flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                bodyMode === 'preview' ? 'bg-primary text-white' : 'hover:bg-white',
              )}
            >
              <Eye className="w-3 h-3" aria-hidden strokeWidth={1.5} />
              Preview inline
            </button>
          </div>
          {bodyMode === 'edit' ? (
            <textarea
              value={value.body}
              onChange={(e) => patch({ body: e.target.value })}
              data-testid="comunicado-form-body"
              placeholder="Texto resumido. Suporta **negrito** e [links](https://docs)."
              aria-label="Corpo do comunicado em markdown"
              rows={4}
              className="w-full px-2 py-2 text-[12px] font-mono bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus resize-y"
            />
          ) : (
            <div
              data-testid="comunicado-form-body-preview-inline"
              className="px-2 py-2 text-[12px] bg-canvas-light border border-border-light min-h-[80px] whitespace-pre-wrap"
            >
              {value.body || (
                <span className="opacity-50 italic">Sem corpo.</span>
              )}
            </div>
          )}
        </Field>

        <Field
          htmlFor="comunicado-form-icon"
          label="Ícone (opcional)"
          hint="Nome do ícone lucide (deixe vazio para usar o padrão do tipo)."
        >
          <input
            id="comunicado-form-icon"
            type="text"
            value={value.icon ?? ''}
            onChange={(e) =>
              patch({ icon: e.target.value.trim() === '' ? null : e.target.value })
            }
            placeholder="ex.: bell, info, alert-triangle"
            data-testid="comunicado-form-icon"
            aria-label="Ícone customizado"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
        </Field>
      </Section>

      {/* ── 2 · Comportamento ────────────────────────────────────────── */}
      <Section
        header={
          <SectionHeader
            icon={SlidersHorizontal}
            title={t('comunicadosAdmin.sectionBehavior')}
            hint={t('comunicadosAdmin.sectionBehaviorHint')}
          />
        }
      >
        <label className="flex items-start gap-2 text-[12px] cursor-pointer">
          <input
            type="checkbox"
            checked={value.closable}
            onChange={(e) => patch({ closable: e.target.checked })}
            data-testid="comunicado-form-closable"
            className="w-4 h-4 mt-0.5 shrink-0"
          />
          <span className="leading-snug">
            Operador pode dispensar (botão X)
            <span className="block text-[10.5px] text-muted-on-light">
              Desmarque para fixar o banner até a expiração da agenda.
            </span>
          </span>
        </label>

        <Field
          htmlFor="comunicado-form-duration"
          label="Auto-fechar após (segundos)"
          hint="0 = sem timer. Aplica ao usuário final."
        >
          <input
            id="comunicado-form-duration"
            type="number"
            value={value.duration_s}
            min={0}
            max={3600}
            step={5}
            onChange={(e) =>
              patch({ duration_s: Math.max(0, Number(e.target.value) || 0) })
            }
            data-testid="comunicado-form-duration"
            aria-label="Auto-fechar em segundos"
            className="w-32 h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
          />
        </Field>
      </Section>

      {/* ── 3 · Botão de ação (opcional) ─────────────────────────────── */}
      <Section
        header={
          <SectionHeader
            icon={MousePointerClick}
            title={t('comunicadosAdmin.sectionAction')}
            badge={t('comunicadosAdmin.sectionActionOptional')}
            hint={t('comunicadosAdmin.sectionActionHint')}
          />
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field htmlFor="comunicado-form-cta-label" label={t('comunicadosAdmin.ctaLabelField')}>
            <input
              id="comunicado-form-cta-label"
              type="text"
              value={value.cta_label ?? ''}
              onChange={(e) =>
                patch({
                  cta_label: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
              placeholder="Ver detalhes"
              data-testid="comunicado-form-cta-label"
              aria-label="Rótulo do botão de ação"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
          </Field>
          <Field htmlFor="comunicado-form-cta-href" label={t('comunicadosAdmin.ctaHrefField')}>
            <input
              id="comunicado-form-cta-href"
              type="text"
              value={value.cta_href ?? ''}
              onChange={(e) =>
                patch({
                  cta_href: e.target.value.trim() === '' ? null : e.target.value,
                })
              }
              placeholder="/docs/manutencao"
              data-testid="comunicado-form-cta-href"
              aria-label="URL do botão de ação"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-focus"
            />
          </Field>
        </div>
      </Section>

      {/* ── 4 · Agenda ───────────────────────────────────────────────── */}
      <Section
        header={
          <SectionHeader
            icon={CalendarClock}
            title={t('comunicadosAdmin.sectionSchedule')}
            hint={t('comunicadosAdmin.sectionScheduleHint')}
          />
        }
      >
        <ScheduleEditor
          value={{
            schedule_start: value.schedule_start,
            schedule_end: value.schedule_end,
            schedule_days_of_week: value.schedule_days_of_week,
          }}
          onChange={(v) => patch(v)}
        />
      </Section>

      {/* ── 5 · Audiência ────────────────────────────────────────────── */}
      <Section
        header={
          <SectionHeader
            icon={Users}
            title={t('comunicadosAdmin.sectionAudience')}
            hint={t('comunicadosAdmin.sectionAudienceHint')}
          />
        }
      >
        <AudienceEditor
          value={{
            audience_roles: value.audience_roles,
            audience_iam_perms: value.audience_iam_perms,
            audience_groups: value.audience_groups,
          }}
          onChange={(v) => patch(v)}
        />
      </Section>
    </form>
  );
}
