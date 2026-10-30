'use client';

/**
 * F1 — leva os TIPOS DE OBJETO PROPOSTOS pelo AIP (do blueprint embutido em
 * `wizard._blueprint`) até o select de "objeto" das skills de Coleta, que hoje só
 * lista tipos EXISTENTES (`Ontology.listNodeTypes`). Sem isto, o operador não vê,
 * no select, o `PerfilInstagram` que o próprio AIP acabou de propor no nó Ontologia.
 *
 * Context (não prop-drilling por 3 componentes): a página provê; o `DynamicRefSelect`
 * consome e mescla. Multidomínio — vem do contrato do blueprint.
 */
import * as React from 'react';

export type ProposedTypeProp = { key: string; label: string };
export type ProposedType = { kind: string; label: string; properties?: ProposedTypeProp[] };
export type RefOption = { value: string; label: string; proposed?: boolean };

const Ctx = React.createContext<ProposedType[]>([]);

export function ProposedTypesProvider({
  types,
  children,
}: {
  types: ProposedType[];
  children: React.ReactNode;
}) {
  // Estabiliza por conteúdo (evita re-render em cada novo array com mesmos dados).
  const key = types.map((t) => `${t.kind}:${t.label}`).join('|');
  const value = React.useMemo(() => types, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProposedTypes(): ProposedType[] {
  return React.useContext(Ctx);
}

/** Extrai {kind,label} dos ontology_types do blueprint embutido no graph. PURA. */
export function proposedTypesFromGraph(graph: unknown): ProposedType[] {
  const wiz = (graph as { wizard?: Record<string, unknown> } | undefined)?.wizard;
  const bp = wiz?._blueprint as
    | {
        ontology_types?: {
          kind?: string;
          display_name?: string;
          properties?: { key?: string; label?: string }[];
        }[];
      }
    | undefined;
  const out: ProposedType[] = [];
  const seen = new Set<string>();
  for (const o of bp?.ontology_types ?? []) {
    const kind = String(o.kind || '').trim();
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    // #7 — leva também as PROPRIEDADES propostas (p/ o select de propriedade da
    // variável "Busca de objetos" não cair em vazio p/ tipo ainda não materializado).
    const properties = (o.properties ?? [])
      .map((p) => ({ key: String(p.key || '').trim(), label: String(p.label || p.key || '').trim() }))
      .filter((p) => p.key);
    out.push({
      kind,
      label: String(o.display_name || o.kind || '').trim() || kind,
      properties: properties.length ? properties : undefined,
    });
  }
  return out;
}

/**
 * Mescla os tipos PROPOSTOS (deste build) com as opções de tipos EXISTENTES.
 * PURA / testável. Regras:
 *  - propostos que ainda NÃO existem entram PRIMEIRO (são a sugestão do AIP) com
 *    sufixo de proposta no rótulo + flag `proposed`;
 *  - propostos que já existem não duplicam (mantém a opção existente);
 *  - dedupe por `value` (kind).
 */
export function mergeObjectTypeOptions(
  existing: RefOption[],
  proposed: ProposedType[],
  proposedSuffix = '· proposto',
): RefOption[] {
  const existingValues = new Set(existing.map((o) => o.value));
  const fresh: RefOption[] = [];
  const seen = new Set<string>();
  for (const p of proposed) {
    const v = String(p.kind || '').trim();
    if (!v || existingValues.has(v) || seen.has(v)) continue;
    seen.add(v);
    fresh.push({ value: v, label: `${p.label} ${proposedSuffix}`.trim(), proposed: true });
  }
  return [...fresh, ...existing];
}
