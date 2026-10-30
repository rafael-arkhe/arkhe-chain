'use client';

/**
 * Botão "Personalizar detalhe" no painel do /buscar — cria um app
 * workshop com surface=search_result + target_source=<source.key>.
 *
 * Próxima vez que operador clicar num resultado da mesma fonte, o app
 * substitui o DetalheObjeto default.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2 } from 'lucide-react';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { Workshop } from '@/lib/workshop/client';
import { pickSearchResultSeed } from '@/lib/workshop/seeds';
import type { SourceDef } from '@/lib/buscar/types';

type Props = { source: SourceDef };

export function PersonalizarResultadoButton({ source }: Props) {
  const t = useT();
  const router = useRouter();
  const canEdit = useCan('security.workshop.edit');
  const canPublish = useCan('security.workshop.publish_global');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!canEdit || !canPublish) return null;
  if (!source.mcpTool) return null; // só fontes externas (não /entities local)

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const existing = await Workshop.bySurface({
        surface: 'search_result',
        target_source: source.key,
      });
      if (existing) {
        // Nova aba: não quebra a pesquisa do operador no /buscar.
        window.open(`/workshop/edit/${existing.id}`, '_blank', 'noopener');
        setBusy(false);
        return;
      }
      const seed = pickSearchResultSeed(source.key);
      const created = await Workshop.create({
        external_id: `detalhe-${source.key}-${Date.now().toString(36)}`,
        display: `${t('buscar.personalizar.app.displayPrefix')} ${source.label}`,
        description: `${t('buscar.personalizar.app.descriptionPrefix')} ${source.label}.`,
        schema_version: 2,
        variables: seed.variables ?? [],
        layout: seed.layout,
        surface: 'search_result',
        target_source: source.key,
      });
      window.open(`/workshop/edit/${created.id}`, '_blank', 'noopener');
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        data-testid="buscar-detalhe-personalizar"
        title={`${t('buscar.personalizar.button.title')} ${source.label}`}
        className="w-full h-7 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary flex items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
        ) : (
          <Pencil className="w-3 h-3" strokeWidth={1.5} />
        )}
        {t('buscar.personalizar.button.label')} {source.label}
      </button>
      {error && (
        <p className="text-[9px] text-danger mt-1 italic line-clamp-2" title={error}>
          {error}
        </p>
      )}
    </>
  );
}
