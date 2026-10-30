'use client';

import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { Widget } from './widget';
import { useT } from '@/lib/i18n/provider';
import {
  Entities,
  Links,
  type IdentidadePossivel,
  type ObjectTypeProperty,
  type ObjectTypeSchema,
  type LinksTraversedNode,
} from '@/lib/api';
import { TECHNICAL_FIELD_RE } from '@/lib/ontology/technical-fields';
import { formatDataHoraBR } from '@/lib/datetime';
import { fetchNeighbors, type NeighborNode } from '@/lib/ficha/neighbors';

// ── Evidência REAL (fan-out / dossiê) — substitui as fixtures mockadas ───────
// Os widgets de Histórico (antecedentes/mandados/veículos/linha do tempo) liam de
// arrays HARDCODED. Agora leem Entities.evidence(entityId) (GET /entities/{id}/evidence)
// filtrado por source_tool, com estado VAZIO honesto. Zero dado fake.
type EvidenceRow = {
  source_tool?: string;
  tool_version?: string;
  payload?: unknown;
  payload_excerpt?: string;
  confidence?: number;
  collected_at?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  bnmp_mandados: 'BNMP — mandado',
  cgu_sancoes: 'CGU — sanção (CEIS/CNEP)',
  cgu_servidores: 'CGU — servidor',
  tcu_inidoneos: 'TCU — inidôneo',
  tcu_inabilitados: 'TCU — inabilitado',
  tcu_contas_irregulares: 'TCU — contas irregulares',
  opensanctions_search: 'OpenSanctions',
  opensanctions_match: 'OpenSanctions (match)',
  icij_search: 'ICIJ — vazamento offshore',
  gdelt_doc_search: 'GDELT — notícia',
  searx_news_brazil: 'Notícia BR',
  searx_search: 'Web',
  search_rag: 'Base interna',
  lattes_buscar: 'Lattes',
  oab_advogados: 'OAB',
};

function sourceLabel(t?: string): string {
  if (!t) return 'Fonte';
  return SOURCE_LABELS[t] ?? t.replace(/_/g, ' ');
}

// ── Renderizador RICO de evidência (multi-domínio) ──────────────────────────
// O payload estruturado (backend) chega pela coluna evidence.payload; fallback:
// parse do excerpt quando cabe. Acha os REGISTROS dentro do payload e mostra os
// campos reais (mandado: pessoa/crime/vara/processo/status) — não "fonte + conf".

/** payload estruturado (backend) ou fallback: parse do excerpt. */
function getPayload(e: EvidenceRow): unknown {
  if (e.payload != null) return e.payload;
  const ex = e.payload_excerpt;
  if (typeof ex === 'string') {
    const s = ex.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    }
  }
  return null;
}

const LIST_KEYS = [
  'mandados', 'results', 'items', 'registros', 'hits', 'sancoes', 'rows', 'lista', 'possiveis',
];

/** Resultado da extração: os registros + se a fonte foi consultada mas veio VAZIA
 *  (lista presente porém sem itens) — pra mostrar "nada encontrado" honesto em vez do
 *  envelope técnico ({status:200}). */
function extractRecords(payload: unknown): { records: Record<string, unknown>[]; emptyResult: boolean } {
  let p: unknown = payload;
  // Desembrulha o envelope do handler MCP {data, status, sha256} → usa o `data`.
  if (p && typeof p === 'object' && !Array.isArray(p) && 'data' in (p as Record<string, unknown>)) {
    const d = (p as Record<string, unknown>).data;
    if (d && typeof d === 'object') p = d;
  }
  if (Array.isArray(p)) {
    const recs = p.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
    return { records: recs, emptyResult: recs.length === 0 };
  }
  if (p && typeof p === 'object') {
    const obj = p as Record<string, unknown>;
    for (const k of LIST_KEYS) {
      const v = obj[k];
      if (Array.isArray(v)) {
        const recs = v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
        return { records: recs, emptyResult: recs.length === 0 };
      }
    }
    return { records: [obj], emptyResult: false };
  }
  return { records: [], emptyResult: false };
}

