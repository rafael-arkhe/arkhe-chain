'use client';

import { use, useEffect, useState } from 'react';
import { Box, Download, Share2 } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { InlineRename } from '@/components/ficha/inline-rename';
import { FichaAcoesMenu } from '@/components/ficha/acoes-menu';
import { MontarDossieButton } from '@/components/ficha/montar-dossie-button';
import { useCan } from '@/lib/auth/useAuth';
import { Entities, Ontology, type ObjectTypeSchema } from '@/lib/api';
import { Cctv } from '@/lib/api/cctv';
import { type ClassificationLevel } from '@/lib/classification';
import { OBJECT_ICONS, OBJECT_LABELS } from '@/lib/object-icons';
import type { ObjectType } from '@/lib/mock-data';
import { FichaWorkshopShell } from '@/components/ficha/ficha-workshop-shell';
import { PersonalizarFichaButton } from '@/components/ficha/personalizar-button';
import { WidgetIdentidades } from '@/components/ficha/widget-identidades';

/**
 * Ficha renderizada via Workshop.
 *
 * Por que client component: o resolver da entity (`Entities.get` →
 * fallback `Cctv.cctvEntity`) usa o `apiFetch` que envia cookies
 * httpOnly pelo proxy `/api/*`. Fetchs server-side do Next 15 não
 * incluem cookies automaticamente — pra evitar reescrever o transport
 * todo, a página inteira vira client e o fetch faz parte do mount.
 *
 * Resolução (em ordem): Entity (/entities) → stream CCTV → OBJETO
 * CANÔNICO (OntologyNode via /ontology/nodes/{id}) — T1.
 * O canônico renderiza a MESMA surface entity_ficha (seed canônica ou
 * override do Workshop por target_kind), com tipo humano do type-def.
 */
type ObjLike = {
  id: string;
  name: string;
  entity_type: string;
  properties: Record<string, unknown>;
  classification?: string;
  /** true quando o id resolveu pra OntologyNode canônico (não Entity). */
  __canonical?: boolean;
  /** display_name do type-def (objectTypeSchema) — tipo humano, não cru. */
  __type_label?: string;
  /** Contrato do type-def (objectTypeSchema) — labels/tipos/is_title das props.
   *  Dirige o WidgetIdentificacao (negócio formatado + técnico colapsado). */
  __schema?: unknown;
};

