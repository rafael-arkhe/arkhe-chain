'use client';

/**
 * DynamicRefSelect — dropdown que carrega opções do backend de forma lazy.
 *
 * Mapa FONTE→LOADER (`SOURCE_LOADERS`): cada dynamic_source do SkillParam tem
 * um loader; fonte nova = UMA entrada no mapa, sem reescrever o componente.
 *   'object_types' → Ontology.listNodeTypes()
 *   'properties'   → Ontology.objectTypeSchema(dependsOnValue).properties[].key
 *   'sources'      → Sources.list()
 *   'datasets'     → Datasets.list()
 *   'markings'     → Markings.list()
 *   'projects'     → Projects.list()
 *   'cameras'      → Cctv.streams.list() (Tarefa B — label = nome; value = id)
 *
 * Falha de rede: fallback HONESTO — input livre com hint (nunca fingir lista
 * vazia); o valor digitado segue fluindo pro onChange.
 *
 * Estética: sharp, sem emoji, sem rounded-*, strings via useT().
 */
import * as React from 'react';

import { useT } from '@/lib/i18n/provider';
import {
  Ontology,
  Sources,
  Datasets,
  Markings,
  Projects,
  MediaSets,
  type SkillParam,
} from '@/lib/api';
import { Cctv } from '@/lib/api/cctv';
import {
  useProposedTypes,
  mergeObjectTypeOptions,
} from '@/components/solution-designer/proposed-types-context';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';

interface Option {
  value: string;
  label: string;
  proposed?: boolean;
  /** Contexto por opção (modo `rich`): nº de instâncias do tipo, type da
   *  propriedade, etc. — renderizado como hint mono no SearchableSelect. */
  hint?: string;
}

const INP =
  'h-7 w-full px-2 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none';

interface LoaderCtx {
  dependsOnValue?: string;
  instancesLabel: string;
}

// Mapa FONTE→LOADER — fontes futuras entram com UMA entrada aqui (regra do
// produto: nunca input técnico manual; sempre seletor populado). O Record
// tipado pelo union do SkillParam força loader p/ toda fonte declarada.
const SOURCE_LOADERS: Record<
  NonNullable<SkillParam['dynamic_source']>,
  (ctx: LoaderCtx) => Promise<Option[]>
> = {
  object_types: async ({ instancesLabel }) => {
    const rows = await Ontology.listNodeTypes();
    return rows.map((r) => ({
      value: r.name,
      label: r.label || r.name,
      hint: r.count > 0 ? `${r.count} ${instancesLabel}` : undefined,
    }));
  },
  properties: async ({ dependsOnValue }) => {
    if (!dependsOnValue) return [];
    const schema = await Ontology.objectTypeSchema(dependsOnValue);
    return schema.properties.map((p) => ({
      value: p.key,
      label: p.label || p.key,
      hint: p.type || undefined, // tipo da propriedade (string/number/date…)
    }));
  },
  sources: async () => {
    const list = await Sources.list();
    return list.map((s) => ({ value: s.id, label: s.name || s.id }));
  },
  datasets: async () => {
    const list = await Datasets.list();
    return list.map((d) => ({ value: d.name, label: d.name }));
  },
  markings: async () => {
    const list = await Markings.list();
    return list.map((m) => ({ value: m.slug, label: m.display_name }));
  },
  projects: async () => {
    const list = await Projects.list();
    return list.map((p) => ({ value: p.id, label: p.display_name }));
  },
  // Tarefa B — câmeras do tenant: label = nome cadastrado; VALUE = id do
  // stream (o que a skill camera.stream resolve primeiro).
  cameras: async () => {
    const list = await Cctv.streams.list();
    return list.map((s) => ({ value: s.id, label: s.name || s.id, hint: s.city || undefined }));
  },
  // Tarefa A — classes válidas do detector ativo (COCO-80 do RF-DETR). Com
  // multi=true o SchemaForm renderiza CHIPS (DetectorClassChips); esta
  // entrada cobre o caso single-select (param futuro sem multi) e mantém o
  // Record exaustivo. label = pt-BR humano; VALUE = name canônico do modelo.
  detector_classes: async () => {
    const { classes } = await Cctv.detector.classes();
    return classes.map((c) => ({ value: c.name, label: c.label, hint: c.name }));
  },
  // Onda 3 — conjuntos de mídia do tenant: label = nome de exibição; VALUE =
  // slug (o que o motor de arquivo resolve). hint = tipo + nº de itens.
  media_sets: async ({ instancesLabel }) => {
    const list = await MediaSets.list();
    return list.map((s) => ({
      value: s.slug,
      label: s.display_name || s.slug,
      hint: s.item_count > 0 ? `${s.item_count} ${instancesLabel}` : s.media_type,
    }));
  },
};

async function loadOptions(
  source: NonNullable<SkillParam['dynamic_source']>,
  dependsOnValue: string | undefined,
  instancesLabel: string,
): Promise<Option[]> {
  // fonte que o backend declara mas esta versão da UI ainda não conhece →
  // lista vazia (o select mostra "nenhum encontrado"), nunca crash.
  const loader = (SOURCE_LOADERS as Record<string, ((ctx: LoaderCtx) => Promise<Option[]>) | undefined>)[source];
  if (!loader) return [];
  return loader({ dependsOnValue, instancesLabel });
}

