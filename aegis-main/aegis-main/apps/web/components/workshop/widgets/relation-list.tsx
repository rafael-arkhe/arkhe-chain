'use client';

/**
 * Relation List ("Vínculos") — mostra as RELAÇÕES (arestas) do objeto selecionado.
 *
 * Sem isto, o operador CRIA a relação (lookup → aresta) mas NÃO a vê em lugar nenhum
 * — relação invisível = relação morta. Lê o id do objeto da binding de seleção e busca
 * os vizinhos 1-hop (`/platform/v23/links/{id}/neighbors`), agrupando por relação +
 * direção. Estética Palantir-sharp: sem rounded, sem emoji.
 */
import * as React from 'react';
import Link from 'next/link';
import { Loader2, Link2, ArrowRight, ArrowLeft } from 'lucide-react';
import {
  fetchNeighbors,
  type NeighborsOut,
  type NeighborNode,
  type NeighborEdge,
} from '@/lib/ficha/neighbors';
import { registerWidget, type WidgetRenderProps } from '../WorkshopV2Renderer';
import type { ObjectTypeSchema, ObjectTypeLink } from '@/lib/api';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';
import { useT } from '@/lib/i18n/provider';
import { objectKindLabel } from '@/lib/i18n/kind-labels';
import { redeLabel } from '@/lib/i18n/rede-labels';

type Cfg = { title?: string; source: string; href_template?: string };

/** Mesma semântica do object_card: '/ficha/{{id}}' resolve com props do nó vizinho. */
function resolveHref(template: string, node: NeighborNode): string {
  const dict = node as unknown as Record<string, unknown>;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = dict[k];
    return v == null ? '' : encodeURIComponent(String(v));
  });
}

function pick(
  variables: Record<string, unknown>,
  bindings: Record<string, unknown>,
  source: string,
): Record<string, unknown> {
  const parts = (source || '').split('.');
  let cur: unknown = parts[0] in variables ? variables[parts[0]] : bindings[parts[0]];
  for (let i = 1; i < parts.length; i++) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[parts[i]];
    else return {};
  }
  return cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : {};
}

