'use client';

/**
 * WidgetResumoExecutivo — painel de SITUAÇÃO no TOPO da ficha (FRENTE D).
 *
 * Lê SINAIS REAIS de duas fontes já existentes e nunca hardcoda vertical:
 *   • Entities.evidence(id)    → registros estruturados das fontes (BNMP, CGU,
 *                                 TCU, OpenSanctions, …). Daqui saem ALERTAS
 *                                 computados (mandado em aberto, sanção, PEP) e
 *                                 a contagem de fontes-com-dado vs consultadas.
 *   • Entities.identidades(id) → identidades possíveis/confirmadas. Daqui sai a
 *                                 confiança agregada (média) e o nº de
 *                                 identificadores distintos.
 *
 * Os ALERTAS são derivados do PAYLOAD da evidência (não de tabela de vertical):
 * um campo `status`/`situacao` com "EM ABERTO" numa evidência de mandado vira o
 * badge "Mandado em aberto"; qualquer registro vindo de fontes de sanção
 * (CGU/TCU/OpenSanctions) com hits vira "Sanção"; flag PEP em qualquer payload
 * vira "PEP". Tudo derivado do dado — multi-domínio.
 *
 * Visual: badges com BORDA (sem ícone colorido, sem rounded, sem emoji).
 */
import * as React from 'react';
import { Widget } from './widget';
import { useT } from '@/lib/i18n/provider';
import { Entities, type IdentidadePossivel } from '@/lib/api';

// ── Tipos locais (helpers mínimos — não reusa widgets-prontos, fora do escopo) ─
type EvidenceRow = {
  source_tool?: string;
  payload?: unknown;
  payload_excerpt?: string;
  confidence?: number;
  collected_at?: string;
};

/** Desembrulha o envelope do handler MCP {data,status,sha256} → usa o `data`. */
function unwrapEnvelope(payload: unknown): unknown {
  let p: unknown = payload;
  if (p && typeof p === 'object' && !Array.isArray(p) && 'data' in (p as Record<string, unknown>)) {
    const d = (p as Record<string, unknown>).data;
    if (d && typeof d === 'object') p = d;
  }
  return p;
}

/** payload estruturado (backend) ou fallback: parse do excerpt JSON. */
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

