'use client';

/**
 * Form Builder — Onda K.2 (2026-05-23).
 *
 * Widget de formulário RICO do editor de Páginas/Workshop. Aparece na
 * paleta automaticamente via registry. Cobre o que o operador pediu no
 * ponto #9 (paridade com Carbon/Foundry Inline Action + Slate controls):
 *
 *   - 16 tipos de campo (text/textarea/number/integer/date/datetime/
 *     boolean/select/multi_select/radio/checkbox_group/lookup/file/
 *     hidden/section/computed). `lookup` é o "procv" — busca na ontologia.
 *   - Validação: required, min/max, minLength/maxLength, pattern, mensagem
 *     customizada.
 *   - Condicional nível Salesforce: regras `quando X op Y → show/hide/
 *     require Z`, avaliadas em tempo real (e reconfirmadas no servidor).
 *   - Valores dinâmicos: default vindo de @today/@now/@user/variável.
 *   - Políticas de visibilidade: public · requires_auth · requires_perm
 *     (a submissão respeita; o servidor é autoritativo).
 *   - Write-back: via ActionType existente OU criando nó na ontologia —
 *     LineageEvent `form.submit` gravado pelo backend (não duplicamos).
 *
 * Config (montado por DROPDOWN/seletores no Inspetor — JAMAIS JSON manual):
 *   - form_key: identificador lógico do form (audit).
 *   - title / submit_label / description
 *   - fields[]: FormFieldSpec[] (editor visual `form-fields` no Inspetor)
 *   - visibility_policy: public | requires_auth | requires_perm
 *   - required_perm: perm do catálogo IAM (dropdown)
 *   - action_id: ActionType (dropdown) — write-back via Action
 *   - target_node_type: tipo de nó (dropdown) — write-back direto
 *   - on_success_variable: variável a receber o resultado
 *
 * Estética Palantir-sharp: sem rounded, sem emojis, sem Sparkles.
 */
import * as React from 'react';
import { Send, CheckCircle2, AlertCircle, ShieldAlert, Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth/useAuth';
import { Forms } from '@/lib/api';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import type {
  FormFieldSpec,
  FormVisibilityPolicy,
  ActionValidationError,
} from '@/lib/api';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { FormFieldRow } from './form-field-row';
import {
  resolveFieldState,
  validateForm,
  resolveDefault,
  resolveComputed,
} from './form-logic';

type Cfg = {
  form_key?: string;
  title?: string;
  description?: string;
  submit_label?: string;
  fields?: FormFieldSpec[];
  visibility_policy?: FormVisibilityPolicy;
  required_perm?: string;
  action_id?: string;
  target_node_type?: string;
  on_success_variable?: string;
};

function readFields(cfg: Cfg): FormFieldSpec[] {
  const raw = cfg.fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is FormFieldSpec => !!f && typeof f.key === 'string' && !!f.type,
  );
}

