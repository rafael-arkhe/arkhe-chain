'use client';

/**
 * /briefings — APRESENTAÇÃO de um Document (T3-D, 2026-06-29).
 *
 * Unificado com /relatorios sobre o MESMO Document (NotepadDoc): /relatorios
 * AUTORA (compositor de seções), /briefings APRESENTA. A rota lista os
 * documentos e apresenta o selecionado como briefing — banner de classificação
 * do nível ARMAZENADO, seções (narrativa IA / texto / objeto) materializando a
 * ontologia, full-bleed no modo Apresentar.
 *
 * Modo A/B/C com EFEITO REAL (não cosmético): Resumo = só narrativas;
 * Operacional = narrativas + texto; Analítico = tudo (incl. objetos/dados).
 *
 * Toolbar 100% fiada: PDF (endpoint /pdf com burn-in) · Transmitir (guest-token
 * /m/{token}, T3-B — fim do broadcast-stub morto) · Apresentar (full-bleed).
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Maximize2, Share2, Download, X, Pencil, Layers } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { useCan } from '@/lib/auth/useAuth';
import { Notepad, type NotepadDoc, type NotepadSection } from '@/lib/api';
import { SectionsPreview } from '@/components/relatorios/section-composer';
import { DocumentList } from '@/components/relatorios/document-list';
import {
  CLASSIFICATION_BG,
  CLASSIFICATION_TEXT,
  CLASSIFICATION_LABEL,
  isClassificationLevel,
  type ClassificationLevel,
} from '@/lib/classification';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { useI18n, useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';
import {
  BRIEFING_MODES,
  modeCounts,
  visibleSections,
  type BriefingMode,
} from '@/lib/briefings/section-level';

type Modo = BriefingMode;

/** Markdown compacto (apresentação): títulos, negrito, listas, parágrafos. */
function BriefMd({ md }: { md: string }) {
  const lines = (md || '').split('\n');
  const out: React.ReactNode[] = [];
  let li: string[] = [];
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p,
    );
  const flush = (k: number) => {
    if (li.length) {
      out.push(
        <ul key={`ul${k}`} className="list-disc pl-5 my-2 text-[13px] text-text-on-light space-y-0.5">
          {li.map((x, i) => (
            <li key={i}>{inline(x)}</li>
          ))}
        </ul>,
      );
      li = [];
    }
  };
  lines.forEach((raw, i) => {
    const l = raw.trimEnd();
    if (/^#{1,3}\s+/.test(l)) {
      flush(i);
      out.push(
        <h3 key={i} className="text-[15px] font-semibold text-text-on-light mt-3 mb-1">
          {inline(l.replace(/^#{1,3}\s+/, ''))}
        </h3>,
      );
    } else if (/^\s*[-*]\s+/.test(l)) {
      li.push(l.replace(/^\s*[-*]\s+/, ''));
    } else if (l.trim() === '') {
      flush(i);
    } else {
      flush(i);
      out.push(
        <p key={i} className="text-[13px] text-text-on-light leading-relaxed my-1.5">
          {inline(l)}
        </p>,
      );
    }
  });
  flush(lines.length);
  return <>{out}</>;
}

/** Seletor de NÍVEL DE DETALHE: abas SUBLINHADAS (nunca preenchidas, regra do DS)
 *  + contagem por degrau, p/ o efeito de cada modo ficar tangível antes do clique. */
function ModeBar({
  modo,
  counts,
  onPick,
  t,
}: {
  modo: Modo;
  counts: Record<Modo, number>;
  onPick: (m: Modo) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-stretch gap-1" role="tablist" aria-label={t('briefings.modo.label')}>
      {BRIEFING_MODES.map((id) => {
        const active = modo === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`briefings-modo-${id}`}
            onClick={() => onPick(id)}
            title={t(`briefings.modo.${id}.desc`)}
            className={cn(
              'h-7 px-2 text-[11px] inline-flex items-center gap-1.5 border-b-2 transition-colors',
              active
                ? 'border-primary text-text-on-light font-medium'
                : 'border-transparent text-muted-on-light hover:text-text-on-light',
            )}
          >
            {t(`briefings.modo.${id}`)}
            <span className="font-mono text-[10px] text-muted-on-light tabular-nums">{counts[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Legenda sempre-visível: diz O QUE o degrau atual mostra + quantas seções de
 *  quantas — o operador entende o controle sem adivinhar. */
function ModeLegend({
  modo,
  visibleCount,
  total,
  t,
}: {
  modo: Modo;
  visibleCount: number;
  total: number;
  t: (k: string) => string;
}) {
  return (
    <p className="text-[11px] text-muted-on-light" data-testid="briefings-modo-legend">
      <span className="font-medium text-text-on-light">{t(`briefings.modo.${modo}`)}</span>
      {' · '}
      {t(`briefings.modo.${modo}.desc`)}
      {' · '}
      <span className="font-mono tabular-nums">
        {visibleCount}/{total}
      </span>{' '}
      {t('briefings.modo.sections')}
    </p>
  );
}

/** Vazio que ENSINA: quando o degrau atual esconde tudo, oferece a saída (Completo)
 *  em vez de um beco sem fim ("Sem seções neste modo"). */
function ModeEmpty({ onShowAll, t }: { onShowAll: () => void; t: (k: string) => string }) {
  return (
    <div
      className="border border-border-light bg-panel-light p-4 text-center"
      data-testid="briefings-modo-empty"
    >
      <p className="text-[12px] text-muted-on-light mb-2.5">{t('briefings.modo.emptyLevel')}</p>
      <button
        type="button"
        onClick={onShowAll}
        data-testid="briefings-modo-showall"
        className="h-7 px-3 text-[11px] bg-white border border-border-light hover:border-primary inline-flex items-center gap-1.5"
      >
        <Layers className="w-3 h-3" strokeWidth={1.5} /> {t('briefings.modo.showAll')}
      </button>
    </div>
  );
}

export default function BriefingsPage() {
  return (
    <RequirePerm perm="security.briefings.view">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const router = useRouter();
  const t = useT();
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const docParam = searchParams.get('doc');
  const canBroadcast = useCan('security.briefings.broadcast');
  const [list, setList] = React.useState<NotepadDoc[]>([]);
  const [sel, setSel] = React.useState<NotepadDoc | null>(null);
  const [modo, setModo] = React.useState<Modo>('operacional');
  const [presenting, setPresenting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    Notepad.list()
      .then((docs) => {
        setList(docs);
        // Atalho cruzado: ?doc=<id> (vindo do "Apresentar" da /relatorios)
        // pré-seleciona o documento — a mesma seleção viaja entre as 2 vistas.
        if (docParam) {
          const found = docs.find((d) => d.id === docParam);
          if (found) setSel(found);
        }
      })
      .catch(() => setList([]));
  }, [docParam]);

  const classification: ClassificationLevel = isClassificationLevel(sel?.classification_level)
    ? (sel!.classification_level as ClassificationLevel)
    : 'restrito';

  const sections = sel?.sections || [];
  const visible = React.useMemo(() => visibleSections(sections, modo), [sections, modo]);
  const counts = React.useMemo(() => modeCounts(sections), [sections]);

  // ESC sai da apresentação.
  React.useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting]);

  function downloadPdf() {
    if (!sel) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    window.open(Notepad.pdfUrl(sel.id, { tz, locale }), '_blank');
  }

  async function transmit() {
    if (!sel) return;
    setBusy(true);
    try {
      const res = await Notepad.transmit(sel.id, { link_base: window.location.origin });
      try {
        await navigator.clipboard.writeText(res.link);
      } catch {
        /* clipboard pode falhar — o link aparece no modal */
      }
      await confirmModal({
        title: 'Briefing transmitido',
        description: (
          <div className="space-y-2">
            <p className="text-[12px]">
              Link público read-only (expira em{' '}
              {new Date(res.expires_at).toLocaleDateString('pt-BR')}). Copiado para a área de
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
      toast.error('Falha ao transmitir.');
    } finally {
      setBusy(false);
    }
  }

  const renderMd = (md: string) => <BriefMd md={md} />;

  const toolbar = sel ? (
    <>
      <button
        type="button"
        data-testid="briefings-edit-link"
        onClick={() => router.push(`/relatorios?doc=${encodeURIComponent(sel.id)}`)}
        title="Abrir este documento para edição em Relatórios"
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <Pencil className="w-3 h-3" strokeWidth={1.5} /> Editar em Relatórios
      </button>
      <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
        {t('briefings.modo.label')}
      </span>
      <ModeBar modo={modo} counts={counts} onPick={setModo} t={t} />
      <button
        type="button"
        data-testid="briefings-present"
        onClick={() => setPresenting(true)}
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <Maximize2 className="w-3 h-3" strokeWidth={1.5} /> Apresentar
      </button>
      <button
        type="button"
        data-testid="briefings-pdf"
        onClick={downloadPdf}
        className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
      >
        <Download className="w-3 h-3" strokeWidth={1.5} /> PDF
      </button>
      {canBroadcast && (
        <button
          type="button"
          data-testid="briefings-transmit"
          onClick={transmit}
          disabled={busy}
          className="h-7 px-2.5 text-[11px] bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
        >
          <Share2 className="w-3 h-3" strokeWidth={1.5} /> Transmitir
        </button>
      )}
    </>
  ) : null;

  return (
    <>
      <PageShell
        title={
          <>
            <FileText className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
            <span>Briefings</span>
          </>
        }
        subtitle="Apresentação (somente leitura) dos documentos — redija em Relatórios"
        classification={classification}
        classificationLabel="BRIEFINGS"
        theme="light"
        toolbar={toolbar}
      >
        <div className="h-full flex min-h-0" data-testid="briefings-root">
          {/* Esquerda: documentos */}
          <DocumentList
            docs={list}
            selectedId={sel?.id}
            onSelect={(d) => {
              setSel(d);
              setPresenting(false);
            }}
            label={t('relatorios.docs')}
            prefix="briefings"
          />

          {/* Centro: apresentação */}
          <main className="flex-1 overflow-y-auto scrollbar-hide min-w-0 bg-canvas-light">
            {!sel ? (
              <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">
                Selecione um documento para apresentar.
              </div>
            ) : (
              <article className="max-w-3xl mx-auto p-6" data-testid="briefings-doc">
                <h1 className="text-[22px] font-bold text-text-on-light">{sel.title}</h1>
                <p className="text-[11px] text-muted-on-light mb-1.5">
                  <span className="font-mono tabular-nums">v{sel.version}</span>
                  {sel.signed ? ' · Selado' : ' · Rascunho'}
                </p>
                <div className="mb-5 pb-3 border-b border-border-light">
                  <ModeLegend modo={modo} visibleCount={visible.length} total={sections.length} t={t} />
                </div>
                {visible.length === 0 ? (
                  sections.length === 0 ? (
                    <p className="text-[12px] text-muted-on-light italic">{t('briefings.empty')}</p>
                  ) : (
                    <ModeEmpty onShowAll={() => setModo('analitico')} t={t} />
                  )
                ) : (
                  <SectionsPreview sections={visible} renderMarkdown={renderMd} docId={sel?.id} />
                )}
              </article>
            )}
          </main>
        </div>
      </PageShell>

      {/* Modo apresentação — full-bleed, banner de classificação SEMPRE no topo. */}
      {presenting && sel && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-canvas-light"
          data-testid="briefings-presentation"
        >
          <div
            className={cn(
              'h-7 shrink-0 flex items-center justify-center font-mono text-[10px] font-semibold tracking-[0.22em] uppercase',
              CLASSIFICATION_BG[classification],
              CLASSIFICATION_TEXT[classification],
            )}
          >
            {CLASSIFICATION_LABEL[classification]}
          </div>
          <div className="h-9 shrink-0 px-4 flex items-center gap-3 border-b border-border-light bg-panel-light">
            <span className="text-[12px] font-semibold flex-1 truncate text-text-on-light">{sel.title}</span>
            <ModeBar modo={modo} counts={counts} onPick={setModo} t={t} />
            <button
              type="button"
              data-testid="briefings-present-exit"
              onClick={() => setPresenting(false)}
              className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
            >
              <X className="w-3 h-3" strokeWidth={1.5} /> Sair
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide bg-canvas-light">
            <article className="max-w-4xl mx-auto p-10">
              <h1 className="text-[30px] font-bold text-text-on-light mb-2">{sel.title}</h1>
              <div className="mb-6 pb-3 border-b border-border-light">
                <ModeLegend modo={modo} visibleCount={visible.length} total={sections.length} t={t} />
              </div>
              {visible.length === 0 ? (
                sections.length === 0 ? (
                  <p className="text-[14px] text-muted-on-light italic">{t('briefings.empty')}</p>
                ) : (
                  <ModeEmpty onShowAll={() => setModo('analitico')} t={t} />
                )
              ) : (
                <SectionsPreview sections={visible} renderMarkdown={renderMd} docId={sel?.id} />
              )}
            </article>
          </div>
        </div>
      )}
    </>
  );
}
