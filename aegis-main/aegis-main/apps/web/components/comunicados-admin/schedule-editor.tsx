'use client';

/**
 * Onda I.5 (2026-05-23) — ScheduleEditor.
 *
 * Editor da janela temporal de um Comunicado:
 *   - schedule_start: ISO datetime de início (null = ativo imediato).
 *   - schedule_end:   ISO datetime de fim (null = sem expiração).
 *   - schedule_days_of_week: [0..6] (Dom..Sáb) — quando preenchido,
 *                     restringe quais dias da semana o banner aparece.
 *
 * Strings + persistência:
 *  - O backend (ontology-module router) já aceita ISO 8601 nos campos
 *    schedule_start/end. Aqui usamos <input type="datetime-local">
 *    e convertemos pra/de ISO no momento do save/hydrate.
 *  - days_of_week é null quando "todos os dias" (UX-friendly toggle).
 *
 * Memórias honradas:
 *  - feedback_no_rounded_no_sparkles · sem rounded-*.
 *  - feedback_no_emojis_in_ui · zero emoji.
 */
import * as React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ScheduleEditorValue {
  schedule_start: string | null;
  schedule_end: string | null;
  schedule_days_of_week: number[] | null;
}

const DAYS: { idx: number; short: string; long: string }[] = [
  { idx: 0, short: 'Dom', long: 'Domingo' },
  { idx: 1, short: 'Seg', long: 'Segunda-feira' },
  { idx: 2, short: 'Ter', long: 'Terça-feira' },
  { idx: 3, short: 'Qua', long: 'Quarta-feira' },
  { idx: 4, short: 'Qui', long: 'Quinta-feira' },
  { idx: 5, short: 'Sex', long: 'Sexta-feira' },
  { idx: 6, short: 'Sáb', long: 'Sábado' },
];

/**
 * Converte ISO 8601 (UTC, com "Z") → string local pro <input
 * type="datetime-local"> ("yyyy-MM-ddTHH:mm").
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

/** Converte o valor local do input para ISO 8601 (com timezone do
 *  browser embutido — backend aceita ambos). */
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: ScheduleEditorValue;
  onChange: (v: ScheduleEditorValue) => void;
}) {
  const startLocal = isoToLocalInput(value.schedule_start);
  const endLocal = isoToLocalInput(value.schedule_end);
  const days = value.schedule_days_of_week;
  const allDays = days === null || days === undefined;

  const toggleDay = (d: number) => {
    const cur = days ?? [];
    const next = cur.includes(d)
      ? cur.filter((x) => x !== d)
      : [...cur, d].sort((a, b) => a - b);
    onChange({ ...value, schedule_days_of_week: next.length === 7 ? null : next });
  };

  const setAllDays = (b: boolean) => {
    onChange({ ...value, schedule_days_of_week: b ? null : [] });
  };

  return (
    <div className="space-y-3" data-testid="comunicado-schedule-editor">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="comunicado-schedule-start"
            className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold flex items-center gap-1 mb-1"
          >
            <Calendar className="w-3 h-3" aria-hidden strokeWidth={1.5} />
            Início
          </label>
          <input
            id="comunicado-schedule-start"
            type="datetime-local"
            value={startLocal}
            onChange={(e) =>
              onChange({
                ...value,
                schedule_start: localInputToIso(e.target.value),
              })
            }
            data-testid="schedule-start-input"
            aria-label="Data e hora de início do comunicado"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-focus"
          />
          <p className="text-[10px] text-muted-on-light italic mt-0.5">
            Vazio = ativo imediatamente.
          </p>
        </div>
        <div>
          <label
            htmlFor="comunicado-schedule-end"
            className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold flex items-center gap-1 mb-1"
          >
            <Clock className="w-3 h-3" aria-hidden strokeWidth={1.5} />
            Fim
          </label>
          <input
            id="comunicado-schedule-end"
            type="datetime-local"
            value={endLocal}
            onChange={(e) =>
              onChange({
                ...value,
                schedule_end: localInputToIso(e.target.value),
              })
            }
            data-testid="schedule-end-input"
            aria-label="Data e hora de término do comunicado"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary focus:ring-2 focus:ring-focus"
          />
          <p className="text-[10px] text-muted-on-light italic mt-0.5">
            Vazio = sem expiração.
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-on-light font-semibold mb-1">
          Dias da semana
        </p>
        <label className="flex items-center gap-1.5 text-[12px] cursor-pointer mb-1.5">
          <input
            type="checkbox"
            checked={allDays}
            onChange={(e) => setAllDays(e.target.checked)}
            data-testid="schedule-all-days-toggle"
            className="w-4 h-4"
          />
          <span>Todos os dias</span>
        </label>
        {!allDays && (
          <div
            data-testid="schedule-days-checkboxes"
            className="flex flex-wrap gap-1.5"
          >
            {DAYS.map((d) => {
              const on = (days ?? []).includes(d.idx);
              return (
                <button
                  key={d.idx}
                  type="button"
                  onClick={() => toggleDay(d.idx)}
                  data-testid={`schedule-day-${d.idx}`}
                  aria-pressed={on}
                  aria-label={d.long}
                  className={cn(
                    'h-7 px-2 text-[11px] border focus:outline-none focus:ring-2 focus:ring-focus',
                    on
                      ? 'bg-primary text-white border-primary'
                      : 'bg-canvas-light border-border-light hover:border-primary',
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
