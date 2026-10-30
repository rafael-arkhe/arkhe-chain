'use client';

/**
 * Ontology Manager — editor de Object Types / Link Types (Onda 16 UI).
 *
 * Fecha o gap #1 do backlog: a ontologia deixa de nascer SÓ via AIP/seed — o
 * operador DESENHA o contrato à mão. 3-pane: lista de tipos · editor (display
 * name + tabela de properties tipadas com Title + modo enforce) · links
 * declarados (com cardinalidade). Escreve pela Write API governada da Onda 16
 * (signed_hash + LineageEvent); lê o contrato via objectTypeSchema (Onda 4).
 *
 * Tipos de property = escalares + ricos da Onda 8 (sem texto técnico livre, o
 * type vem de dropdown). Estética sharp (sem rounded).
 */
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Save, Trash2, Loader2, AlertCircle, CheckCircle2, Link2 } from 'lucide-react';

import { RequirePerm } from '@/components/auth/require-perm';
import { OntologiaTabs } from '@/components/ontologia/ontologia-tabs';
import {
  Ontology,
  type OntologyNodeType,
  type ObjectTypePropertyInput,
  type LinkTypeWriteBody,
} from '@/lib/api';
import { confirmModal } from '@/components/dialog/confirm-dialog';

const INP = 'w-full h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary';
// Universo de tipos de property (espelha _allowed_property_types do backend:
// escalares + ricos canônicos da Onda 8). type vem de dropdown, nunca texto livre.
const PROP_TYPES = ['text', 'number', 'boolean', 'date', 'geopoint', 'geoshape', 'timeseries', 'vector', 'struct', 'array'] as const;
const CARDINALITIES = [
  ['one_to_one', '1:1'],
  ['one_to_many', '1:N'],
  ['many_to_many', 'N:N'],
] as const;

type PropRow = ObjectTypePropertyInput & { _id: string };
type Draft = {
  kind: string;
  display_name: string;
  title_property: string;
  enforce: 'lenient' | 'strict';
  properties: PropRow[];
  isNew: boolean;
};

export default function TiposEditorPage() {
  // A barra de abas do explorador fica ACIMA do gate de permissão: mesmo quem
  // não pode editar (sem ontology.types.write) continua vendo o explorador e
  // navega de volta p/ Tipos/Instâncias/Grafo/Vizinhança — nunca fica preso só
  // com o sidenav (régua de clareza: não encurralar o operador).
  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      <OntologiaTabs />
      <div className="flex-1 min-h-0 flex flex-col">
        <RequirePerm perm="ontology.types.write">
          <Inner />
        </RequirePerm>
      </div>
    </div>
  );
}

function _rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function emptyDraft(): Draft {
  return { kind: '', display_name: '', title_property: '', enforce: 'lenient', properties: [], isNew: true };
}

