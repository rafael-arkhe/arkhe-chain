'use client';

/**
 * Relatórios (Notepad) — documentos GOVERNADOS, persistidos no backend
 * NotepadDoc (/platform/v23/notepad): tenant + classificação (nível CBAC +
 * marcações) + versão + pinned.
 *
 * P5 Onda 4 (2026-06-27):
 *   - banner de classificação SEMPRE no topo (migrado p/ PageShell);
 *   - nível CBAC (dropdown fechado) + marcações (multi-select de catálogo,
 *     nunca texto livre) ENVIADOS no create/update (conjuntivos);
 *   - "compilar a partir de um nó": embutir widgets genéricos do objeto
 *     (object_table/vizinhos/correlacao/mapa/timeline) — reflexo da ontologia,
 *     com LineageEvent (Notepad.embed).
 *
 * Domínio-neutro. 2-pane: documentos (esq) · editor/preview (centro).
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  Plus,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Pin,
  Eye,
  Pencil,
  Share2,
  FileDown,
  Lock,
  Maximize2,
} from 'lucide-react';

import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { useCan } from '@/lib/auth/useAuth';
import { DocumentList } from '@/components/relatorios/document-list';
import { Notepad, type NotepadDoc, type NotepadSection } from '@/lib/api';
import { confirmModal, promptModal } from '@/components/dialog/confirm-dialog';
import { MarkingsSelect } from '@/components/ui/markings-select';
import { SelectField } from '@/components/buscar/select-field';
import { useT, useI18n } from '@/lib/i18n/provider';
import {
  CLASSIFICATION_LABEL,
  type ClassificationLevel,
} from '@/lib/classification';
import {
  ReportNodeEmbed,
  type EmbedWidget,
} from '@/components/relatorios/node-embed';
import {
  SectionComposer,
  SectionsPreview,
} from '@/components/relatorios/section-composer';

const LEVELS: ClassificationLevel[] = ['publico', 'restrito', 'confidencial', 'sigiloso'];
const DEFAULT_LEVEL: ClassificationLevel = 'restrito';

/** Linha de diretiva de embed dentro do markdown: `:::embed node=<id> widget=<kind>`. */
const EMBED_RE = /^:::embed\s+node=(\S+)\s+widget=(\S+)\s*$/;

/** Contexto da geração narrativa: as OUTRAS seções (markdown + objetos +
 *  narrativas já geradas) viram itens de contexto — a "materialização" do que o
 *  documento reúne, narrada pela IA. */
function sectionsAsContext(secs: NotepadSection[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const s of secs) {
    const heading = String(s.heading || '');
    if (s.kind === 'markdown' && s.body) {
      out.push({ id: String(s.id || 'md'), kind: 'markdown', label: heading, body: String(s.body).slice(0, 1200) });
    } else if (s.kind === 'embed' && s.node_id) {
      out.push({ id: String(s.node_id), kind: 'objeto', label: heading, body: `objeto ${s.node_id} (widget ${s.widget || 'object_table'})` });
    } else if (s.kind === 'narrative' && s.generated?.body) {
      out.push({ id: String(s.id || 'n'), kind: 'narrativa', label: heading, body: String(s.generated.body).slice(0, 800) });
    }
  }
  return out;
}

