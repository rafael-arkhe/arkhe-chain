'use client';

/**
 * Botão "Personalizar ficha" — clona a seed em código pra um app
 * workshop com surface=entity_ficha + target_kind, persiste no backend
 * e redireciona pro editor. A próxima vez que `/ficha/{id}` for aberta
 * com a mesma kind, o resolver vai achar esse app e usá-lo no lugar
 * do default.
 *
 * Idempotente: se já existe app workshop pro target_kind, abre direto
 * o editor dele. Permite que vários operadores com `workshop.edit`
 * trabalhem na mesma ficha sem clonar de novo.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Loader2 } from 'lucide-react';
import { useCan } from '@/lib/auth/useAuth';
import { Workshop } from '@/lib/workshop/client';
import { pickFichaSeed } from '@/lib/workshop/seeds/ficha';
import { OBJECT_LABELS } from '@/lib/object-icons';
import type { ObjectType } from '@/lib/mock-data';

type Props = {
  entityType: string;
  /** true quando a ficha é de OntologyNode canônico — a seed clonada é a
   *  genérica de objeto (identificação + vínculos), não a de pessoa. */
  canonical?: boolean;
};

export function PersonalizarFichaButton({ entityType, canonical }: Props) {
  const router = useRouter();
  const canEdit = useCan('security.workshop.edit');
  const canPublish = useCan('security.workshop.publish_global');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Botão só pra quem tem ambas as perms — escolher kind pra publicar
  // muda a ficha global da tenant.
  if (!canEdit || !canPublish) return null;

  const kindLabel = OBJECT_LABELS[entityType as ObjectType] || entityType;

  const handle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1. Já existe app pra essa kind? Abre direto.
      const existing = await Workshop.bySurface({
        surface: 'entity_ficha',
        target_kind: entityType,
      });
      if (existing) {
        router.push(`/workshop/edit/${existing.id}`);
        return;
      }
      // 2. Não existe — clona a seed em código como ponto de partida.
      const seed = pickFichaSeed(entityType, { canonical });
      const created = await Workshop.create({
        external_id: `ficha-${entityType}-${Date.now().toString(36)}`,
        display: `Ficha · ${kindLabel}`,
        description: `Layout customizado pra entities com kind=${entityType}.`,
        schema_version: 2,
        variables: seed.variables ?? [],
        layout: seed.layout,
        surface: 'entity_ficha',
        target_kind: entityType,
      });
      router.push(`/workshop/edit/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        data-testid="ficha-personalizar"
        title={`Personalizar layout de fichas de ${kindLabel}`}
        className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
        ) : (
          <Pencil className="w-3 h-3" strokeWidth={1.5} />
        )}
        Personalizar
      </button>
      {error && (
        <span className="text-[10px] text-danger truncate max-w-[200px]" title={error}>
          {error}
        </span>
      )}
    </>
  );
}
