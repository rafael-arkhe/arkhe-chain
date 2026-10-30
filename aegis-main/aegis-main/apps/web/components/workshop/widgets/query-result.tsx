'use client';

/**
 * Query Result — Sprint L7 (2026-05-23).
 *
 * Executa um AIP Logic Function (POST /platform/v23/aip-logic/{id}/invoke)
 * com inputs vindos de variables + literal e renderiza o output. Pesquisa
 * R2 Slate · widgets/platform.md + read-write/queries.md.
 *
 * Estados:
 *   - sem function_id → empty
 *   - loading        → spinner inline
 *   - error          → caixa danger
 *   - success        → caixa formatada com output
 *
 * Config:
 *   - function_id: string       id do AIPLogicFunction
 *   - inputs?: object | string  payload literal { input_key: value }
 *   - inputs_source?: string    external_id da variable que tem inputs obj
 *   - auto_run?: boolean        roda no mount (default true)
 *   - result_target?: string    grava resultado.output na variable
 *   - title?: string            header opcional
 */
import * as React from 'react';
import {
  Loader2,
  AlertCircle,
  Play,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

import { AipLogic, type FormFieldSpec } from '@/lib/api';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { FormFieldRow } from './form-field-row';
import { parseMissingInputError, humanizeApiError } from '@/lib/workshop/missing-inputs';

type Cfg = {
  function_id?: string;
  inputs?: Record<string, unknown> | string;
  inputs_source?: string;
  auto_run?: boolean;
  result_target?: string;
  title?: string;
};

function resolveInputs(
  cfg: Cfg,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  if (cfg.inputs_source && cfg.inputs_source in variables) {
    const v = variables[cfg.inputs_source];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  if (cfg.inputs && typeof cfg.inputs === 'object' && !Array.isArray(cfg.inputs)) {
    return cfg.inputs;
  }
  if (typeof cfg.inputs === 'string') {
    try {
      const parsed = JSON.parse(cfg.inputs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore — string mal formada vira {}
    }
  }
  return {};
}

export function QueryResult({ config, variables, setBinding, emit }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const fnId = cfg.function_id?.trim() ?? '';
  const auto = cfg.auto_run !== false;

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [output, setOutput] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState<number | null>(null);
  // Gate de entrada (defesa em profundidade): se a Function devolver
  // function_signature_violation / missing inputs, NÃO mostramos JSON cru — abrimos
  // um form inline p/ o operador preencher os campos e re-rodamos.
  const [gate, setGate] = React.useState<{ fields: FormFieldSpec[]; values: Record<string, unknown>; message: string } | null>(null);
  const ranOnce = React.useRef(false);

  const resolvedInputs = resolveInputs(cfg, variables ?? {});
  const inputsJson = JSON.stringify(resolvedInputs);

  // Gate de auto_run: quando a função declara inputs (via inputs_source ou inputs),
  // só auto-roda se TODOS estiverem preenchidos. Fecha a corrida do /evaluate (durante
  // o loading, variables={} → resolved={}) e nunca dispara invoke com {} ou campos
  // vazios → mata o function_signature_violation no carregamento. O operador preenche
  // os inputs e clica em Executar. Domain-agnostic (opera sobre o SHAPE dos inputs).
  const hasDeclaredInputs =
    !!cfg.inputs_source ||
    (!!cfg.inputs && typeof cfg.inputs === 'object' && Object.keys(cfg.inputs).length > 0) ||
    typeof cfg.inputs === 'string';
  const inputsIncomplete =
    hasDeclaredInputs &&
    (Object.keys(resolvedInputs).length === 0 ||
      Object.values(resolvedInputs).some((v) => v === '' || v == null));

  const run = React.useCallback(async (extra?: Record<string, unknown>) => {
    if (!fnId) return;
    setBusy(true);
    setError(null);
    try {
      const base = JSON.parse(inputsJson) as Record<string, unknown>;
      const inputs = extra ? { ...base, ...extra } : base;
      const res = await AipLogic.invoke(fnId, inputs);
      setOutput(res.output);
      setVersion(res.version);
      setGate(null);
      if (cfg.result_target) setBinding(cfg.result_target, res.output);
      emit?.('query.success', {
        function_id: fnId,
        output: res.output,
        version: res.version,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // NUNCA vaza JSON cru de "missing input/signature": vira form inline de coleta.
      const miss = parseMissingInputError(raw);
      if (miss && miss.fields.length) {
        setGate((g) => ({
          fields: miss.fields,
          // semeia '' p/ TODA chave → o re-run sempre manda todas (vazio = presente,
          // nunca "missing"); o operador preenche as que quiser filtrar.
          values: g?.values ?? Object.fromEntries(miss.fields.map((f) => [f.key, ''])),
          message: miss.message,
        }));
      } else {
        setError(humanizeApiError(raw));
      }
      emit?.('query.error', { function_id: fnId, reason: raw });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fnId, inputsJson, cfg.result_target, setBinding, emit]);

  React.useEffect(() => {
    if (auto && fnId && !ranOnce.current && !inputsIncomplete) {
      ranOnce.current = true;
      void run();
    }
  }, [auto, fnId, inputsIncomplete, run]);

  if (!fnId) {
    return (
      <div
        className="border border-border-light bg-white p-3 text-[11px] text-muted-on-light"
        data-testid="query-result-empty"
      >
        Configure `function_id` no Inspector para vincular a uma função AIP.
      </div>
    );
  }

  return (
    <div
      className="border border-border-light bg-white flex flex-col"
      data-testid="query-result"
    >
      <header className="h-8 px-2.5 border-b border-border-light bg-raised-light/40 flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1 truncate">
          {cfg.title ?? 'Resultado da função'}
        </p>
        {version != null && (
          <span className="text-[10px] font-mono text-muted-on-light">
            v{version}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          aria-label="Executar"
          data-testid="query-result-run"
          className="h-6 w-6 flex items-center justify-center hover:bg-border-light/60 border border-transparent hover:border-border-light disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          ) : ranOnce.current ? (
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          ) : (
            <Play className="w-3 h-3" strokeWidth={1.5} />
          )}
        </button>
      </header>
      <div className="p-2.5">
        {busy && !output && (
          <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            Executando…
          </p>
        )}
        {error && !gate && (
          <p
            className="text-[11px] text-danger flex items-start gap-1"
            data-testid="query-result-error"
          >
            <AlertCircle
              className="w-3 h-3 mt-0.5 shrink-0"
              strokeWidth={1.5}
            />
            {error}
          </p>
        )}
        {gate && (
          <div
            className="flex flex-col gap-2 border border-border-light bg-raised-light p-2.5"
            data-testid="query-result-gate"
          >
            <p className="text-[11px] text-muted-on-light">{gate.message}</p>
            {gate.fields.map((f) => (
              <FormFieldRow
                key={f.key}
                field={f}
                value={gate.values[f.key] ?? ''}
                effectiveRequired={false}
                onChange={(v) =>
                  setGate((g) => (g ? { ...g, values: { ...g.values, [f.key]: v } } : g))
                }
              />
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(gate.values)}
              data-testid="query-result-gate-run"
              className="h-8 px-3 self-start bg-primary text-white text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-primary-hover disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" strokeWidth={1.5} />
              Executar
            </button>
          </div>
        )}
        {output != null && !error && !gate && (
          <div className="flex flex-col gap-1.5" data-testid="query-result-output">
            <p className="text-[10px] uppercase tracking-wider font-mono text-muted-on-light flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
              output
            </p>
            <pre className="text-[11px] text-text-on-light bg-canvas-light border border-border-light p-2 whitespace-pre-wrap break-words">
              {output}
            </pre>
          </div>
        )}
        {!busy && !error && !gate && output == null && (
          <div className="flex flex-col gap-2 items-start">
            <p className="text-[11px] text-muted-on-light">
              {inputsIncomplete
                ? 'Preencha os campos acima (opcional) e execute.'
                : 'Pronto para executar.'}
            </p>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              data-testid="query-result-run-body"
              className="h-8 px-3 bg-primary text-white text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-primary-hover disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" strokeWidth={1.5} />
              Executar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

registerWidget('query_result', QueryResult, {
  group: 'data',
  label: 'Resultado de função',
  description:
    'Executa uma função AIP da plataforma e mostra a saída. Útil para classificadores, resumos, perguntas ao agente.',
  icon: 'play',
  defaultColSpan: 6,
  mockConfig: {
    function_id: 'fn-demo',
    auto_run: false,
    title: 'Classificar evento',
  },
  mockVariables: {},
  previewWidth: 420,
  previewHeight: 200,
  config_schema: [
    {
      name: 'function_id',
      label: 'ID da função AIP',
      field: 'string',
      placeholder: 'uuid da AIPLogicFunction',
    },
    {
      name: 'title',
      label: 'Título',
      field: 'string',
      placeholder: 'Resultado da função',
    },
    {
      name: 'inputs_source',
      label: 'Variável com inputs (objeto)',
      field: 'variable-ref',
    },
    {
      name: 'auto_run',
      label: 'Executar automaticamente ao carregar',
      field: 'boolean',
      default: true,
    },
    {
      name: 'result_target',
      label: 'Gravar saída em variável',
      field: 'variable-ref',
    },
  ],
});
