'use client';

/**
 * ModelDefaultsCard — modelo padrão por FINALIDADE. Centraliza em
 * `/painel-de-controle/dados?aba=modelos` qual modelo cada parte do AEGIS usa.
 * Seletor DETALHADO (codinome AIP + tier + contexto + preço) via ModelSelect;
 * guarda o SLUG real. Ícone AudioLines neutro; sem nome de terceiros; sem markup.
 */
import * as React from 'react';
import { AudioLines, Globe2, Loader2, CheckCircle2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { InfoTip } from '@/components/ui/info-tip';
import { ModelSelect } from '@/components/aip/model-select';
import { AIPModels, Compute, type AipCatalogModel, type AipModelDefault, type ComputeProviderRow } from '@/lib/api';
import { isHiddenProvider } from '@/lib/aip/modelLabels';

const KIND_KEY: Record<string, string> = {
  edge: 'provedores.kind.edge',
  cloud_inference: 'provedores.kind.cloud_inference',
  cloud_gpu: 'provedores.kind.cloud_gpu',
};

const PURPOSES = ['codegen', 'planning', 'agent', 'chat', 'embedding', 'coleta', 'visao', 'audio'] as const;
type Purpose = (typeof PURPOSES)[number];
const PURPOSE_KEY: Record<Purpose, { label: string; hint: string }> = {
  codegen: { label: 'modelDefaults.codegen', hint: 'modelDefaults.codegenHint' },
  planning: { label: 'modelDefaults.planning', hint: 'modelDefaults.planningHint' },
  agent: { label: 'modelDefaults.agent', hint: 'modelDefaults.agentHint' },
  chat: { label: 'modelDefaults.chat', hint: 'modelDefaults.chatHint' },
  embedding: { label: 'modelDefaults.embedding', hint: 'modelDefaults.embeddingHint' },
  coleta: { label: 'modelDefaults.coleta', hint: 'modelDefaults.coletaHint' },
  visao: { label: 'modelDefaults.visao', hint: 'modelDefaults.visaoHint' },
  audio: { label: 'modelDefaults.audio', hint: 'modelDefaults.audioHint' },
};

/** Um provedor (ComputeProvider) só pode ser amarrado a uma finalidade compatível:
 *  embedding exige capability 'embedding'; finalidades de LLM não aceitam provedor
 *  que SÓ faz embedding. Espelha a regra fail-closed do backend (set_default_model). */
function providerServesPurpose(p: ComputeProviderRow, purpose: Purpose): boolean {
  const caps = (p.capabilities || []).map((c) => c.toLowerCase());
  if (purpose === 'embedding') return caps.includes('embedding');
  return !(caps.length === 1 && caps[0] === 'embedding');
}

export function ModelDefaultsCard() {
  const t = useT();
  const [defs, setDefs] = React.useState<Record<string, AipModelDefault>>({});
  const [models, setModels] = React.useState<AipCatalogModel[]>([]);
  const [provs, setProvs] = React.useState<ComputeProviderRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [savingPurpose, setSavingPurpose] = React.useState<string | null>(null);
  const [savedPurpose, setSavedPurpose] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, cat, ps] = await Promise.all([
        AIPModels.defaults(),
        AIPModels.catalog(),
        Compute.list().catch(() => [] as ComputeProviderRow[]),
      ]);
      const byPurpose: Record<string, AipModelDefault> = {};
      for (const it of d) byPurpose[it.purpose] = it;
      setDefs(byPurpose);
      setModels(cat.filter((m) => !isHiddenProvider(m.provider)));
      setProvs(ps.filter((p) => p.enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(
    async (purpose: Purpose, body: { provider: string; model: string; provider_id?: string }) => {
      setSavingPurpose(purpose);
      setSavedPurpose(null);
      setError(null);
      try {
        const updated = await AIPModels.setDefault({ purpose, ...body });
        setDefs((prev) => ({ ...prev, [purpose]: updated }));
        setSavedPurpose(purpose);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSavingPurpose(null);
      }
    },
    [],
  );

  // Trocar o modelo PRESERVA o vínculo de soberania (provider_id) da finalidade.
  const onPick = React.useCallback(
    (purpose: Purpose, m: AipCatalogModel) =>
      save(purpose, {
        provider: m.provider,
        model: m.model_slug || m.label, // SLUG real, nunca o catalog-id
        provider_id: defs[purpose]?.provider_id || undefined,
      }),
    [save, defs],
  );

  // Vincular/desvincular o provedor soberano MANTÉM o modelo escolhido.
  const onBindProvider = React.useCallback(
    (purpose: Purpose, providerId: string) => {
      const cur = defs[purpose];
      if (!cur) return;
      save(purpose, { provider: cur.provider, model: cur.model, provider_id: providerId || undefined });
    },
    [save, defs],
  );

  const selectedId = (purpose: Purpose): string => {
    const cur = defs[purpose];
    if (!cur) return '';
    return models.find((m) => (m.model_slug || m.label) === cur.model)?.id ?? '';
  };

  return (
    <div className="border border-border-light bg-white" data-testid="model-defaults-card">
      <div className="flex items-start gap-2 px-4 py-3 border-b border-border-light">
        <AudioLines className="w-4 h-4 text-text-on-light shrink-0 mt-0.5" strokeWidth={1.5} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text-on-light">{t('modelDefaults.title')}</div>
          <div className="text-[11px] text-muted-on-light leading-snug">{t('modelDefaults.subtitle')}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[12px] text-muted-on-light">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
        </div>
      ) : (
        // Lista alinhada: finalidade à ESQUERDA (preenche o espaço), modelo à
        // DIREITA em largura fixa confortável (não full-width), e a soberania como
        // controle SECUNDÁRIO discreto (ghost) — não uma segunda caixa pesada.
        <div className="divide-y divide-border-light" data-testid="model-defaults-grid">
          {PURPOSES.map((purpose) => {
            const cur = defs[purpose];
            const purposeProvs = provs.filter((p) => providerServesPurpose(p, purpose));
            const saving = savingPurpose === purpose;
            const saved = savedPurpose === purpose;
            return (
              <div
                key={purpose}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                data-testid={`model-default-row-${purpose}`}
              >
                {/* finalidade — nome + dica, ocupa o espaço livre à esquerda */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-text-on-light">
                      {t(PURPOSE_KEY[purpose].label)}
                    </span>
                    {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-on-light" strokeWidth={1.5} />}
                    {saved && (
                      <CheckCircle2
                        className="w-3 h-3 text-primary"
                        strokeWidth={2}
                        data-testid={`model-default-saved-${purpose}`}
                      />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-on-light leading-tight">
                    {t(PURPOSE_KEY[purpose].hint)}
                  </div>
                </div>

                {/* controles à direita — modelo (primário) + soberania (discreta) */}
                <div className="w-full shrink-0 sm:w-[340px]">
                  <ModelSelect
                    models={models}
                    value={selectedId(purpose)}
                    currentSlug={cur?.model}
                    onPick={(m) => onPick(purpose, m)}
                    testId={`model-default-select-${purpose}`}
                    purpose={purpose}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <Globe2 className="w-3 h-3 shrink-0 text-muted-on-light" strokeWidth={1.5} />
                    <select
                      value={cur?.provider_id ?? ''}
                      onChange={(e) => onBindProvider(purpose, e.target.value)}
                      disabled={purposeProvs.length === 0}
                      className="min-w-0 flex-1 cursor-pointer truncate bg-transparent py-0.5 text-[11px] text-muted-on-light outline-none hover:text-text-on-light focus:text-text-on-light disabled:cursor-default disabled:opacity-60"
                      data-testid={`model-default-sovereignty-${purpose}`}
                      title={t('modelDefaults.sovereignty')}
                    >
                      <option value="">{t('modelDefaults.sovereigntyNone')}</option>
                      {purposeProvs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} · {t(KIND_KEY[p.provider_kind] || 'provedores.kind.cloud_inference')}
                          {p.jurisdictions.length > 0 ? ` · ${p.jurisdictions.join(', ')}` : ''}
                          {p.country ? ` · ${p.country}` : ''}
                        </option>
                      ))}
                    </select>
                    {cur && (cur.jurisdictions.length > 0 || cur.country) && (
                      <span
                        className="shrink-0 text-[10px] font-mono text-muted-on-light"
                        data-testid={`model-default-jurisdiction-${purpose}`}
                      >
                        {cur.jurisdictions.length > 0 ? cur.jurisdictions.join(', ') : ''}
                        {cur.country ? ` · ${cur.country}` : ''}
                      </span>
                    )}
                    <InfoTip text={t('modelDefaults.sovereigntyHelp')} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="px-4 py-2 text-[11px] font-mono text-danger" data-testid="model-defaults-error">
          {error}
        </p>
      )}
    </div>
  );
}
