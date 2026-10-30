'use client';

/**
 * Modelos de IA — hub Dados (`/painel-de-controle/dados?aba=modelos`). Centraliza
 * a configuração de modelo do AEGIS: modelo padrão por finalidade + Orçamento de IA
 * + modelos próprios (BYOM) + catálogo com preço.
 *
 * Regras de UI (memory): ícone do AIP = AudioLines, SEMPRE neutro (sem cor de
 * acento/semântica — não infantilizar). Nunca nome de fornecedor/modelo de
 * terceiros (só codinome AIP via aipModelLabel). Nunca citar markup. Cantos retos,
 * JetBrains Mono nos dados, preços em R$, strings via useT(). A PÁGINA inteira
 * rola — o catálogo não fica espremido num flex-1.
 */
import * as React from 'react';
import { AudioLines, Boxes, Filter, RefreshCw, Tag, Layers } from 'lucide-react';

import { HubHeader } from '@/components/dados/hub-header';
import { ModelDefaultsCard } from '@/components/aip/model-defaults-card';
import { SttDefaultCard } from '@/components/aip/stt-default-card';
import { ByomModelsCard } from '@/components/aip/byom-models-card';
import { LlmUsagePanel } from '@/components/aip/llm-usage-panel';
import { BrandIcon, hasBrandIcon } from '@/components/aip/brand-icon';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/provider';
import { aipModelLabel, aipModelNote, isAipCloudModel, isFlagshipModel, isHiddenProvider } from '@/lib/aip/modelLabels';
import { modelTier, formatContextWindow, TIER_I18N } from '@/lib/aip/modelMeta';
import { AIPModels, type AipCatalogModel } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';

function humanise(e: unknown): string {
  if (e instanceof ApiError) return e.message || `Erro HTTP ${e.status}`;
  return e instanceof Error ? e.message : String(e);
}

const CAP_KEYS: Record<string, string> = {
  reasoning: 'aip.cap.reasoning',
  vision: 'aip.cap.vision',
  structured_outputs: 'aip.cap.structured_outputs',
  tool_use: 'aip.cap.tool_use',
  audio: 'aip.cap.audio',
  long_context: 'aip.cap.long_context',
};

