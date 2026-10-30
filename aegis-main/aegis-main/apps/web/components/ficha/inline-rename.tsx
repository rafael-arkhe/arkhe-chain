'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X } from 'lucide-react';
import { Ontology } from '@/lib/api';
import { Cctv } from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';

type Props = {
  entityId: string;
  initial: string;
  /**
   * Tarefa D — true quando o id é um OntologyNode CANÔNICO: salva via
   * Ontology.updateNode (PUT /ontology/nodes/{id}, perm
   * ontology.objects.write, lineage automático) de forma OTIMISTA —
   * o título muda já; erro → rollback + mensagem. O caller é quem gateia
   * pela perm (useCan('ontology.objects.write')).
   */
  canonical?: boolean;
  onSaved?: (newName: string) => void;
};

/**
 * Campo de renomear no header da ficha. Clica no ícone, digita,
 * Enter salva, Esc cancela.
 * - Entity/CCTV (default): PATCH /cctv/entities/{id} + router.refresh().
 * - Nó canônico (canonical): Ontology.updateNode otimista com rollback.
 * O operador transforma "Pessoa #0001" em "João Silva" — depois disso
 * a ficha + lista de detecções + timeline passam a mostrar o nome real.
 */
export function InlineRename({ entityId, initial, canonical = false, onSaved }: Props) {
  const router = useRouter();
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // mantém o texto exibido enquanto o server-component não revalida —
  // evita "salvei mas continuou Pessoa #0001" do feedback do operador.
  const [displayed, setDisplayed] = useState(initial);

  const saveCanonical = async (next: string) => {
    const prev = displayed;
    // OTIMISTA: título atualiza já; rollback se o backend recusar.
    setDisplayed(next);
    onSaved?.(next);
    setEditing(false);
    setSaving(true);
    setErr(null);
    try {
      const node = await Ontology.updateNode(entityId, { name: next });
      const finalName = node?.name || next;
      setDisplayed(finalName);
      setValue(finalName);
      onSaved?.(finalName);
    } catch (e) {
      // ROLLBACK: nome anterior volta + mensagem visível pro operador.
      setDisplayed(prev);
      setValue(prev);
      onSaved?.(prev);
      setErr(e instanceof Error && e.message ? e.message : t('ficha.rename.error'));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const next = value.trim();
    if (!next || next === displayed) {
      setEditing(false);
      return;
    }
    if (canonical) {
      await saveCanonical(next);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await Cctv.entityUpdate(entityId, { display: next });
      setDisplayed(r.display);
      onSaved?.(r.display);
      setEditing(false);
      // router.refresh invalida o cache do RSC → re-fetch do server,
      // ficha inteira atualiza sem F5 manual.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t('ficha.rename.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="ficha-rename"
          className="inline-flex items-center gap-1 hover:text-primary"
          title={t('ficha.rename.tooltip')}
        >
          <Pencil className="w-3 h-3 opacity-70" strokeWidth={1.5} />
        </button>
        {err && (
          <span data-testid="ficha-rename-error" className="text-[10px] text-danger">
            {err}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setValue(displayed);
            setEditing(false);
          }
        }}
        autoFocus
        disabled={saving}
        data-testid="ficha-rename-input"
        className="h-7 px-2 text-[13px] bg-white border border-primary outline-none min-w-[200px]"
        placeholder={t('ficha.rename.placeholder')}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        aria-label={t('common.save')}
        className={cn(
          'w-6 h-6 flex items-center justify-center border',
          'bg-success text-white border-success hover:opacity-80 disabled:opacity-50',
        )}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(displayed);
          setEditing(false);
        }}
        aria-label={t('common.cancel')}
        className="w-6 h-6 flex items-center justify-center bg-raised-light border border-border-light hover:border-danger"
      >
        <X className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      {err && (
        <span data-testid="ficha-rename-error" className="text-[10px] text-danger">
          {err}
        </span>
      )}
    </span>
  );
}