/** Acha os REGISTROS dentro do payload (mesmo critério dos widgets de histórico). */
function extractRecords(payload: unknown): Record<string, unknown>[] {
  const p = unwrapEnvelope(payload);
  if (Array.isArray(p)) {
    return p.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  if (p && typeof p === 'object') {
    const obj = p as Record<string, unknown>;
    for (const k of LIST_KEYS) {
      const v = obj[k];
      if (Array.isArray(v)) {
        return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
      }
    }
    return [obj];
  }
  return [];
}

// Heurísticas de SINAL (derivadas do dado, não de vertical hardcoded).
const STATUS_KEY_RE = /status|situa/i;
const OPEN_VALUE_RE = /em\s*aberto|aberto|ativo|pendente|cumprir|vigente|open|active/i;
const SANCTION_SOURCE_RE = /cgu|tcu|opensanctions|ceis|cnep|cepim|sancao|sancoes|inidone|inabilit/i;
const PEP_KEY_RE = /\bpep\b|politically.?exposed|pessoa.?exposta/i;
const PEP_VALUE_RE = /\bpep\b|exposta|exposed|true|sim|yes/i;
const MANDADO_SOURCE_RE = /bnmp|mandado/i;

type Alerta = { key: string; label: string };

/** Computa alertas a partir das evidências (status do payload + fonte). */
function computeAlertas(rows: EvidenceRow[], t: (k: string) => string): Alerta[] {
  const found = new Set<string>();
  for (const e of rows) {
    const recs = extractRecords(getPayload(e));
    if (!recs.length) continue;
    const src = e.source_tool ?? '';
    const isMandadoSrc = MANDADO_SOURCE_RE.test(src);
    const isSanctionSrc = SANCTION_SOURCE_RE.test(src);

    for (const rec of recs) {
      for (const [k, v] of Object.entries(rec)) {
        const val = typeof v === 'string' ? v : v == null ? '' : String(v);
        // Mandado em aberto: fonte BNMP/mandado + campo status com valor de "aberto".
        if (isMandadoSrc && STATUS_KEY_RE.test(k) && OPEN_VALUE_RE.test(val)) {
          found.add('mandado_aberto');
        }
        // PEP: chave OU valor sinalizando pessoa politicamente exposta.
        if (PEP_KEY_RE.test(k) && PEP_VALUE_RE.test(val)) {
          found.add('pep');
        }
      }
    }
    // Sanção: qualquer registro vindo de fonte de sanção/inidoneidade.
    if (isSanctionSrc) found.add('sancao');
  }
  const out: Alerta[] = [];
  if (found.has('mandado_aberto')) out.push({ key: 'mandado_aberto', label: t('ficha.resumo.alerta.mandadoAberto') });
  if (found.has('sancao')) out.push({ key: 'sancao', label: t('ficha.resumo.alerta.sancao') });
  if (found.has('pep')) out.push({ key: 'pep', label: t('ficha.resumo.alerta.pep') });
  return out;
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

function useEntityIdentidades(entityId: string | null): IdentidadePossivel[] | null {
  const [rows, setRows] = React.useState<IdentidadePossivel[] | null>(null);
  React.useEffect(() => {
    if (!entityId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows(null);
    Entities.identidades(entityId)
      .then((d) => !cancelled && setRows(Array.isArray(d?.identidades) ? d.identidades : []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [entityId]);
  return rows;
}

/** Métrica compacta (rótulo + número grande). */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-border-light bg-raised-light/30 px-3 py-2 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.14em] text-muted-on-light font-mono truncate">
        {label}
      </p>
      <p className="text-[18px] font-semibold text-text-on-light leading-tight mt-0.5 tabular-nums">
        {value}
      </p>
      {hint && <p className="text-[9px] font-mono text-muted-on-light mt-0.5 truncate">{hint}</p>}
    </div>
  );
}

export function WidgetResumoExecutivo({ entityId }: { entityId?: string | null }) {
  const t = useT();
  const id = entityId ?? null;
  const evidence = useEntityEvidence(id);
  const identidades = useEntityIdentidades(id);

  const alertas = React.useMemo(
    () => (evidence ? computeAlertas(evidence, t) : []),
    [evidence, t],
  );

  // Fontes consultadas vs com dado (registros presentes no payload).
  const { consultadas, comDado } = React.useMemo(() => {
    if (!evidence) return { consultadas: 0, comDado: 0 };
    const tools = new Set<string>();
    const withData = new Set<string>();
    for (const e of evidence) {
      const tool = e.source_tool ?? '∅';
      tools.add(tool);
      if (extractRecords(getPayload(e)).length > 0) withData.add(tool);
    }
    return { consultadas: tools.size, comDado: withData.size };
  }, [evidence]);

  // Confiança agregada de identidade (média) + nº de identificadores distintos.
  const { confMedia, numIdentificadores } = React.useMemo(() => {
    if (!identidades || identidades.length === 0) {
      return { confMedia: null as number | null, numIdentificadores: 0 };
    }
    const confs = identidades
      .map((i) => i.confianca)
      .filter((c): c is number => typeof c === 'number');
    const media = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    const ids = new Set(identidades.map((i) => `${i.tipo}:${i.identificador}`));
    return { confMedia: media, numIdentificadores: ids.size };
  }, [identidades]);

  const loading = evidence === null || identidades === null;

  return (
    <Widget title={t('ficha.resumo.titulo')} description={t('ficha.resumo.descricao')}>
      {loading ? (
        <p className="text-[11px] text-muted-on-light italic">{t('ficha.resumo.carregando')}</p>
      ) : (
        <div className="space-y-3">
          {/* Alertas */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-muted-on-light font-mono mb-1.5">
              {t('ficha.resumo.alertas')}
            </p>
            {alertas.length === 0 ? (
              <p className="text-[11px] text-muted-on-light italic">
                {t('ficha.resumo.semAlertas')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {alertas.map((a) => (
                  <span
                    key={a.key}
                    className="inline-flex items-center h-6 px-2 text-[10px] font-semibold uppercase tracking-wider border border-border-light bg-canvas-light text-text-on-light"
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Métricas de situação */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric
              label={t('ficha.resumo.fontes')}
              value={`${comDado}/${consultadas}`}
              hint={t('ficha.resumo.fontesHint')}
            />
            <Metric
              label={t('ficha.resumo.confianca')}
              value={confMedia == null ? '—' : `${Math.round(confMedia * 100)}%`}
              hint={t('ficha.resumo.confiancaHint')}
            />
            <Metric
              label={t('ficha.resumo.identificadores')}
              value={String(numIdentificadores)}
              hint={t('ficha.resumo.identificadoresHint')}
            />
          </div>
        </div>
      )}
    </Widget>
  );
}
