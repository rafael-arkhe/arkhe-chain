'use client';

/**
 * ConnectDataSection — "#1 (feedback do operador): nós de Coleta ACIONÁVEIS".
 *
 * O AIP Arquiteto propõe fontes/conectores/datasets no diagrama, mas até aqui
 * clicar num nó de Coleta não levava a NADA acionável — o operador ficava
 * perdido ("de onde vem a ingestão? posso linkar algo pronto? posso subir um
 * dataset pequeno?"). Esta seção (renderizada no NodeInspector quando
 * ``phase === 'coleta'``) dá os 3 caminhos concretos:
 *
 *   1. VINCULAR EXISTENTE — dropdown populado com as fontes de dados,
 *      conectores e datasets do tenant (nunca input técnico manual). A escolha
 *      grava ``config.linked_source`` no nó → o canvas mostra "Conectado".
 *   2. CRIAR AGORA — deep-links contextuais pras abas do Hub Dados
 *      (?aba=conexoes|datasets|arquivos).
 *   3. SUBIR ARQUIVO PEQUENO — CSV/JSON/texto até 2 MB direto no inspector →
 *      POST /ingest/event (caminho GOVERNADO: DataSource → DataAsset com hash
 *      → LineageEvent) → o nó é vinculado na hora.
 *
 * Fail-soft por grupo: sem permissão numa lista (403), o grupo simplesmente
 * não aparece — os outros caminhos continuam.
 */
import * as React from 'react';
import { Loader2, DatabaseZap, Link2, Upload, CheckCircle2, X, Search, Power, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InfoTip } from '@/components/ui/info-tip';
import { SchemaForm } from '@/components/ui/schema-form';
import { useProposedTypes } from '@/components/solution-designer/proposed-types-context';
import { producedTypes, withProducedTypes } from '@/components/solution-designer/produced-types';
import {
  readColetaSkills,
  writeColetaSkillsConfig,
  addColetaSkill,
  removeColetaSkill,
  setColetaSkillParam,
  type ColetaSkill,
} from '@/components/solution-designer/coleta-skills';
import { useSkillSample } from '@/components/solution-designer/use-skill-sample';
import { useSetSample } from '@/components/solution-designer/sample-context';
import {
  Sources,
  Datasets,
  Connectors,
  Ingest,
  Skills,
  type SkillParam,
  type SkillCatalogRow,
  type SolutionNode,
} from '@/lib/api';

/** A skill que o AIP propôs para ESTA coleta (do blueprint). */
export interface ProposedColetaSkill {
  skill_key: string;
  label: string;
  platforms: string[];
  ready: boolean;
}

/**
 * Vínculo gravado em ``config.linked_sources`` (escala pro canvas + save).
 *
 * B (#1): além da ORIGEM (kind/id/label), o vínculo carrega a ROTA — para qual
 * Tipo de objeto (``target_node_type``) ele alimenta + o mapa mínimo de campos
 * (qual coluna é o id / o nome). Campos vazios = vínculo só de proveniência.
 */
export interface LinkedSource {
  kind: 'fonte' | 'conector' | 'dataset';
  id: string;
  label: string;
  /** Tipo de objeto (node_type) de destino PRIMÁRIO — 1º de `target_node_types`,
   *  mantido p/ retrocompat (mapa de campos id/nome + backend legado). */
  target_node_type?: string;
  /** Tipos de objeto que esta fonte produz (Instagram → Perfil + Post). O nó
   *  Coleta NÃO é limitado a 1 tipo; o conector/skill pode emitir vários. */
  target_node_types?: string[];
  /** Coluna da fonte que é o identificador do objeto. */
  id_field?: string;
  /** Coluna da fonte que vira o nome do objeto. */
  name_field?: string;
}

function _str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function _validSource(raw: unknown): LinkedSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    (o.kind === 'fonte' || o.kind === 'conector' || o.kind === 'dataset') &&
    typeof o.id === 'string' &&
    typeof o.label === 'string'
  ) {
    const list = Array.isArray(o.target_node_types)
      ? (o.target_node_types as unknown[]).filter(
          (x): x is string => typeof x === 'string' && !!x,
        )
      : undefined;
    return {
      kind: o.kind,
      id: o.id,
      label: o.label,
      target_node_type: _str(o.target_node_type),
      target_node_types: list && list.length ? list : undefined,
      id_field: _str(o.id_field),
      name_field: _str(o.name_field),
    };
  }
  return null;
}

/** Lê ``config.linked_source`` (LEGADO, singular) defensivamente. */
export function readLinkedSource(
  config: Record<string, unknown> | undefined,
): LinkedSource | null {
  return _validSource(config?.linked_source);
}

/**
 * P2 (2026-06-05) — múltiplas fontes por nó: lê ``config.linked_sources``
 * (array). MIGRAÇÃO DEFENSIVA: diagramas salvos antes do P2 carregam o
 * ``linked_source`` singular — embrulha em array de 1 (nunca perde vínculo).
 */
export function readLinkedSources(
  config: Record<string, unknown> | undefined,
): LinkedSource[] {
  const raw = config?.linked_sources;
  if (Array.isArray(raw)) {
    return raw.map(_validSource).filter((s): s is LinkedSource => s !== null);
  }
  const legacy = readLinkedSource(config);
  return legacy ? [legacy] : [];
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB — "dataset pequeno"

/** CSV simples → linhas de objetos (header na 1ª linha, vírgula). Suficiente
 *  pro caso "subir uma planilha pequena agora"; arquivos complexos vão pelo
 *  Hub Dados. */
export function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

/** Slug curto pro source_name a partir do título do nó. */
function sourceSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'coleta'
  );
}

interface PickOption {
  kind: LinkedSource['kind'];
  id: string;
  label: string;
}

