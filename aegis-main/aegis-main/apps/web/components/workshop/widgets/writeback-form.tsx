'use client';

/**
 * Writeback Form — Sprint Wave D.4 (2026-05-23).
 *
 * Widget que ESCREVE uma INSTÂNCIA canônica (OntologyNode(node_type=kind)),
 * análogo ao Action widget do Foundry/Slate. Renderiza form dinâmico baseado
 * em `fields[]` e, no submit, usa o caminho CANÔNICO de instância (2026-06-05,
 * fix do 422 "node_type pattern mismatch" — o write antigo batia em
 * POST /ontology/nodes, que é o META-modelo e rejeita kinds):
 *   - CRIAR:    POST /ontology/nodes/bulk (handler aegis.ontology.create_objects
 *               — coerção de contrato, signed_hash, lineage, perm bulk_write)
 *   - ATUALIZAR: PUT /ontology/nodes/{node_id} com {properties} (coerção de
 *               contrato + lineage; o mesmo caminho do instance_editor)
 *
 * Backend já emite `LineageEvent` em cada write — não duplicamos
 * audit aqui (regra: governance invariants em ontology-module).
 *
 * Confirm dialog sempre presente antes do submit (regra "operator
 * confirmation" pra writes não-óbvias). O payload NÃO fica exposto no form
 * (feedback do operador 2026-06-05): há só um botão discreto no cabeçalho que
 * COPIA o JSON exato que será enviado, caso precise.
 *
 * Config:
 *   - target_kind:   tipo do nó (Person / Vehicle / Event / Document / ...)
 *   - node_id?:      string ou variable-ref — quando presente, é UPDATE
 *   - fields[]:      { key, label, type: 'string'|'number'|'boolean'|'text', required? }
 *   - title?:        cabeçalho
 *   - submit_label?: rótulo do botão
 *   - on_success_variable?: variable a setar com o node criado/atualizado
 */
import * as React from 'react';
import { Save, CheckCircle2, AlertCircle, Copy } from 'lucide-react';

import { Ontology, OsdkActions } from '@/lib/api';
import { useWorkshopSurface } from '@/lib/workshop/surface';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { FormFieldRow } from './form-field-row';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import type { FormFieldSpec, FormFieldType } from '@/lib/api';

// Mapa legado: writeback antigo só tinha 'string'|'number'|'boolean'|'text'. Mantemos
// compat (ADD-alongside) → coage p/ o tipo rico canônico do FormFieldSpec.
const _LEGACY_TYPE: Record<string, FormFieldType> = {
  string: 'text', text: 'textarea', number: 'number', boolean: 'boolean',
};

type Cfg = {
  target_kind?: string;
  node_id?: string;
  title?: string;
  submit_label?: string;
  on_success_variable?: string;
  // Campos no shape canônico FormFieldSpec (key/label/type/required/options/
  // ref_node_type/pattern/custom_message/...). Renderizados pelo MESMO renderer rico
  // do Form widget (form-field-row) — Select/Date/Lookup/Radio/etc., não só texto.
  fields?: FormFieldSpec[];
  // Wave G.1 — OSDK writeback callback. Quando setado, o submit chama
  // POST /platform/v25/aip/osdk/actions/{action_key}/invoke em vez de
  // POST /ontology/nodes — operador escolhe entre write direto ou via
  // Action declarada na ontologia (audit explícito + handler plugável).
  osdk_action_key?: string;
};

function readFields(cfg: Cfg): FormFieldSpec[] {
  if (!Array.isArray(cfg.fields)) return [];
  return cfg.fields
    .filter((f): f is FormFieldSpec => !!f && typeof f.key === 'string')
    .map((f) => {
      const raw = String(f.type ?? 'text');
      const type = (_LEGACY_TYPE[raw] ?? raw) as FormFieldType;
      return { ...f, type, label: f.label || f.key, required: !!f.required };
    });
}

/** Lê um id de nó de `name` ou `name.id`, seja em variables OU bindings.
 *  A SELEÇÃO (object_list/table select_change → set_variable) cai em
 *  `bindings`, não nas variables declaradas — por isso checamos os dois
 *  (#127): sem isto o Editar nunca achava o id e o form virava "criar". */
function readNodeRef(
  raw: string,
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
): string | null {
  const parts = raw.split('.');
  const head = parts[0];
  let cur: unknown = head in variables ? variables[head] : bindings[head];
  for (let i = 1; i < parts.length; i++) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[parts[i]];
    else return null;
  }
  if (typeof cur === 'string') return cur;
  if (
    cur &&
    typeof cur === 'object' &&
    typeof (cur as { id?: unknown }).id === 'string'
  ) {
    return (cur as { id: string }).id;
  }
  return null;
}

