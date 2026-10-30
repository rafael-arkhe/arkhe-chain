'use client';

/**
 * Painel de Controle · Páginas · [slug] / edit — Onda I.1 (2026-05-23).
 *
 * REESCRITA total — substitui o editor 5-blocos da Wave H.4.A por uma
 * casca que monta o ``PagesWorkshopEditor``, **reusando o widget
 * registry + paleta + canvas + inspector do Workshop**.
 *
 * Operador feedback #1:
 *   "Por que voce fez outro editor para as 'Paginas' sendo que é so
 *    usar o mesmo editor do workshop? introduzir inclusive os widgets?"
 *
 * Resposta: zero duplicação. Quando o operador clica "Editar layout"
 * numa Page, ele vê os mesmos widgets disponíveis no Workshop normal
 * (markdown_v2, object_table, metric_card, chart-xy, geo-map, timeline,
 * security.*, parlamentar.*, detalhe.*, etc.).
 *
 * Backward-compat: Pages criadas com o editor antigo (config tem
 * ``mode: 'legacy'`` ou ``blocks: []`` sem mode) abrem em modo vazio +
 * banner "Migrar para Workshop". Migração só acontece quando o operador
 * confirma — o blob legacy fica intacto no storage até lá.
 *
 * Política (memórias honradas):
 *   feedback_workshop_first_when_touching_pages · checked: surface
 *     padrão `standalone`; widgets reusados do registry; perm
 *     `workspace.publish` (mesmo IAM da Wave H.4.A).
 *   feedback_no_localstorage_for_persistence · zero localStorage —
 *     ``Pages.putConfig`` é o único caminho.
 *   feedback_no_rounded_no_sparkles · sharp; sem Sparkles.
 */
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { PagesWorkshopEditor } from '@/components/pages-editor/pages-workshop-editor';
import { Pages, type RegisteredPage } from '@/lib/api';

export default function EditPaginaPage() {
  return (
    <RequirePerm perm="workspace.publish">
      <EditPaginaInner />
    </RequirePerm>
  );
}

function EditPaginaInner() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';

  const [page, setPage] = React.useState<RegisteredPage | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!slug) return;
    setErr(null);
    Pages.get(slug)
      .then((p) => setPage(p))
      .catch((e) =>
        setErr((e as Error)?.message ?? 'Falha ao carregar página'),
      );
  }, [slug]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (err && !page) {
    return <CpErrorState description={err} retry={load} />;
  }
  if (!page) return <CpSkeleton />;

  return (
    <PagesWorkshopEditor
      page={page}
      onPageChange={setPage}
      onBack={() => router.push('/painel-de-controle/paginas')}
    />
  );
}
