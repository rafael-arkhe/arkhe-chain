'use client';

/**
 * Barra superior de busca — input principal + "Busca avançada" colapsável.
 *
 * Os campos avançados (nome da mãe, nascimento, UF) NÃO são enfeite: fluem como
 * `properties` no dossiê e viram FILTRO PRECISO nas fontes (o BNMP some o "1328
 * homônimos" quando recebe nome da mãe ou nascimento; o OAB usa a UF). É o gesto
 * que o investigador faz manual — agora na máquina.
 *
 * As fontes ficam no painel lateral (`PainelFiltros`).
 */
import * as React from 'react';
import { Search, FileSearch, Loader2, SlidersHorizontal, ChevronDown, Info } from 'lucide-react';
import { fieldKind, refinerLabel } from '@/lib/buscar/classify';
import { MaskedField } from '@/components/buscar/masked-field';
import { SelectField } from '@/components/buscar/select-field';
import type { AccessPurpose } from '@/lib/buscar/access-purposes';
import { isNsfwOn, type PerSourceGroup } from '@/lib/buscar/per-source-fields';
import { useT } from '@/lib/i18n/provider';

// MODULAR: os campos de desambiguação vêm do `refines` das fontes selecionadas
// (keyed pelo nome do refiner = a property que o backend espera). purpose/caseId são
// fixos (LGPD, do gesto de dossiê). As FINALIDADES (purpose) vêm por prop `purposes` —
// default neutro (bases LGPD) + configurável por domínio (NUNCA hardcoded aqui).
export type AdvancedFields = { fields: Record<string, string>; purpose: string; caseId: string };

type Props = {
  query: string;
  setQuery: (v: string) => void;
  totalSelecionado: number;
  onSubmit: () => void;
  onDossier?: () => void;
  dossierLoading?: boolean;
  disabled?: boolean;
  advanced: AdvancedFields;
  setAdvanced: (patch: Partial<AdvancedFields>) => void;
  /** Refiners (desambiguadores) das fontes selecionadas — campos avançados MODULARES. */
  refiners: string[];
  refinerExamples?: Record<string, string>;
  /**
   * Parâmetros POR-FONTE (FE-B): os `ui_fields` de cada fonte selecionada,
   * agrupados por fonte e namespaced (`<toolBase>__<propKey>`). Renderizados
   * numa seção própria ("Parâmetros da fonte"), abaixo dos refiners.
   */
  perSourceFields?: PerSourceGroup[];
  /** Finalidades de acesso (LGPD) — default neutro (bases LGPD) + configurável por domínio. */
  purposes: AccessPurpose[];
};