const STATUS_RE = /status|situa/i;
const DATE_RE = /data|date|expedic|nascimento|emiss|venc|inicio|fim/i;
// data-só (YYYY-MM-DD, sem T/hora) vs data-hora (YYYY-MM-DDThh:mm…). Datas como
// nascimento/expedição não têm hora — formatar com hora inventa "00:00:00"+TZ.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** Formata ISO respeitando a granularidade: data-só → DD/MM/AAAA (sem hora,
 *  sem TZ — uma data civil "2026-03-13" não vira "2026-03-12" por fuso);
 *  data-hora → DD/MM/AAAA HH:MM:SS. Não-data → devolve cru. */
function formatDateMaybeTime(value: string): string {
  if (DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  if (DATE_TIME_RE.test(value)) return formatDataHoraBR(value);
  return value;
}

/** Campos legíveis de 1 registro (filtra técnico, formata data, marca status). */
function fieldRows(rec: Record<string, unknown>): { label: string; value: string; emph: boolean }[] {
  const out: { label: string; value: string; emph: boolean }[] = [];
  for (const [k, v] of Object.entries(rec)) {
    if (TECHNICAL_FIELD_RE.test(k)) continue;
    if (v == null || v === '') continue;
    let value: string;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      value = `${v.length} item(ns)`;
    } else if (typeof v === 'object') {
      continue; // aninhado → evita ruído
    } else {
      value = String(v);
    }
    if (!value.trim()) continue;
    if (DATE_RE.test(k) && /^\d{4}-\d{2}/.test(value)) value = formatDateMaybeTime(value);
    out.push({ label: k.replace(/_/g, ' '), value: value.slice(0, 240), emph: STATUS_RE.test(k) });
  }
  return out.slice(0, 12);
}

/** Resumo de UMA linha p/ a timeline (campo saliente do 1º registro, ou contagem). */
function compactSummary(e: EvidenceRow): string {
  const { records } = extractRecords(getPayload(e));
  if (!records.length) return '';
  if (records.length > 1) return `${records.length} registro(s)`;
  const f = fieldRows(records[0])[0];
  return f ? f.value : '';
}

function useEntityEvidence(entityId: string | null): EvidenceRow[] | null {
  const [rows, setRows] = React.useState<EvidenceRow[] | null>(null);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Entities.evidence(entityId)
      .then((d) => !cancelled && setRows((Array.isArray(d) ? d : []) as EvidenceRow[]))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId]);
  return rows;
}

/** Card RICO de 1 evidência: cabeçalho (fonte · nº registros · conf · data) + os
 *  CAMPOS reais de cada registro (mandado: pessoa/crime/vara/processo/status). */
function EvidenceCard({ e }: { e: EvidenceRow }) {
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const { records, emptyResult } = React.useMemo(() => extractRecords(getPayload(e)), [e]);
  const shown = expanded ? records : records.slice(0, 3);
  return (
    <li className="border border-border-light bg-canvas-light p-2.5">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-semibold text-text-on-light">{sourceLabel(e.source_tool)}</span>
        {records.length > 1 && (
          <span className="text-[10px] font-mono text-muted-on-light">
            {records.length} {t('ficha.ev.registros')}
          </span>
        )}
        {typeof e.confidence === 'number' && (
          <span className="text-[9px] font-mono text-muted-on-light">
            {t('ficha.ev.conf')} {Math.round(e.confidence * 100)}%
          </span>
        )}
        {e.collected_at && (
          <span className="ml-auto text-[10px] font-mono text-muted-on-light">
            {formatDataHoraBR(e.collected_at)}
          </span>
        )}
      </div>
      {records.length === 0 ? (
        <p className="text-[11px] text-muted-on-light italic">
          {emptyResult ? t('ficha.ev.nadaEncontrado') : t('ficha.ev.semCampos')}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((rec, i) => {
            const fields = fieldRows(rec);
            if (!fields.length) return null;
            return (
              <dl
                key={i}
                className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-l-2 border-border-light pl-2"
              >
                {fields.map((f) => (
                  <React.Fragment key={f.label}>
                    <dt className="text-[10px] uppercase tracking-wider text-muted-on-light self-center">
                      {f.label}
                    </dt>
                    <dd
                      className={`text-[11px] break-words ${f.emph ? 'font-semibold uppercase text-text-on-light' : 'text-text-on-light'}`}
                    >
                      {f.value}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            );
          })}
        </div>
      )}
      {records.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10px] text-primary hover:underline"
        >
          {expanded ? t('ficha.ev.verMenos') : `${t('ficha.ev.verMais')} (${records.length - 3})`}
        </button>
      )}
    </li>
  );
}

