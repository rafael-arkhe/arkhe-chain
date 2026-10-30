'use client';

/**
 * Modal "Novo aplicativo" — escolhe surface + alvo antes de criar.
 *
 * 3 surfaces:
 *   - standalone   → app renderiza em /workshop/{id} (padrão)
 *   - entity_ficha → substitui /ficha/{id} pra entity.kind = target_kind
 *   - search_result → substitui DetalheObjeto do /buscar pra source = target_source
 *
 * surface ∈ {entity_ficha, search_result} é "ação global" — exige perm
 * security.workshop.publish_global. Sem ela, os radios ficam disabled.
 */
import * as React from 'react';
import { LayoutDashboard, Search, UserSquare2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useCan } from '@/lib/auth/useAuth';
import { SOURCE_CATALOG, CATEGORY_ORDER, CATEGORY_LABEL } from '@/lib/buscar/types';
import { SmartSelect, type SelectOption } from '@/components/ui/smart-select';

export type Surface = 'standalone' | 'entity_ficha' | 'search_result';

export type CreatePayload = {
  display: string;
  slug: string;
  surface: Surface;
  target_kind?: string;
  target_source?: string;
  /** Seed específico a clonar como layout inicial (override do
   *  pickFichaSeed/pickSearchResultSeed). Sprint 2: usado pelo template
   *  "Demo · Eventos + Overlay" pra trazer overlays + events. */
  seed_id?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreatePayload) => Promise<void> | void;
  /**
   * Pré-fill quando operador escolhe um template — modal abre com os
   * valores já preenchidos pro fluxo "duplicate-and-customize".
   * Operador ainda pode editar antes de criar.
   */
  initial?: Partial<{
    display: string;
    surface: Surface;
    target_kind: string;
    target_source: string;
    seed_id: string;
  }>;
};

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'parlamentar', label: 'Parlamentar' },
  { value: 'pessoa', label: 'Pessoa' },
  { value: 'empresa', label: 'Empresa' },
  { value: 'partido', label: 'Partido' },
  { value: 'uf', label: 'UF / Estado' },
  { value: 'fornecedor', label: 'Fornecedor CEAP' },
  { value: 'video', label: 'Vídeo' },
  { value: 'canal', label: 'Canal' },
  { value: 'evento', label: 'Evento' },
  { value: 'perfil_social', label: 'Perfil social' },
  { value: 'noticia', label: 'Notícia' },
  { value: 'proposicao', label: 'Proposição' },
  { value: 'ioc', label: 'IOC' },
];

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function NovoAppModal({ open, onClose, onCreate, initial }: Props) {
  const canPublishGlobal = useCan('security.workshop.publish_global');

  const [display, setDisplay] = React.useState('');
  const [surface, setSurface] = React.useState<Surface>('standalone');
  const [targetKind, setTargetKind] = React.useState<string>('parlamentar');
  const [targetSource, setTargetSource] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDisplay(initial?.display ?? '');
      setSurface(initial?.surface ?? 'standalone');
      setTargetKind(initial?.target_kind ?? 'parlamentar');
      setTargetSource(initial?.target_source ?? '');
      setSubmitting(false);
      setError(null);
    }
  }, [open, initial]);

  // Opções pros SearchableSelects — kind + source com group por categoria.
  // IMPORTANTE: declarar TODOS hooks (useMemo/useState/useEffect) antes
  // do early return `if (!open)` pra não violar Rules of Hooks.
  const kindOptions: SelectOption[] = React.useMemo(
    () =>
      KIND_OPTIONS.map((k) => ({
        value: k.value,
        label: k.label,
        hint: k.value,
      })),
    [],
  );
  const sourceOptions: SelectOption[] = React.useMemo(() => {
    const out: SelectOption[] = [];
    for (const cat of CATEGORY_ORDER) {
      const cands = SOURCE_CATALOG.filter((s) => s.mcpTool && s.category === cat);
      for (const s of cands) {
        out.push({
          value: s.key,
          label: s.label,
          group: CATEGORY_LABEL[cat],
          hint: s.mcpTool ?? undefined,
        });
      }
    }
    return out;
  }, []);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!display.trim()) {
      setError('Informe um nome pro app.');
      return;
    }
    if (surface === 'search_result' && !targetSource) {
      setError('Escolha a fonte de busca.');
      return;
    }
    const payload: CreatePayload = {
      display: display.trim(),
      slug: slugify(display) || `app-${Date.now()}`,
      surface,
      target_kind: surface === 'entity_ficha' ? targetKind : undefined,
      target_source: surface === 'search_result' ? targetSource : undefined,
      seed_id: initial?.seed_id,
    };
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="workshop-novo-modal"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-canvas-light border border-border-light"
      >
        <header className="h-10 px-3 border-b border-border-light flex items-center bg-raised-light/40">
          <p className="text-[11px] uppercase tracking-[0.16em] font-semibold flex-1">
            Novo aplicativo
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-7 w-7 flex items-center justify-center hover:bg-raised-light"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          <div>
            <label
              htmlFor="novo-display"
              className="block text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1"
            >
              Nome
            </label>
            <input
              id="novo-display"
              data-testid="novo-display"
              type="text"
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              placeholder="ex: Dashboard Aurora · Ficha parlamentar custom"
              className="w-full h-9 px-2.5 text-[12px] bg-canvas-light border border-border-light outline-none focus:border-primary"
              autoFocus
            />
            {display && (
              <p className="mt-1 text-[10px] font-mono text-muted-on-light">
                slug: {slugify(display) || 'app-…'}
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-2">
              Onde o app aparece
            </legend>
            <div className="grid grid-cols-3 gap-2">
              <SurfaceCard
                value="standalone"
                current={surface}
                onChange={setSurface}
                title="Página própria"
                subtitle="Você acessa direto pelo menu Workshop"
                Icon={LayoutDashboard}
                preview={<PreviewStandalone />}
              />
              <SurfaceCard
                value="entity_ficha"
                current={surface}
                onChange={setSurface}
                title="Ficha de entidade"
                subtitle="Abre ao clicar em uma pessoa, empresa, parlamentar…"
                Icon={UserSquare2}
                preview={<PreviewFicha />}
                disabled={!canPublishGlobal}
                disabledReason="Requer permissão de publicar"
              />
              <SurfaceCard
                value="search_result"
                current={surface}
                onChange={setSurface}
                title="Detalhe da busca"
                subtitle="Abre ao clicar num resultado do Buscar"
                Icon={Search}
                preview={<PreviewSearch />}
                disabled={!canPublishGlobal}
                disabledReason="Requer permissão de publicar"
              />
            </div>
          </fieldset>

          {surface === 'entity_ficha' && (
            <div>
              <label
                htmlFor="novo-kind"
                className="block text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1"
              >
                Tipo de entidade
              </label>
              <SmartSelect
                id="novo-kind"
                data-testid="novo-kind"
                value={targetKind}
                onChange={setTargetKind}
                options={kindOptions}
                placeholder="— escolha um tipo —"
                searchPlaceholder="Buscar tipo (parlamentar, empresa, …)"
              />
              <p className="mt-1 text-[10px] text-muted-on-light">
                Este app vai substituir o layout default de qualquer entidade com{' '}
                <code className="font-mono text-primary">kind={targetKind}</code>.
              </p>
            </div>
          )}

          {surface === 'search_result' && (
            <div>
              <label
                htmlFor="novo-source"
                className="block text-[10px] uppercase tracking-[0.16em] text-muted-on-light font-semibold font-mono mb-1"
              >
                Fonte de busca
              </label>
              <SmartSelect
                id="novo-source"
                data-testid="novo-source"
                value={targetSource}
                onChange={setTargetSource}
                options={sourceOptions}
                placeholder="— escolha uma fonte —"
                searchPlaceholder="Buscar fonte (YouTube, Câmara, Bluesky…)"
                emptyLabel="Nenhuma fonte encontrada"
              />
              <p className="mt-1 text-[10px] text-muted-on-light">
                Quando operador clicar num resultado desta fonte, o app renderiza
                no painel direito (substitui o detalhe default).
              </p>
            </div>
          )}

          {error && (
            <div className="px-2.5 py-1.5 text-[11px] text-danger border border-danger/40 bg-danger/5">
              {error}
            </div>
          )}
        </div>

        <footer className="px-3 py-2 border-t border-border-light bg-raised-light/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !display.trim()}
            data-testid="novo-submit"
            className="h-7 px-2.5 text-[11px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? 'Criando…' : 'Criar app'}
          </button>
        </footer>
      </form>
    </div>
    </ModalPortal>
  );
}