export function DynamicRefSelect({
  source,
  dependsOnValue,
  value,
  onChange,
  testid,
  rich,
  placeholder,
}: {
  source: NonNullable<SkillParam['dynamic_source']>;
  dependsOnValue?: string;
  value: string;
  onChange: (v: string) => void;
  testid?: string;
  /** Modo RICO: combobox com busca + contexto por opção (count/tipo). Opt-in
   *  p/ não mexer nos usos simples que esperam o `<select>` nativo. */
  rich?: boolean;
  /** Placeholder do INPUT LIVRE de fallback (backend fora) — tipicamente o
   *  placeholder declarado no próprio param_schema. */
  placeholder?: string;
}) {
  const t = useT();
  const [options, setOptions] = React.useState<Option[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  // Fallback honesto: o loader FALHOU e não há opções de reserva → input
  // livre com hint (nunca fingir "lista vazia" quando o backend está fora).
  const [failed, setFailed] = React.useState(false);
  // F1 — tipos PROPOSTOS pelo AIP neste build (do blueprint embutido). Mesclados
  // no select de 'object_types' p/ o operador ver o que o AIP acabou de propor.
  const proposed = useProposedTypes();
  const proposedKey = proposed.map((p) => p.kind).join('|');

  // Properties source: blocked until dependsOnValue is set.
  const blockedByDep = source === 'properties' && !dependsOnValue;

  React.useEffect(() => {
    if (blockedByDep) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    // #2 — propriedades do tipo PROPOSTO (do blueprint), independem da rede. O schema
    // VIVO vem vazio/404 p/ tipo ainda-não-materializado; sem isto, "Propriedade de
    // saída" ficava SEMPRE vazia num build novo (o operador "nunca via popular").
    const proposedProps: Option[] =
      source === 'properties' && dependsOnValue
        ? (proposed.find((p) => p.kind === dependsOnValue)?.properties ?? [])
            .filter((pp) => pp.key)
            .map((pp) => ({ value: pp.key, label: pp.label || pp.key, hint: t('schemaForm.proposedSuffix') }))
        : [];
    void loadOptions(source, dependsOnValue, t('solutions.instancesShort'))
      .then((opts) => {
        if (source === 'object_types') {
          setOptions(mergeObjectTypeOptions(opts, proposed, t('schemaForm.proposedSuffix')));
        } else if (source === 'properties') {
          const have = new Set(opts.map((o) => o.value));
          setOptions([...opts, ...proposedProps.filter((o) => !have.has(o.value))]);
        } else {
          setOptions(opts);
        }
      })
      // schema vivo falhou (404 em tipo proposto) → ainda mostra as propriedades
      // propostas; SEM reserva nenhuma, degrada honesto pra input livre + hint.
      .catch(() => {
        setOptions(proposedProps);
        if (proposedProps.length === 0) setFailed(true);
      })
      .finally(() => setLoading(false));
    // proposedKey: re-mescla quando os tipos propostos mudam (novo blueprint).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, dependsOnValue, blockedByDep, proposedKey]);

  // Fallback HONESTO (ambos os modos): backend fora → input livre + hint.
  // O valor digitado segue fluindo (id/URL/nome — quem resolve é o backend).
  if (failed) {
    return (
      <div className="space-y-0.5">
        <input
          type="text"
          value={value}
          placeholder={placeholder || ''}
          onChange={(e) => onChange(e.target.value)}
          className={INP}
          data-testid={testid}
        />
        <p
          className="text-[10px] text-muted-on-light"
          data-testid={testid ? `${testid}-hint` : undefined}
        >
          {t('schemaForm.refUnavailable')}
        </p>
      </div>
    );
  }

  // Modo RICO — SearchableSelect (busca + hint por opção). Estados desabilitados
  // (sem dependência / carregando) viram placeholder no próprio combobox.
  if (rich) {
    const disabledMsg = blockedByDep
      ? t('schemaForm.selectFirst')
      : loading || options === null
      ? t('schemaForm.loading')
      : null;
    const sel: SelectOption[] = (options || []).map((o) => ({
      value: o.value,
      label: o.label,
      hint: o.hint,
    }));
    return (
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={disabledMsg ? [] : sel}
        disabled={!!disabledMsg}
        placeholder={disabledMsg || '—'}
        emptyLabel={t('schemaForm.empty')}
        searchPlaceholder={t('solutions.searchOption')}
        data-testid={testid}
      />
    );
  }

  if (blockedByDep) {
    return (
      <select disabled className={INP} data-testid={testid}>
        <option>{t('schemaForm.selectFirst')}</option>
      </select>
    );
  }

  if (loading || options === null) {
    return (
      <select disabled className={INP} data-testid={testid}>
        <option>{t('schemaForm.loading')}</option>
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INP}
      data-testid={testid}
    >
      <option value="">—</option>
      {options.length === 0 ? (
        <option disabled value="">
          {t('schemaForm.empty')}
        </option>
      ) : (
        options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))
      )}
    </select>
  );
}