export function BuscarInput({
  query,
  setQuery,
  totalSelecionado,
  onSubmit,
  onDossier,
  dossierLoading,
  disabled,
  advanced,
  setAdvanced,
  refiners,
  refinerExamples,
  perSourceFields,
  purposes,
}: Props) {
  const t = useT();
  // Resiliência: um store persistido de versão ANTIGA pode trazer `advanced` sem `fields`
  // (mudei o shape p/ {fields,purpose,caseId}). Normaliza aqui pra nunca quebrar com
  // Object.values(undefined). O migrate do store (lib/buscar/store) corrige a origem.
  const fields = advanced.fields ?? {};
  const purpose = advanced.purpose ?? '';
  const caseId = advanced.caseId ?? '';
  // `filled` conta TODOS os campos preenchidos em advanced.fields (refiners +
  // parâmetros por-fonte namespaced) + finalidade + caso — o badge da Busca
  // avançada reflete os parâmetros por-fonte também (FE-B).
  const filled =
    Object.values(fields).filter((v) => v && v.trim()).length +
    (purpose ? 1 : 0) +
    (caseId.trim() ? 1 : 0);
  const setField = (k: string, v: string) =>
    setAdvanced({ fields: { ...fields, [k]: v } });
  const [advOpen, setAdvOpen] = React.useState(filled > 0);
  const groups = perSourceFields ?? [];
  // Progressive disclosure: cada fonte começa COLAPSADA; o operador abre só a que
  // quer ajustar (a maioria fica no padrão). openSources = chaves de fonte abertas.
  const [openSources, setOpenSources] = React.useState<Set<string>>(() => new Set());
  const toggleSource = (key: string) =>
    setOpenSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Quantos parâmetros DESTA fonte foram ajustados (0 = usando o padrão da fonte).
  const sourceAdjustments = (g: PerSourceGroup) =>
    g.fields.filter((f) => (fields[f.key] ?? '').trim()).length;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  const fieldCls =
    'h-9 px-2 bg-canvas-light border border-border-light text-[12px] outline-none focus:border-primary disabled:opacity-60';

  return (
    <div className="bg-canvas-light border-b border-border-light p-3">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-on-light"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('buscar.input.placeholder')}
            data-testid="buscar-input-principal"
            disabled={disabled}
            className="w-full h-10 pl-10 pr-3 bg-canvas-light border border-border-light text-[13px] outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !query.trim() || totalSelecionado === 0}
          data-testid="buscar-submit"
          className="h-10 px-4 text-[12px] font-semibold bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Search className="w-4 h-4" strokeWidth={1.5} />
          {t('buscar.input.submit')}
          {totalSelecionado > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-white/20 border border-white/30">
              {totalSelecionado}
            </span>
          )}
        </button>
        {onDossier && (
          <button
            type="button"
            onClick={onDossier}
            disabled={disabled || dossierLoading || !query.trim()}
            data-testid="buscar-montar-dossie"
            title={t('buscar.input.dossie.title')}
            className="h-10 px-4 text-[12px] font-semibold bg-canvas-light text-text-on-light border border-primary hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {dossierLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <FileSearch className="w-4 h-4" strokeWidth={1.5} />
            )}
            {dossierLoading ? t('buscar.input.dossie.loading') : t('buscar.input.dossie.cta')}
          </button>
        )}
      </div>

      {/* Busca avançada — desambiguadores que viram filtro preciso nas fontes */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setAdvOpen((v) => !v)}
          data-testid="buscar-avancada-toggle"
          className="flex items-center gap-1.5 text-[11px] text-muted-on-light hover:text-text-on-light"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t('buscar.input.avancada.toggle')}
          {filled > 0 && (
            <span className="px-1 py-0.5 text-[9px] font-mono bg-primary/10 text-primary border border-primary/30">
              {filled}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${advOpen ? 'rotate-180' : ''}`}
            strokeWidth={1.5}
          />
        </button>

        {advOpen && (
          <>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="buscar-avancada-campos">
            {/* MODULAR: 1 campo por refiner do union das fontes selecionadas. */}
            {refiners.length === 0 ? (
              <p className="sm:col-span-3 text-[10px] text-muted-on-light italic">
                {t('buscar.input.avancada.empty')}
              </p>
            ) : (
              refiners.map((r) => (
                // MODULAR: máscara + validador (DV) + placeholder derivados do KIND
                // (fieldKind(r) → fieldUIForKind). Emite SEMPRE o valor canônico.
                <MaskedField
                  key={r}
                  kind={fieldKind(r)}
                  name={r}
                  label={refinerLabel(r)}
                  value={fields[r] ?? ''}
                  placeholder={refinerExamples?.[r]}
                  onChange={(v) => setField(r, v)}
                  disabled={disabled}
                />
              ))
            )}
            <SelectField
              name="finalidade"
              value={purpose}
              onChange={(v) => setAdvanced({ purpose: v })}
              options={purposes}
              disabled={disabled}
              emptyLabel={t('buscar.input.finalidade.select')}
              label={
                <span className="flex items-center gap-1">
                  {t('buscar.input.finalidade.label')}{' '}
                  <span className="text-muted-on-light/70">
                    {t('buscar.input.finalidade.hint')}
                  </span>
                  <span
                    className="inline-flex cursor-help"
                    title={t('buscar.input.finalidade.tooltip')}
                    aria-label={t('buscar.input.finalidade.aria')}
                  >
                    <Info
                      className="w-3 h-3 text-muted-on-light"
                      strokeWidth={1.5}
                    />
                  </span>
                </span>
              }
            />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('buscar.input.caso.label')} <span className="text-muted-on-light/70">{t('buscar.input.caso.optional')}</span>
              </span>
              <input
                type="text"
                value={caseId}
                onChange={(e) => setAdvanced({ caseId: e.target.value })}
                placeholder={t('buscar.input.caso.placeholder')}
                data-testid="buscar-campo-caso"
                disabled={disabled}
                className={fieldCls}
              />
            </label>
          </div>

          {/* PARÂMETROS DA FONTE (FE-B): ui_fields agrupados por fonte. NÃO
              colapsa entre fontes (sites do maigret ≠ sherlock). Cada campo
              escolhe o componente por ui.kind; o multiselect respeita o gate
              NSFW do toggle irmão da MESMA fonte. */}
          {groups.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-light" data-testid="buscar-fonte-params">
              <div className="flex items-baseline gap-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
                  {t('buscar.fonte.params')}
                </p>
                <span className="text-[10px] text-muted-on-light/70">
                  {t('buscar.fonte.params.hint')}
                </span>
              </div>
              {/* Lista COLAPSÁVEL por fonte, com scroll próprio (não estoura a
                  página). Cada fonte começa fechada mostrando só o resumo. */}
              <div className="mt-2 max-h-[42vh] overflow-y-auto scrollbar-hide space-y-1.5">
                {groups.map((g) => {
                  const isOpen = openSources.has(g.sourceKey);
                  const adj = sourceAdjustments(g);
                  const nsfwOn = isNsfwOn(fields, g.toolBase);
                  return (
                    <div
                      key={g.sourceKey}
                      data-testid={`buscar-fonte-grupo-${g.sourceKey}`}
                      className="border border-border-light bg-canvas-light"
                    >
                      {/* cabeçalho: label + chip de resumo (Padrão / N ajustes) */}
                      <button
                        type="button"
                        onClick={() => toggleSource(g.sourceKey)}
                        data-testid={`buscar-fonte-toggle-${g.sourceKey}`}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-primary/5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ChevronDown
                            className={`w-3.5 h-3.5 shrink-0 text-muted-on-light transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            strokeWidth={1.5}
                          />
                          <span className="truncate text-[11px] font-semibold text-text-on-light">
                            {g.sourceLabel}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 border px-1.5 py-0.5 text-[9px] ${
                            adj > 0
                              ? 'border-primary/30 bg-primary/10 text-primary font-mono'
                              : 'border-border-light text-muted-on-light'
                          }`}
                        >
                          {adj > 0
                            ? t('buscar.fonte.ajustes').replace('{n}', String(adj))
                            : t('buscar.fonte.padrao')}
                        </span>
                      </button>
                      {/* corpo: campos da fonte — só quando aberta */}
                      {isOpen && (
                        <div className="grid grid-cols-1 gap-2 border-t border-border-light p-2 sm:grid-cols-2">
                          {g.fields.map((f) => {
                            // multiselect só vê NSFW quando o toggle nsfw da MESMA
                            // fonte está ligado (gate nsfwGated do catálogo).
                            const includeNsfw = f.ui.kind === 'multiselect' ? nsfwOn : undefined;
                            return (
                              <MaskedField
                                key={f.key}
                                kind={f.ui.kind}
                                name={f.key}
                                label={f.ui.labelKey ? t(f.ui.labelKey) : refinerLabel(f.propKey)}
                                value={fields[f.key] ?? ''}
                                onChange={(v) => setField(f.key, v)}
                                catalog={f.catalog}
                                includeNsfw={includeNsfw}
                                labelKey={f.ui.labelKey}
                                min={f.ui.min}
                                max={f.ui.max}
                                step={f.ui.step}
                                unitKey={f.ui.unitKey}
                                options={f.ui.options}
                                disabled={disabled}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