/** Capitaliza o tipo cru de relação — fallback quando não há tradução curada. */
function capitalizeRelation(r: string): string {
  const s = (r || '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Símbolo de cardinalidade do link type (universal, não traduzido). */
function cardinalitySymbol(c?: string): string {
  switch ((c || '').toLowerCase()) {
    case 'one_to_one':
      return '1:1';
    case 'one_to_many':
      return '1:N';
    case 'many_to_one':
      return 'N:1';
    case 'many_to_many':
      return 'N:N';
    default:
      return '';
  }
}

/**
 * Rótulo curado pt-BR/en-US da relação. Antes só capitalizava (jogando
 * `identity_decision` na tela como "Identity decision" — em inglês!). Agora resolve
 * via dicionário i18n `ficha.rel.<relation_type>`; se a chave não existir, `t()`
 * devolve a própria chave → caímos no capitalize do tipo cru (multi-domínio: qualquer
 * relação nova aparece legível sem precisar de tradução prévia).
 */
function useRelationLabel(): (r: string) => string {
  const t = useT();
  return React.useCallback(
    (r: string) => {
      const key = `ficha.rel.${(r || '').trim()}`;
      const translated = t(key);
      if (translated && translated !== key) return translated;
      return capitalizeRelation(r) || t('ficha.vinc.fallback');
    },
    [t],
  );
}

/** Confiança 0..1 → pct inteiro (mesma régua do painel Identidades). */
function pctOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = n <= 1 ? n * 100 : n; // aceita 0..1 OU já-em-pct
  return Math.max(0, Math.min(100, Math.round(r)));
}

type RelChip = { text: string; tone: 'status' | 'plain' };

/**
 * Contexto da ARESTA como chips: status (possível/confirmada) + confiança
 * (properties ou weight). A qualificação societária e a natureza do vínculo
 * agora vivem na LINHA 1 do card (autoexplicativa), não aqui. Multi-domínio:
 * não interpreta vertical, só superficializa o dado.
 */
function edgeChips(
  edge: NeighborEdge | undefined,
  t: (k: string) => string,
): RelChip[] {
  const chips: RelChip[] = [];
  const p = edge?.properties ?? {};

  const rawStatus = String(p.status ?? '').toLowerCase();
  if (rawStatus === 'possible') chips.push({ text: t('ficha.vinc.status.possivel'), tone: 'status' });
  else if (rawStatus === 'confirmed') chips.push({ text: t('ficha.vinc.status.confirmada'), tone: 'status' });

  const pct = pctOf(p.confianca ?? p.confidence ?? edge?.weight);
  if (pct != null) chips.push({ text: `${t('ficha.vinc.confianca')} ${pct}%`, tone: 'plain' });

  return chips;
}

/**
 * Title-case de nome em CAPS ("CLARICE COPPETTI" → "Clarice Coppetti"), preservando
 * @handles e siglas curtas. Só normaliza quando a string está toda em maiúsculas —
 * nomes já capitalizados ou handles (@felipeneto) passam intactos.
 */
function nomeTitle(name: string): string {
  const s = (name || '').trim();
  if (!s) return '';
  if (s.startsWith('@')) return s; // handle de perfil — não mexer
  const hasLower = /[a-zà-ÿ]/.test(s);
  if (hasLower) return s; // já tem minúsculas → respeita o casing da fonte
  return s
    .toLowerCase()
    .replace(/\b([a-zà-ÿ])/g, (_, c: string) => c.toUpperCase());
}

export function RelationList({ config, variables, bindings, emit }: WidgetRenderProps) {
  const cfg = config as Cfg;
  const t = useT();
  const relationLabel = useRelationLabel();
  const obj = pick(variables ?? {}, bindings ?? {}, cfg.source || 'item_selecionado');
  const nodeId = typeof obj.id === 'string' ? obj.id : '';
  // Roteia o grafo certo: OntologyNode canônico → Links.neighbors; Entity → Entities.graph.
  // (Evita o 404 "node not found" ao passar um Entity.id pro grafo da ontologia.)
  const isCanonical = obj.__canonical === true;

  const [data, setData] = React.useState<NeighborsOut | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!nodeId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErr(null);
    fetchNeighbors(nodeId, isCanonical, { max_depth: 1, max_nodes: 100 })
      .then((out) => {
        if (!cancelled) setData(out);
      })
      .catch((e) => {
        if (!cancelled) setErr(humanizeApiError(e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, isCanonical]);

  const nodeById = React.useMemo(
    () => new Map((data?.nodes ?? []).map((n) => [n.id, n] as const)),
    [data],
  );
  const groups = React.useMemo(() => {
    // Carrega a ARESTA junto do nó vizinho — sem isto o contexto (status/qualificação/
    // confiança) que neighbors.ts agora preserva morreria de novo na agregação.
    const g: Record<string, Array<{ node: NeighborNode; dir: 'out' | 'in'; edge: NeighborEdge }>> =
      {};
    for (const e of data?.edges ?? []) {
      const isOut = e.source_id === nodeId;
      const otherId = isOut ? e.target_id : e.source_id;
      const other = nodeById.get(otherId);
      if (!other || other.id === nodeId) continue;
      (g[e.relation_type] ??= []).push({ node: other, dir: isOut ? 'out' : 'in', edge: e });
    }
    return g;
  }, [data, nodeById, nodeId]);
  const relTypes = Object.keys(groups);

  // ENRIQUECE o agrupamento com os LINK TYPES do contrato (objectTypeSchema.links):
  // tipo-alvo legível + cardinalidade por relação. Mantém o fallback genérico
  // (i18n/capitalize) pra relação NOVA não declarada no contrato — multidomínio.
  const typeDef = (variables?.type_def as ObjectTypeSchema | null | undefined) ?? null;
  const linkByRelation = React.useMemo(() => {
    const m = new Map<string, ObjectTypeLink>();
    for (const l of typeDef?.links ?? []) {
      if (l?.relation && !m.has(l.relation)) m.set(l.relation, l);
    }
    return m;
  }, [typeDef]);

  return (
    <div
      className="bg-white border border-border-light p-3 flex flex-col gap-2"
      data-testid="relation-list"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold flex items-center gap-1">
        <Link2 className="w-3 h-3" strokeWidth={1.5} />
        {cfg.title ?? t('ficha.vinc.titulo')}
      </p>
      {!nodeId && <p className="text-[11px] text-muted-on-light">{t('ficha.vinc.selecione')}</p>}
      {nodeId && busy && (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          {t('ficha.vinc.carregando')}
        </p>
      )}
      {nodeId && err && <p className="text-[11px] text-danger">{err}</p>}
      {nodeId && !busy && !err && relTypes.length === 0 && (
        <p className="text-[11px] text-muted-on-light">{t('ficha.vinc.vazio')}</p>
      )}
      {relTypes.map((rt) => {
        // Enriquecimento do contrato (quando a relação está declarada): tipo-alvo
        // legível + cardinalidade. Relação não declarada → só o rótulo (fallback).
        const link = linkByRelation.get(rt);
        const card = cardinalitySymbol(link?.cardinality);
        const hint = link
          ? [link.target_label, card].filter(Boolean).join(' · ')
          : '';
        return (
        <div key={rt} className="flex flex-col gap-1">
          <p className="text-[10px] text-muted-on-light flex items-center gap-1.5">
            <span>{relationLabel(rt)}</span>
            {hint && (
              <span
                data-testid="relation-group-hint"
                className="text-[9px] font-mono text-muted-on-light/80 border border-border-light px-1 py-0.5"
              >
                {hint}
              </span>
            )}
          </p>
          {groups[rt].map(({ node, dir, edge }, i) => {
            const p = edge?.properties ?? {};
            const url = typeof p.url === 'string' && p.url.trim() ? p.url.trim() : '';
            // A decisão perfil-vs-ficha é do WIDGET via o DADO (relation_type ou
            // properties.url) — NÃO do seed: perfil tem URL externa navegável; vínculo
            // de ontologia aponta pra ficha do outro nó.
            const isProfile = rt === 'identity_decision' || !!url;
            const rawStatus = String(p.status ?? '').toLowerCase();
            const qual = String(p.qualificacao ?? p.qualification ?? '').trim();
            const chips = edgeChips(edge, t);
            const nome = nomeTitle(node.name || node.id.slice(0, 8));

            // LINHA 1 — a NATUREZA do vínculo, autoexplicativa.
            const titulo = isProfile
              ? `${
                  rawStatus === 'possible'
                    ? t('ficha.vinc.perfilStatusPossivel')
                    : t('ficha.vinc.perfilEm')
                } ${redeLabel(p.rede)}: ${node.name || node.id.slice(0, 8)}`
              : `${relationLabel(rt)}${qual ? ` — ${qual}` : ''}`;

            const inner = (
              <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  {dir === 'out' ? (
                    <ArrowRight className="w-3 h-3 opacity-50 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ArrowLeft className="w-3 h-3 opacity-50 shrink-0" strokeWidth={1.5} />
                  )}
                  <span className="truncate font-medium">{titulo}</span>
                </span>
                {/* LINHA 2 — COM O QUÊ: tipo do objeto (pt-BR) · nome legível. */}
                <span className="text-[10px] text-muted-on-light truncate pl-[18px]">
                  {objectKindLabel(t, node.node_type)} · {nome}
                </span>
                {chips.length > 0 && (
                  <span className="flex items-center gap-1 flex-wrap pl-[18px]">
                    {chips.map((c, ci) => (
                      <span
                        key={`${c.text}-${ci}`}
                        data-testid="relation-badge"
                        className={
                          c.tone === 'status'
                            ? 'text-[9px] uppercase tracking-wider px-1 py-0.5 border border-primary/40 text-primary'
                            : 'text-[9px] font-mono px-1 py-0.5 border border-border-light text-muted-on-light'
                        }
                      >
                        {c.text}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            );

            const action = (
              <span className="text-[10px] text-muted-on-light shrink-0 self-start mt-0.5">
                {isProfile
                  ? `${t('ficha.vinc.abrirPerfil')} ↗`
                  : `${t('ficha.vinc.verFicha')} →`}
              </span>
            );

            const cls =
              'min-h-7 px-2 py-1 text-[11px] border border-border-light bg-raised-light flex items-start gap-1.5 text-left hover:border-primary hover:bg-white transition-colors';

            // PERFIL: navega pro PERFIL real (URL externa) — clicar abre a rede,
            // não uma /ficha/{{id}} inexistente. Nova aba (links de perfil sempre).
            if (isProfile) {
              return (
                <a
                  key={node.id + String(i)}
                  data-testid="relation-item"
                  href={url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls}
                >
                  {inner}
                  {action}
                </a>
              );
            }
            // T1 ficha canônica: com `href_template` o vínculo NAVEGA (link real
            // pra ficha do outro nó — '/ficha/{{id}}') em vez de emitir overlay.
            if (cfg.href_template) {
              return (
                <Link
                  key={node.id + String(i)}
                  data-testid="relation-item"
                  href={resolveHref(cfg.href_template, node)}
                  className={cls}
                >
                  {inner}
                  {action}
                </Link>
              );
            }
            // NAVEGÁVEL (#130): clicar no vínculo emite `select_change` com o nó vizinho
            // → o app fia set_variable(item_selecionado=node) + open_overlay(ficha), e a
            // ficha re-renderiza no objeto relacionado. Mesmo contrato do object_list.
            return (
              <button
                type="button"
                key={node.id + String(i)}
                data-testid="relation-item"
                onClick={() =>
                  emit?.('select_change', { selected: node, selected_id: node.id })
                }
                className={cls}
              >
                {inner}
                {action}
              </button>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}

registerWidget('relation_list', RelationList, {
  group: 'detalhe',
  label: 'Vínculos',
  description:
    'Mostra as relações (arestas) do objeto selecionado — as entidades vinculadas, agrupadas por relação e direção.',
  icon: 'link-2',
  defaultColSpan: 6,
  mockConfig: { title: 'Vínculos', source: 'item_selecionado' },
  mockVariables: {
    item_selecionado: { id: 'demo-node-1', name: 'Apartamento 302', node_type: 'Imovel' },
  },
  config_schema: [
    {
      name: 'title',
      label: 'Título',
      field: 'string',
    },
    {
      name: 'source',
      label: 'Objeto selecionado (binding)',
      field: 'variable-ref',
    },
    {
      name: 'href_template',
      label: 'Template do link (usa {{prop}})',
      description:
        'Quando preenchido (ex.: /ficha/{{id}}), clicar no vínculo navega pra ficha do outro nó em vez de emitir seleção.',
      field: 'string',
      placeholder: '/ficha/{{id}}',
    },
  ],
});