/**
 * Higieniza um rótulo de capacidade vindo do backend: remove DEFENSIVAMENTE
 * qualquer sufixo entre parênteses que cite mecanismo interno (agente, sessão,
 * gateway, openclaw, servidor). A UI do operador NUNCA expõe jargão de
 * implementação — mesmo que o backend escorregue, limpamos no display.
 */
export function cleanSkillLabel(label: string): string {
  return (label || '')
    .replace(/\s*\((?:agente|sessão|sessao|gateway|openclaw|servidor)[^)]*\)\s*$/i, '')
    .trim();
}

/**
 * Mapeia category/source da row do catálogo → chave de categoria LIMPA
 * (resolvida no display via i18n). Horizontal: nenhum gate por domínio.
 */
export function coletaCategoryKey(row: { category?: string; source?: string }): string {
  if (row.source === 'clawhub') return 'social';
  switch ((row.category || '').toLowerCase()) {
    case 'social':
      return 'social';
    case 'ingestion':
      return 'ingestion';
    case 'vision':
      return 'vision';
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'ocr':
      return 'ocr';
    case 'compose':
    case 'aip':
      return 'compose';
    default:
      return 'other';
  }
}

/** Ordem estável das categorias no catálogo (intenção → técnico). */
const COLETA_CATEGORY_ORDER = [
  'social',
  'ingestion',
  'vision',
  'audio',
  'image',
  'ocr',
  'compose',
  'other',
] as const;

/** Uma capacidade higienizada, pronta p/ render no catálogo. */
interface ColetaCapability {
  skill_key: string;
  label: string; // já higienizado
  description: string;
  categoryKey: string;
  /** clawhub = requer ativação; native = pronto. */
  ready: boolean;
  platforms: string[];
  param_schema: SkillParam[];
}

function toCapability(row: SkillCatalogRow): ColetaCapability {
  return {
    skill_key: row.skill_key,
    label: cleanSkillLabel(row.label) || row.skill_key,
    description: row.description || '',
    categoryKey: coletaCategoryKey(row),
    ready: row.source !== 'clawhub',
    platforms: row.platforms || [],
    param_schema: row.param_schema || [],
  };
}