function Inner() {
  const [types, setTypes] = React.useState<OntologyNodeType[]>([]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [links, setLinks] = React.useState<{ relation: string; target_kind: string; cardinality: string; direction: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [newLink, setNewLink] = React.useState({ target_kind: '', relation: '', cardinality: 'many_to_many' });

  const reload = React.useCallback(() => {
    Ontology.listNodeTypes().then(setTypes).catch(() => {});
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  // Deep-link ?kind= — atalho "Editar tipo" dos inspetores de Tipo/Instância
  // abre o tipo direto, sem o operador recaçá-lo na lista. Sem ?kind=, o
  // comportamento padrão (lista fria) permanece.
  const params = useSearchParams();
  const kindFromUrl = params?.get('kind') ?? '';
  React.useEffect(() => {
    if (kindFromUrl && types.length > 0 && (!draft || draft.kind !== kindFromUrl)) {
      void openType(kindFromUrl);
    }
    // openType é estável (definida no corpo); só re-dispara ao mudar a URL/lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFromUrl, types]);

  async function openType(kind: string) {
    setMsg(null);
    try {
      const s = await Ontology.objectTypeSchema(kind);
      setDraft({
        kind,
        display_name: s.display_name || kind,
        title_property: s.title_property || '',
        enforce: ((s as unknown as { enforce?: string }).enforce as 'lenient' | 'strict') || 'lenient',
        properties: (s.properties || []).map((p) => ({ _id: _rid(), key: p.key, type: p.type, label: p.label, is_title: p.is_title })),
        isNew: false,
      });
      setLinks((s.links || []).map((l) => ({ relation: l.relation, target_kind: l.target_kind, cardinality: l.cardinality, direction: l.direction })));
    } catch {
      // tipo legado sem contrato — abre vazio editável
      setDraft({ ...emptyDraft(), kind, display_name: kind, isNew: false });
      setLinks([]);
    }
  }

  function newType() {
    setDraft(emptyDraft());
    setLinks([]);
    setMsg(null);
  }

  function setD(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }
  function addProp() {
    setD({ properties: [...(draft?.properties || []), { _id: _rid(), key: '', type: 'text', label: '' }] });
  }
  function patchProp(id: string, patch: Partial<PropRow>) {
    setD({ properties: (draft?.properties || []).map((p) => (p._id === id ? { ...p, ...patch } : p)) });
  }
  function removeProp(id: string) {
    setD({ properties: (draft?.properties || []).filter((p) => p._id !== id) });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setMsg(null);
    const body = {
      kind: draft.kind.trim(),
      display_name: draft.display_name.trim() || undefined,
      title_property: draft.title_property,
      enforce: draft.enforce,
      properties: draft.properties.map((p) => ({
        key: p.key, type: p.type, label: p.label || undefined, is_title: p.key === draft.title_property,
      })),
    };
    try {
      if (draft.isNew) await Ontology.createObjectType(body);
      else await Ontology.updateObjectType(draft.kind, body);
      setMsg({ ok: true, text: `Object Type '${draft.kind}' salvo.` });
      setDraft({ ...draft, isNew: false });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha ao salvar.' });
    } finally { setBusy(false); }
  }

  async function removeType() {
    if (!draft || draft.isNew) return;
    if (!(await confirmModal({ title: `Remover o Object Type '${draft.kind}'?`, description: 'Só é possível se não houver instâncias.', tone: 'danger', confirmLabel: 'Remover' }))) return;
    setBusy(true); setMsg(null);
    try {
      await Ontology.deleteObjectType(draft.kind);
      setMsg({ ok: true, text: `'${draft.kind}' removido.` });
      setDraft(null); reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha ao remover (tem instâncias?).' });
    } finally { setBusy(false); }
  }

  async function declareLink() {
    if (!draft || draft.isNew) { setMsg({ ok: false, text: 'Salve o tipo antes de declarar links.' }); return; }
    if (!newLink.target_kind || !newLink.relation.trim()) { setMsg({ ok: false, text: 'Escolha alvo + relação.' }); return; }
    setBusy(true);
    const b: LinkTypeWriteBody = {
      source_kind: draft.kind, target_kind: newLink.target_kind,
      relation: newLink.relation.trim(), cardinality: newLink.cardinality as LinkTypeWriteBody['cardinality'],
    };
    try {
      await Ontology.declareLinkType(b);
      setMsg({ ok: true, text: `Link '${b.relation}' declarado.` });
      setNewLink({ target_kind: '', relation: '', cardinality: 'many_to_many' });
      openType(draft.kind);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha ao declarar link.' });
    } finally { setBusy(false); }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="h-12 px-4 border-b border-border-light flex items-center gap-3 shrink-0">
        <h1 className="text-[13px] font-semibold text-text-on-light">Editar ontologia</h1>
        <span className="text-[11px] text-muted-on-light">Desenhe os tipos de objeto e suas relações à mão (governado + assinado).</span>
        {msg && (
          <span className={'ml-auto flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')}
            role="status" data-testid="otm-msg">
            {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{msg.text}
          </span>
        )}
      </header>
      <div className="flex-1 flex min-h-0">
        {/* Esquerda: lista de tipos */}
        <aside className="w-56 border-r border-border-light flex flex-col shrink-0">
          <div className="h-9 px-3 border-b border-border-light flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-on-light">Object Types</span>
            <button type="button" onClick={newType} data-testid="otm-new" aria-label="Novo tipo" className="text-muted-on-light hover:text-primary">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="flex-1 overflow-y-auto scrollbar-hide">
            {types.map((t) => (
              <li key={t.name}>
                <button type="button" onClick={() => openType(t.name)} data-testid={`otm-type-${t.name}`}
                  className={'w-full text-left px-3 py-2 text-[11px] border-b border-border-light/60 ' +
                    (draft && !draft.isNew && draft.kind === t.name ? 'bg-primary/5 text-primary' : 'hover:bg-canvas-light')}>
                  <span className="block truncate font-medium">{t.label}</span>
                  <span className="text-[9px] font-mono text-muted-on-light">{t.name} · {t.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Centro: editor */}
        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 min-w-0">
          {!draft ? (
            <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">
              Selecione um tipo ou crie um novo.
            </div>
          ) : (
            <div className="max-w-2xl space-y-4" data-testid="otm-editor">
              <div className="flex items-center gap-2">
                <h2 className="text-[12px] font-semibold flex-1">{draft.isNew ? 'Novo Object Type' : `Editar · ${draft.kind}`}</h2>
                {!draft.isNew && (
                  <button type="button" onClick={removeType} data-testid="otm-delete" className="h-7 px-2 text-[11px] text-muted-on-light hover:text-danger border border-border-light flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </button>
                )}
                <button type="button" onClick={save} disabled={busy} data-testid="otm-save"
                  className="h-7 px-3 text-[11px] bg-primary text-white flex items-center gap-1.5 disabled:opacity-50">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Identificador (kind)">
                  <input type="text" value={draft.kind} disabled={!draft.isNew} data-testid="otm-kind"
                    placeholder="ex.: subestacao" onChange={(e) => setD({ kind: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                    className={INP + (draft.isNew ? '' : ' opacity-60')} />
                </Field>
                <Field label="Nome de exibição">
                  <input type="text" value={draft.display_name} data-testid="otm-display"
                    onChange={(e) => setD({ display_name: e.target.value })} className={INP} />
                </Field>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">Propriedades</span>
                  <button type="button" onClick={addProp} data-testid="otm-add-prop" className="text-[10px] text-primary hover:underline">+ propriedade</button>
                </div>
                <table className="w-full text-[11px] border border-border-light">
                  <thead>
                    <tr className="bg-raised-light/40 text-[9px] uppercase tracking-wider text-muted-on-light">
                      <th className="text-left px-2 h-6 font-semibold">Chave</th>
                      <th className="text-left px-2 font-semibold">Tipo</th>
                      <th className="text-left px-2 font-semibold">Rótulo</th>
                      <th className="text-center px-2 font-semibold">Título</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.properties.length === 0 && (
                      <tr><td colSpan={5} className="px-2 py-2 text-muted-on-light italic">Sem propriedades. Adicione ao menos uma.</td></tr>
                    )}
                    {draft.properties.map((p) => (
                      <tr key={p._id} className="border-t border-border-light/60" data-testid={`otm-prop-${p._id}`}>
                        <td className="px-1 py-1">
                          <input type="text" value={p.key} data-testid="otm-prop-key" placeholder="chave"
                            onChange={(e) => patchProp(p._id, { key: e.target.value })} className={INP + ' font-mono'} />
                        </td>
                        <td className="px-1">
                          <select value={p.type} data-testid="otm-prop-type" onChange={(e) => patchProp(p._id, { type: e.target.value })} className={INP}>
                            {PROP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-1"><input type="text" value={p.label || ''} onChange={(e) => patchProp(p._id, { label: e.target.value })} className={INP} /></td>
                        <td className="text-center">
                          <input type="radio" name="title_prop" data-testid="otm-prop-title" checked={draft.title_property === p.key && !!p.key}
                            onChange={() => setD({ title_property: p.key })} disabled={!p.key} />
                        </td>
                        <td className="text-center">
                          <button type="button" onClick={() => removeProp(p._id)} aria-label="Remover propriedade" className="text-muted-on-light hover:text-danger">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-muted-on-light">A propriedade marcada como Título rotula a instância (obrigatória).</p>
              </div>

              <Field label="Validação de escrita (enforce)">
                <select value={draft.enforce} data-testid="otm-enforce" onChange={(e) => setD({ enforce: e.target.value as 'lenient' | 'strict' })} className={INP + ' max-w-xs'}>
                  <option value="lenient">Lenient — coage best-effort (default)</option>
                  <option value="strict">Strict — rejeita escrita type-inválida (422)</option>
                </select>
              </Field>

              {/* Links */}
              {!draft.isNew && (
                <div className="border-t border-border-light pt-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> Link Types
                  </span>
                  <ul className="mt-1 space-y-1">
                    {links.length === 0 && <li className="text-[11px] text-muted-on-light italic">Nenhum link declarado.</li>}
                    {links.map((l, i) => (
                      <li key={i} data-testid={`otm-link-${l.relation}`} className="text-[11px] flex items-center gap-2 border-b border-border-light/40 py-1">
                        <span className="font-mono">{l.relation}</span>
                        <span className="text-muted-on-light">→ {l.target_kind}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1 bg-primary/10 text-primary border border-primary/30">
                          {CARDINALITIES.find((c) => c[0] === l.cardinality)?.[1] || l.cardinality}
                        </span>
                        <span className="text-[9px] text-muted-on-light">{l.direction}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-end gap-2">
                    <div className="flex-1"><Field label="Tipo alvo">
                      <select value={newLink.target_kind} data-testid="otm-link-target" onChange={(e) => setNewLink({ ...newLink, target_kind: e.target.value })} className={INP}>
                        <option value="">— escolher —</option>
                        {types.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}
                      </select>
                    </Field></div>
                    <div className="flex-1"><Field label="Relação"><input type="text" value={newLink.relation} data-testid="otm-link-relation"
                      placeholder="ex.: alimenta" onChange={(e) => setNewLink({ ...newLink, relation: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} className={INP + ' font-mono'} /></Field></div>
                    <div><Field label="Cardinalidade">
                      <select value={newLink.cardinality} data-testid="otm-link-card" onChange={(e) => setNewLink({ ...newLink, cardinality: e.target.value })} className={INP}>
                        {CARDINALITIES.map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}
                      </select>
                    </Field></div>
                    <button type="button" onClick={declareLink} disabled={busy} data-testid="otm-link-declare"
                      className="h-7 px-3 text-[11px] border border-border-light bg-white hover:border-primary disabled:opacity-50">Declarar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-on-light font-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}
