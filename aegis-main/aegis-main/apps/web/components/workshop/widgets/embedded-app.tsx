'use client';

/**
 * Embedded App — Sprint 4 do parity roadmap.
 *
 * Renderiza outro WorkshopApp inline dentro do app pai. Útil pra reuso
 * (mesmo header de identificação em N fichas, dossiê parlamentar
 * embarcado num dashboard, etc).
 *
 * Config:
 *   - `app_id`: id ou external_id do app a embarcar
 *   - `pass_variables`: lista de external_ids de variables a propagar
 *     (default: todos os variables do escopo pai)
 *
 * Recursion guard: usa um contexto React-prop que conta profundidade.
 * Default max = 3 níveis pra evitar loop infinito (A embeda B embeda A).
 *
 * Como o renderer é assíncrono (fetch /workshop/apps/{id} → render),
 * mostra skeleton enquanto carrega.
 */
import * as React from 'react';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import { Workshop } from '@/lib/workshop/client';
import { getSeed } from '@/lib/workshop/seeds';
import type { WorkshopApp } from '@/lib/workshop/types';

type Cfg = {
  app_id?: string;
  pass_variables?: string[]; // CSV ou array
  _depth?: number; // injetado internamente pelo recursion guard
};

const MAX_DEPTH = 3;

function EmbeddedApp({ config, variables }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const depth = typeof cfg._depth === 'number' ? cfg._depth : 0;
  const [embedded, setEmbedded] = React.useState<WorkshopApp | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!cfg.app_id) return;
    if (depth >= MAX_DEPTH) {
      setError(
        `Profundidade de embed >= ${MAX_DEPTH} — guard de recursão ativado.`,
      );
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Seeds locais carregam sem rede
    if (cfg.app_id.startsWith('seed.')) {
      const seed = getSeed(cfg.app_id);
      if (seed) {
        setEmbedded(seed);
        setLoading(false);
        return;
      }
    }

    Workshop.get(cfg.app_id)
      .then((a) => !cancelled && setEmbedded(a))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cfg.app_id, depth]);

  if (!cfg.app_id) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Configure `app_id` no Inspetor pra escolher qual workshop app
        embarcar.
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white border border-danger/40 bg-danger/5 p-3 text-[11px] text-danger font-mono">
        Erro ao embarcar `{cfg.app_id}`: {error}
      </div>
    );
  }
  if (loading || !embedded) {
    return (
      <div className="bg-white border border-border-light p-3 text-[11px] text-muted-on-light italic">
        Carregando embed `{cfg.app_id}`…
      </div>
    );
  }

  // Filtra variables propagadas pro embed
  let propagated: Record<string, unknown> = variables;
  if (cfg.pass_variables) {
    const allowed = Array.isArray(cfg.pass_variables)
      ? cfg.pass_variables
      : String(cfg.pass_variables).split(',').map((s) => s.trim()).filter(Boolean);
    propagated = {};
    for (const k of allowed) {
      if (k in variables) propagated[k] = variables[k];
    }
  }

  // Lazy-load Renderer pra evitar circular import
  const Renderer = React.lazy(() =>
    import('../WorkshopV2Renderer').then((m) => ({ default: m.WorkshopV2Renderer })),
  );

  return (
    <div
      className="bg-canvas-light border border-border-light"
      data-testid={`embedded-app-${cfg.app_id}`}
    >
      <div className="h-7 px-2.5 border-b border-border-light bg-raised-light flex items-center gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted-on-light font-semibold flex-1 truncate">
          embed · {embedded.display}
        </p>
        <span className="text-[9px] font-mono text-muted-on-light/70">
          depth {depth + 1}/{MAX_DEPTH}
        </span>
      </div>
      <React.Suspense fallback={<div className="p-3 text-[11px] text-muted-on-light italic">Renderizando…</div>}>
        <Renderer
          app={embedded}
          overrideOverrides={propagated}
          flat
        />
      </React.Suspense>
    </div>
  );
}

registerWidget('embedded_app', EmbeddedApp, {
  group: 'content',
  label: 'Painel embarcado',
  description:
    'Embute outro painel inline pra reuso de fichas, dossiês e cabeçalhos. Os dados do painel atual são propagados ao embarcado.',
  icon: 'package',
  defaultColSpan: 20,
  mockConfig: {
    app_id: 'seed.security.demo.events',
  },
  mockVariables: {},
  previewWidth: 420,
  previewHeight: 300,
  config_schema: [
    {
      name: 'app_id',
      label: 'ID do painel',
      description:
        'Identificador único do painel a embutir (UUID ou identificador legível como `seed.security.home`).',
      field: 'string',
      placeholder: 'seed.security.home',
    },
    {
      name: 'pass_variables',
      label: 'Dados a passar (separados por vírgula)',
      description:
        'Quais dados do painel atual repassar ao embarcado. Deixe vazio pra propagar todos.',
      field: 'string',
      placeholder: 'entity_id,properties',
    },
  ],
});