const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function ModelosWorkspace() {
  const t = useT();
  const [models, setModels] = React.useState<AipCatalogModel[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [capabilityFilter, setCapabilityFilter] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await AIPModels.catalog());
    } catch (e) {
      setError(humanise(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visibleModels = React.useMemo(
    () => models.filter((m) => !isHiddenProvider(m.provider)),
    [models],
  );
  const visible = React.useMemo(() => {
    const list = capabilityFilter
      ? visibleModels.filter((m) => m.capabilities.includes(capabilityFilter))
      : visibleModels;
    // Soberanos (AIP Cloud) no topo, externos no fundo; flagship antes dentro do grupo.
    const rank = (m: AipCatalogModel) =>
      (isAipCloudModel(m.id, m.source) ? 0 : 2) + (isFlagshipModel(m.id, m.source) ? -1 : 0);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [visibleModels, capabilityFilter]);
  const priced = visible.find((m) => m.pricing)?.pricing ?? null;

  return (
    <div data-testid="modelos-workspace" className="h-full flex flex-col">
      {/* F7.3c — chrome padrão das seções-hub da casca. */}
      <HubHeader label={t('modelos.title')} />
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
      {/* Orçamento de IA primeiro de tudo; depois soberania (modelos próprios) +
          padrão por finalidade. O catálogo vai por ÚLTIMO (referência). */}
      <div className="px-6 pt-4 space-y-3">
        <LlmUsagePanel />
        <ByomModelsCard />
        <ModelDefaultsCard />
        <SttDefaultCard />
      </div>

      {error && (
        <div
          className="mx-6 mt-3 px-3 py-2 text-[12px] text-danger bg-danger/5 border border-danger/30"
          data-testid="modelos-error"
        >
          {error}
        </div>
      )}

      {/* Catálogo de modelos — por último. */}
      <div className="mt-4 border-t border-border-light">
        <div className="bg-white px-6 py-3 flex items-center gap-4 flex-wrap border-b border-border-light">
          <div className="flex items-center gap-2">
            <AudioLines className="w-4 h-4 text-text-on-light" strokeWidth={1.5} />
            <span className="text-[12px] font-semibold text-text-on-light">{t('modelos.catalogTitle')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-muted-on-light" strokeWidth={1.5} />
            <select
              value={capabilityFilter}
              onChange={(e) => setCapabilityFilter(e.target.value)}
              className="h-7 text-[12px] bg-white border border-border-light px-2 rounded-none outline-none focus:border-primary"
              data-testid="modelos-capability-filter"
              aria-label={t('modelos.capability')}
            >
              <option value="">{t('modelos.allCapabilities')}</option>
              {Object.entries(CAP_KEYS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t(v)}
                </option>
              ))}
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={load} className="h-7" data-testid="modelos-refresh">
            <RefreshCw className={cn('w-3 h-3 mr-1 text-muted-on-light', loading && 'animate-spin')} strokeWidth={1.5} />
            {t('modelos.refresh')}
          </Button>
          <span className="ml-auto text-[11px] font-mono text-muted-on-light">
            {visible.length} {visible.length === 1 ? t('modelos.countModel') : t('modelos.countModels')}
          </span>
        </div>

        {priced && (
          <div
            className="px-6 py-1.5 bg-canvas-light border-b border-border-light text-[10px] text-muted-on-light"
            data-testid="modelos-price-legend"
          >
            {t('modelos.priceLegend')}
          </div>
        )}

        <div className="p-6 bg-canvas-light">
          {loading && models.length === 0 && (
            <div className="text-center py-10 text-[12px] text-muted-on-light italic">{t('modelos.loading')}</div>
          )}
          {!loading && visible.length === 0 && (
            <div className="bg-white border border-border-light p-6 text-center" data-testid="modelos-empty">
              <AudioLines className="w-5 h-5 text-muted-on-light mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[12px] text-muted-on-light">{t('modelos.empty')}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="modelos-grid">
            {visible.map((m) => (
              <ModelCard key={m.id} model={m} t={t} />
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function ModelCard({ model, t }: { model: AipCatalogModel; t: (k: string) => string }) {
  const isBYOM = model.source === 'byom';
  const aipCloud = isAipCloudModel(model.id, model.source);
  // Branding: abertos (AIP Cloud) → codinome AIP + nota AIP (narrativa). Proprietários
  // → nome + descrição + logo ORIGINAIS da marca, nunca mascarados como AIP.
  const title = aipCloud
    ? aipModelLabel(model.id) || model.label
    : model.display_name || model.label || model.id;
  // Abertos (AIP) mantêm a narrativa pt-BR; EXTERNOS ficam SEM descrição — todo
  // mundo já conhece, o reforço vem pelas tags.
  const note = aipCloud ? aipModelNote(model.id) : '';
  const p = model.pricing;
  const ctx = formatContextWindow(model.context_window);
  const caps = model.capabilities.filter((c) => CAP_KEYS[c]);
  const isEmbedding = model.capabilities.includes('embedding');
  const chip = 'text-[10px] px-1.5 py-0.5 border border-border-light text-muted-on-light';
  return (
    <article
      // Diferença legal sutil: os modelos AIP Cloud ganham uma fina barra azul-aço
      // à esquerda (nada exagerado). Proprietários ficam neutros.
      className={cn(
        'bg-white border p-3 flex flex-col gap-2',
        aipCloud ? 'border-border-light border-l-2 border-l-primary' : 'border-border-light',
      )}
      data-testid={`model-card-${model.id}`}
    >
      <header className="flex items-start gap-2">
        {aipCloud || !hasBrandIcon(model.id) ? (
          aipCloud ? (
            <AudioLines className="w-4 h-4 mt-0.5 shrink-0 text-text-on-light" strokeWidth={1.5} />
          ) : (
            <Boxes className="w-4 h-4 mt-0.5 shrink-0 text-muted-on-light" strokeWidth={1.5} />
          )
        ) : (
          <BrandIcon modelId={model.id} className="w-4 h-4 mt-0.5 shrink-0 text-text-on-light" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-text-on-light truncate">{title}</h3>
          {/* Subtítulo = capacidades reais do modelo (particular de cada um), não o
              tier genérico repetido. */}
          {caps.length > 0 && (
            <p className="text-[10px] text-muted-on-light truncate">
              {caps.map((c) => t(CAP_KEYS[c])).join(' · ')}
            </p>
          )}
        </div>
        {isBYOM ? (
          <span className="text-[10px] font-mono px-1.5 py-0.5 border border-border-light text-muted-on-light">
            {t('modelos.own')}
          </span>
        ) : isFlagshipModel(model.id, model.source) ? (
          // Destaque premium — SÓ no topo de linha do AIP (família Ipiranga).
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 border border-featured text-featured bg-featured/5"
            data-testid={`model-featured-${model.id}`}
          >
            {t('modelos.featured')}
          </span>
        ) : null}
      </header>

      {note && <p className="text-[11px] text-text-on-light leading-snug">{note}</p>}

      <div className="border border-border-light bg-canvas-light" data-testid={`model-price-${model.id}`}>
        {!p ? (
          <div className="px-2.5 py-1.5 text-[11px] text-muted-on-light italic">{t('modelos.onRequest')}</div>
        ) : isEmbedding ? (
          // Embedding cobra só input → preço único, sem coluna de saída.
          <div className="px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-muted-on-light">{t('modelos.priceEmbedding')}</p>
            <p className="text-[13px] font-mono font-semibold text-text-on-light leading-tight">{brl(p.input_brl_mtok)}</p>
            <p className="text-[9px] text-muted-on-light">{t('modelos.perMtok')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border-light">
            <div className="px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-on-light">{t('modelos.priceInput')}</p>
              <p className="text-[13px] font-mono font-semibold text-text-on-light leading-tight">{brl(p.input_brl_mtok)}</p>
              <p className="text-[9px] text-muted-on-light">{t('modelos.perMtok')}</p>
            </div>
            <div className="px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-on-light">{t('modelos.priceOutput')}</p>
              <p className="text-[13px] font-mono font-semibold text-text-on-light leading-tight">{brl(p.output_brl_mtok)}</p>
              <p className="text-[9px] text-muted-on-light">{t('modelos.perMtok')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-on-light">
        <Tag className="w-3 h-3" strokeWidth={1.5} />
        <span className="font-mono" data-testid={`model-cloud-${model.id}`}>
          {aipCloud ? t('cloud.aip') : t('cloud.external')}
        </span>
        {ctx && (
          <>
            <span className="text-border-light">·</span>
            <Layers className="w-3 h-3" strokeWidth={1.5} />
            <span className="font-mono">{ctx} mil ctx</span>
          </>
        )}
      </div>

      {/* Tag: privacidade/treino. As capacidades já vão no subtítulo. */}
      <div className="flex flex-wrap gap-1" data-testid={`model-tags-${model.id}`}>
        <span className={chip}>{aipCloud ? t('modelos.dataPrivate') : t('modelos.dataThirdParty')}</span>
      </div>
    </article>
  );
}