/** Lista de evidências reais filtrada por fonte — base dos widgets de Histórico. */
function EvidenceList({
  entityId,
  sourceTools,
  title,
  description,
  empty,
}: {
  entityId: string | null;
  sourceTools?: string[];
  title: string;
  description?: string;
  empty: string;
}) {
  const t = useT();
  const all = useEntityEvidence(entityId);
  const key = sourceTools ? sourceTools.join(',') : '';
  const rows = React.useMemo(() => {
    if (!all) return null;
    if (!sourceTools || !sourceTools.length) return all;
    return all.filter((e) => e.source_tool && sourceTools.includes(e.source_tool));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, key]);

  // DEDUP de "nada encontrado": N consultas vazias da MESMA fonte viram UMA linha
  // "Fonte consultada — nada encontrado (N)". Cards com registros reais ficam intactos.
  const { cards, emptySources } = React.useMemo(() => {
    if (!rows) return { cards: [] as EvidenceRow[], emptySources: [] as { tool: string; count: number }[] };
    const cardRows: EvidenceRow[] = [];
    const emptyCounts = new Map<string, number>();
    for (const e of rows) {
      const { records, emptyResult } = extractRecords(getPayload(e));
      if (records.length === 0 && emptyResult) {
        const tool = e.source_tool ?? '';
        emptyCounts.set(tool, (emptyCounts.get(tool) ?? 0) + 1);
      } else {
        cardRows.push(e);
      }
    }
    return {
      cards: cardRows,
      emptySources: Array.from(emptyCounts.entries()).map(([tool, count]) => ({ tool, count })),
    };
  }, [rows]);

  const hasAnything = rows && rows.length > 0;
  return (
    <Widget title={title} description={rows ? `${rows.length} registro(s)` : description}>
      {rows === null && (
        <p className="text-[11px] text-muted-on-light italic">Carregando…</p>
      )}
      {rows && rows.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-on-light italic">{empty}</p>
      )}
      {hasAnything && (
        <ul className="space-y-2">
          {cards.map((e, i) => (
            <EvidenceCard key={`${e.source_tool ?? 'ev'}-${i}`} e={e} />
          ))}
          {emptySources.map((s) => (
            <li
              key={`empty-${s.tool}`}
              className="border border-border-light bg-canvas-light px-2.5 py-2 flex items-baseline gap-2"
            >
              <span className="text-[11px] font-semibold text-text-on-light">{sourceLabel(s.tool)}</span>
              <span className="text-[11px] text-muted-on-light italic">
                {t('ficha.ev.nadaEncontrado')}
              </span>
              {s.count > 1 && (
                <span className="ml-auto text-[10px] font-mono text-muted-on-light">
                  {s.count} {t('ficha.ev.consultas')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

const MANDADO_TOOLS = ['bnmp_mandados'];
const ANTECEDENTE_TOOLS = [
  'cgu_sancoes',
  'tcu_inidoneos',
  'tcu_inabilitados',
  'tcu_contas_irregulares',
  'opensanctions_search',
  'opensanctions_match',
  'icij_search',
];

/**
 * Identificação da entidade. Lê DIRETO o entity real (obj) e formata
 * o cabeçalho com metadados (id/tipo/classificação) + properties.
 *
 * `obj` é injetado pelo FichaWorkshopShell como variable. Quando
 * ausente (preview no editor), só renderiza properties OU mensagem de
 * estado vazio.
 */
type ObjForIdent = {
  id?: string;
  name?: string;
  entity_type?: string;
  classification?: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
};

/** Renderiza qualquer valor de property de forma legível. */
function ValueRender({ v }: { v: unknown }): React.ReactElement {
  if (v == null) return <span className="text-muted-on-light">—</span>;
  if (typeof v === 'boolean') return <>{v ? 'sim' : 'não'}</>;
  if (typeof v === 'number') return <>{v.toLocaleString('pt-BR')}</>;
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v)) {
      return (
        <a
          href={v}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {v}
        </a>
      );
    }
    // Data/hora ISO 8601 crua → formato local legível (genérico: vale p/ qualquer
    // property que seja timestamp, sem depender de type-def).
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        return <>{d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</>;
      }
    }
    return <>{v}</>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-on-light">—</span>;
    return (
      <ul className="space-y-0.5">
        {v.slice(0, 12).map((item, i) => (
          <li key={i} className="text-[11px]">
            <ValueRender v={item} />
          </li>
        ))}
        {v.length > 12 && (
          <li className="text-[10px] text-muted-on-light italic">
            … e mais {v.length - 12}
          </li>
        )}
      </ul>
    );
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-on-light">{'{}'}</span>;
    return (
      <table className="w-full text-[11px] border border-border-light bg-raised-light/30">
        <tbody>
          {entries.slice(0, 24).map(([k, val]) => (
            <tr key={k} className="border-b border-border-light/40 last:border-b-0">
              <td className="px-2 py-0.5 text-[10px] text-muted-on-light font-mono w-1/3 align-top">
                {k}
              </td>
              <td className="px-2 py-0.5 align-top break-words">
                <ValueRender v={val} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <>{String(v)}</>;
}

/** Formata o valor PELO TIPO do type-def (data/número/booleano/url/geo). Tipo
 *  desconhecido cai no ValueRender (nunca quebra). */
function FormatByType({ v, type }: { v: unknown; type?: string }): React.ReactElement {
  if (v == null || v === '') return <span className="text-muted-on-light">—</span>;
  const ty = (type || '').toLowerCase();
  if ((ty === 'datetime' || ty === 'date' || ty === 'timestamp') && typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return <>{d.toLocaleString('pt-BR', ty === 'date' ? { dateStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' })}</>;
    }
  }
  if ((ty === 'money' || ty === 'currency') && typeof v === 'number') {
    return <>{v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</>;
  }
  if (ty === 'geopoint' && v && typeof v === 'object') {
    const g = v as Record<string, unknown>;
    const lat = g.lat ?? g.latitude;
    const lon = g.lng ?? g.lon ?? g.longitude;
    if (lat != null && lon != null) return <>{Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}</>;
  }
  return <ValueRender v={v} />;
}

/** snake/kebab/camel → Title Case (fallback de rótulo quando não há type-def). */
function humanizeKey(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Heurística de "técnico" — ÚLTIMO RECURSO, só quando NÃO há type-def. Com
// type-def a verdade é declarativa (no contrato = negócio; fora = técnico).
// Reusa o ponto único compartilhado (lib/ontology/technical-fields) — mesma
// heurística usada pelos widgets de detecção (Alertas em destaque).
const TECH_KEY_RE = TECHNICAL_FIELD_RE;

type IdentRow = { key: string; label: string; type?: string; value: unknown };

function classificationStyle(level?: string): string {
  switch ((level || '').toLowerCase()) {
    case 'sigiloso':
      return 'border-cls-sigiloso text-cls-sigiloso bg-cls-sigiloso/10';
    case 'confidencial':
      return 'border-cls-confidencial text-cls-confidencial bg-cls-confidencial/10';
    case 'restrito':
      return 'border-cls-restrito text-cls-restrito bg-cls-restrito/10';
    case 'publico':
      return 'border-cls-publico text-cls-publico bg-cls-publico/10';
    default:
      return 'border-border-light text-muted-on-light';
  }
}

// Rótulo legível da rede/tipo do identificador (multi-domínio: redes sociais,
// e-mail, etc.). Desconhecido cai no próprio valor (humanizado).
const IDENT_TIPO_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  x_twitter: 'X',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  github: 'GitHub',
  email: 'E-mail',
};

function identTipoLabel(tipo: string): string {
  return IDENT_TIPO_LABEL[tipo] ?? humanizeKey(tipo);
}

/** Carrega identidades correlatas (perfis/aliases) do entity. Consolida o que o
 *  painel "Identidades possíveis" já produz, em modo leitura, pra que a aba
 *  Identidade NUNCA fique vazia quando há identidades. */
function useEntityIdentidades(entityId: string | null | undefined): IdentidadePossivel[] | null {
  const [rows, setRows] = React.useState<IdentidadePossivel[] | null>(null);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Entities.identidades(entityId)
      .then((r) => {
        if (cancelled) return;
        // descarta os rejeitados; mostra possíveis + confirmados (ordem: confiança desc).
        const list = (r.identidades || [])
          .filter((p) => p.status !== 'rejected')
          .sort((a, b) => (b.confianca || 0) - (a.confianca || 0));
        setRows(list);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId]);
  return rows;
}

/** Seção "Identificadores / Aliases" — perfis correlacionados (rede + @handle/email
 *  + confiança + status), em leitura. As AÇÕES (confirmar/descartar/arbitrar) vivem
 *  no painel dedicado "Identidades possíveis"; aqui é só consolidação na Identidade. */
function IdentificadoresSection({ items }: { items: IdentidadePossivel[] }) {
  const t = useT();
  return (
    <div className="mt-3 pt-3 border-t border-border-light" data-testid="ficha-identificadores">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold mb-2">
        {t('ficha.ident.identificadores')} ({items.length})
      </p>
      <ul className="space-y-1.5">
        {items.map((p) => {
          const pct = Math.min(100, Math.round((p.confianca || 0) * 100));
          const confirmed = p.status === 'confirmed';
          return (
            <li
              key={`${p.tipo}-${p.identificador}`}
              className="grid grid-cols-[72px_1fr_auto] gap-2 items-center"
            >
              <span className="text-[10px] font-mono uppercase text-muted-on-light truncate" title={identTipoLabel(p.tipo)}>
                {identTipoLabel(p.tipo)}
              </span>
              <span className="min-w-0 flex items-center gap-1.5">
                <span className="text-[12px] font-mono truncate" title={p.identificador}>
                  {p.identificador}
                </span>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-on-light hover:text-primary shrink-0"
                    title={t('ficha.ident.abrirFonte')}
                  >
                    <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                  </a>
                )}
              </span>
              <span className="text-[10px] font-mono text-muted-on-light shrink-0 flex items-center gap-1.5">
                <span>{pct}%</span>
                <span
                  className={`inline-flex items-center h-4 px-1 text-[9px] uppercase tracking-wider border ${
                    confirmed
                      ? 'border-primary text-primary'
                      : 'border-border-light text-muted-on-light'
                  }`}
                >
                  {confirmed ? t('ficha.ident.confirmado') : t('ficha.ident.possivel')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WidgetIdentificacao({
  properties,
  obj,
  typeDef,
}: {
  properties?: Record<string, unknown>;
  obj?: ObjForIdent;
  /** Contrato do type-def da ontologia. Presente → negócio (declarado) formatado
   *  + técnico (não-declarado) colapsado. Ausente → fallback heurístico. */
  typeDef?: ObjectTypeSchema | null;
}) {
  const t = useT();
  const props = properties ?? {};
  const present = (v: unknown) => v != null && v !== '';

  // NEGÓCIO vs TÉCNICO. Com type-def: declarado=negócio, não-declarado=técnico
  // (100% ontológico/multidomínio). Sem type-def: heurística de último recurso.
  const { business, technical } = React.useMemo<{ business: IdentRow[]; technical: IdentRow[] }>(() => {
    const schemaProps: ObjectTypeProperty[] = typeDef?.properties ?? [];
    if (schemaProps.length > 0) {
      const declared = new Set(schemaProps.map((p) => p.key));
      const titleKey = typeDef?.title_property || schemaProps.find((p) => p.is_title)?.key;
      const biz: IdentRow[] = schemaProps
        .filter((p) => present(props[p.key]))
        // título primeiro, depois ordem do contrato
        .sort((a, b) => (a.key === titleKey ? -1 : b.key === titleKey ? 1 : 0))
        .map((p) => ({ key: p.key, label: p.label || humanizeKey(p.key), type: p.type, value: props[p.key] }));
      const tech: IdentRow[] = Object.keys(props)
        .filter((k) => !declared.has(k) && present(props[k]))
        .map((k) => ({ key: k, label: humanizeKey(k), value: props[k] }));
      return { business: biz, technical: tech };
    }
    // Fallback (sem type-def): humaniza a chave + separa técnico por heurística.
    const biz: IdentRow[] = [];
    const tech: IdentRow[] = [];
    for (const [k, v] of Object.entries(props)) {
      if (!present(v)) continue;
      (TECH_KEY_RE.test(k) ? tech : biz).push({ key: k, label: humanizeKey(k), value: v });
    }
    return { business: biz, technical: tech };
  }, [props, typeDef]);

  // Identificadores correlatos (perfis/aliases) — consolida o que o painel
  // "Identidades possíveis" já produz pra que a Identidade nunca fique vazia.
  // entity_id chega via obj.id (a rota injeta variables.entity_id = obj.id).
  const identidades = useEntityIdentidades(obj?.id ?? null);

  const hasContent =
    !!obj ||
    business.length > 0 ||
    technical.length > 0 ||
    (identidades?.length ?? 0) > 0;

  return (
    <Widget title={t('ficha.ident.titulo')} description={t('ficha.ident.descricao')}>
      {!hasContent && (
        <p className="text-[11px] text-muted-on-light italic">
          {t('ficha.ident.vazio')}
        </p>
      )}

      {obj && (
        <div className="mb-3 pb-3 border-b border-border-light flex items-start gap-3 flex-wrap">
          {obj.entity_type && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('ficha.ident.tipo')}
              </p>
              <p className="text-[12px] font-mono">{obj.entity_type}</p>
            </div>
          )}
          {obj.classification && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('ficha.ident.classificacao')}
              </p>
              <span
                className={`inline-flex items-center h-5 px-1.5 text-[10px] font-mono uppercase tracking-wider border ${classificationStyle(obj.classification)}`}
              >
                {obj.classification}
              </span>
            </div>
          )}
          {obj.id && (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('ficha.ident.id')}
              </p>
              <p
                className="text-[11px] font-mono truncate"
                title={obj.id}
              >
                {obj.id}
              </p>
            </div>
          )}
          {typeof obj.version === 'number' && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-on-light">
                {t('ficha.ident.versao')}
              </p>
              <p className="text-[12px] font-mono">v{obj.version}</p>
            </div>
          )}
        </div>
      )}

      {/* NEGÓCIO: declarado no type-def (rótulo + formato do contrato). */}
      {business.length > 0 && (
        <dl className="space-y-2">
          {business.map((row) => {
            const isNested =
              row.value !== null && typeof row.value === 'object' && !Array.isArray(row.value);
            return (
              <div key={row.key} className="grid grid-cols-[110px_1fr] gap-2 items-start">
                <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold pt-0.5">
                  {row.label}
                </dt>
                <dd className={isNested ? 'text-[11px] break-words' : 'text-[12px] break-words'}>
                  <FormatByType v={row.value} type={row.type} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* IDENTIFICADORES / ALIASES: perfis correlacionados (rede + handle/email
          + confiança + status). Garante que a Identidade não fique vazia quando
          há identidades, mesmo com properties esparsas. */}
      {identidades && identidades.length > 0 && (
        <IdentificadoresSection items={identidades} />
      )}

      {/* TÉCNICO: não declarado no contrato → colapsado (dado preservado). */}
      {technical.length > 0 && (
        <details className="mt-3 pt-3 border-t border-border-light" data-testid="ficha-tecnico">
          <summary className="text-[10px] uppercase tracking-[0.14em] text-muted-on-light font-semibold cursor-pointer select-none">
            {t('ficha.ident.tecnico')} ({technical.length})
          </summary>
          <dl className="space-y-1.5 mt-2">
            {technical.map((row) => (
              <div key={row.key} className="grid grid-cols-[110px_1fr] gap-2 items-start">
                <dt className="text-[10px] text-muted-on-light/80 font-mono pt-0.5 truncate" title={row.key}>
                  {row.label}
                </dt>
                <dd className="text-[11px] font-mono text-muted-on-light break-words">
                  <ValueRender v={row.value} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {(obj?.created_at || obj?.updated_at) && (
        <div className="mt-3 pt-3 border-t border-border-light text-[10px] font-mono text-muted-on-light flex flex-wrap gap-x-4 gap-y-1">
          {obj.created_at && (
            <span>
              {t('ficha.ident.criado')}{' '}
              {new Date(obj.created_at).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
              {obj.created_by ? ` · ${obj.created_by}` : ''}
            </span>
          )}
          {obj.updated_at && (
            <span>
              {t('ficha.ident.atualizado')}{' '}
              {new Date(obj.updated_at).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          )}
        </div>
      )}
    </Widget>
  );
}

export function WidgetAntecedentes({ entityId }: { entityId?: string | null }) {
  return (
    <EvidenceList
      entityId={entityId ?? null}
      sourceTools={ANTECEDENTE_TOOLS}
      title="Antecedentes e integridade"
      empty="Nenhum registro de sanção/inidoneidade/vazamento. Monte o dossiê para cruzar CGU, TCU, OpenSanctions e ICIJ."
    />
  );
}

export function WidgetMandados({ entityId }: { entityId?: string | null }) {
  return (
    <EvidenceList
      entityId={entityId ?? null}
      sourceTools={MANDADO_TOOLS}
      title="Mandados (BNMP)"
      empty="Nenhum mandado no BNMP para esta entidade. Monte o dossiê para consultar."
    />
  );
}

export function WidgetVeiculos({
  entityId,
  canonical,
}: {
  entityId?: string | null;
  canonical?: boolean;
}) {
  const [rows, setRows] = React.useState<NeighborNode[] | null>(null);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    // Blocker #2: ficha de PESSOA é Entity → grafo é Entities.graph, não Links.neighbors
    // (que dava 404 → "0 veículos"). fetchNeighbors roteia pelo espaço de id correto.
    fetchNeighbors(entityId, canonical === true, { max_depth: 1, max_nodes: 100 })
      .then((out) => {
        if (cancelled) return;
        setRows(out.nodes.filter((n) => /ve[ií]culo|vehicle|placa|plate/i.test(n.node_type)));
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId, canonical]);

  return (
    <Widget title="Veículos vinculados" description={rows ? `${rows.length} vínculo(s)` : undefined}>
      {rows === null && <p className="text-[11px] text-muted-on-light italic">Carregando…</p>}
      {rows && rows.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-on-light italic">
          Nenhum veículo vinculado (LPR/ontologia). Vínculos surgem de detecções de placa ou
          relações cadastradas.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((v) => (
            <li
              key={v.id}
              className="text-[12px] border-b border-border-light/60 pb-1.5 last:border-b-0"
            >
              <a
                href={`/ficha/${encodeURIComponent(v.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono font-semibold text-text-on-light hover:text-primary"
              >
                {v.name || v.id.slice(0, 8)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

type EnderecoItem = {
  label: string;
  hint?: string;
  /** quando setado, usado pra montar o iframe OSM */
  lat?: number;
  lng?: number;
};

/**
 * Extrai endereços do `properties` do entity. Aceita:
 *  - `Endereço` (string única) → 1 item, sem coords
 *  - `enderecos` (array de strings) → N itens, sem coords
 *  - `enderecos` (array de objetos `{label, lat, lng, hint?}`) → N itens
 */
function parseEnderecos(
  properties: Record<string, unknown> | undefined,
): EnderecoItem[] {
  if (!properties) return [];
  const out: EnderecoItem[] = [];
  // Caso 1: Endereço string
  const single = (properties as Record<string, unknown>)['Endereço'] ??
    (properties as Record<string, unknown>)['endereco'];
  if (typeof single === 'string' && single.trim()) {
    out.push({ label: single, hint: 'principal' });
  }
  // Caso 2: enderecos array
  const list = (properties as Record<string, unknown>).enderecos;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) {
        out.push({ label: item });
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const label =
          typeof obj.label === 'string'
            ? obj.label
            : typeof obj.logradouro === 'string'
              ? String(obj.logradouro) +
                (obj.numero ? `, ${String(obj.numero)}` : '')
              : null;
        if (label) {
          out.push({
            label,
            hint: typeof obj.hint === 'string' ? obj.hint : undefined,
            lat: typeof obj.lat === 'number' ? obj.lat : undefined,
            lng: typeof obj.lng === 'number' ? obj.lng : undefined,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Constrói URL do OSM embed centralizada em um ponto. Bbox ≈ 600m em
 * cada direção a partir do alvo (≈ zoom 16).
 */
function osmEmbedUrl(lat: number, lng: number): string {
  const span = 0.006;
  const minLon = lng - span;
  const maxLon = lng + span;
  const minLat = lat - span;
  const maxLat = lat + span;
  return (
    `https://www.openstreetmap.org/export/embed.html?` +
    `bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}` +
    `&layer=mapnik&marker=${lat}%2C${lng}`
  );
}

export function WidgetEnderecos({
  properties,
}: {
  properties?: Record<string, unknown>;
} = {}) {
  const items = React.useMemo(() => parseEnderecos(properties), [properties]);
  // Coords primária pro mapa: 1º item com lat/lng OU geocode lazy do 1º.
  const [resolved, setResolved] = React.useState<{ lat: number; lng: number } | null>(
    items.find((i) => i.lat != null && i.lng != null)
      ? { lat: items[0].lat!, lng: items[0].lng! }
      : null,
  );
  const [geoError, setGeoError] = React.useState<string | null>(null);

  // Geocode lazy via Nominatim quando NÃO há coords no payload.
  React.useEffect(() => {
    if (resolved || items.length === 0) return;
    const first = items[0];
    let cancelled = false;
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
      encodeURIComponent(first.label);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((rows: { lat: string; lon: string }[]) => {
        if (cancelled) return;
        if (rows && rows[0]) {
          setResolved({ lat: parseFloat(rows[0].lat), lng: parseFloat(rows[0].lon) });
        } else {
          setGeoError('não geocodificado');
        }
      })
      .catch(() => {
        if (!cancelled) setGeoError('falha de rede');
      });
    return () => {
      cancelled = true;
    };
  }, [items, resolved]);

  if (items.length === 0) {
    return (
      <Widget title="Endereços conhecidos" span={2}>
        <p className="text-[11px] text-muted-on-light italic">
          Nenhum endereço registrado nas propriedades desta entidade.
        </p>
      </Widget>
    );
  }

  return (
    <Widget title="Endereços conhecidos" span={2}>
      <div className="flex gap-3 items-stretch">
        {/* OSM embed */}
        <div className="w-2/5 aspect-square border border-border-light overflow-hidden relative bg-panel-light">
          {resolved ? (
            <iframe
              key={`${resolved.lat},${resolved.lng}`}
              src={osmEmbedUrl(resolved.lat, resolved.lng)}
              title="OpenStreetMap"
              className="w-full h-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : geoError ? (
            <div className="absolute inset-0 flex items-center justify-center p-3 text-[10px] font-mono text-muted-on-light text-center">
              Mapa indisponível
              <br />
              {geoError}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-muted-on-light">
              Localizando…
            </div>
          )}
          {resolved && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${resolved.lat}&mlon=${resolved.lng}#map=17/${resolved.lat}/${resolved.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1 right-1 bg-canvas-light/90 border border-border-light text-[9px] font-mono px-1 hover:border-primary"
            >
              ver no OSM ↗
            </a>
          )}
        </div>

        {/* Lista */}
        <ul className="flex-1 space-y-2 text-[12px]">
          {items.map((it, i) => (
            <li key={`${it.label}-${i}`}>
              <p className="font-medium">{it.label}</p>
              {it.hint && (
                <p className="text-[11px] text-muted-on-light">{it.hint}</p>
              )}
              {it.lat != null && it.lng != null && (
                <p className="text-[10px] font-mono text-muted-on-light">
                  {it.lat.toFixed(4)}, {it.lng.toFixed(4)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Widget>
  );
}

export function WidgetLinhaTempo({ entityId }: { entityId?: string | null }) {
  const t = useT();
  const all = useEntityEvidence(entityId ?? null);
  const [limit, setLimit] = React.useState(25);
  const items = React.useMemo(() => {
    if (!all) return null;
    return all
      .filter((e) => e.collected_at)
      .slice()
      .sort((a, b) => (String(b.collected_at) > String(a.collected_at) ? 1 : -1));
  }, [all]);
  const shown = items ? items.slice(0, limit) : null;

  return (
    <Widget title="Linha do tempo" span={3} description={items ? `${items.length} evento(s)` : undefined}>
      {items === null && <p className="text-[11px] text-muted-on-light italic">Carregando…</p>}
      {items && items.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-on-light italic">
          Sem eventos datados ainda. Cada evidência coletada (dossiê, detecção CCTV, vínculo)
          aparece aqui em ordem cronológica.
        </p>
      )}
      {shown && shown.length > 0 && (
        <ol className="relative border-l border-border-light pl-4 space-y-3">
          {shown.map((e, i) => {
            const sum = compactSummary(e);
            return (
              <li key={`${e.source_tool ?? 'ev'}-${i}`} className="relative">
                <span className="absolute -left-[19px] top-1.5 w-2 h-2 bg-primary" />
                <p className="text-[11px] font-mono text-muted-on-light">
                  {formatDataHoraBR(e.collected_at as string)}
                </p>
                <p className="text-[12px] text-text-on-light">
                  {sourceLabel(e.source_tool)}
                  {sum && <span className="text-muted-on-light"> — {sum}</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {items && items.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 25)}
          className="mt-2 text-[11px] text-primary hover:underline"
        >
          {t('ficha.ev.verMais')} ({items.length - limit})
        </button>
      )}
    </Widget>
  );
}
