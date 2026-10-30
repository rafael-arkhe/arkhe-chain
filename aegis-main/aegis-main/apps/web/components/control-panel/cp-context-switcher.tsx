'use client';

/**
 * <CpContextSwitcher /> — Sprint UX-1.1 (2026-05-22).
 *
 * Popover acionado pelo botão "Trocar" no header do painel de controle.
 * Permite escolher Espaço + Operação ativos. A Organização é fixada ao
 * tenant do usuário autenticado (sem multi-tenant switch dentro de uma
 * sessão).
 *
 * Persistência: server-side via `PUT /me/context` (User.metadata_.context).
 * Memória: `feedback_no_localstorage_for_persistence` — zero localStorage.
 *
 * Estilo Palantir-sharp: sem rounded-*, sem Sparkles, sem emoji.
 */
import * as React from 'react';
import { ArrowLeftRight, Building2, FolderSearch, Layers, X } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import {
  MeContextApi,
  Projects,
  Spaces,
  type MeContext,
  type OrganizationMembership,
  type ProjectListItem,
  type Space,
} from '@/lib/api';

interface Props {
  onClose: () => void;
  onSwitched?: (ctx: MeContext) => void;
}

export function CpContextSwitcher({ onClose, onSwitched }: Props) {
  const dialogRef = useDialogA11y({ open: true, onClose });
  const [ctx, setCtx] = React.useState<MeContext | null>(null);
  const [organizations, setOrganizations] = React.useState<OrganizationMembership[]>(
    [],
  );
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadCtxData = React.useCallback(() => {
    Promise.all([
      MeContextApi.get(),
      MeContextApi.listOrganizations(),
      Spaces.list(),
      Projects.list(),
    ])
      .then(([c, orgs, s, p]) => {
        setCtx(c);
        setOrganizations(orgs);
        setSpaces(s);
        setProjects(p);
      })
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar contexto'));
  }, []);

  React.useEffect(() => {
    loadCtxData();
  }, [loadCtxData]);

  const apply = async (patch: {
    organization_id?: string | null;
    space_id?: string | null;
    project_id?: string | null;
  }) => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await MeContextApi.set(patch);
      setCtx(updated);
      onSwitched?.(updated);
      // Sprint PR1: Org switch invalida listas (espaços/operações são por Org).
      if (patch.organization_id !== undefined) {
        const [s, p] = await Promise.all([Spaces.list(), Projects.list()]);
        setSpaces(s);
        setProjects(p);
      }
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao trocar contexto');
    } finally {
      setBusy(false);
    }
  };

  // Operações filtradas pelo Espaço ativo (se houver).
  const filteredProjects = React.useMemo(() => {
    if (!projects) return [];
    if (!ctx?.space_id) return projects;
    return projects.filter((p) => (p as ProjectListItem & { space_id?: string }).space_id === ctx.space_id);
  }, [projects, ctx?.space_id]);

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="cp-context-switcher"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[560px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">Trocar contexto</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {err && (
            <p
              className="text-[11px] text-danger font-mono"
              data-testid="cp-context-error"
            >
              {err}
            </p>
          )}

          {!ctx && !err && (
            <p className="text-[11.5px] text-muted-on-light italic">Carregando…</p>
          )}

          {ctx && (
            <>
              {/* Organização — Sprint PR1: select habilitado se >1 Org. */}
              <section className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-primary" strokeWidth={1.5} />
                  Organização
                </p>
                {organizations.length <= 1 ? (
                  <div
                    data-testid="cp-context-org"
                    className="flex items-center gap-2 bg-canvas-light border border-border-light px-3 h-9"
                  >
                    <span className="flex-1 text-[12px] font-semibold truncate">
                      {ctx.organization_name}
                    </span>
                    <span className="text-[10px] font-mono text-muted-on-light shrink-0">
                      única membership
                    </span>
                  </div>
                ) : (
                  <select
                    value={ctx.organization_id}
                    onChange={(e) =>
                      apply({
                        organization_id: e.target.value,
                        space_id: null,
                        project_id: null,
                      })
                    }
                    disabled={busy}
                    data-testid="cp-context-org"
                    className="w-full h-9 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.display_name} ({o.slug}) ·{' '}
                        {o.role === 'owner'
                          ? 'membro'
                          : o.role === 'guest'
                          ? 'convidado'
                          : 'admin'}
                      </option>
                    ))}
                  </select>
                )}
              </section>

              {/* Espaço */}
              <section className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-primary" strokeWidth={1.5} />
                  Espaço
                </p>
                <select
                  value={ctx.space_id ?? ''}
                  onChange={(e) =>
                    apply({
                      space_id: e.target.value || null,
                      project_id: null, // resetar operação ao trocar espaço
                    })
                  }
                  disabled={busy}
                  data-testid="cp-context-space"
                  className="w-full h-9 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
                >
                  <option value="">— sem espaço selecionado —</option>
                  {(spaces ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name} ({s.slug})
                    </option>
                  ))}
                </select>
              </section>

              {/* Operação */}
              <section className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.16em] font-semibold flex items-center gap-1.5">
                  <FolderSearch className="w-3 h-3 text-primary" strokeWidth={1.5} />
                  Operação
                </p>
                <select
                  value={ctx.project_id ?? ''}
                  onChange={(e) => apply({ project_id: e.target.value || null })}
                  disabled={busy || filteredProjects.length === 0}
                  data-testid="cp-context-project"
                  className="w-full h-9 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">— sem operação selecionada —</option>
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} ({p.slug})
                    </option>
                  ))}
                </select>
                {ctx.space_id && filteredProjects.length === 0 && (
                  <p className="text-[10.5px] text-muted-on-light italic">
                    Nenhuma Operação vinculada a este Espaço ainda.
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            data-testid="cp-context-done"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover"
          >
            Concluir
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
