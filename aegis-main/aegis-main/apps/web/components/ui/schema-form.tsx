'use client';

/**
 * SchemaForm — formulário GENÉRICO dirigido por um param_schema declarado.
 *
 * Renderiza os parâmetros de QUALQUER fonte (skill openclaw, connector.http, …)
 * a partir do schema dela — text/number/boolean/enum/segredo/dynamic. Multidomínio: os
 * campos vêm do schema, nunca hardcoded por vertical.
 *
 * Task 1: suporta `dynamic_source` → DynamicRefSelect (dropdown lazy-loaded do backend).
 * `dynamic_depends_on` permite que um campo carregue opções dependentes de outro.
 *
 * Estética security-app: sharp, sem emoji, strings via useT().
 */
import * as React from 'react';

import type { SkillParam } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import { DynamicRefSelect } from '@/components/ui/param-ref-select';
import { MarkingsSelect } from '@/components/ui/markings-select';
import { DetectorClassChips } from '@/components/ui/detector-class-chips';

const INP =
  'h-7 w-full px-2 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none';

export function SchemaForm({
  params,
  values,
  onChange,
  testidPrefix = 'schema',
}: {
  params: SkillParam[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  testidPrefix?: string;
}) {
  if (!params || params.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1.5" data-testid={`${testidPrefix}-form`}>
      {params.map((p) => {
        const v = values[p.key];
        const tid = `${testidPrefix}-field-${p.key}`;
        const labelEl = (
          <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
            {p.label || p.key}
            {p.required && <span className="text-danger">*</span>}
            {p.description && <InfoTip text={p.description} />}
          </Label>
        );

        // O backend declara 'bool' (SkillParam do agents_platform); aceita os dois.
        if (p.param_type === 'boolean' || p.param_type === 'bool') {
          return (
            <label key={p.key} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!v}
                onChange={(e) => onChange(p.key, e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
                data-testid={tid}
              />
              <span className="text-[11px] text-text-on-light">{p.label || p.key}</span>
              {p.description && <InfoTip text={p.description} />}
            </label>
          );
        }
        if (p.param_type === 'enum' && (p.enum_values || []).length > 0) {
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <select
                value={String(v ?? p.default ?? '')}
                onChange={(e) => onChange(p.key, e.target.value)}
                className={INP}
                data-testid={tid}
              >
                <option value="">—</option>
                {(p.enum_values || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        // #5 (fix do operador) — Marcações nunca é texto/JSON livre (operador
        // não decora identificador). Multi-select do catálogo real. Casa por
        // dynamic_source='markings' OU pela convenção de chave 'markings'.
        if (p.dynamic_source === 'markings' || p.key === 'markings') {
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <MarkingsSelect value={v} onChange={(slugs) => onChange(p.key, slugs)} testid={tid} />
            </div>
          );
        }
        // Tarefa A — classes do detector + multi → CHIPS multi-select com
        // busca sobre TODAS as classes válidas (operador nunca decora classe
        // de cabeça). O valor que viaja segue o CSV canônico do contrato.
        if (p.dynamic_source === 'detector_classes' && p.multi) {
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <DetectorClassChips
                value={String(v ?? '')}
                onChange={(csv) => onChange(p.key, csv)}
                testid={tid}
              />
            </div>
          );
        }
        // Task 1: dynamic_source → lazy-loaded dropdown (never free-text for refs)
        if (p.dynamic_source) {
          const depValue = p.dynamic_depends_on
            ? String(values[p.dynamic_depends_on] ?? '')
            : undefined;
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <DynamicRefSelect
                source={p.dynamic_source}
                dependsOnValue={depValue}
                value={String(v ?? '')}
                onChange={(val) => onChange(p.key, val)}
                testid={tid}
                placeholder={p.placeholder || ''}
              />
            </div>
          );
        }
        // json/object — editor de JSON (textarea mono). Sem este branch, um default
        // dict (ex.: connector.http serializer={"format":"json"}) caía no input de
        // texto e virava "[object Object]". Guarda o objeto PARSEADO (o backend espera
        // dict); enquanto o JSON é inválido, mantém o texto cru pra o operador editar.
        if (p.param_type === 'json' || p.param_type === 'object') {
          const jsonText =
            typeof v === 'string'
              ? v
              : v != null
                ? JSON.stringify(v, null, 2)
                : '';
          const jsonPh = p.default != null ? JSON.stringify(p.default) : '{ }';
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <textarea
                value={jsonText}
                placeholder={jsonPh}
                rows={3}
                spellCheck={false}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') {
                    onChange(p.key, undefined);
                    return;
                  }
                  try {
                    onChange(p.key, JSON.parse(raw));
                  } catch {
                    onChange(p.key, raw); // mantém o texto enquanto inválido
                  }
                }}
                className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-border-light focus:border-primary outline-none resize-y scrollbar-hide"
                data-testid={tid}
              />
            </div>
          );
        }
        // multiline — textarea simples (ex.: template de prompt).
        if (p.param_type === 'multiline') {
          return (
            <div key={p.key} className="space-y-0.5">
              {labelEl}
              <textarea
                value={v == null ? '' : String(v)}
                placeholder={p.placeholder || ''}
                rows={3}
                onChange={(e) => onChange(p.key, e.target.value)}
                className="w-full px-2 py-1 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none resize-y scrollbar-hide"
                data-testid={tid}
              />
            </div>
          );
        }
        // 'int' | 'float' são os tipos REAIS do backend (agents_platform.SkillParam).
        const isNum =
          p.param_type === 'number' || p.param_type === 'integer' ||
          p.param_type === 'int' || p.param_type === 'float';
        const isSecret = p.param_type === 'secret' || !!p.secret_scope;
        return (
          <div key={p.key} className="space-y-0.5">
            {labelEl}
            <input
              type={isSecret ? 'password' : isNum ? 'number' : 'text'}
              value={v == null ? '' : String(v)}
              placeholder={p.placeholder || (p.default != null ? String(p.default) : '')}
              // Tarefa C — limites estruturados do param_schema (min/max) no input.
              // A validação que bloqueia o submit (mensagem i18n) fica no caller.
              min={isNum && p.min != null ? p.min : undefined}
              max={isNum && p.max != null ? p.max : undefined}
              onChange={(e) => onChange(p.key, isNum ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
              className={INP}
              data-testid={tid}
            />
          </div>
        );
      })}
    </div>
  );
}