export default function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [obj, setObj] = useState<ObjLike | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'not_found'>('loading');
  // Fontes que falharam no dossiê que abriu esta ficha (hand-off do /buscar via
  // sessionStorage — régua "fontes que falharam visíveis"). Cache transitório.
  const [sourcesFailed, setSourcesFailed] = useState<{ tool: string; error?: string }[]>([]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`dossie_failed_${id}`);
      if (raw) {
        setSourcesFailed(JSON.parse(raw));
        sessionStorage.removeItem(`dossie_failed_${id}`);
      }
    } catch {
      /* sessionStorage indisponível — ignora */
    }
  }, [id]);
  // Tarefa D — rename do nó CANÔNICO usa PUT /ontology/nodes/{id}; o gate
  // espelha a perm de escrita do backend (ontology.objects.write).
  const canWriteObjects = useCan('ontology.objects.write');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await Entities.get(id);
        if (!cancelled) {
          setObj(e as ObjLike);
          setStatus('ok');
        }
        return;
      } catch {
        /* tenta fallbacks REAIS (CCTV → nó canônico). O fallback local
         * fabricado (FALLBACK_ENTITIES) morreu em 2026-06-12 — ficha
         * inexistente mostra not_found honesto, nunca dossiê inventado. */
      }
      try {
        const cctv = await Cctv.cctvEntity(id);
        if (!cancelled) {
          setObj({
            id: cctv.id,
            name: cctv.name,
            entity_type: cctv.entity_type,
            properties: cctv.properties,
            classification: 'restrito',
          });
          setStatus('ok');
        }
        return;
      } catch {
        /* tenta objeto canônico */
      }
      // T1 — FALLBACK CANÔNICO: id é um OntologyNode (conector, câmera,
      // compute_endpoint, instância de create_object...). Ficha de 1ª
      // classe pra qualquer objeto da ontologia, mesma surface Workshop.
      try {
        const node = await Ontology.getNode(id);
        // Tipo humano + CONTRATO do type-def (best-effort). O schema NÃO é mais
        // descartado: vai pro obj.__schema → o WidgetIdentificacao usa
        // label/tipo/is_title pra mostrar negócio formatado e colapsar técnico
        // (props fora do contrato). Multidomínio: a verdade vem da ontologia.
        let typeLabel = node.node_type;
        let typeSchema: unknown = null;
        try {
          const schema = await Ontology.objectTypeSchema(node.node_type);
          if (schema?.display_name) typeLabel = schema.display_name;
          typeSchema = schema ?? null;
        } catch {
          /* type-def indisponível — ficha degrada pro fallback heurístico */
        }
        if (!cancelled) {
          setObj({
            id: node.id,
            name: node.name || node.id,
            entity_type: node.node_type,
            properties: node.properties ?? {},
            classification: 'restrito',
            __canonical: true,
            __type_label: typeLabel,
            __schema: typeSchema,
          });
          setStatus('ok');
        }
        return;
      } catch {
        /* não achou */
      }
      if (!cancelled) setStatus('not_found');
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === 'loading') {
    return (
      <PageShell
        title="Carregando ficha…"
        subtitle={id}
        classification="restrito"
        theme="light"
      >
        <div className="h-full flex items-center justify-center text-[12px] text-muted-on-light">
          Resolvendo entidade…
        </div>
      </PageShell>
    );
  }

  if (status === 'not_found' || !obj) {
    return (
      <PageShell
        title="Ficha não encontrada"
        subtitle={id}
        classification="restrito"
        theme="light"
      >
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md border border-border-light bg-white p-4 text-[12px] font-mono">
            <p className="text-text-on-light mb-2">
              Nenhuma entidade ou stream CCTV com o id{' '}
              <code className="text-primary">{id}</code> foi encontrada.
            </p>
            <p className="text-muted-on-light text-[11px]">
              Verifique se o id está correto ou se você tem permissão pra ler
              essa entidade.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  const tipo = obj.entity_type as ObjectType;
  const isCanonical = obj.__canonical === true;
  // Ícone NEUTRO pra tipo desconhecido (Box) — NUNCA cai no ícone de pessoa.
  // Pessoa/veículo/etc. conhecidos mantêm o ícone próprio do catálogo.
  const Icon = OBJECT_ICONS[tipo] ?? Box;
  const cls = obj.classification as ClassificationLevel;
  // Tipo humano: type-def do objeto canônico > label estático > kind cru.
  const tipoLabel = obj.__type_label || OBJECT_LABELS[tipo] || tipo;
  const subtitle = Object.values(obj.properties)
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).replace(/\s+/g, ' ').trim())
    .filter((v) => v.length > 0 && v.length <= 80)
    .slice(0, 3)
    .join(' · ');

  return (
    <PageShell
      title={
        <>
          <Icon className="w-4 h-4 text-muted-on-light" strokeWidth={1.5} />
          <span>{obj.name}</span>
          {/* Rename: Entity/CCTV via PATCH do CCTV; nó CANÔNICO via
              Ontology.updateNode (otimista + rollback), gated pela perm
              de escrita da ontologia (Tarefa D). */}
          {!isCanonical ? (
            <InlineRename entityId={obj.id} initial={obj.name} />
          ) : canWriteObjects ? (
            <InlineRename
              entityId={obj.id}
              initial={obj.name}
              canonical
              onSaved={(newName) =>
                setObj((prev) => (prev ? { ...prev, name: newName } : prev))
              }
            />
          ) : null}
        </>
      }
      subtitle={`${tipoLabel} · ${obj.id} · ${subtitle}`}
      classification={cls}
      classificationLabel={`FICHA · ${obj.id.toUpperCase()}`}
      theme="light"
      toolbar={
        <>
          <PersonalizarFichaButton entityType={obj.entity_type} canonical={isCanonical} />
          <button
            type="button"
            disabled
            title="Compartilhamento — em breve"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light flex items-center gap-1.5 opacity-50 cursor-not-allowed"
          >
            <Share2 className="w-3 h-3" strokeWidth={1.5} /> Compartilhar
          </button>
          <button
            type="button"
            disabled
            title="Exportar PDF — em breve"
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light flex items-center gap-1.5 opacity-50 cursor-not-allowed"
          >
            <Download className="w-3 h-3" strokeWidth={1.5} /> Exportar PDF
          </button>
          {/* Dossiê MULTIDOMÍNIO (P5 Onda 2) — vale p/ QUALQUER objeto canônico;
              derivação de fontes por CAMPO/forma das properties. Só nó canônico
              + perm correlation.run (gate interno do componente). */}
          <MontarDossieButton nodeId={obj.id} nodeName={obj.name} canonical={isCanonical} />
          {/* Ações do TIPO (type_def.actions) — populado do contrato do Object
              Type; clicar leva à seção "Ações" da ficha (execução governada). */}
          <FichaAcoesMenu
            entityType={obj.entity_type}
            schema={(obj.__schema as ObjectTypeSchema | null) ?? null}
          />
        </>
      }
    >
      {sourcesFailed.length > 0 && (
        <div
          className="m-3 border border-border-light bg-panel-light p-3 text-[11px]"
          data-testid="ficha-fontes-falhas"
        >
          <p className="font-semibold text-text-on-light mb-1">
            {sourcesFailed.length} fonte{sourcesFailed.length > 1 ? 's' : ''} falhou neste dossiê
          </p>
          <ul className="space-y-0.5">
            {sourcesFailed.map((f) => (
              <li key={f.tool} className="font-mono text-muted-on-light">
                {f.tool}
                {f.error ? ` — ${f.error}` : ''}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSourcesFailed([])}
            className="mt-1.5 text-[10px] text-primary hover:underline"
          >
            dispensar
          </button>
        </div>
      )}
      <FichaWorkshopShell obj={obj} />
      <WidgetIdentidades entityId={obj.id} entityType={obj.entity_type} />
    </PageShell>
  );
}