function SurfaceCard({
  value,
  current,
  onChange,
  title,
  subtitle,
  Icon,
  preview,
  disabled,
  disabledReason,
}: {
  value: Surface;
  current: Surface;
  onChange: (v: Surface) => void;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  preview: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const active = current === value;
  return (
    <label
      className={cn(
        'relative flex flex-col border cursor-pointer transition-all overflow-hidden',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border-light bg-canvas-light hover:border-primary/60 hover:bg-raised-light/30',
        disabled && 'cursor-not-allowed opacity-55',
      )}
      title={disabled ? disabledReason : ''}
    >
      <input
        type="radio"
        name="surface"
        value={value}
        checked={active}
        onChange={() => !disabled && onChange(value)}
        disabled={disabled}
        data-testid={`surface-${value}`}
        className="sr-only"
      />

      {/* Preview ilustrativo (mini-mockup) */}
      <div
        className={cn(
          'relative h-24 border-b border-border-light/60 bg-raised-light/40 flex items-center justify-center',
          active && 'bg-primary/8',
        )}
      >
        {preview}
        <div
          className={cn(
            'absolute top-1.5 left-1.5 w-7 h-7 flex items-center justify-center border',
            active
              ? 'bg-primary text-white border-primary'
              : 'bg-canvas-light text-muted-on-light border-border-light',
          )}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        </div>
        {active && (
          <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-primary text-white text-[9px] flex items-center justify-center font-bold">
            ✓
          </span>
        )}
      </div>

      <div className="px-2.5 py-2 flex-1">
        <p className="text-[12px] font-semibold text-text-on-light leading-tight">
          {title}
        </p>
        <p className="text-[10px] text-muted-on-light leading-relaxed mt-1">
          {subtitle}
        </p>
        {disabled && disabledReason && (
          <p className="text-[9px] text-warning mt-1.5 italic">{disabledReason}</p>
        )}
      </div>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Mini-mockups das 3 surfaces (SVG/CSS — leves, sem download)               */
/* -------------------------------------------------------------------------- */
function PreviewStandalone() {
  // Mockup: grid de 3 widgets cards na página
  return (
    <div className="flex flex-col gap-1 w-16">
      <div className="h-2 bg-primary/30 border border-primary/40 w-full" />
      <div className="grid grid-cols-3 gap-1">
        <div className="aspect-square bg-canvas-light border border-border-light" />
        <div className="aspect-square bg-canvas-light border border-border-light" />
        <div className="aspect-square bg-canvas-light border border-border-light" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <div className="h-3 bg-canvas-light border border-border-light" />
        <div className="h-3 bg-canvas-light border border-border-light" />
      </div>
    </div>
  );
}

function PreviewFicha() {
  // Mockup: cabeçalho de ficha com avatar + abas + conteúdo
  return (
    <div className="flex flex-col gap-1 w-16">
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 bg-primary/40 border border-primary/60" />
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="h-1 bg-text-on-light/70 w-3/4" />
          <div className="h-0.5 bg-muted-on-light/40 w-1/2" />
        </div>
      </div>
      <div className="flex gap-0.5">
        <div className="h-1.5 flex-1 bg-primary border-b border-primary" />
        <div className="h-1.5 flex-1 bg-border-light/50" />
        <div className="h-1.5 flex-1 bg-border-light/50" />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-1">
        <div className="h-4 bg-canvas-light border border-border-light" />
        <div className="h-4 bg-canvas-light border border-border-light" />
      </div>
    </div>
  );
}

function PreviewSearch() {
  // Mockup: barra de busca + lista 2-col com painel detalhe à direita destacado
  return (
    <div className="flex flex-col gap-1 w-16">
      <div className="h-1.5 bg-canvas-light border border-border-light" />
      <div className="grid grid-cols-[1fr_1fr] gap-1 flex-1">
        <div className="flex flex-col gap-0.5">
          <div className="h-1 bg-border-light/60" />
          <div className="h-1 bg-border-light/60" />
          <div className="h-1 bg-primary/60" />
          <div className="h-1 bg-border-light/60" />
        </div>
        <div className="bg-primary/15 border border-primary/40 flex flex-col gap-0.5 p-0.5">
          <div className="h-1 bg-primary/50" />
          <div className="h-0.5 bg-primary/30" />
          <div className="h-0.5 bg-primary/30" />
        </div>
      </div>
    </div>
  );
}