export function ConnectDataSection({
  node,
  onPatchNode,
  objectTypes = [],
  proposedSkill,
}: {
  node: SolutionNode;
  onPatchNode: (id: string, patch: Partial<SolutionNode>) => void;
  /** B (#1) — Tipos de objeto disponíveis p/ a Saída (da ontologia do blueprint;
   *  nunca input técnico livre). Cada um {kind: node_type, label: humano}. */
  objectTypes?: { kind: string; label: string }[];
  /** A skill que o AIP propôs p/ esta coleta — o nó LIDERA com ela + os params. */
  proposedSkill?: ProposedColetaSkill | null;
}) {
  const t = useT();
  // F2 — quais tipos da Saída foram PROPOSTOS pelo AIP neste build (p/ badge no select).
  const proposedTypes = useProposedTypes();
  const proposedKinds = React.useMemo(
    () => new Set(proposedTypes.map((p) => p.kind)),
    [proposedTypes],
  );
  // Fonte de coleta — CATÁLOGO de capacidades estilo Foundry: TODAS as
  // capacidades (horizontal, sem gate por domínio), agrupadas por categoria,
  // buscáveis. O operador navega/escolhe a que serve à operação; a sugestão do
  // AIP é só um destaque pré-selecionado, nunca uma trava. As capacidades
  // escolhidas são persistidas em node.config.coleta_skills[] (N por nó).
  const cfg = (node.config || {}) as Record<string, unknown>;
  // N-skills (2026-06-08): o nó de Coleta tem uma LISTA de skills (cada uma →
  // seu worker na materialização). Lê coleta_skills[] com retrocompat ao
  // singular coleta_skill_key/coleta_params.
  const persistedSkills = readColetaSkills(cfg);
  // Candidatas exibidas no FORM: as persistidas; se nada persistido, a sugerida
  // do AIP (soft — só persiste ao interagir). proposedSkill nunca é trava.
  const focusCandidates: ColetaSkill[] =
    persistedSkills.length > 0
      ? persistedSkills
      : proposedSkill?.skill_key
        ? [{ skill_key: proposedSkill.skill_key, params: {} }]
        : [];

  const [catalog, setCatalog] = React.useState<ColetaCapability[] | null>(null);
  const [search, setSearch] = React.useState('');
  // Categorias colapsáveis — fechadas por padrão, mas a da seleção abre.
  const [openCats, setOpenCats] = React.useState<Record<string, boolean>>({});
  const [activating, setActivating] = React.useState(false);
  const [activatedKeys, setActivatedKeys] = React.useState<Set<string>>(new Set());
  // Qual skill da lista tem o form de parâmetros aberto.
  const [focusKey, setFocusKey] = React.useState('');
  // "Outras fontes" abre por padrão no uso STANDALONE (sem capacidade de coleta
  // selecionada nem sugerida pelo AIP) — aí ela é o caminho principal. Quando há
  // uma capacidade liderando, fica recolhida (secundária).
  const ledByCapability = focusCandidates.length > 0;
  const [advancedOpen, setAdvancedOpen] = React.useState(!ledByCapability);

  // Carrega o catálogo COMPLETO (native + clawhub) uma vez. Fail-soft.
  const loadCatalog = React.useCallback(async () => {
    try {
      const rows = await Skills.catalog();
      setCatalog(rows.map(toCapability));
    } catch {
      setCatalog([]);
    }
  }, []);
  React.useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  // Skill em FOCO (form aberto): a escolhida via chip/catálogo OU a 1ª candidata.
  const effectiveFocus = focusCandidates.some((s) => s.skill_key === focusKey)
    ? focusKey
    : focusCandidates[0]?.skill_key || '';
  const focusSkill = focusCandidates.find((s) => s.skill_key === effectiveFocus) || null;
  // Capacidade em foco (resolvida do catálogo) + seu param_schema.
  const focusCap = React.useMemo(
    () => (catalog || []).find((c) => c.skill_key === effectiveFocus) || null,
    [catalog, effectiveFocus],
  );
  // Pronta quando native, OU clawhub já ativada nesta sessão.
  const focusReady = focusCap
    ? focusCap.ready || activatedKeys.has(focusCap.skill_key)
    : false;

  // Abre a categoria da capacidade em foco (p/ o operador vê-la em contexto).
  React.useEffect(() => {
    if (focusCap) setOpenCats((m) => ({ ...m, [focusCap.categoryKey]: true }));
  }, [focusCap]);

  const writeSkills = (skills: ColetaSkill[]) => {
    onPatchNode(node.id, { config: writeColetaSkillsConfig(cfg, skills) });
  };
  // Base p/ mutações: persistidas OU as candidatas (inclui a sugerida soft), p/
  // não perder a sugestão do AIP ao adicionar a 2ª skill.
  const baseSkills = () => (persistedSkills.length > 0 ? persistedSkills : focusCandidates);

  // Selecionar uma capacidade ADICIONA (não substitui) + foca-a. Reescolher a
  // mesma é NOP (dedupe), só re-foca.
  const addSkill = (cap: ColetaCapability) => {
    writeSkills(addColetaSkill(baseSkills(), cap.skill_key));
    setFocusKey(cap.skill_key);
  };
  const removeSkill = (skillKey: string) => {
    writeSkills(removeColetaSkill(persistedSkills, skillKey));
  };
  // Editar param da skill em foco — persiste (inclui a sugerida soft, igual ao
  // comportamento antigo de gravar ao editar).
  const setSkillParam = (skillKey: string, paramKey: string, value: unknown) => {
    const withKey = addColetaSkill(baseSkills(), skillKey);
    writeSkills(setColetaSkillParam(withKey, skillKey, paramKey, value));
  };

  const activateSkill = React.useCallback(async () => {
    if (!focusCap || activating) return;
    setActivating(true);
    try {
      await Skills.installOpenclaw(focusCap.skill_key);
      setActivatedKeys((s) => new Set(s).add(focusCap.skill_key));
      await loadCatalog(); // re-busca: o param_schema (frontmatter) já disponível
    } catch { /* fail-soft */ } finally { setActivating(false); }
  }, [focusCap, activating, loadCatalog]);

  // #6 — amostra REAL da skill em foco ("rodar o nó" estilo N8N).
  const sample = useSkillSample();
  const setSample = useSetSample();
  const runSample = () => {
    if (!focusCap) return;
    void sample.run(focusCap.skill_key, focusSkill?.params || {});
  };
  const sampleState = sample.state;
  const sampleRecords = sample.records;
  const sampleNodeType = sample.nodeType;
  // Ao terminar, alimenta a IDE (chave por Tipo de objeto + '*' = última amostra).
  React.useEffect(() => {
    if (sampleState === 'done' && sampleRecords.length) {
      if (sampleNodeType) setSample(sampleNodeType, sampleRecords);
      setSample('*', sampleRecords);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleState, sampleNodeType]);

  // Filtro de busca (label/description/plataforma, case-insensitive) + grupos.
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = (catalog || []).filter((c) => {
      if (!q) return true;
      return (
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.platforms.some((p) => p.toLowerCase().includes(q))
      );
    });
    const byCat = new Map<string, ColetaCapability[]>();
    for (const c of items) {
      const arr = byCat.get(c.categoryKey) || [];
      arr.push(c);
      byCat.set(c.categoryKey, arr);
    }
    return COLETA_CATEGORY_ORDER.filter((k) => byCat.has(k)).map((k) => ({
      key: k,
      items: (byCat.get(k) || []).sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [catalog, search]);

  const [groups, setGroups] = React.useState<{
    fontes: PickOption[];
    conectores: PickOption[];
    datasets: PickOption[];
  } | null>(null);
  const [loadingLists, setLoadingLists] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadMsg, setUploadMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // B (#1) — colunas conhecidas por fonte (key `kind:id`), p/ popular os
  // seletores de campo (id/nome) SEM input técnico livre: headers do CSV subido
  // ou campos do binding de um conector.
  const [columnsBySource, setColumnsBySource] = React.useState<Record<string, string[]>>({});

  const linked = readLinkedSources(node.config);
  // #4 do review — ref sempre com a lista MAIS RECENTE, p/ o write pós-await do
  // prefill de conector mesclar contra o estado atual (e não um snapshot velho,
  // que apagaria um vínculo adicionado concorrentemente durante o fetch).
  const linkedRef = React.useRef(linked);
  linkedRef.current = linked;

  // Listas carregam lazy ao montar a seção (nó de Coleta selecionado).
  // Fail-soft POR GRUPO: 403/erro em uma lista não derruba as outras.
  React.useEffect(() => {
    let cancelled = false;
    setLoadingLists(true);
    void Promise.allSettled([
      Sources.list(),
      Connectors.list(),
      Datasets.list(),
    ]).then(([srcs, conns, dsets]) => {
      if (cancelled) return;
      setGroups({
        fontes:
          srcs.status === 'fulfilled'
            ? srcs.value.map((s) => ({ kind: 'fonte', id: s.id, label: s.name }))
            : [],
        conectores:
          conns.status === 'fulfilled'
            ? conns.value.map((c) => ({
                kind: 'conector',
                id: c.id,
                label: c.display_name || c.slug,
              }))
            : [],
        datasets:
          dsets.status === 'fulfilled'
            ? dsets.value.map((d) => ({
                kind: 'dataset',
                id: d.name,
                label: d.name,
              }))
            : [],
      });
      setLoadingLists(false);
    });
    return () => {
      cancelled = true;
    };
  }, [node.id]);

  // P2 — múltiplas fontes: APPEND com dedupe (kind:id). A escrita migra o
  // legado: grava ``linked_sources`` (array) e remove o ``linked_source``
  // singular pré-P2 (não deixa as duas chaves coexistirem no config).
  const writeSources = (sources: LinkedSource[]) => {
    const next = { ...(node.config || {}) } as Record<string, unknown>;
    delete next.linked_source;
    if (sources.length > 0) next.linked_sources = sources;
    else delete next.linked_sources;
    onPatchNode(node.id, { config: next });
  };

  const keyOf = (s: { kind: string; id: string }) => `${s.kind}:${s.id}`;

  const link = (sel: LinkedSource) => {
    if (linked.some((s) => s.kind === sel.kind && s.id === sel.id)) return; // dedupe
    writeSources([...linked, sel]);
  };

  const unlink = (sel: LinkedSource) => {
    writeSources(linked.filter((s) => !(s.kind === sel.kind && s.id === sel.id)));
  };

  // B (#1) — atualiza a ROTA de UM vínculo (Tipo de objeto destino + mapa de
  // campos). Patch parcial; remove a chave quando o valor esvazia.
  const setMapping = (sel: LinkedSource, patch: Partial<LinkedSource>) => {
    writeSources(
      linked.map((s) =>
        s.kind === sel.kind && s.id === sel.id
          ? {
              ...s,
              ...patch,
              ...(patch.target_node_type === '' ? { target_node_type: undefined } : {}),
              ...(patch.id_field === '' ? { id_field: undefined } : {}),
              ...(patch.name_field === '' ? { name_field: undefined } : {}),
            }
          : s,
      ),
    );
  };

  // N-tipos — adiciona/remove um Tipo produzido por ESTA fonte. Mantém o
  // singular `target_node_type` sincronizado ao 1º (retrocompat). O conector do
  // Instagram, p.ex., produz PerfilInstagram E PostInstagram.
  const addType = (sel: LinkedSource, kind: string) => {
    if (!kind) return;
    writeSources(
      linked.map((s) =>
        keyOf(s) === keyOf(sel)
          ? withProducedTypes(s, [...producedTypes(s), kind])
          : s,
      ),
    );
  };
  const removeType = (sel: LinkedSource, kind: string) => {
    writeSources(
      linked.map((s) =>
        keyOf(s) === keyOf(sel)
          ? withProducedTypes(
              s,
              producedTypes(s).filter((k) => k !== kind),
            )
          : s,
      ),
    );
  };

  // Ao vincular um CONECTOR, herda o mapa já configurado na aba Conectores
  // (binding.config: node_type/id_field/name_field) — o vínculo só CONFIRMA o
  // destino, sem o operador redigitar nada. Vincula SÍNCRONO já (o chip aparece
  // na hora), depois mapeia de forma assíncrona sobre o array EXPLÍCITO ``base``
  // (não o ``linked`` do closure) — evita stale-closure. Fail-soft.
  async function linkConnectorWithBinding(sel: LinkedSource) {
    if (linked.some((s) => s.kind === sel.kind && s.id === sel.id)) return; // dedupe
    const base = [...linked, sel];
    writeSources(base);
    try {
      const binds = await Connectors.bindings(sel.id);
      const cfg = (binds.find((b) => b.active) || binds[0])?.config as
        | Record<string, unknown>
        | undefined;
      if (!cfg) return;
      const nt = typeof cfg.node_type === 'string' ? cfg.node_type : '';
      const idf = typeof cfg.id_field === 'string' ? cfg.id_field : '';
      const nf = typeof cfg.name_field === 'string' ? cfg.name_field : '';
      const cols = [idf, nf].filter(Boolean);
      if (cols.length) setColumnsBySource((m) => ({ ...m, [keyOf(sel)]: cols }));
      const patch: Partial<LinkedSource> = {
        ...(nt && objectTypes.some((o) => o.kind === nt) ? { target_node_type: nt } : {}),
        ...(idf ? { id_field: idf } : {}),
        ...(nf ? { name_field: nf } : {}),
      };
      if (Object.keys(patch).length) {
        // #4 — mescla contra o estado ATUAL (linkedRef), não o snapshot 'base':
        // preserva qualquer fonte adicionada durante o await.
        const cur = linkedRef.current.some((s) => keyOf(s) === keyOf(sel))
          ? linkedRef.current
          : base;
        writeSources(cur.map((s) => (keyOf(s) === keyOf(sel) ? { ...s, ...patch } : s)));
      }
    } catch {
      /* fail-soft: o operador escolhe o Tipo manualmente */
    }
  }

  const onPick = (value: string) => {
    if (!value || !groups) return;
    const [kind, ...rest] = value.split(':');
    const id = rest.join(':');
    const all = [...groups.fontes, ...groups.conectores, ...groups.datasets];
    const opt = all.find((o) => o.kind === kind && o.id === id);
    if (!opt) return;
    const sel: LinkedSource = { kind: opt.kind, id: opt.id, label: opt.label };
    if (sel.kind === 'conector') void linkConnectorWithBinding(sel);
    else link(sel);
  };

  async function uploadSmallFile(file: File) {
    setErr(null);
    setUploadMsg(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setErr(t('solutions.connectTooBig'));
      return;
    }
    setUploading(true);
    try {
      // File.text() com fallback FileReader (jsdom/browsers antigos).
      const text =
        typeof file.text === 'function'
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(String(r.result || ''));
              r.onerror = () => reject(r.error);
              r.readAsText(file);
            });
      const isCsv = /\.csv$/i.test(file.name);
      const isJson = /\.json$/i.test(file.name);
      let payload: Record<string, unknown>;
      let columns: string[] = [];
      if (isCsv) {
        const rows = parseCsvRows(text);
        columns = rows.length ? Object.keys(rows[0]) : [];
        payload = { filename: file.name, rows };
      } else if (isJson) {
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length && typeof data[0] === 'object' && data[0]) {
          columns = Object.keys(data[0] as Record<string, unknown>);
        }
        payload = { filename: file.name, data };
      } else {
        payload = { filename: file.name, text };
      }
      const sourceName = sourceSlug(node.title);
      // Caminho GOVERNADO: DataSource → DataAsset (hash) → LineageEvent.
      const res = await Ingest.event({
        source_name: sourceName,
        source_type: 'manual_upload',
        payload,
      });
      const sel: LinkedSource = { kind: 'fonte', id: sourceName, label: file.name };
      link(sel);
      // B (#1) — guarda as colunas do CSV/JSON p/ popular os seletores de campo
      // (id/nome) do mapeamento, sem o operador digitar nome de coluna.
      if (columns.length) setColumnsBySource((m) => ({ ...m, [keyOf(sel)]: columns }));
      setUploadMsg(
        `${t('solutions.connectUploadDone')} · ${res.asset_id.slice(0, 8)}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  // P2 — opções disponíveis = catálogo MENOS as já vinculadas (dedupe visível).
  const isLinked = (kind: LinkedSource['kind'], id: string) =>
    linked.some((s) => s.kind === kind && s.id === id);
  const avail = {
    fontes: (groups?.fontes ?? []).filter((o) => !isLinked(o.kind, o.id)),
    conectores: (groups?.conectores ?? []).filter((o) => !isLinked(o.kind, o.id)),
    datasets: (groups?.datasets ?? []).filter((o) => !isLinked(o.kind, o.id)),
  };
  const hasOptions =
    !!groups &&
    avail.fontes.length + avail.conectores.length + avail.datasets.length > 0;

  return (
    <div
      className="border-t border-border-light pt-3 space-y-2"
      data-testid="inspector-connect-data"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
        <DatabaseZap className="w-3 h-3" strokeWidth={1.5} />
        {t('solutions.connectData')}
      </p>

      {/* FONTE DE COLETA — CATÁLOGO de capacidades estilo Foundry: TODAS as
          capacidades disponíveis (horizontal, sem gate por domínio), agrupadas
          por categoria com cabeçalhos limpos, buscáveis. O operador navega/
          escolhe a que serve à operação. A sugestão do AIP aparece destacada no
          topo, pré-selecionada — mas é só um destaque, nunca uma trava. */}
      <div className="space-y-1.5" data-testid="coleta-catalog">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
          {t('solutions.coletaCatalogTitle')}
          <InfoTip text={t('solutions.coletaCatalogHint')} />
        </Label>

        {/* SUGESTÃO DO AIP — destaque no topo (pré-selecionada). */}
        {proposedSkill?.skill_key && (
          <div
            className="border border-primary/40 bg-primary/5 px-2 py-1.5 space-y-0.5"
            data-testid="coleta-suggested"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-text-on-light">
                {cleanSkillLabel(proposedSkill.label) || proposedSkill.label}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-primary/10 text-primary border-primary/40">
                {t('solutions.coletaSuggested')}
              </span>
              {persistedSkills.some((s) => s.skill_key === proposedSkill.skill_key) && (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-success/10 text-success border-success/30">
                  <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={1.5} /> {t('solutions.coletaSelected')}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Busca */}
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-on-light" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('solutions.coletaCatalogSearch')}
            data-testid="coleta-catalog-search"
            className="w-full h-7 pl-7 pr-2 text-[11.5px] bg-white border border-border-light focus:border-primary outline-none"
          />
        </div>

        {/* Lista por categoria (colapsável), scroll com barra escondida. */}
        {catalog === null ? (
          <div className="flex items-center gap-2 text-[10.5px] text-muted-on-light">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            {t('solutions.coletaCatalogLoading')}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[10px] text-muted-on-light italic" data-testid="coleta-catalog-empty">
            {t('solutions.coletaCatalogEmpty')}
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto scrollbar-hide border border-border-light divide-y divide-border-light">
            {filtered.map((grp) => {
              // #15 — categorias COLAPSADAS por default (menos carga cognitiva);
              // mas ABREM quando há busca ativa (senão os resultados ficariam
              // escondidos) e a categoria da skill em foco abre (effect focusCap).
              const open = openCats[grp.key] ?? !!search.trim();
              return (
                <div key={grp.key}>
                  <button
                    type="button"
                    onClick={() => setOpenCats((m) => ({ ...m, [grp.key]: !open }))}
                    data-testid={`coleta-cat-${grp.key}`}
                    className="w-full flex items-center gap-1 px-2 py-1 text-[9.5px] uppercase tracking-wider text-muted-on-light bg-panel-light hover:text-text-on-light"
                  >
                    {open ? <ChevronDown className="w-3 h-3" strokeWidth={1.5} /> : <ChevronRight className="w-3 h-3" strokeWidth={1.5} />}
                    {t(`solutions.coletaCat_${grp.key}`)}
                    <span className="ml-auto font-mono">{grp.items.length}</span>
                  </button>
                  {open &&
                    grp.items.map((cap) => {
                      const isAdded = persistedSkills.some((s) => s.skill_key === cap.skill_key);
                      const isFocus = cap.skill_key === effectiveFocus;
                      return (
                        <button
                          key={cap.skill_key}
                          type="button"
                          onClick={() => addSkill(cap)}
                          data-testid={`coleta-item-${cap.skill_key}`}
                          className={
                            'w-full text-left px-2 py-1.5 space-y-0.5 border-l-2 ' +
                            (isAdded || isFocus
                              ? 'border-l-primary bg-primary/5'
                              : 'border-l-transparent hover:bg-canvas-light')
                          }
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isAdded && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" strokeWidth={1.5} />}
                            <span className="text-[11px] text-text-on-light">{cap.label}</span>
                            {cap.platforms.map((p) => (
                              <span key={p} className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-panel-light text-muted-on-light border-border-light">{p}</span>
                            ))}
                            {cap.ready ? (
                              <span className="text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-success/10 text-success border-success/30">{t('solutions.skillReady')}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 border bg-warning/10 text-warning border-warning/30">
                                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={1.5} /> {t('solutions.skillNeedsActivation')}
                              </span>
                            )}
                          </div>
                          {cap.description && (
                            <p className="text-[10px] text-muted-on-light truncate">{cap.description}</p>
                          )}
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}

        {/* Skills DESTA coleta (N): cada uma vira um worker na materialização.
            Selecionar no catálogo ADICIONA (não substitui). Chips clicáveis
            focam o form; o X remove. Inclui a sugerida do AIP (soft) até ela
            persistir ao interagir. */}
        {focusCandidates.length > 0 && (
          <div className="space-y-1" data-testid="coleta-skills-list">
            <p className="text-[9.5px] uppercase tracking-wider text-muted-on-light">
              {t('solutions.coletaSkillsTitle')}
            </p>
            <div className="flex flex-wrap gap-1">
              {focusCandidates.map((s) => {
                const cap = (catalog || []).find((c) => c.skill_key === s.skill_key);
                const label = cap?.label || s.skill_key;
                const isFocus = s.skill_key === effectiveFocus;
                const persisted = persistedSkills.some((p) => p.skill_key === s.skill_key);
                return (
                  <span
                    key={s.skill_key}
                    data-testid={`coleta-skill-chip-${s.skill_key}`}
                    data-focus={isFocus ? 'true' : 'false'}
                    className={
                      'inline-flex items-center gap-1 h-6 pl-2 pr-1 text-[10.5px] border ' +
                      (isFocus
                        ? 'border-primary bg-primary/5 text-text-on-light'
                        : 'border-border-light bg-white text-muted-on-light')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setFocusKey(s.skill_key)}
                      className="truncate max-w-[150px]"
                    >
                      {label}
                    </button>
                    {persisted && (
                      <button
                        type="button"
                        onClick={() => removeSkill(s.skill_key)}
                        aria-label={`${t('solutions.coletaSkillRemove')}: ${label}`}
                        title={t('solutions.coletaSkillRemove')}
                        data-testid={`coleta-skill-remove-${s.skill_key}`}
                        className="text-muted-on-light hover:text-danger shrink-0"
                      >
                        <X className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Parâmetros da skill em FOCO (form genérico do param_schema real).
            Caminho de ativação para itens que requerem ativação. */}
        {focusCap && (
          <div className="border border-border-light bg-canvas-light p-2 space-y-1.5" data-testid="coleta-agent">
            <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
              {focusCap.label}
            </p>
            {/* #7 (fix do operador) — SEMPRE mostra o que a skill FAZ (descrição),
                params ou não. Sem isto, skill sem parâmetro parecia inútil. */}
            {focusCap.description && (
              <p className="text-[10px] text-muted-on-light leading-snug" data-testid="coleta-agent-desc">
                {focusCap.description}
              </p>
            )}
            {!focusReady ? (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-on-light" data-testid="coleta-activate-hint">
                  {t('solutions.activateToConfig')}
                </p>
                <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => void activateSkill()} disabled={activating}
                  data-testid="coleta-activate"
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 border border-border-light text-text-on-light hover:border-primary disabled:opacity-40">
                  {activating ? <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} /> : <Power className="w-2.5 h-2.5" strokeWidth={1.5} />}
                  {t('solutions.activateSkill')}
                </button>
                <InfoTip text={t('solutions.activateSkillHint')} />
                </div>
              </div>
            ) : focusCap.param_schema.length > 0 ? (
              <SchemaForm params={focusCap.param_schema} values={focusSkill?.params || {}} onChange={(pk, v) => setSkillParam(effectiveFocus, pk, v)} testidPrefix="coleta-param" />
            ) : (
              <p className="text-[10px] text-muted-on-light" data-testid="coleta-agent-noparams">{t('solutions.coletaNoParams')}</p>
            )}

            {/* ROTA dos tipos — o AIP propôs N tipos mas "Tipo de objeto" é UM (a skill
                alimenta 1 tipo). Diz QUAL tipo esta coleta alimenta + de onde vêm os outros,
                pro operador não ficar "tenho 4 objetos, e agora? tá certo? vai quebrar?". */}
            {focusReady && proposedKinds.size > 0 && (() => {
              const sel = String((focusSkill?.params as Record<string, unknown>)?.node_type || '').trim();
              const selLabel = objectTypes.find((o) => o.kind === sel)?.label || sel;
              const others = Array.from(proposedKinds)
                .filter((k) => k !== sel)
                .map((k) => objectTypes.find((o) => o.kind === k)?.label || k);
              return (
                <div className="border-t border-border-light pt-1.5 space-y-0.5" data-testid="coleta-type-route">
                  <p className="text-[10px] text-text-on-light leading-snug">
                    {sel
                      ? t('solutions.coletaTypeRouteFeeds').replace('{type}', selLabel)
                      : t('solutions.coletaTypeRoutePick')}
                  </p>
                  {others.length > 0 && (
                    <p className="text-[10px] text-muted-on-light leading-snug" data-testid="coleta-type-route-others">
                      {t('solutions.coletaTypeRouteOthers').replace('{types}', others.join(', '))}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* #6 — "Rodar amostra" (estilo N8N): roda a skill DE VERDADE com
                limite pequeno, sem persistir, e mostra os dados REAIS. Dá ao
                operador o mapa mental + alimenta a IDE. */}
            {focusReady && (
              <div className="border-t border-border-light pt-1.5 space-y-1">
                {sampleState === 'running' ? (
                  // #6 — sem timeout arbitrário: contador AO VIVO + botão Parar.
                  // O operador vê que está vivo e decide quando desistir.
                  <div className="space-y-1" data-testid="coleta-sample-running">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} />
                        {t('solutions.coletaSampleRunning')}
                        <span className="font-mono tabular-nums" data-testid="coleta-sample-elapsed">
                          {sample.elapsedSec}s
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={sample.stop}
                        data-testid="coleta-sample-stop"
                        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 border border-border-light text-muted-on-light hover:border-danger hover:text-danger"
                      >
                        {t('solutions.coletaSampleStop')}
                      </button>
                    </div>
                    {sample.slow && (
                      <p className="flex items-start gap-1 text-[9.5px] text-warning leading-snug" data-testid="coleta-sample-slow">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                        {t('solutions.coletaSampleSlow')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={runSample}
                      data-testid="coleta-run-sample"
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 border border-primary text-primary hover:bg-primary/5"
                    >
                      <Power className="w-2.5 h-2.5" strokeWidth={1.5} />
                      {t('solutions.coletaRunSample')}
                    </button>
                    <InfoTip text={t('solutions.coletaRunSampleHint')} />
                  </div>
                )}
                {sampleState === 'done' && (
                  <div data-testid="coleta-sample-result" className="space-y-1">
                    <p className="text-[9.5px] uppercase tracking-wider text-success">
                      {t('solutions.coletaSampleDone').replace('{n}', String(sampleRecords.length))}
                    </p>
                    {sampleRecords.slice(0, 3).map((rec, i) => (
                      <div
                        key={i}
                        data-testid="coleta-sample-record"
                        className="border border-border-light bg-white px-1.5 py-1 space-y-0.5"
                      >
                        {Object.entries(rec)
                          .filter(([k]) => !k.startsWith('_'))
                          .slice(0, 6)
                          .map(([k, v]) => (
                            <p key={k} className="text-[9.5px] leading-tight truncate">
                              <span className="font-mono text-muted-on-light">{k}:</span>{' '}
                              <span className="text-text-on-light">
                                {Array.isArray(v) ? `[${v.length}]` : String(v ?? '').slice(0, 60)}
                              </span>
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
                {(sampleState === 'error' || sampleState === 'unsupported') && (
                  <p className="text-[9.5px] text-warning" data-testid="coleta-sample-error">
                    {sampleState === 'unsupported'
                      ? t('solutions.coletaSampleUnsupported')
                      : sample.error === 'cap'
                        ? t('solutions.coletaSampleCap')
                        : `${t('solutions.coletaSampleError')}: ${sample.error || ''}`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* "Outras fontes (avançado)" — vincular um conector/dataset pronto, criar
          no Hub Dados, ou subir um arquivo. Sempre secundário/recolhido (o nó
          lidera pela capacidade de coleta acima). */}
      <button type="button" onClick={() => setAdvancedOpen((v) => !v)} data-testid="connect-advanced-toggle"
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-on-light hover:text-text-on-light">
        {advancedOpen ? <ChevronDown className="w-3 h-3" strokeWidth={1.5} /> : <ChevronRight className="w-3 h-3" strokeWidth={1.5} />}
        {t('solutions.connectAdvanced')}
      </button>
      {advancedOpen && (
      <>
      {/* Estado dos vínculos — o operador bate o olho e sabe quantas fontes o
          nó tem. P2: lista de chips removíveis + contador (várias ingestões
          por nó; antes só cabia 1 e a 2ª sobrescrevia a 1ª). */}
      {linked.length > 0 ? (
        <div className="space-y-1" data-testid="connect-linked-list">
          <p className="text-[9.5px] uppercase tracking-wider text-muted-on-light" data-testid="connect-count">
            {t('solutions.connectCount').replace('{n}', String(linked.length))}
          </p>
          {linked.map((s) => {
            const k = `${s.kind}:${s.id}`;
            const cols = columnsBySource[k] || [];
            const types = producedTypes(s);
            const hasOutput = types.length > 0;
            return (
              <div
                key={k}
                className={
                  'border px-2 py-1.5 space-y-1.5 ' +
                  (hasOutput ? 'bg-success/5 border-success/40' : 'bg-warning/5 border-warning/40')
                }
                data-testid="connect-linked"
                data-output={hasOutput ? 'set' : 'unset'}
              >
                {/* Origem + tipo do vínculo + remover */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2
                      className={'w-3.5 h-3.5 shrink-0 ' + (hasOutput ? 'text-success' : 'text-warning')}
                      strokeWidth={1.5}
                    />
                    <span className="text-[11px] text-text-on-light truncate">{s.label}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-on-light shrink-0">
                      {t(`solutions.connectKind_${s.kind}`)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => unlink(s)}
                    aria-label={`${t('solutions.connectUnlink')}: ${s.label}`}
                    title={t('solutions.connectUnlink')}
                    data-testid="connect-unlink"
                    className="text-muted-on-light hover:text-danger shrink-0"
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>

                {/* A ROTA: quais Tipos de objeto esta fonte PRODUZ (Saída) — N tipos,
                    não 1. Instagram → PerfilInstagram + PostInstagram. Chips
                    removíveis + dropdown p/ adicionar; SEMPRE da ontologia. */}
                <div className="space-y-1" data-testid="connect-produces">
                  <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
                    {t('solutions.connectOutput')}
                    <InfoTip text={t('solutions.connectOutputHint')} />
                  </span>
                  {objectTypes.length > 0 ? (
                    <>
                      {types.length > 0 && (
                        <div className="flex flex-wrap gap-1" data-testid="connect-produced-list">
                          {types.map((kind) => {
                            const meta = objectTypes.find((o) => o.kind === kind);
                            const label = meta?.label || kind;
                            return (
                              <span
                                key={kind}
                                data-testid="connect-produced-chip"
                                data-kind={kind}
                                className="inline-flex items-center gap-1 h-6 pl-2 pr-1 text-[10.5px] bg-white border border-success/50 text-text-on-light"
                              >
                                <span className="truncate max-w-[150px]">
                                  {proposedKinds.has(kind)
                                    ? `${label} ${t('schemaForm.proposedSuffix')}`
                                    : label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeType(s, kind)}
                                  aria-label={`${t('solutions.connectProducedRemove')}: ${label}`}
                                  title={t('solutions.connectProducedRemove')}
                                  data-testid="connect-produced-remove"
                                  className="text-muted-on-light hover:text-danger shrink-0"
                                >
                                  <X className="w-3 h-3" strokeWidth={1.5} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <SearchableSelect
                        value=""
                        onChange={(v) => { if (v) addType(s, v); }}
                        options={objectTypes
                          .filter((o) => !types.includes(o.kind))
                          .map((o) => ({
                            value: o.kind,
                            label: proposedKinds.has(o.kind)
                              ? `${o.label} ${t('schemaForm.proposedSuffix')}`
                              : o.label,
                          }))}
                        placeholder={types.length > 0 ? t('solutions.connectOutputAdd') : t('solutions.connectOutputPick')}
                        searchPlaceholder={t('solutions.searchOption')}
                        data-testid="connect-output-type"
                      />
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-on-light italic" data-testid="connect-no-types">
                      {t('solutions.connectNoTypes')}
                    </span>
                  )}
                </div>

                {/* Mapa mínimo de campos (id/nome) — só quando as colunas da fonte
                    são conhecidas (CSV subido / binding do conector). */}
                {hasOutput && cols.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap" data-testid="connect-field-map">
                    <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light shrink-0">
                      {t('solutions.connectFieldId')}
                    </span>
                    <select
                      value={s.id_field || ''}
                      onChange={(e) => setMapping(s, { id_field: e.target.value })}
                      data-testid="connect-id-field"
                      className="h-6 px-1 text-[10.5px] bg-white border border-border-light outline-none"
                    >
                      <option value="">—</option>
                      {cols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span className="text-[9.5px] uppercase tracking-wider text-muted-on-light shrink-0">
                      {t('solutions.connectFieldName')}
                    </span>
                    <select
                      value={s.name_field || ''}
                      onChange={(e) => setMapping(s, { name_field: e.target.value })}
                      data-testid="connect-name-field"
                      className="h-6 px-1 text-[10.5px] bg-white border border-border-light outline-none"
                    >
                      <option value="">—</option>
                      {cols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <InfoTip text={t('solutions.connectFieldMapHint')} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10.5px] text-muted-on-light leading-relaxed" data-testid="connect-none">
          {t('solutions.connectNone')}
        </p>
      )}

      {/* 1 — VINCULAR EXISTENTE (dropdown populado, nunca input manual). */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
          <Link2 className="w-3 h-3" strokeWidth={1.5} />
          {t('solutions.connectExisting')}
        </Label>
        {loadingLists ? (
          <div className="flex items-center gap-2 text-[10.5px] text-muted-on-light">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            {t('common.loading')}
          </div>
        ) : hasOptions ? (
          // P2 — picker de APPEND: value sempre '' (reseta após escolher);
          // escolher adiciona à lista (nunca sobrescreve). Já-vinculadas saem
          // do dropdown (dedupe visível).
          <SearchableSelect
            value=""
            onChange={(v) => { if (v) onPick(v); }}
            options={[
              ...avail.fontes.map((o) => ({ value: `fonte:${o.id}`, label: o.label, group: t('solutions.connectGroupSources') })),
              ...avail.conectores.map((o) => ({ value: `conector:${o.id}`, label: o.label, group: t('solutions.connectGroupConnectors') })),
              ...avail.datasets.map((o) => ({ value: `dataset:${o.id}`, label: o.label, group: t('solutions.connectGroupDatasets') })),
            ]}
            placeholder={t('solutions.connectAddSource')}
            searchPlaceholder={t('solutions.searchOption')}
            data-testid="connect-existing-select"
          />
        ) : (
          <p className="text-[10px] text-muted-on-light italic" data-testid="connect-no-options">
            {t('solutions.connectNoOptions')}
          </p>
        )}
      </div>

      {/* 2 — CRIAR AGORA: deep-links pras abas certas do Hub Dados. */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('solutions.connectCreate')}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['conexoes', 'solutions.connectCreateConnector'],
              ['datasets', 'solutions.connectCreateDataset'],
              ['arquivos', 'solutions.connectCreateMedia'],
            ] as const
          ).map(([aba, labelKey]) => (
            <a
              key={aba}
              href={`/painel-de-controle/dados?aba=${aba}`}
              target="_blank"
              rel="noreferrer"
              data-testid={`connect-create-${aba}`}
              className="h-7 px-2 text-[10.5px] border border-border-light bg-white text-text-on-light hover:border-primary flex items-center"
            >
              {t(labelKey)}
            </a>
          ))}
        </div>
      </div>

      {/* 3 — SUBIR ARQUIVO PEQUENO (governado via /ingest/event). */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1">
          <Upload className="w-3 h-3" strokeWidth={1.5} />
          {t('solutions.connectUpload')}
        </Label>
        <p className="text-[9.5px] text-muted-on-light leading-relaxed">
          {t('solutions.connectUploadHint')}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json,text/plain"
          className="hidden"
          data-testid="connect-upload-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadSmallFile(f);
            e.currentTarget.value = '';
          }}
        />
        <Button
          variant="outline"
          className="h-8 w-full text-[11px]"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="connect-upload-btn"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
          {t('solutions.connectUpload')}
        </Button>
        {uploadMsg && (
          <p className="text-[10px] font-mono text-success" data-testid="connect-upload-done">
            {uploadMsg}
          </p>
        )}
      </div>
      </>
      )}

      {err && (
        <div
          className="px-2 py-1.5 text-[10.5px] font-mono text-danger bg-danger/5 border border-danger/30"
          data-testid="connect-error"
        >
          {err}
        </div>
      )}
    </div>
  );
}
