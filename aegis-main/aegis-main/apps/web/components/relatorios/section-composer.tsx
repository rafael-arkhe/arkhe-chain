'use client';

/**
 * SectionComposer (T3-C) — compositor de SEÇÕES de um Document.
 *
 * Seções ordenadas que materializam ontologia + AIP:
 *   - markdown  : texto manual (render via o SimpleMd da página).
 *   - narrative : prompt + "Gerar" (AIP auditado) → corpo gerado + citações.
 *   - embed     : nó da ontologia + widget genérico (ReportNodeEmbed ao vivo).
 *
 * Domínio-neutro. Sem input técnico manual: node_id vem do ObjectPicker, widget
 * do catálogo fechado. O motor de geração vive no backend (Notepad.generate).
 */
import * as React from 'react';
import {
  AudioLines,
  Boxes,
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutGrid,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';

import type { NotepadSection } from '@/lib/api';
import { ObjectPicker } from '@/components/ontology/object-picker';
import {
  ReportNodeEmbed,
  EMBED_WIDGETS,
  type EmbedWidget,
} from '@/components/relatorios/node-embed';
import {
  WidgetSectionEditor,
  WidgetSectionView,
} from '@/components/relatorios/widget-section';

// 'widget' = qualquer widget do catálogo pleno (T3-E). 'embed' = legado (T3-C,
// 5 widgets do ReportNodeEmbed) — não oferecido em novas seções, só renderizado.
type Kind = 'narrative' | 'markdown' | 'widget' | 'embed';

const KIND_META: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  narrative: { label: 'Narrativa (IA)', icon: AudioLines },
  markdown: { label: 'Texto', icon: Type },
  widget: { label: 'Widget', icon: LayoutGrid },
  embed: { label: 'Objeto (legado)', icon: Boxes },
};

/** Tipos oferecidos no botão "Adicionar" (embed legado fica de fora). */
const ADD_KINDS: Kind[] = ['narrative', 'markdown', 'widget'];