export default function RelatoriosPage() {
  return (
    <RequirePerm perm="security.relatorios.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const t = useT();
  const { locale } = useI18n();
  const canEdit = useCan('security.relatorios.edit');
  const router = useRouter();
  const searchParams = useSearchParams();
  const docParam = searchParams.get('doc');
  const [list, setList] = React.useState<NotepadDoc[]>([]);
  const [sel, setSel] = React.useState<NotepadDoc | null>(null);
  const [title, setTitle] = React.useState('');
  const [sections, setSections] = React.useState<NotepadSection[]>([]);
  const [level, setLevel] = React.useState<ClassificationLevel>(DEFAULT_LEVEL);
  const [markings, setMarkings] = React.useState<string[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [generatingId, setGeneratingId] = React.useState<string | null>(null);
  const [embedWidget, setEmbedWidget] = React.useState<EmbedWidget>('object_table');
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const reload = React.useCallback(() => {
    Notepad.list().then(setList).catch(() => setList([]));
  }, []);
  React.useEffect(() => {
    reload();
  }, [reload]);

  // Atalho cruzado: ?doc=<id> (vindo do "Editar em Relatórios" da /briefings)
  // abre o documento — a mesma seleção viaja entre as 2 vistas (redigir/apresentar).
  React.useEffect(() => {
    if (docParam && list.length) {
      const found = list.find((d) => d.id === docParam);
      if (found && sel?.id !== found.id) open(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, list]);

  function open(d: NotepadDoc) {
    setSel(d);
    setTitle(d.title);
    // Migra body_md legado para uma seção markdown quando o doc ainda não tem
    // seções — nada se perde, o operador segue no compositor.
    const secs: NotepadSection[] =
      d.sections && d.sections.length
        ? d.sections
        : d.body_md
          ? [{ id: 'legacy-md', kind: 'markdown', heading: '', body: d.body_md }]
          : [];
    setSections(secs);
    setLevel((d.classification_level as ClassificationLevel) || DEFAULT_LEVEL);
    setMarkings(d.markings || []);
    setDirty(false);
    setPreview(false);
    setGeneratingId(null);
    setMsg(null);
  }

  async function create() {
    const name = await promptModal({ title: t('relatorios.newTitle'), confirmLabel: t('common.create') });
    if (!name) return;
    const slug =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || `rel-${Date.now()}`;
    setBusy(true);
    setMsg(null);
    try {
      const d = await Notepad.create({ slug, title: name, body_md: '', classification_level: DEFAULT_LEVEL, markings: [] });
      reload();
      open(d);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('relatorios.createFail') });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!sel) return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await Notepad.update(sel.id, { title, sections, classification_level: level, markings });
      setSel(d);
      setSections(d.sections || sections);
      setDirty(false);
      setMsg({ ok: true, text: `${t('relatorios.savedPrefix')} (v${d.version}).` });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('relatorios.saveFail') });
    } finally {
      setBusy(false);
    }
  }

  async function togglePin() {
    if (!sel) return;
    try {
      const d = await Notepad.update(sel.id, { pinned: !sel.pinned });
      setSel(d);
      reload();
    } catch {
      /* silencioso */
    }
  }

  async function remove() {
    if (!sel || !(await confirmModal({ title: t('relatorios.removeConfirm'), tone: 'danger', confirmLabel: t('common.delete') }))) return;
    try {
      await Notepad.remove(sel.id);
      setSel(null);
      setTitle('');
      setSections([]);
      setMsg({ ok: true, text: t('relatorios.removed') });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t('relatorios.fail') });
    }
  }

  // T3-C — gera UMA seção narrativa via AIP (auditado). O backend usa as seções
  // ENVIADAS (data_summary/embeds viram contexto), persiste e bumpa versão.
  async function generateSection(sectionId: string) {
    if (!sel) return;
    setGeneratingId(sectionId);
    setMsg(null);
    try {
      const d = await Notepad.generate(sel.id, {
        sections,
        only_section_ids: [sectionId],
        context_items: sectionsAsContext(sections),
      });
      setSel(d);
      setSections(d.sections || sections);
      setDirty(false);
      setMsg({ ok: true, text: 'Seção gerada (IA · auditada).' });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha na geração.' });
    } finally {
      setGeneratingId(null);
    }
  }

  function downloadPdf() {
    if (!sel) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    window.open(Notepad.pdfUrl(sel.id, { tz, locale }), '_blank');
  }

  async function sealDoc() {
    if (!sel) return;
    if (
      dirty &&
      !(await confirmModal({
        title: 'Alterações não salvas',
        description: 'Selar usa a versão salva. Salve primeiro e tente de novo.',
        confirmLabel: 'Entendi',
        tone: 'warning',
      }))
    )
      return;
    if (
      !(await confirmModal({
        title: 'Selar documento',
        description: 'Assina digitalmente o documento. Qualquer edição posterior invalida o selo.',
        confirmLabel: 'Selar',
        tone: 'warning',
      }))
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const d = await Notepad.sign(sel.id);
      setSel(d);
      setSections(d.sections || sections);
      setMsg({ ok: true, text: `Selado (v${d.version}).` });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Falha ao selar.' });
    } finally {
      setBusy(false);
    }
  }

  async function transmit() {
    if (!sel) return;
    setBusy(true);
    try {
      const res = await Notepad.transmit(sel.id, { link_base: window.location.origin });
      try {
        await navigator.clipboard.writeText(res.link);
      } catch {
        /* clipboard pode falhar sem gesto/https — o link aparece no modal */
      }
      setMsg({ ok: true, text: 'Link de transmissão copiado.' });
      await confirmModal({
        title: 'Link de transmissão criado',
        description: (
          <div className="space-y-2">
            <p className="text-[12px]">
              Link público read-only (expira em{' '}
              {new Date(res.expires_at).toLocaleDateString('pt-BR')}). Já copiado para a área de
              transferência.
            </p>
            <code className="block text-[11px] break-all bg-raised-light p-2 border border-border-light">
              {res.link}
            </code>
          </div>
        ),
        confirmLabel: 'Fechar',
      });
    } catch {
      setMsg({ ok: false, text: 'Falha ao transmitir.' });
    } finally {
      setBusy(false);
    }
  }

  const toolbar = sel ? (
    <>
      <button
        type="button"
        onClick={() => setPreview((v) => !v)}
        data-testid="rel-preview-toggle"
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        {preview ? (
          <>
            <Pencil className="w-3 h-3" /> {t('relatorios.edit')}
          </>
        ) : (
          <>
            <Eye className="w-3 h-3" /> {t('relatorios.view')}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={downloadPdf}
        data-testid="rel-pdf"
        title="Baixar PDF (classificação + selo)"
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <FileDown className="w-3 h-3" /> PDF
      </button>
      <button
        type="button"
        onClick={() => router.push(`/briefings?doc=${encodeURIComponent(sel.id)}`)}
        data-testid="rel-present-link"
        title="Apresentar este documento em Briefings (somente leitura)"
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <Maximize2 className="w-3 h-3" /> Apresentar
      </button>
      <RequirePerm perm="security.relatorios.edit" fallback={null}>
        <button
          type="button"
          onClick={togglePin}
          aria-label={t('relatorios.pin')}
          data-testid="rel-pin"
          className={
            'h-7 w-7 flex items-center justify-center border ' +
            (sel.pinned
              ? 'border-primary text-primary bg-primary/5'
              : 'border-border-light bg-white hover:border-primary')
          }
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          data-testid="rel-save"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1.5"
        >
          <Save className="w-3 h-3" /> {t('common.save')}
        </button>
        <button
          type="button"
          onClick={remove}
          aria-label={t('common.delete')}
          data-testid="rel-delete"
          className="h-7 w-7 flex items-center justify-center border border-border-light bg-white text-muted-on-light hover:text-danger hover:border-danger"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </RequirePerm>
      <RequirePerm perm="security.relatorios.close" fallback={null}>
        <button
          type="button"
          onClick={sealDoc}
          disabled={busy}
          data-testid="rel-seal"
          title={sel?.signed ? 'Documento selado' : 'Selar (assinar) o documento'}
          className={
            'h-7 px-2.5 text-[11px] border flex items-center gap-1.5 ' +
            (sel?.signed
              ? 'border-success text-success bg-success/5'
              : 'bg-white border-border-light hover:border-primary')
          }
        >
          <Lock className="w-3 h-3" /> {sel?.signed ? 'Selado' : 'Selar'}
        </button>
      </RequirePerm>
      <RequirePerm perm="security.briefings.broadcast" fallback={null}>
        <button
          type="button"
          onClick={transmit}
          disabled={busy}
          data-testid="rel-transmit"
          title="Gerar link público read-only deste documento"
          className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1.5"
        >
          <Share2 className="w-3 h-3" /> Transmitir
        </button>
      </RequirePerm>
      {msg && (
        <span
          className={'flex items-center gap-1.5 text-[11px] ' + (msg.ok ? 'text-success' : 'text-danger')}
          role="status"
          data-testid="rel-msg"
        >
          {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {msg.text}
        </span>
      )}
    </>
  ) : null;

  return (
    <PageShell
      title={
        <>
          <FileText className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <span>{t('relatorios.title')}</span>
        </>
      }
      subtitle={t('relatorios.subtitle')}
      classification={level}
      classificationLabel={t('relatorios.title').toUpperCase()}
      theme="light"
      toolbar={toolbar}
    >
      <div className="h-full flex min-h-0">
        <DocumentList
          docs={list}
          selectedId={sel?.id}
          onSelect={open}
          onCreate={canEdit ? create : undefined}
          label={t('relatorios.docs')}
          prefix="rel"
        />

        <main className="flex-1 overflow-y-auto scrollbar-hide min-w-0">
          {!sel ? (
            <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">
              {t('relatorios.selectOrCreate')}
            </div>
          ) : preview ? (
            <article className="max-w-3xl mx-auto p-6" data-testid="rel-preview">
              <ClassificationStrip level={level} markings={markings} />
              <h1 className="text-[20px] font-bold text-text-on-light mb-4">{title}</h1>
              {sel.signed && (
                <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] text-success" data-testid="rel-sealed">
                  <Lock className="w-3.5 h-3.5" strokeWidth={1.5} /> Selado · v{sel.version}
                </p>
              )}
              <SectionsPreview
                sections={sections}
                renderMarkdown={(md) => <SimpleMd content={md} />}
                docId={sel?.id}
              />
            </article>
          ) : (
            <div className="max-w-3xl mx-auto p-6 space-y-3" data-testid="rel-editor">
              {/* Metadados de governança — nível CBAC (dropdown fechado) +
                  marcações (catálogo). Conjuntivos. */}
              <RequirePerm perm="security.relatorios.edit" fallback={null}>
                <div className="border border-border-light bg-canvas-light p-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-on-light w-24 shrink-0">
                      {t('relatorios.classification')}
                    </label>
                    <div className="w-52">
                      <SelectField
                        name="rel-level"
                        testId="rel-level"
                        value={level}
                        clearable={false}
                        options={LEVELS.map((lv) => ({ value: lv, label: CLASSIFICATION_LABEL[lv] }))}
                        onChange={(v) => {
                          if (!v) return;
                          setLevel(v as ClassificationLevel);
                          setDirty(true);
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-on-light w-24 shrink-0 pt-1">
                      {t('relatorios.markings')}
                    </label>
                    <MarkingsSelect
                      value={markings}
                      testid="rel-markings"
                      onChange={(slugs) => {
                        setMarkings(slugs);
                        setDirty(true);
                      }}
                    />
                  </div>
                </div>
              </RequirePerm>

              <input
                type="text"
                value={title}
                data-testid="rel-title"
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                className="w-full text-[18px] font-semibold text-text-on-light bg-transparent outline-none border-b border-transparent focus:border-border-light pb-1"
                placeholder={t('relatorios.titlePlaceholder')}
              />

              {/* Compositor de SEÇÕES (T3-C): narrativa IA · texto · objeto. */}
              <RequirePerm
                perm="security.relatorios.edit"
                fallback={
                  <SectionsPreview
                    sections={sections}
                    renderMarkdown={(md) => <SimpleMd content={md} />}
                    docId={sel?.id}
                  />
                }
              >
                <SectionComposer
                  sections={sections}
                  onChange={(next) => {
                    setSections(next);
                    setDirty(true);
                  }}
                  onGenerate={generateSection}
                  generatingId={generatingId}
                  embedWidget={embedWidget}
                  onEmbedWidget={setEmbedWidget}
                  docId={sel?.id}
                />
              </RequirePerm>
            </div>
          )}
        </main>
      </div>
    </PageShell>
  );
}

/** Faixa read-only de classificação no preview (nível + marcações). */
function ClassificationStrip({ level, markings }: { level: ClassificationLevel; markings: string[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5" data-testid="rel-preview-cls">
      <span className="inline-flex items-center h-5 px-2 text-[10px] font-semibold tracking-wider border border-border-light bg-canvas-light text-text-on-light">
        {CLASSIFICATION_LABEL[level]}
      </span>
      {markings.map((m) => (
        <span
          key={m}
          className="inline-flex items-center h-5 px-2 text-[10px] border border-border-light text-muted-on-light"
        >
          {m}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Render markdown minimal sem dependência externa (convenção do codebase —    */
/* aip-chat/MessageView): títulos #/##/###, **negrito**, `code`, listas e §.   */
/* Onda 4: diretivas `:::embed node=<id> widget=<kind>` viram widget genérico.  */
function SimpleMd({ content }: { content: string }) {
  const t = useT();
  if (!content.trim()) return <p className="text-[12px] text-muted-on-light italic">{t('relatorios.emptyDoc')}</p>;
  const lines = content.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (key: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 my-2 text-[12px] text-text-on-light space-y-0.5">
          {list.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const em = line.match(EMBED_RE);
    if (em) {
      flush(i);
      out.push(<ReportNodeEmbed key={i} nodeId={em[1]} widget={em[2]} />);
    } else if (/^###\s+/.test(line)) {
      flush(i);
      out.push(
        <h4 key={i} className="text-[13px] font-semibold text-text-on-light mt-3 mb-1">
          {inline(line.replace(/^###\s+/, ''))}
        </h4>,
      );
    } else if (/^##\s+/.test(line)) {
      flush(i);
      out.push(
        <h3 key={i} className="text-[15px] font-semibold text-text-on-light mt-4 mb-1">
          {inline(line.replace(/^##\s+/, ''))}
        </h3>,
      );
    } else if (/^#\s+/.test(line)) {
      flush(i);
      out.push(
        <h2 key={i} className="text-[17px] font-bold text-text-on-light mt-4 mb-2">
          {inline(line.replace(/^#\s+/, ''))}
        </h2>,
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flush(i);
    } else {
      flush(i);
      out.push(
        <p key={i} className="text-[12px] text-text-on-light leading-relaxed my-1.5">
          {inline(line)}
        </p>,
      );
    }
  });
  flush(lines.length);
  return <>{out}</>;
}

function inline(text: string): React.ReactNode[] {
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  return text.split(re).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`'))
      return (
        <code key={i} className="px-1 bg-canvas-light border border-border-light text-[11px] font-mono">
          {p.slice(1, -1)}
        </code>
      );
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
