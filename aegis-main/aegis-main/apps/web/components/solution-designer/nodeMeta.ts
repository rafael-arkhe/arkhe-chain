/**
 * Solution Diagram — node/phase metadata (M4 #9).
 *
 * Maps internal node ``kind``/``phase`` identifiers to pt-BR display labels.
 * The canvas, palette and inspector NEVER render a raw ``kind``/``type``
 * (memory rule `feedback_widget_type_never_raw_in_ui`): always go through
 * ``kindLabel()`` / ``PHASE_META``.
 */

export type Phase = 'coleta' | 'processamento' | 'ontologia' | 'aplicacao';

export const PHASE_ORDER: Phase[] = [
  'coleta',
  'processamento',
  'ontologia',
  'aplicacao',
];

export const PHASE_META: Record<Phase, { label: string; tone: string }> = {
  coleta: { label: 'Coleta de dados', tone: 'text-blue-700' },
  processamento: { label: 'Processamento', tone: 'text-violet-700' },
  ontologia: { label: 'Ontologia', tone: 'text-success' },
  aplicacao: { label: 'Construção da aplicação', tone: 'text-warning' },
};

/** Display label + icon hint per node kind. */
const KIND_META: Record<string, { label: string; category: Phase }> = {
  concept: { label: 'Conceito', category: 'coleta' },
  external: { label: 'Sistema externo', category: 'coleta' },
  connector: { label: 'Conector de dados', category: 'coleta' },
  worker: { label: 'Worker de coleta', category: 'coleta' },
  dataset: { label: 'Dataset', category: 'coleta' },
  pipeline: { label: 'Pipeline de transformação', category: 'processamento' },
  logic: { label: 'Função de IA', category: 'processamento' },
  ontology_type: { label: 'Tipo de objeto', category: 'ontologia' },
  workspace: { label: 'Painel (Sala)', category: 'aplicacao' },
  tour: { label: 'Tour guiado', category: 'aplicacao' },
};

export function kindLabel(kind: string): string {
  return KIND_META[kind]?.label ?? 'Componente';
}

/**
 * Caption (linha superior) do nó no canvas, SEM repetir o nome da fase quando o
 * título do nó JÁ é o nome da fase (ex.: nó "Coleta de dados" na fase "Coleta de
 * dados" mostrava "COLETA DE DADOS · CONCEITO" + título "Coleta de dados"). Puro
 * (i18n entra via os rótulos) — testável.
 */
export function nodeCaption(opts: {
  objectType?: boolean;
  isConcept?: boolean;
  title?: string;
  phaseLabel: string;
  conceptLabel: string;
  objectTypeLabel: string;
}): string {
  if (opts.objectType) return opts.objectTypeLabel;
  if (!opts.isConcept) return opts.phaseLabel;
  const same = (opts.title || '').trim().toLowerCase() === opts.phaseLabel.trim().toLowerCase();
  // título == fase → mostra só "Conceito" (a fase já aparece no título + na cor).
  return same ? opts.conceptLabel : `${opts.phaseLabel} · ${opts.conceptLabel}`;
}

/**
 * Humaniza um `kind`/slug de TIPO DE OBJETO (snake_case → Título) p/ usar como
 * FALLBACK quando o blueprint/ontologia não trouxe `display_name`. Evita expor o
 * identificador técnico cru (ex.: "produto_final" → "Produto Final", "person" →
 * "Person"). Nunca retorna vazio.
 */