function newId(): string {
  try {
    return `s-${crypto.randomUUID()}`;
  } catch {
    return `s-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

export function SectionComposer({
  sections,
  onChange,
  onGenerate,
  generatingId,
  embedWidget,
  onEmbedWidget,
  docId,
}: {
  sections: NotepadSection[];
  onChange: (next: NotepadSection[]) => void;
  /** Gera a seção narrativa (chama Notepad.generate no backend). */
  onGenerate: (sectionId: string) => void;
  generatingId: string | null;
  embedWidget: EmbedWidget;
  onEmbedWidget: (w: EmbedWidget) => void;
  /** Id do documento — necessário p/ resolver object-sets ao vivo (T3-E2). */
  docId?: string;
}) {
  const [pickingFor, setPickingFor] = React.useState<string | null>(null);

  function patch(id: string, fields: Partial<NotepadSection>) {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...fields } : s)));
  }
  function add(kind: Kind) {
    const base: NotepadSection = { id: newId(), kind, heading: '' };
    if (kind === 'markdown') base.body = '';
    if (kind === 'narrative') base.prompt = '';
    if (kind === 'widget') base.widget = ''; // sem widget escolhido → mostra a palette
    onChange([...sections, base]);
  }
  function remove(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    const i = sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-3" data-testid="rel-composer">
      {sections.length === 0 && (
        <p className="text-[12px] text-muted-on-light italic px-1">
          Documento vazio. Adicione uma seção abaixo.
        </p>
      )}

      {sections.map((s, idx) => {
        const kind = (s.kind as Kind) || 'markdown';
        const Meta = KIND_META[kind] || KIND_META.markdown;
        const sid = String(s.id || '');
        const generating = generatingId === sid;
        return (
          <section
            key={sid || idx}
            data-testid={`rel-section-${idx}`}
            className="border border-border-light bg-canvas-light"
          >
            <header className="h-8 px-2.5 flex items-center gap-2 border-b border-border-light bg-panel-light">
              <Meta.icon className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
              <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {Meta.label}
              </span>
              <input
                type="text"
                value={String(s.heading || '')}
                onChange={(e) => patch(sid, { heading: e.target.value })}
                placeholder="Cabeçalho da seção"
                data-testid={`rel-section-heading-${idx}`}
                className="flex-1 h-6 px-2 text-[12px] font-semibold text-text-on-light bg-white border border-border-light outline-none focus:border-primary"
              />
              <button
                type="button"
                aria-label="Mover para cima"
                onClick={() => move(sid, -1)}
                disabled={idx === 0}
                className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary disabled:opacity-30"
              >
                <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                onClick={() => move(sid, 1)}
                disabled={idx === sections.length - 1}
                className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-primary disabled:opacity-30"
              >
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Remover seção"
                onClick={() => remove(sid)}
                data-testid={`rel-section-remove-${idx}`}
                className="h-6 w-6 flex items-center justify-center text-muted-on-light hover:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </header>

            <div className="p-2.5">
              {kind === 'markdown' && (
                <textarea
                  value={String(s.body || '')}
                  onChange={(e) => patch(sid, { body: e.target.value })}
                  placeholder="Texto em Markdown…"
                  data-testid={`rel-section-body-${idx}`}
                  className="w-full h-32 p-2 text-[12px] font-mono leading-relaxed bg-white border border-border-light outline-none focus:border-primary resize-y"
                  spellCheck
                />
              )}

              {kind === 'narrative' && (
                <div className="space-y-2">
                  <textarea
                    value={String(s.prompt || '')}
                    onChange={(e) => patch(sid, { prompt: e.target.value })}
                    placeholder="Instrução para a IA (ex.: resuma os antecedentes e vínculos do investigado)…"
                    data-testid={`rel-section-prompt-${idx}`}
                    className="w-full h-16 p-2 text-[12px] leading-relaxed bg-white border border-border-light outline-none focus:border-primary resize-y"
                  />
                  <button
                    type="button"
                    onClick={() => onGenerate(sid)}
                    disabled={generating}
                    data-testid={`rel-section-generate-${idx}`}
                    className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <AudioLines className={'w-3 h-3' + (generating ? ' animate-pulse' : '')} strokeWidth={1.5} />
                    {generating ? 'Gerando…' : 'Gerar com IA'}
                  </button>
                  {s.generated?.body ? (
                    <div className="border border-border-light bg-white p-2.5">
                      <p className="text-[12px] whitespace-pre-wrap leading-relaxed text-text-on-light">
                        {s.generated.body}
                      </p>
                      {(s.generated.citations?.length ?? 0) > 0 && (
                        <p className="text-[10px] text-muted-on-light mt-2">
                          Fontes: {(s.generated.citations || []).map((c) => `#${c}`).join(', ')}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-on-light italic">
                      Sem conteúdo gerado. Escreva a instrução e clique em “Gerar com IA”.
                    </p>
                  )}
                </div>
              )}

              {kind === 'widget' && (
                <WidgetSectionEditor
                  section={s}
                  onChange={(fields) => patch(sid, fields)}
                  docId={docId}
                />
              )}

              {kind === 'embed' && (
                <div className="space-y-2">
                  {s.node_id ? (
                    <ReportNodeEmbed
                      nodeId={String(s.node_id)}
                      widget={String(s.widget || 'object_table')}
                    />
                  ) : (
                    <p className="text-[11px] text-muted-on-light italic">Nenhum objeto escolhido.</p>
                  )}
                  {pickingFor === sid ? (
                    <div className="border border-border-light p-2.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] uppercase tracking-wider text-muted-on-light shrink-0">
                          Widget
                        </label>
                        <select
                          value={embedWidget}
                          onChange={(e) => onEmbedWidget(e.target.value as EmbedWidget)}
                          data-testid={`rel-section-widget-${idx}`}
                          className="h-7 px-2 text-[11px] text-text-on-light bg-white border border-border-light outline-none focus:border-primary"
                        >
                          {EMBED_WIDGETS.map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ObjectPicker
                        autoFocus={false}
                        onPick={(node) => {
                          patch(sid, { node_id: node.id, widget: embedWidget });
                          setPickingFor(null);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickingFor(sid)}
                      data-testid={`rel-section-pick-${idx}`}
                      className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                    >
                      <Boxes className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
                      {s.node_id ? 'Trocar objeto' : 'Escolher objeto'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* Adicionar seção */}
      <div className="flex items-center gap-1.5" data-testid="rel-add-section">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light mr-1">
          Adicionar
        </span>
        {ADD_KINDS.map((k) => {
          const M = KIND_META[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => add(k)}
              data-testid={`rel-add-${k}`}
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" strokeWidth={1.5} />
              <M.icon className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
              {M.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Render read-only das seções (preview + qualquer consumidor). */
export function SectionsPreview({
  sections,
  renderMarkdown,
  docId,
}: {
  sections: NotepadSection[];
  renderMarkdown: (md: string) => React.ReactNode;
  /** Id do documento — p/ resolver object-sets ao vivo nas seções de widget. */
  docId?: string;
}) {
  return (
    <div className="space-y-5" data-testid="rel-sections-preview">
      {sections.map((s, i) => {
        const kind = (s.kind as Kind) || 'markdown';
        const heading = String(s.heading || '');
        return (
          <section key={String(s.id || i)}>
            {heading && (
              <h2 className="text-[15px] font-semibold text-text-on-light mb-1.5 flex items-center gap-1.5">
                {kind === 'narrative' && <AudioLines className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />}
                {kind === 'widget' && <LayoutGrid className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />}
                {kind === 'embed' && <FileText className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />}
                {heading}
              </h2>
            )}
            {kind === 'markdown' && renderMarkdown(String(s.body || ''))}
            {kind === 'narrative' &&
              (s.generated?.body ? (
                <>
                  <p className="text-[12px] whitespace-pre-wrap leading-relaxed text-text-on-light">
                    {s.generated.body}
                  </p>
                  {(s.generated.citations?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-muted-on-light mt-1.5">
                      Fontes: {(s.generated.citations || []).map((c) => `#${c}`).join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-on-light italic">(seção sem conteúdo)</p>
              ))}
            {kind === 'widget' && <WidgetSectionView section={s} docId={docId} />}
            {kind === 'embed' &&
              (s.node_id ? (
                <ReportNodeEmbed nodeId={String(s.node_id)} widget={String(s.widget || 'object_table')} />
              ) : (
                <p className="text-[11px] text-muted-on-light italic">(objeto não escolhido)</p>
              ))}
          </section>
        );
      })}
    </div>
  );
}