function resolveNodeId(
  cfg: Cfg,
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
): string | null {
  const raw = (cfg.node_id ?? '').trim();
  if (!raw) return null;
  // Resolve da seleção (variables OU bindings). Só cai pro literal se o ref
  // não casa nada E parece um UUID colado (não um nome de variável solto).
  const resolved = readNodeRef(raw, variables, bindings);
  if (resolved) return resolved;
  return /^[0-9a-f-]{16,}$/i.test(raw) ? raw : null;
}

function WritebackForm({ config, variables, bindings, setBinding, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const fields = readFields(cfg);
  const nodeId = resolveNodeId(cfg, variables, bindings ?? {});
  const isUpdate = !!nodeId;
  // Superfície: numa superfície pública (/m), o write é escopado pelo token (via
  // Action allowlistada). Ausente → caminho de escrita autenticado padrão.
  const surface = useWorkshopSurface();

  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [confirming, setConfirming] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<
    | { kind: 'idle' }
    | { kind: 'ok'; id: string }
    | { kind: 'err'; message: string }
  >({ kind: 'idle' });
  // 2026-06-05 (feedback do operador) — o payload técnico fica ESCONDIDO; o
  // form mostra só os campos. Um botão discreto no cabeçalho copia o JSON
  // exato que será enviado, caso precise (debug/suporte).
  const [copied, setCopied] = React.useState(false);
  const [confirmTextEntered, setConfirmTextEntered] = React.useState('');
  const requiredConfirmText = 'gravar';

  const setField = (k: string, v: unknown) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const missing = React.useMemo(
    () =>
      fields
        .filter((f) => f.required)
        .filter((f) => {
          const v = values[f.key];
          if (f.type === 'boolean') return false;
          return v == null || v === '';
        })
        .map((f) => f.label),
    [fields, values],
  );

  const target_kind = (cfg.target_kind ?? '').trim() || 'Person';

  // Payload HONESTO (espelha exatamente o que `handleConfirm` envia no caminho
  // canônico): criar = bulk {kind, items}; atualizar = {id, properties}.
  const previewPayload = React.useMemo<Record<string, unknown>>(
    () =>
      isUpdate && nodeId
        ? { id: nodeId, properties: values }
        : { kind: target_kind, items: [values] },
    [target_kind, values, isUpdate, nodeId],
  );

  const copyPayload = React.useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(
        JSON.stringify(previewPayload, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível — sem quebra; o botão é só conveniência */
    }
  }, [previewPayload]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length > 0) {
      setResult({
        kind: 'err',
        message: `Preencha: ${missing.join(', ')}`,
      });
      return;
    }
    setConfirmTextEntered('');
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setResult({ kind: 'idle' });
    try {
      // Três paths de writeback (em ordem de precedência):
      //   1) superfície pública (/m) → Action token-scoped (allowlistada);
      //   2) cfg.osdk_action_key → POST /aip/osdk/actions/{key}/invoke
      //      (auditoria via LineageEvent('osdk.action.invoke'));
      //   3) Direto pelo caminho CANÔNICO de instância (2026-06-05, fix do
      //      422): criar = POST /ontology/nodes/bulk (create_objects: coerção
      //      de contrato + signed_hash + lineage); atualizar = PUT
      //      /ontology/nodes/{id} com {properties} (mesmo caminho do
      //      instance_editor). O write antigo (POST /ontology/nodes) era o
      //      META-modelo — regex ^(entity|concept|attribute|relation)$
      //      rejeitava qualquer kind real.
      const actionKey = (cfg.osdk_action_key ?? '').trim();
      // RELAÇÕES: campos de lookup com relation_type viram ARESTAS na ontologia (não
      // properties soltas). Separa-os: o NÓ é criado só com os campos escalares; as
      // relações viram edges depois (source = nó novo, target = nó escolhido).
      const relationFields = fields.filter(
        (f) => (f as { relation_type?: string }).relation_type && f.ref_node_type,
      );
      const relKeys = new Set(relationFields.map((f) => f.key));
      const nodeValues = Object.fromEntries(
        Object.entries(values).filter(([k]) => !relKeys.has(k)),
      );
      let resultId = '';
      let savedObj: Record<string, unknown> = {};
      if (surface.writeback) {
        // Superfície pública (/m): escrita escopada pelo token — despacha uma
        // Action allowlistada (gated + auditada), nunca um write anônimo direto.
        const out = await surface.writeback({
          target_kind,
          fields: nodeValues,
          node_id: isUpdate && nodeId ? nodeId : undefined,
        });
        savedObj = { id: out.id, ...nodeValues };
        resultId = String(out.id || nodeId || '');
      } else if (actionKey) {
        const invokePayload: Record<string, unknown> = {
          target_kind,
          fields: nodeValues,
        };
        if (isUpdate && nodeId) invokePayload.node_id = nodeId;
        const out = await OsdkActions.invoke(actionKey, invokePayload);
        if (!out.ok) {
          throw new Error('invoke retornou ok=false');
        }
        // Echo response — id real virá de handlers reais (Wave G.2+);
        // hoje o stub devolve o input dentro de result.echo.
        savedObj = (out.result?.echo as Record<string, unknown>) ?? {};
        resultId = String(savedObj.id ?? nodeId ?? out.lineage_event_id ?? '');
      } else if (isUpdate && nodeId) {
        const saved = await Ontology.updateNode(nodeId, { properties: nodeValues });
        savedObj = saved as unknown as Record<string, unknown>;
        resultId = String((savedObj.id as string) ?? nodeId);
      } else {
        const out = await Ontology.bulkCreate(target_kind, [nodeValues]);
        resultId = String(out.object_ids?.[0] ?? '');
        savedObj = { id: resultId, ...nodeValues };
      }
      // CRIA AS ARESTAS (relações reais) p/ cada lookup preenchido — best-effort: a
      // gravação do nó não falha se uma aresta não puder ser criada.
      if (resultId && relationFields.length) {
        await Promise.all(
          relationFields.map(async (f) => {
            const v = values[f.key];
            const rel = (f as { relation_type?: string }).relation_type;
            if (typeof v === 'string' && v && rel) {
              try {
                await Ontology.createEdge({
                  source_node_id: resultId,
                  target_node_id: v,
                  relation_type: String(rel),
                });
              } catch {
                /* aresta best-effort — não derruba a gravação */
              }
            }
          }),
        );
      }
      setResult({ kind: 'ok', id: resultId });
      if (cfg.on_success_variable) {
        setBinding(cfg.on_success_variable, savedObj);
      }
      // Emite o trigger que o AIP fia (refresh_all + switch_page p/ a aba de lista) —
      // sem isto a gravação não recarregava a lista nem navegava entre abas.
      emit?.('form.submit.success', { id: resultId, ...savedObj });
      setConfirming(false);
    } catch (err) {
      const msg = humanizeApiError(err instanceof Error ? err.message : 'Falha ao gravar');
      setResult({ kind: 'err', message: msg });
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2.5"
      data-testid="writeback-form-widget"
    >
      <header className="flex items-center gap-2 border-b border-border-light pb-2">
        <Save className="w-3 h-3 text-primary" strokeWidth={1.5} />
        <p className="text-h3 font-semibold flex-1">
          {cfg.title ?? 'Gravar na ontologia'}
        </p>
        <span className="text-caption font-mono text-muted-on-light">
          {isUpdate ? 'atualizar' : 'criar'} · {target_kind}
        </span>
        {/* 2026-06-05 (feedback do operador) — payload técnico ESCONDIDO do
            form; este botão discreto copia o JSON exato que será enviado. */}
        <button
          type="button"
          onClick={() => void copyPayload()}
          title="Copiar payload (JSON)"
          aria-label="Copiar payload (JSON)"
          data-testid="writeback-form-copy-payload"
          className="shrink-0 flex items-center justify-center w-5 h-5 text-muted-on-light hover:text-primary"
        >
          {copied ? (
            <CheckCircle2 className="w-3 h-3 text-success" strokeWidth={1.5} />
          ) : (
            <Copy className="w-3 h-3" strokeWidth={1.5} />
          )}
        </button>
      </header>

      {fields.length === 0 ? (
        <p
          className="text-small text-muted-on-light italic"
          data-testid="writeback-form-empty"
        >
          Configure os campos no Inspetor para começar.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-2"
          data-testid="writeback-form-form"
        >
          {fields.map((f) => (
            <FormFieldRow
              key={f.key}
              field={f}
              value={values[f.key]}
              effectiveRequired={!!f.required}
              onChange={(v) => setField(f.key, v)}
            />
          ))}

          {missing.length > 0 && result.kind === 'err' && (
            <p
              className="text-caption text-danger font-mono"
              data-testid="writeback-form-missing"
            >
              {result.message}
            </p>
          )}

          {result.kind === 'err' && missing.length === 0 && (
            <p
              className="text-caption text-danger font-mono flex items-center gap-1.5"
              data-testid="writeback-form-error"
            >
              <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
              {result.message}
            </p>
          )}

          {result.kind === 'ok' && (
            <p
              className="text-caption text-success font-mono flex items-center gap-1.5"
              data-testid="writeback-form-success"
            >
              <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
              Gravado · id {result.id || '—'}
            </p>
          )}

          <button
            type="submit"
            data-testid="writeback-form-submit"
            disabled={submitting}
            className="h-7 px-3 text-small bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 self-start flex items-center gap-1.5"
          >
            <Save className="w-3 h-3" strokeWidth={1.5} />
            {cfg.submit_label ?? (isUpdate ? 'Atualizar' : 'Criar')}
          </button>
        </form>
      )}

      {confirming && (
        <div
          className="border border-warning bg-warning/10 p-3 flex flex-col gap-2"
          data-testid="writeback-form-confirm"
          role="dialog"
          aria-label="Confirmação de gravação"
        >
          <p className="text-small font-semibold text-text-on-light flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 text-warning" strokeWidth={1.5} />
            Confirmar gravação?
          </p>
          <p className="text-caption text-muted-on-light">
            {isUpdate
              ? `O nó ${nodeId} (${target_kind}) será atualizado.`
              : `Um novo nó ${target_kind} será criado.`}
          </p>
          {/* Wave F.2 — requireConfirmText. Operador precisa digitar
              "gravar" antes do botão Confirmar ficar ativo. */}
          <label className="block text-caption text-text-on-light">
            <span className="block mb-1">
              Digite{' '}
              <span className="font-mono text-warning">
                {requiredConfirmText}
              </span>{' '}
              para liberar a confirmação:
            </span>
            <input
              type="text"
              value={confirmTextEntered}
              onChange={(e) => setConfirmTextEntered(e.target.value)}
              data-testid="writeback-form-confirm-text"
              className="w-full h-6 px-2 text-caption font-mono bg-white border border-border-light outline-none focus:border-primary"
              autoFocus
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={
                submitting || confirmTextEntered.trim() !== requiredConfirmText
              }
              data-testid="writeback-form-confirm-yes"
              className="h-6 px-2 text-caption font-mono bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? 'Gravando…' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              data-testid="writeback-form-confirm-no"
              className="h-6 px-2 text-caption font-mono bg-white border border-border-light hover:border-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

registerWidget('writeback_form', WritebackForm, {
  group: 'data',
  label: 'Formulário de gravação',
  description:
    'Cria ou atualiza um nó na ontologia. Renderiza form a partir dos campos declarados e grava via API com confirmação.',
  icon: 'save',
  defaultColSpan: 6,
  mockConfig: {
    target_kind: 'Person',
    title: 'Cadastro rápido de pessoa',
    submit_label: 'Salvar pessoa',
    fields: [
      {
        key: 'nome',
        label: 'Nome completo',
        type: 'text',
        required: true,
        placeholder: 'Ex.: Maria da Silva',
      },
      {
        key: 'cpf',
        label: 'CPF',
        type: 'text',
        required: true,
        placeholder: 'somente números',
      },
      {
        key: 'observacoes',
        label: 'Observações',
        type: 'text',
        required: false,
        placeholder: 'Notas operacionais',
      },
    ],
  } satisfies Cfg,
  mockVariables: {},
  config_schema: [
    {
      name: 'target_kind',
      label: 'Tipo do nó',
      description:
        'Tipo de entidade na ontologia (ex.: Person, Vehicle, Event, Document).',
      field: 'node-type',
      placeholder: 'Person',
      default: 'Person',
    },
    {
      name: 'node_id',
      label: 'ID do nó a atualizar (vazio = criar novo)',
      description:
        'ID literal ou external_id de um dado que carregue o id. Quando preenchido, o submit faz UPDATE.',
      field: 'variable-ref',
    },
    {
      name: 'title',
      label: 'Título',
      description: 'Cabeçalho exibido acima do formulário.',
      field: 'string',
      placeholder: 'ex.: Cadastro rápido de pessoa',
    },
    {
      name: 'submit_label',
      label: 'Rótulo do botão',
      description: 'Texto do botão de gravação.',
      field: 'string',
      placeholder: 'ex.: Salvar pessoa',
    },
    {
      name: 'on_success_variable',
      label: 'Dado a atualizar no sucesso',
      description:
        'external_id de um dado que deve receber o nó criado/atualizado.',
      field: 'variable-ref',
    },
    {
      name: 'fields',
      label: 'Campos (JSON)',
      description:
        'Array JSON: [{key, label, type: string|number|boolean|text, required?, placeholder?}]',
      field: 'string',
      placeholder: '[{"key":"nome","label":"Nome","type":"string","required":true}]',
    },
    {
      // Wave G.1 — OSDK writeback callback. Quando preenchido, o submit
      // chama POST /platform/v25/aip/osdk/actions/{key}/invoke em vez do
      // write direto em /ontology/nodes. Use a chave declarada do
      // ActionType na ontologia.
      name: 'osdk_action_key',
      label: 'ActionType (OSDK)',
      description:
        'Quando preenchido, o submit chama o ActionType pela chave informada (POST /aip/osdk/actions/{key}/invoke) em vez de gravar direto em /ontology/nodes.',
      field: 'string',
      placeholder: 'ex.: security.criar_caso',
    },
  ],
});

export { WritebackForm };