export function FormBuilder({ config, variables, setBinding, emit }: WidgetRenderProps) {
  const cfg = (config ?? {}) as Cfg;
  const { principal } = useAuth();
  const fields = React.useMemo(() => readFields(cfg), [cfg]);
  const policy: FormVisibilityPolicy = cfg.visibility_policy ?? 'requires_auth';
  const requiredPerm = (cfg.required_perm ?? '').trim();

  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<ActionValidationError[]>([]);
  const [result, setResult] = React.useState<
    | { kind: 'idle' }
    | { kind: 'ok'; message: string }
    | { kind: 'denied'; message: string }
    | { kind: 'err'; message: string }
  >({ kind: 'idle' });

  // Defaults dinâmicos — resolvidos uma vez (e quando variáveis-fonte mudam).
  const defaultCtx = React.useMemo(
    () => ({ currentUser: principal?.username, variables: variables ?? {} }),
    [principal?.username, variables],
  );
  const initializedRef = React.useRef(false);
  React.useEffect(() => {
    if (initializedRef.current) return;
    const seed: Record<string, unknown> = {};
    for (const f of fields) {
      const d = resolveDefault(f, defaultCtx);
      if (d !== undefined) seed[f.key] = d;
    }
    if (Object.keys(seed).length > 0) {
      setValues((prev) => ({ ...seed, ...prev }));
    }
    initializedRef.current = true;
  }, [fields, defaultCtx]);

  // Campos computed são derivados do payload — recalculados a cada change.
  const effectiveValues = React.useMemo(() => {
    const out = { ...values };
    for (const f of fields) {
      if (f.type === 'computed') {
        out[f.key] = resolveComputed(f, values);
      }
    }
    return out;
  }, [fields, values]);

  const setField = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const errorByKey = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of errors) if (!m[e.key]) m[e.key] = e.message;
    return m;
  }, [errors]);

  // Política client-side (UX) — o servidor reconfirma.
  const anonAllowed = policy === 'public';
  const blockedByAuth = !anonAllowed && !principal;
  const blockedByPerm =
    policy === 'requires_perm' &&
    !!principal &&
    !!requiredPerm &&
    !principal.permissions.includes(requiredPerm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setResult({ kind: 'idle' });
    const validation = validateForm(fields, effectiveValues);
    setErrors(validation);
    if (validation.length > 0) return;
    setSubmitting(true);
    try {
      const out = await Forms.submit({
        form_key: (cfg.form_key ?? '').trim() || 'form',
        fields,
        payload: effectiveValues,
        visibility_policy: policy,
        required_perm: requiredPerm || null,
        action_id: (cfg.action_id ?? '').trim() || null,
        target_node_type: (cfg.target_node_type ?? '').trim() || null,
      });
      if (out.status === 'denied') {
        setResult({ kind: 'denied', message: out.deny_reason || 'Submissão negada pela política.' });
        emit?.('form.submit.denied', { form_key: cfg.form_key, reason: out.deny_reason });
        return;
      }
      if (out.status === 'failed') {
        if (out.validation_errors.length > 0) {
          setErrors(out.validation_errors);
          setResult({ kind: 'err', message: 'Corrija os campos destacados.' });
        } else {
          setResult({ kind: 'err', message: out.deny_reason || 'Falha ao submeter.' });
        }
        emit?.('form.submit.error', { form_key: cfg.form_key });
        return;
      }
      setResult({
        kind: 'ok',
        message: `Enviado · ${
          (out.result.node_id as string) ||
          (out.result.execution_id as string) ||
          out.submission_id
        }`,
      });
      if (cfg.on_success_variable) {
        setBinding(cfg.on_success_variable, out.result);
      }
      emit?.('form.submit.success', {
        form_key: cfg.form_key,
        submission_id: out.submission_id,
        result: out.result,
      });
    } catch (err) {
      const msg = humanizeApiError(err instanceof Error ? err.message : 'Falha ao submeter');
      setResult({ kind: 'err', message: msg });
      emit?.('form.submit.error', { form_key: cfg.form_key, reason: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2.5"
      data-testid="form-builder-widget"
    >
      <header className="flex items-center gap-2 border-b border-border-light pb-2">
        <Send className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-[12px] font-semibold flex-1 text-text-on-light">
          {cfg.title || 'Formulário'}
        </p>
        <PolicyBadge policy={policy} />
      </header>

      {cfg.description && (
        <p className="text-[11px] text-muted-on-light leading-snug">
          {cfg.description}
        </p>
      )}

      {fields.length === 0 ? (
        <p
          className="text-[11px] text-muted-on-light italic"
          data-testid="form-builder-empty"
        >
          Adicione campos no Inspetor para montar este formulário.
        </p>
      ) : blockedByAuth ? (
        <div
          className="flex items-center gap-2 p-2 border border-border-light bg-canvas-light text-[11px] text-muted-on-light"
          data-testid="form-builder-auth-required"
        >
          <Lock className="w-3 h-3 shrink-0" strokeWidth={1.5} />
          Este formulário exige autenticação para ser enviado.
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2.5"
          data-testid="form-builder-form"
          noValidate
        >
          {fields.map((f) => {
            const { visible, required } = resolveFieldState(f, effectiveValues);
            if (!visible) return null;
            return (
              <FormFieldRow
                key={f.key}
                field={f}
                value={effectiveValues[f.key]}
                effectiveRequired={required}
                error={errorByKey[f.key]}
                disabled={submitting}
                onChange={(v) => setField(f.key, v)}
              />
            );
          })}

          {blockedByPerm && (
            <div
              className="flex items-center gap-2 p-2 border border-warning bg-warning/10 text-[10px] text-text-on-light"
              data-testid="form-builder-perm-warning"
            >
              <ShieldAlert className="w-3 h-3 text-warning shrink-0" strokeWidth={1.5} />
              Você não tem a permissão exigida para enviar este formulário.
            </div>
          )}

          {result.kind === 'ok' && (
            <p
              className="text-[10px] text-success font-mono flex items-center gap-1.5"
              data-testid="form-builder-success"
              role="status"
            >
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
              {result.message}
            </p>
          )}
          {result.kind === 'denied' && (
            <p
              className="text-[10px] text-warning font-mono flex items-center gap-1.5"
              data-testid="form-builder-denied"
              role="alert"
            >
              <ShieldAlert className="w-3 h-3" strokeWidth={1.5} />
              {result.message}
            </p>
          )}
          {result.kind === 'err' && (
            <p
              className="text-[10px] text-danger font-mono flex items-center gap-1.5"
              data-testid="form-builder-error"
              role="alert"
            >
              <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
              {result.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || blockedByPerm}
            data-testid="form-builder-submit"
            className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 self-start flex items-center gap-1.5"
          >
            {submitting ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <Send className="w-3 h-3" strokeWidth={1.5} />
            )}
            {cfg.submit_label || 'Enviar'}
          </button>
        </form>
      )}
    </div>
  );
}

function PolicyBadge({ policy }: { policy: FormVisibilityPolicy }) {
  const map: Record<FormVisibilityPolicy, string> = {
    public: 'Pública',
    requires_auth: 'Requer login',
    requires_perm: 'Requer permissão',
  };
  return (
    <span
      className="text-[9px] font-mono uppercase tracking-wider text-muted-on-light border border-border-light px-1.5 py-0.5"
      data-testid="form-builder-policy-badge"
    >
      {map[policy]}
    </span>
  );
}

registerWidget('form_builder', FormBuilder, {
  group: 'data',
  label: 'Formulário',
  description:
    'Formulário rico: 16 tipos de campo (incl. busca na ontologia), validação, regras condicionais, valores dinâmicos e políticas de visibilidade. Grava via ação ou cria um objeto.',
  icon: 'clipboard-list',
  defaultColSpan: 6,
  previewWidth: 420,
  mockVariables: {},
  mockConfig: {
    form_key: 'cadastro-pessoa',
    title: 'Cadastro de pessoa',
    description: 'Demonstração: lookup ontológico + campo condicional.',
    submit_label: 'Cadastrar',
    visibility_policy: 'requires_auth',
    target_node_type: 'Person',
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true, placeholder: 'Ex.: Maria da Silva' },
      { key: 'tipo', label: 'Tipo de pessoa', type: 'select', options: ['Física', 'Jurídica'], required: true },
      {
        key: 'cnpj',
        label: 'CNPJ',
        type: 'text',
        placeholder: 'somente números',
        rules: [
          { when_field: 'tipo', operator: 'eq', value: 'Jurídica', effect: 'show' },
          { when_field: 'tipo', operator: 'eq', value: 'Jurídica', effect: 'require' },
        ],
      },
      { key: 'idade', label: 'Idade', type: 'integer', minimum: 0, maximum: 130 },
      { key: 'vinculo', label: 'Vínculo (objeto)', type: 'lookup', ref_node_type: 'Person' },
      { key: 'ativo', label: 'Cadastro ativo', type: 'boolean' },
    ] satisfies FormFieldSpec[],
  } satisfies Cfg,
  config_schema: [
    {
      name: 'form_key',
      label: 'Identificador do formulário',
      description: 'Chave lógica usada na auditoria das submissões.',
      field: 'string',
      placeholder: 'ex.: cadastro-pessoa',
    },
    {
      name: 'title',
      label: 'Título',
      field: 'string',
      placeholder: 'ex.: Cadastro de pessoa',
    },
    {
      name: 'description',
      label: 'Descrição',
      field: 'string',
      placeholder: 'Instrução curta exibida acima dos campos.',
    },
    {
      name: 'submit_label',
      label: 'Rótulo do botão',
      field: 'string',
      placeholder: 'Enviar',
    },
    {
      name: 'fields',
      label: 'Campos do formulário',
      description:
        'Editor visual: adicione, ordene (arraste) e configure cada campo — tipo, validação e regras condicionais — sem digitar JSON.',
      // Onda K.2 — FieldKind dedicado renderizado por `FormFieldsEditor`.
      field: 'form-fields',
    },
    {
      name: 'visibility_policy',
      label: 'Política de visibilidade',
      description:
        'Pública (sem login) · Requer login · Requer permissão. O servidor é autoritativo.',
      field: 'select',
      options: [
        { value: 'public', label: 'Pública (sem login)' },
        { value: 'requires_auth', label: 'Requer login' },
        { value: 'requires_perm', label: 'Requer permissão' },
      ],
      default: 'requires_auth',
    },
    {
      name: 'required_perm',
      label: 'Permissão exigida',
      description:
        'Usada quando a política é "Requer permissão". Escolha do catálogo IAM.',
      // Onda K.2 — FieldKind dedicado: dropdown populado por /iam/permissions.
      field: 'perm-key',
    },
    {
      name: 'action_id',
      label: 'Ação de gravação (opcional)',
      description:
        'Quando preenchida, o envio executa esta ação (reusa o pipeline auditado). Caso contrário, cria um objeto do tipo abaixo.',
      // Onda K.2 — FieldKind dedicado: dropdown populado por /action-types.
      field: 'action-type',
    },
    {
      name: 'target_node_type',
      label: 'Tipo de objeto (quando sem ação)',
      description: 'Tipo do nó criado na ontologia quando não há ação.',
      field: 'node-type',
    },
    {
      name: 'on_success_variable',
      label: 'Variável de resultado',
      description: 'Recebe o resultado do envio (id do nó / output da ação).',
      field: 'variable-ref',
    },
  ],
});
