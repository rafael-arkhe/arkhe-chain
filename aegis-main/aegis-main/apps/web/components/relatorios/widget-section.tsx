'use client';

/**
 * WidgetSection (T3-E) — uma seção de documento = QUALQUER widget do catálogo
 * pleno (reusa o motor do Workshop, nunca reinventa):
 *   - palette: `getRegisteredWidgets()` (proposable, não-domínio, não-hidden) +
 *     `MiniWidgetPreview` (thumbs).
 *   - configurar: `PropFieldEditor` sobre `meta.config_schema`.
 *   - bind à ontologia: `ObjectPicker` → resolve o nó client-side (getNode →
 *     ObjectReference; neighbors → ObjectSet) auto-fiado ao 1º campo variable-ref.
 *   - render ao vivo: `getWidgetComponent(type)` com {config, variables}.
 *
 * v1: widgets config-driven (texto/callout/divider/quote/imagem/KPI…) e de
 * objeto-único (property_list/object_view/card/comments) renderizam com dado
 * real. Widgets de object_set (tabela/gráficos) bindam por vizinhança; quando
 * não há binding, mostram a pré-visualização (mockVariables) com aviso honesto.
 */
import * as React from 'react';
import { Boxes, LayoutGrid, PenLine, Plus, Upload, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import '@/components/workshop/widgets'; // side-effect: popula o REGISTRY (palette)
import {
  getRegisteredWidgets,
  getWidgetComponent,
  getWidgetMeta,
  type PropFieldDef,
} from '@/components/workshop/WorkshopV2Renderer';
import { PropFieldEditor } from '@/components/workshop/prop-field-editor';
import { ObjectPicker } from '@/components/ontology/object-picker';
import { iconByName } from '@/lib/icon-by-name';
import { Ontology, Notepad, Me } from '@/lib/api';
import type { NotepadSection, ObjectTypeProperty } from '@/lib/api';
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad';
import {
  ObjectSetRunnerContext,
  type ObjectSetRunner,
} from '@/lib/workshop/runtime';
import type { ObjectSetRow, WorkshopVariable } from '@/lib/workshop/types';
import catalogRaw from '@/lib/workshop/widget-catalog.json';

type CatalogEntry = {
  type: string;
  label: string;
  category: string;
  proposable: boolean;
  inputs: { name: string; variable_type: string }[];
};
const CATALOG = catalogRaw as unknown as CatalogEntry[];
const CATALOG_BY_TYPE = new Map(CATALOG.map((e) => [e.type, e]));

// Um documento/apresentação (PDF ou web) é DISPLAY + data-viz + mídia. Widgets
// INTERATIVOS não fazem sentido num artefato estático: filtros, busca, seletores
// (categoria 'filtering'), botões/ações/abas (categoria 'event_nav') e os de
// escrita/composição/ops ao vivo abaixo. Ficam fora da palette do documento.
const DOC_EXCLUDED_CATEGORIES = new Set(['filtering', 'event_nav']);
const DOC_EXCLUDED_TYPES = new Set([
  'form_builder',
  'writeback_form',
  'embedded_app',
  'loop_layout',
  'instance_editor',
  'media_uploader',
  'alert_list',
  'buscas_monitoradas',
  'connector_status',
  'comments',
  'iframe',
  'container_group',
]);

/** Widgets oferecidos no DOCUMENTO: proposable, não-domínio, não-hidden, e que
 *  fazem sentido num PDF/apresentação (display + data-viz + mídia). */
function documentWidgets(): { type: string; label: string; group: string; icon: string }[] {
  const out: { type: string; label: string; group: string; icon: string }[] = [];
  for (const { type, meta } of getRegisteredWidgets()) {
    const cat = CATALOG_BY_TYPE.get(type);
    if (!cat?.proposable) continue;
    if (type.startsWith('security.')) continue;
    if (meta.hidden) continue;
    if (DOC_EXCLUDED_CATEGORIES.has(cat.category)) continue;
    if (DOC_EXCLUDED_TYPES.has(type)) continue;
    out.push({ type, label: meta.label || type, group: meta.group || 'data', icon: meta.icon || 'square' });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

const GROUP_LABEL: Record<string, string> = {
  content: 'Conteúdo',
  data: 'Dados',
  viz: 'Visualização',
  filtros: 'Filtros',
  filtros_por_grupo: 'Filtros',
  embed: 'Incorporado',
};

function firstVariableRefField(schema: PropFieldDef[] | undefined): string | null {
  for (const f of schema || []) if (f.field === 'variable-ref' || f.field === 'variable-path') return f.name;
  return null;
}

function inputTypeOf(type: string): string | undefined {
  return CATALOG_BY_TYPE.get(type)?.inputs?.[0]?.variable_type;
}

// ── T3-G3 (a): filtro discreto do object-set ────────────────────────────────
// Uma seção de conjunto traz TODOS os objetos do tipo; o filtro restringe
// ("uf = SP", "score ≥ 80") direto na seção. As condições da UI compilam num
// FilterPredicate (contrato do backend: leaf {op,field,value} / {op:'and',
// operands}) que flui IGUAL para o operador e para o /m transmitido. Op nunca
// aparece cru na UI — só rótulo pt-BR; campo é escolhido no contrato do tipo.
export type FilterCondition = { field: string; op: string; value: unknown };

const FILTER_OP_LABEL: Record<string, string> = {
  eq: 'é igual a',
  neq: 'é diferente de',
  contains: 'contém',
  prefix: 'começa com',
  gt: 'maior que',
  gte: 'maior ou igual a',
  lt: 'menor que',
  lte: 'menor ou igual a',
};

const _NUMERIC_TYPES = new Set([
  'number', 'integer', 'int', 'float', 'numeric', 'double', 'long', 'decimal',
]);
const _TEMPORAL_TYPES = new Set(['date', 'datetime', 'timestamp', 'time']);

function bucketOfType(type?: string): 'numeric' | 'temporal' | 'boolean' | 'text' {
  const t = (type || '').toLowerCase();
  if (t === 'boolean' || t === 'bool') return 'boolean';
  if (_NUMERIC_TYPES.has(t)) return 'numeric';
  if (_TEMPORAL_TYPES.has(t)) return 'temporal';
  return 'text';
}

/** Operadores oferecidos para uma propriedade, curados pelo seu tipo (rótulo
 *  pt-BR; nunca op cru). String/desconhecido = igualdade + texto; numérico e
 *  temporal = comparações de ordem; booleano = só igualdade. */
export function opsForType(type?: string): { op: string; label: string }[] {
  const allowed: Record<ReturnType<typeof bucketOfType>, string[]> = {
    text: ['eq', 'neq', 'contains', 'prefix'],
    numeric: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    temporal: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    boolean: ['eq', 'neq'],
  };
  return allowed[bucketOfType(type)].map((op) => ({ op, label: FILTER_OP_LABEL[op] }));
}

// As rows do ObjectSet expõem os campos tipados sob `properties.<chave>` (top-level
// só id/name/node_type). O backend (`_resolve_field`) exige o caminho dotted p/
// JSONB — então uma propriedade do contrato vira `properties.<chave>` no predicado.
const _TOP_LEVEL_FIELDS = new Set(['id', 'name', 'node_type']);
const _PROP_PREFIX = 'properties.';
function toFieldPath(raw: string): string {
  if (!raw || raw.includes('.') || _TOP_LEVEL_FIELDS.has(raw)) return raw;
  return `${_PROP_PREFIX}${raw}`;
}
function fromFieldPath(path: string): string {
  return path.startsWith(_PROP_PREFIX) ? path.slice(_PROP_PREFIX.length) : path;
}

function isConditionComplete(c: FilterCondition): boolean {
  if (!c.field || !c.op) return false;
  if (c.value === undefined || c.value === null) return false;
  if (typeof c.value === 'string' && c.value.trim() === '') return false;
  return true;
}

/** Compila as condições da UI num FilterPredicate (contrato do backend):
 *  0 condições completas → null; 1 → leaf {op,field,value}; ≥2 → AND de leaves.
 *  Ignora condições incompletas (em edição) — preserva number/boolean/0. */
export function buildFilterPredicate(
  conditions: FilterCondition[] | undefined,
): Record<string, unknown> | null {
  const leaves = (conditions || [])
    .filter(isConditionComplete)
    .map((c) => ({ op: c.op, field: c.field, value: c.value }));
  if (leaves.length === 0) return null;
  if (leaves.length === 1) return leaves[0];
  return { op: 'and', operands: leaves };
}

// Widgets de MÍDIA → o arquivo é enviado ao MinIO (escopado ao doc) e a URL de
// serve ESTÁVEL é gravada no campo certo do widget. Cada um lê de um campo:
const MEDIA_URL_FIELD: Record<string, string> = {
  figure: 'url',
  image: 'url',
  signature: 'url',
  audio_player: 'url',
  video_player: 'source',
  pdf_viewer: 'source',
};
const MEDIA_ACCEPT: Record<string, string> = {
  video_player: 'video/*',
  audio_player: 'audio/*',
  pdf_viewer: 'application/pdf',
};

/** Upload de arquivo p/ um widget de mídia: file → data URL → MinIO (escopado ao
 *  doc) → grava a URL de serve ESTÁVEL no campo do widget. */
function MediaUploadField({
  docId,
  widgetType,
  value,
  onUploaded,
}: {
  docId: string;
  widgetType: string;
  value?: string;
  onUploaded: (url: string, objectKey: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('falha ao ler o arquivo'));
        r.readAsDataURL(file);
      });
      const up = await Notepad.upload(docId, { data_url: dataUrl, original_filename: file.name });
      onUploaded(Notepad.mediaUrl(docId, up.object_key), up.object_key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha no upload');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-border-light p-2.5 space-y-1.5" data-testid="widget-section-upload">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Arquivo (armazenado no MinIO)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT[widgetType] || 'image/*'}
        className="hidden"
        data-testid="media-upload-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          data-testid="media-upload-btn"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1.5"
        >
          <Upload className="w-3 h-3" strokeWidth={1.5} /> {busy ? 'Enviando…' : 'Enviar arquivo'}
        </button>
        {value && <span className="text-[10px] text-success">arquivo enviado</span>}
      </div>
      {err && <p className="text-[10px] text-danger" data-testid="media-upload-err">{err}</p>}
    </div>
  );
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('falha ao ler o arquivo'));
    r.readAsDataURL(blob);
  });
}

/** Config do widget de ASSINATURA (#3): imagem reutilizável do operador. Três
 *  fontes — assinatura salva (cofre /me/signature), enviar imagem, ou desenhar.
 *  A imagem aplicada é copiada p/ o doc (MinIO escopado) e renderiza igual à
 *  figura (operador/guest/PDF). Opcional: salvar como minha assinatura (reusar). */
function SignatureConfigField({
  docId,
  props,
  onChange,
}: {
  docId: string;
  props: Record<string, unknown>;
  onChange: (next: Partial<NotepadSection>) => void;
}) {
  const [savedExists, setSavedExists] = React.useState<boolean | null>(null);
  const [mode, setMode] = React.useState<'upload' | 'draw' | null>(null);
  const [saveReuse, setSaveReuse] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const padRef = React.useRef<SignaturePadHandle>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const currentUrl = props.url ? String(props.url) : '';

  React.useEffect(() => {
    let alive = true;
    Me.signature()
      .then((s) => alive && setSavedExists(s.has_signature))
      .catch(() => alive && setSavedExists(false));
    return () => {
      alive = false;
    };
  }, []);

  async function applyDataUrl(dataUrl: string, alsoSave: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const up = await Notepad.upload(docId, { data_url: dataUrl });
      const today = new Date().toLocaleDateString();
      onChange({
        props: {
          ...props,
          url: Notepad.mediaUrl(docId, up.object_key),
          object_key: up.object_key,
          date: props.date || today,
        },
      });
      if (alsoSave) {
        try {
          await Me.setSignature(dataUrl);
          setSavedExists(true);
        } catch {
          /* falha ao salvar no cofre não impede usar no doc */
        }
      }
      setMode(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao aplicar a assinatura');
    } finally {
      setBusy(false);
    }
  }

  async function useSaved() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(Me.signatureImageUrl());
      if (!res.ok) throw new Error('sem assinatura salva');
      await applyDataUrl(await readAsDataUrl(await res.blob()), false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha ao usar a assinatura salva');
      setBusy(false);
    }
  }

  async function applyDraw() {
    const dataUrl = padRef.current?.toDataUrl();
    if (!dataUrl) {
      setErr('desenhe a assinatura primeiro');
      return;
    }
    await applyDataUrl(dataUrl, saveReuse);
  }

  return (
    <div className="border border-border-light p-2.5 space-y-2" data-testid="signature-config">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        Assinatura (imagem)
      </p>

      {currentUrl && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt="Assinatura" className="h-10 max-w-[160px] object-contain border border-border-light bg-white" />
          <span className="text-[10px] text-success">assinatura aplicada</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {savedExists && (
          <button
            type="button"
            disabled={busy}
            onClick={useSaved}
            data-testid="signature-use-saved"
            className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50"
          >
            Minha assinatura
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setErr(null);
            setMode(mode === 'upload' ? null : 'upload');
            fileRef.current?.click();
          }}
          data-testid="signature-upload"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Upload className="w-3 h-3" strokeWidth={1.5} /> Enviar imagem
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setErr(null);
            setMode(mode === 'draw' ? null : 'draw');
          }}
          data-testid="signature-draw-toggle"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <PenLine className="w-3 h-3" strokeWidth={1.5} /> Desenhar
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="signature-file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await applyDataUrl(await readAsDataUrl(f), saveReuse);
        }}
      />

      {mode === 'draw' && (
        <div className="space-y-1.5" data-testid="signature-draw">
          <SignaturePad ref={padRef} height={130} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={applyDraw}
              data-testid="signature-apply-draw"
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => padRef.current?.clear()}
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary inline-flex items-center gap-1.5"
            >
              <X className="w-3 h-3" strokeWidth={1.5} /> Limpar
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-1.5 text-[10px] text-muted-on-light">
        <input
          type="checkbox"
          checked={saveReuse}
          onChange={(e) => setSaveReuse(e.target.checked)}
          data-testid="signature-save-reuse"
          className="accent-primary"
        />
        Salvar como minha assinatura (reusar em outros documentos)
      </label>

      {err && <p className="text-[10px] text-danger" data-testid="signature-err">{err}</p>}
    </div>
  );
}

/** Resolve client-side o NÓ ÚNICO (ObjectReference) bindado. Operador: `getNode`
 *  (auth). Guest /m (`guestToken`): endpoint token-scoped que exige o nó estar
 *  referenciado no doc + ABAC (clearances=() → classificado cai p/ preview). */
function useResolvedRef(
  varKey: string,
  inputType: string | undefined,
  nodeId?: string,
  guestToken?: string,
) {
  const [vars, setVars] = React.useState<Record<string, unknown> | null>(null);
  React.useEffect(() => {
    if (inputType !== 'ObjectReference' || !nodeId || !varKey) {
      setVars(null);
      return;
    }
    let cancelled = false;
    const fetchNode = guestToken
      ? fetch(
          `/api/public/guest/${encodeURIComponent(guestToken)}/document/node?node_id=${encodeURIComponent(nodeId)}`,
        ).then((r) => (r.ok ? r.json() : Promise.reject(new Error('guest node'))))
      : Ontology.getNode(nodeId);
    fetchNode
      .then((node) => {
        if (!cancelled) setVars({ [varKey]: node });
      })
      .catch(() => {
        if (!cancelled) setVars(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inputType, nodeId, varKey, guestToken]);
  return vars;
}

/** Editor do filtro discreto do object-set: lista de condições (E lógico),
 *  cada uma = propriedade (do contrato do tipo) + operador (curado pelo tipo) +
 *  valor (input adaptado ao tipo). Sem input técnico cru: campo e operador são
 *  dropdowns vindos do contrato. Compila p/ FilterPredicate via o pai. */
function FilterConditionsEditor({
  objectType,
  conditions,
  onChange,
}: {
  objectType: string;
  conditions: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
}) {
  const [schemaProps, setSchemaProps] = React.useState<ObjectTypeProperty[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setSchemaProps(null);
    Ontology.objectTypeSchema(objectType)
      .then((s) => {
        if (!cancelled) setSchemaProps(s.properties);
      })
      .catch(() => {
        // tipo legado sem contrato → degrada para campo textual manual
        if (!cancelled) setSchemaProps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectType]);

  // c.field guarda o CAMINHO (ex.: `properties.cidade`); o tipo vem do contrato
  // pela propriedade cujo caminho bate.
  const typeOf = (field: string): string | undefined =>
    schemaProps?.find((p) => toFieldPath(p.key) === field)?.type;

  const update = (i: number, patch: Partial<FilterCondition>) =>
    onChange(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));
  const add = () => onChange([...conditions, { field: '', op: 'eq', value: '' }]);

  // Troca de propriedade (recebe o caminho): zera valor e garante operador válido.
  const onPickField = (i: number, field: string) => {
    const ops = opsForType(typeOf(field));
    const op = ops.some((o) => o.op === conditions[i]?.op) ? conditions[i].op : ops[0]?.op || 'eq';
    update(i, { field, op, value: '' });
  };

  const coerce = (raw: string, type?: string): unknown => {
    if (bucketOfType(type) === 'numeric') {
      if (raw === '') return '';
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    return raw;
  };

  return (
    <div className="space-y-1.5" data-testid="filter-conditions">
      {conditions.map((c, i) => {
        const propType = typeOf(c.field);
        const bucket = bucketOfType(propType);
        const ops = opsForType(propType);
        return (
          <div key={i} className="flex items-center gap-1.5" data-testid="filter-condition-row">
            {/* propriedade (contrato do tipo) */}
            {schemaProps && schemaProps.length > 0 ? (
              <select
                value={c.field}
                data-testid="filter-field"
                onChange={(e) => onPickField(i, e.target.value)}
                className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary max-w-[34%]"
              >
                <option value="">Propriedade…</option>
                {schemaProps.map((p) => (
                  <option key={p.key} value={toFieldPath(p.key)}>
                    {p.label || p.key}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={fromFieldPath(c.field)}
                data-testid="filter-field"
                placeholder={schemaProps == null ? 'Carregando…' : 'propriedade'}
                disabled={schemaProps == null}
                onChange={(e) => onPickField(i, toFieldPath(e.target.value.trim()))}
                className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary max-w-[34%]"
              />
            )}

            {/* operador (curado pelo tipo) */}
            <select
              value={c.op}
              data-testid="filter-op"
              onChange={(e) => update(i, { op: e.target.value })}
              className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary"
            >
              {ops.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* valor (adaptado ao tipo) */}
            {bucket === 'boolean' ? (
              <select
                value={c.value === true ? 'true' : c.value === false ? 'false' : ''}
                data-testid="filter-value"
                onChange={(e) =>
                  update(i, { value: e.target.value === '' ? '' : e.target.value === 'true' })
                }
                className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary flex-1 min-w-0"
              >
                <option value="">—</option>
                <option value="true">Verdadeiro</option>
                <option value="false">Falso</option>
              </select>
            ) : (
              <input
                type={bucket === 'numeric' ? 'number' : bucket === 'temporal' ? 'date' : 'text'}
                value={c.value == null ? '' : String(c.value)}
                data-testid="filter-value"
                placeholder="valor"
                onChange={(e) => update(i, { value: coerce(e.target.value, propType) })}
                className="h-7 px-1.5 text-[11px] bg-white border border-border-light outline-none focus:border-primary flex-1 min-w-0"
              />
            )}

            <button
              type="button"
              onClick={() => remove(i)}
              data-testid="filter-remove"
              aria-label="Remover condição"
              className="text-muted-on-light hover:text-danger shrink-0"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        data-testid="filter-add"
        className="h-7 px-2 text-[10px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5 text-text-on-light"
      >
        <Plus className="w-3 h-3" strokeWidth={1.5} /> Adicionar condição
      </button>
    </div>
  );
}

/** Um widget que estoura não pode derrubar o documento inteiro. */
class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <p className="text-[11px] text-muted-on-light italic border border-dashed border-border-light p-3">
          Este widget não pôde ser exibido aqui.
        </p>
      );
    }
    return this.props.children;
  }
}

/** Render ao vivo de um widget de seção. Funciona em 2 superfícies:
 *  - operador (docId): dados/mídia via /notepad/{id}/... (auth de operador);
 *  - guest /m (guestToken): dados/mídia via /public/v1/guest/{token}/... (token). */
export function WidgetSectionView({
  section,
  docId,
  guestToken,
}: {
  section: NotepadSection;
  docId?: string;
  guestToken?: string;
}) {
  const type = String(section.widget || '');
  const props = (section.props as Record<string, unknown>) || {};
  const Component = getWidgetComponent(type);
  const meta = getWidgetMeta(type);
  const inputType = inputTypeOf(type);
  const refKey = firstVariableRefField(meta?.config_schema);
  const varKey = (refKey ? String(props[refKey] ?? '') : '') || 'doc_data';
  const nodeId = section.node_id ? String(section.node_id) : undefined;
  const objectType = section.object_type ? String(section.object_type) : undefined;

  const refVars = useResolvedRef(varKey, inputType, nodeId, guestToken);

  // T3-G3 (a): o filtro discreto da seção flui IGUAL p/ operador e guest. Serializa
  // p/ chave estável (evita re-fetch por identidade nova a cada render).
  const filterKey = JSON.stringify((section.filter as Record<string, unknown> | null) ?? null);

  // Resolve um object-set: guest (token-scoped) OU operador (docId). Mesma
  // engine governada no backend; só muda QUEM autoriza.
  const fetchSet = React.useCallback(
    async (ot: string, limit: number): Promise<{ rows: Record<string, unknown>[]; total: number }> => {
      const filter = JSON.parse(filterKey) as Record<string, unknown> | null;
      if (guestToken) {
        const res = await fetch(
          `/api/public/guest/${encodeURIComponent(guestToken)}/document/object-sets/query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ object_type: ot, filter, limit }),
          },
        );
        if (!res.ok) throw new Error('guest object-set');
        const d = await res.json();
        return { rows: (d.rows ?? []) as Record<string, unknown>[], total: d.total_after_filter ?? 0 };
      }
      if (docId) {
        const d = await Notepad.queryObjectSet(docId, { object_type: ot, filter, limit });
        return { rows: d.rows as Record<string, unknown>[], total: d.total_after_filter };
      }
      throw new Error('sem documento');
    },
    [guestToken, docId, filterKey],
  );

  const [setRows, setSetRows] = React.useState<Record<string, unknown>[] | null>(null);
  React.useEffect(() => {
    if (inputType !== 'ObjectSet' || !objectType || !(docId || guestToken)) {
      setSetRows(null);
      return;
    }
    let cancelled = false;
    fetchSet(objectType, 200)
      .then((r) => {
        if (!cancelled) setSetRows(r.rows);
      })
      .catch(() => {
        if (!cancelled) setSetRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inputType, objectType, docId, guestToken, fetchSet]);

  if (!Component) {
    return (
      <p className="text-[11px] text-muted-on-light italic border border-dashed border-border-light p-3">
        Widget &quot;{type}&quot; não registrado.
      </p>
    );
  }

  const isMedia = !!MEDIA_URL_FIELD[type];
  // Mídia no guest: a URL gravada é a serve-path do operador (auth). Reescreve
  // p/ a serve-path PÚBLICA do token usando o object_key gravado no upload.
  let effectiveProps = props;
  if (guestToken && isMedia && props.object_key) {
    effectiveProps = {
      ...props,
      [MEDIA_URL_FIELD[type]]: `/api/public/guest/${encodeURIComponent(guestToken)}/media?key=${encodeURIComponent(String(props.object_key))}`,
    };
  }

  const needsData = !!inputType;
  let variables: Record<string, unknown> = (meta?.mockVariables as Record<string, unknown>) ?? {};
  let usingMock = false;
  if (inputType === 'ObjectReference') {
    variables = refVars ?? variables;
    usingMock = !refVars;
  } else if (inputType === 'ObjectSet') {
    variables = setRows ? { [varKey]: setRows } : variables;
    usingMock = !setRows;
  }

  const runner: ObjectSetRunner | null =
    inputType === 'ObjectSet' && objectType && (docId || guestToken)
      ? async (_appId, q) => {
          const r = await fetchSet(objectType, q.limit ?? 200);
          return { rows: r.rows as unknown as ObjectSetRow[], total: r.total };
        }
      : null;

  const body = (
    <div>
      <WidgetErrorBoundary>
        <Component
          appId="document"
          config={effectiveProps}
          variables={variables}
          bindings={{}}
          setBinding={() => {}}
        />
      </WidgetErrorBoundary>
      {needsData && usingMock && !guestToken && (
        <p className="text-[10px] text-muted-on-light italic mt-1">
          {inputType === 'ObjectSet'
            ? 'Pré-visualização — escolha um tipo de objeto para ligar à ontologia.'
            : 'Pré-visualização — escolha um objeto para ligar à ontologia.'}
        </p>
      )}
    </div>
  );

  return runner ? (
    <ObjectSetRunnerContext.Provider value={runner}>{body}</ObjectSetRunnerContext.Provider>
  ) : (
    body
  );
}

/** Editor de uma seção de widget: palette → configurar + bindar + preview. */
export function WidgetSectionEditor({
  section,
  onChange,
  docId,
}: {
  section: NotepadSection;
  onChange: (next: Partial<NotepadSection>) => void;
  docId?: string;
}) {
  const type = String(section.widget || '');
  const props = (section.props as Record<string, unknown>) || {};
  const meta = type ? getWidgetMeta(type) : null;
  const schema = meta?.config_schema;
  const inputType = type ? inputTypeOf(type) : undefined;
  const needsData = !!inputType;
  const isMedia = !!MEDIA_URL_FIELD[type];
  const refKey = firstVariableRefField(schema);

  // #7: no documento o object_type vive na SEÇÃO (não numa variável declarada).
  // Injeta uma var objectSet SINTÉTICA p/ os pickers de propriedade (chart/pivot/
  // heatmap/slate…) resolverem o contrato do tipo via typeFrom='source' — dropdown
  // de propriedades, nunca input técnico cru (feedback_no_manual_technical_input).
  const sourceVar = (refKey ? String(props[refKey] ?? '') : '') || 'doc_data';
  const docAppVariables = React.useMemo<WorkshopVariable[]>(
    () =>
      section.object_type
        ? [
            {
              id: 'doc-src',
              external_id: sourceVar,
              type: 'ObjectSet',
              kind: 'objectSet',
              recompute_mode: 'onLoad',
              spec: { object_type: String(section.object_type) },
            } as unknown as WorkshopVariable,
          ]
        : [],
    [section.object_type, sourceVar],
  );

  if (!type) {
    return <WidgetPalette onPick={(t) => onChange({ widget: t, props: defaultProps(t) })} />;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <LayoutGrid className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
        <span className="text-[11px] font-medium text-text-on-light">{meta?.label || type}</span>
        <button
          type="button"
          onClick={() => onChange({ widget: '', props: {}, node_id: undefined })}
          data-testid="widget-section-change"
          className="ml-auto h-6 px-2 text-[10px] bg-white border border-border-light hover:border-primary"
        >
          Trocar widget
        </button>
      </div>

      {/* Preview ao vivo */}
      <div className="border border-border-light bg-white p-2">
        <WidgetSectionView section={section} docId={docId} />
      </div>

      {/* Mídia → MinIO, serve estável. Assinatura tem config própria (salva/enviar/
          desenhar); os demais usam o upload genérico. */}
      {isMedia && docId && type === 'signature' && (
        <SignatureConfigField docId={docId} props={props} onChange={onChange} />
      )}
      {isMedia && docId && type !== 'signature' && (
        <MediaUploadField
          docId={docId}
          widgetType={type}
          value={props[MEDIA_URL_FIELD[type]] as string | undefined}
          onUploaded={(url, key) =>
            onChange({ props: { ...props, [MEDIA_URL_FIELD[type]]: url, object_key: key } })
          }
        />
      )}

      {/* Bind à ontologia (widgets de dado, não-mídia) */}
      {needsData && !isMedia && (
        <div className="border border-border-light p-2.5 space-y-1.5" data-testid="widget-section-bind">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            {inputType === 'ObjectSet' ? 'Conjunto de objetos (ontologia)' : 'Ligar à ontologia'}
          </p>
          {inputType === 'ObjectSet' ? (
            <>
              <PropFieldEditor
                field={{
                  name: 'object_type',
                  label: 'Tipo de objeto',
                  field: 'node-type',
                  description: 'Todos os objetos deste tipo — governado (tenant + ABAC + masking).',
                }}
                value={section.object_type}
                appVariables={[]}
                onOpenVariablesPanel={() => {}}
                onChange={(v) =>
                  onChange({
                    object_type: v ? String(v) : undefined,
                    // trocar o tipo invalida as propriedades → zera o filtro
                    filter: null,
                    filter_conditions: [],
                    props: refKey ? { ...props, [refKey]: 'doc_data' } : props,
                  })
                }
              />
              {section.object_type ? (
                <div className="pt-2 mt-1.5 border-t border-border-light/60 space-y-1.5" data-testid="widget-section-filter">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                    Filtro (opcional)
                  </p>
                  <FilterConditionsEditor
                    objectType={String(section.object_type)}
                    conditions={(section.filter_conditions as FilterCondition[] | undefined) ?? []}
                    onChange={(next) =>
                      onChange({ filter_conditions: next, filter: buildFilterPredicate(next) })
                    }
                  />
                </div>
              ) : null}
            </>
          ) : section.node_id ? (
            <div className="flex items-center gap-2 text-[11px]">
              <Boxes className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
              <span className="font-mono truncate">{String(section.node_id)}</span>
              <button
                type="button"
                onClick={() => onChange({ node_id: undefined })}
                className="ml-auto text-muted-on-light hover:text-danger"
                aria-label="Desligar objeto"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <ObjectPicker
              autoFocus={false}
              onPick={(node) => {
                // auto-fia o 1º campo variable-ref ao dado resolvido do nó
                const nextProps = refKey ? { ...props, [refKey]: 'doc_data' } : props;
                onChange({ node_id: node.id, props: nextProps });
              }}
            />
          )}
        </div>
      )}

      {/* Configurar (config_schema) */}
      {schema && schema.length > 0 && (
        <div className="border border-border-light p-2.5 space-y-2" data-testid="widget-section-config">
          <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
            Configurar
          </p>
          {schema
            // o campo variable-ref é auto-fiado pelo bind acima; não expõe input cru
            .filter((f) => f.field !== 'variable-ref' && f.field !== 'variable-path')
            .map((f) => (
              <PropFieldEditor
                key={f.name}
                field={f}
                value={props[f.name]}
                appVariables={docAppVariables}
                siblingConfig={props}
                onOpenVariablesPanel={() => {}}
                onChange={(v) => onChange({ props: { ...props, [f.name]: v } })}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function defaultProps(type: string): Record<string, unknown> {
  return { ...((getWidgetMeta(type)?.mockConfig as Record<string, unknown>) ?? {}) };
}

/** Palette agrupada do catálogo pleno. */
function WidgetPalette({ onPick }: { onPick: (type: string) => void }) {
  const [q, setQ] = React.useState('');
  const widgets = React.useMemo(() => documentWidgets(), []);
  const filtered = widgets.filter(
    (w) => !q.trim() || w.label.toLowerCase().includes(q.toLowerCase()) || w.type.includes(q.toLowerCase()),
  );
  const groups = React.useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const w of filtered) {
      const arr = m.get(w.group) || [];
      arr.push(w);
      m.set(w.group, arr);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="border border-border-light bg-canvas-light p-2.5 space-y-2" data-testid="widget-palette">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar widget (texto, gráfico, tabela, mapa…)"
        data-testid="widget-palette-search"
        className="w-full h-7 px-2 text-[11px] text-text-on-light bg-white border border-border-light outline-none focus:border-primary"
      />
      <div className="max-h-80 overflow-y-auto scrollbar-hide space-y-3">
        {groups.map(([group, ws]) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1.5">
              {GROUP_LABEL[group] || group}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {ws.map((w) => {
                const Icon = iconByName(w.icon);
                return (
                  <button
                    key={w.type}
                    type="button"
                    onClick={() => onPick(w.type)}
                    data-testid={`widget-palette-${w.type}`}
                    title={w.label}
                    className="border border-border-light bg-white hover:border-primary px-2 py-2 flex items-center gap-2 text-left"
                  >
                    <Icon className="w-4 h-4 text-muted-on-light shrink-0" strokeWidth={1.5} />
                    <span className="text-[11px] font-medium text-text-on-light truncate">
                      {w.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-on-light italic">Nenhum widget encontrado.</p>
        )}
      </div>
    </div>
  );
}