export function humanizeKind(kind: string): string {
  const k = (kind || '').trim();
  if (!k) return '';
  return k
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Short helper-text dictionary key per node kind (#18). The palette renders
 * this as a compact subtitle so operators understand what each component does
 * without exposing the raw ``kind``. Resolved via ``useT()`` at the display
 * layer (pt-BR default + en-US peer live in ``lib/i18n/dict.ts``).
 */
const KIND_HINT_KEY: Record<string, string> = {
  external: 'solutions.hint.external',
  connector: 'solutions.hint.connector',
  worker: 'solutions.hint.worker',
  dataset: 'solutions.hint.dataset',
  pipeline: 'solutions.hint.pipeline',
  logic: 'solutions.hint.logic',
  ontology_type: 'solutions.hint.ontology_type',
  workspace: 'solutions.hint.workspace',
  tour: 'solutions.hint.tour',
};

/**
 * Returns the i18n key for a node kind's short hint, or ``null`` when the kind
 * has no dedicated hint (caller simply omits the subtitle).
 */
export function kindHintKey(kind: string): string | null {
  return KIND_HINT_KEY[kind] ?? null;
}

/**
 * Component information per node kind (Foundry node control #3: About /
 * Documentation / Example). Rendered inline in the inspector. Kept pt-BR and
 * jargon-free — never surfaces the raw ``kind``.
 */
export type ComponentInfo = {
  about: string;
  documentation: string;
  example: string;
};

const COMPONENT_INFO: Record<string, ComponentInfo> = {
  concept: {
    about: 'Etapa conceitual do fluxo. Selecione uma implementação para detalhá-la.',
    documentation: 'Cada fase agrupa os componentes daquela etapa da operação.',
    example: 'Coleta → Processamento → Ontologia → Construção da aplicação.',
  },
  external: {
    about: 'Sistema de origem externo que fornece os dados brutos.',
    documentation: 'Representa uma API, banco ou serviço fora da plataforma.',
    example: 'API de uma corregedoria, feed de uma rede social, banco legado.',
  },
  connector: {
    about: 'Conector gerenciado que ingere dados em intervalos agendados.',
    documentation: 'Baixa código: configure origem e frequência sem programar.',
    example: 'Coletar mensagens de um canal a cada hora.',
  },
  worker: {
    about: 'Worker dedicado de coleta com fila própria.',
    documentation: 'Pro-código: scraper/worker para fontes que exigem lógica.',
    example: 'Worker que percorre páginas e enfileira itens novos.',
  },
  dataset: {
    about: 'Conjunto de dados resultante de uma etapa.',
    documentation: 'Camada bruta (raw) ou curada (clean) do pipeline.',
    example: 'Dataset bruto de ocorrências; dataset limpo após triagem.',
  },
  pipeline: {
    about: 'Pipeline de transformação e enriquecimento dos dados.',
    documentation: 'Limpa, normaliza e enriquece antes de modelar.',
    example: 'Deduplicação + geocodificação de endereços.',
  },
  logic: {
    about: 'Função de IA que classifica, resume ou correlaciona.',
    documentation: 'Recebe entrada e devolve um resultado estruturado.',
    example: 'Triagem por severidade; resumo executivo em 3 pontos.',
  },
  ontology_type: {
    about: 'Tipo de objeto da ontologia (entidade do domínio).',
    documentation: 'Define propriedades e vínculos da entidade modelada.',
    example: 'Pessoa, Veículo, Ocorrência, Local.',
  },
  workspace: {
    about: 'Painel (Sala) entregue ao operador.',
    documentation: 'Superfície final com widgets de situação.',
    example: 'Sala de situação com indicadores e lista de objetos.',
  },
  tour: {
    about: 'Plano guiado passo a passo da operação.',
    documentation: 'Reutiliza o sistema de Tour para orientar a construção.',
    example: 'Roteiro Próximo/Anterior cobrindo cada fase.',
  },
};

export function componentInfo(kind: string): ComponentInfo {
  return (
    COMPONENT_INFO[kind] ?? {
      about: 'Componente da operação.',
      documentation: 'Sem documentação específica para este componente.',
      example: 'Conecte-o a outros nós do diagrama.',
    }
  );
}

/** Components grouped by phase for the Node Toolbar palette. */
export const PALETTE: Array<{ phase: Phase; kinds: string[] }> = [
  { phase: 'coleta', kinds: ['external', 'connector', 'worker', 'dataset'] },
  { phase: 'processamento', kinds: ['pipeline', 'logic'] },
  { phase: 'ontologia', kinds: ['ontology_type'] },
  { phase: 'aplicacao', kinds: ['workspace', 'tour'] },
];
