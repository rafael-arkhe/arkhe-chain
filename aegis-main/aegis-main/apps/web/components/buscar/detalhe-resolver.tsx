'use client';

/**
 * DetalheResolver — consulta workshop por surface=search_result+target_source
 * pra ver se há app workshop publicado pra fonte do resultado selecionado.
 *
 * Encontrou → renderiza o app no painel direito (substitui DetalheObjeto).
 * Não encontrou (ou backend offline) → cai pro DetalheObjeto default.
 */
import * as React from 'react';
import { Workshop } from '@/lib/workshop/client';
import { useResolvedApp } from '@/lib/workshop/runtime';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import '@/components/workshop/widgets';
import type { WorkshopApp } from '@/lib/workshop/types';
import { DetalheObjeto } from './detalhe';
import type { NormalizedResult, SourceDef } from '@/lib/buscar/types';

type Props = {
  selecionado: { result: NormalizedResult; source: SourceDef; query: string } | null;
  onEnriquecer: (result: NormalizedResult, target: SourceDef) => void;
  onCriar: (result: NormalizedResult, from: SourceDef) => void;
};

export function DetalheResolver(props: Props) {
  const { selecionado } = props;
  const [app, setApp] = React.useState<WorkshopApp | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Cache local pra não repetir lookups da mesma source
  const cacheRef = React.useRef<Map<string, WorkshopApp | null>>(new Map());

  React.useEffect(() => {
    if (!selecionado) {
      setApp(null);
      return;
    }
    const sourceKey = selecionado.source.key;
    if (cacheRef.current.has(sourceKey)) {
      setApp(cacheRef.current.get(sourceKey) ?? null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Workshop.bySurface({
      surface: 'search_result',
      target_source: sourceKey,
    })
      .then((found) => {
        if (cancelled) return;
        cacheRef.current.set(sourceKey, found);
        setApp(found);
      })
      .catch(() => {
        if (!cancelled) {
          cacheRef.current.set(sourceKey, null);
          setApp(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selecionado]);

  // Sem app workshop OU ainda carregando → fallback
  if (!app || loading) {
    return <DetalheObjeto {...props} />;
  }
  return (
    <DetalheWorkshop
      app={app}
      selecionado={selecionado!}
      onCriar={props.onCriar}
      onEnriquecer={props.onEnriquecer}
    />
  );
}

function DetalheWorkshop({
  app,
  selecionado,
  onCriar,
  onEnriquecer,
}: {
  app: WorkshopApp;
  selecionado: NonNullable<Props['selecionado']>;
  onCriar: Props['onCriar'];
  onEnriquecer: Props['onEnriquecer'];
}) {
  const { app: resolvedApp } = useResolvedApp(app);
  // Variáveis pro renderer — disponibiliza o resultado + source + query
  // + callbacks pros widgets atômicos de detalhe consumirem.
  const variables = React.useMemo(
    () => ({
      result: selecionado.result,
      source: selecionado.source,
      query: selecionado.query,
      onCriar,
      onEnriquecer,
      // alguns widgets esperam `properties` (igual /ficha)
      properties: {
        ...(selecionado.result.raw as Record<string, unknown> | undefined),
        name: selecionado.result.name,
        url: selecionado.result.url,
        subtitle: selecionado.result.subtitle,
        snippet: selecionado.result.snippet,
        thumbnail: selecionado.result.thumbnail,
      },
    }),
    [selecionado, onCriar, onEnriquecer],
  );
  return (
    <aside
      data-testid="buscar-detalhe-workshop"
      className="w-[320px] shrink-0 border-l border-border-light bg-panel-light flex flex-col overflow-hidden"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold font-mono flex-1">
          {app.display}
        </p>
        <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-success/40 text-success bg-success/10">
          workshop
        </span>
      </header>
      <div className="flex-1 overflow-y-auto p-3">
        <WorkshopV2Renderer app={resolvedApp} overrideOverrides={variables} flat />
      </div>
    </aside>
  );
}
