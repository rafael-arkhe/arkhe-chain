'use client';

/**
 * Espaços — Painel de Controle (Sprint Foundry-A · 2026-05-22).
 *
 * Lista de Espaços (Foundry: Spaces) que agrupam Operações sob uma
 * ontologia comum + restringem o acesso a uma ou mais Organizações.
 *
 * Suporta criação inline via formulário no rodapé. Gated por
 * `space.read` (listagem) e `space.write` (criação).
 *
 * Esta primeira iteração da Fase Foundry-A entrega CRUD básico — Espaço
 * Compartilhado (multi-org) e gerenciamento de Operações vivem em
 * iterações posteriores.
 */
import * as React from 'react';
import { Layers, Plus, Pencil, Trash2, ArchiveRestore, X } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { Projects, Spaces, type Space } from '@/lib/api';

export default function EspacosPage() {
  const askConfirm = useConfirm();
  const t = useT();
  const [spaces, setSpaces] = React.useState<Space[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Space | null>(null);
  const [filter, setFilter] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const deactivate = async (s: Space) => {
    const ok = await askConfirm({
      title: t('espacos.deactivateTitle').replace('{name}', s.display_name),
      description: t('espacos.deactivateDesc'),
      tone: 'warning',
      confirmLabel: t('common.deactivate'),
    });
    if (!ok) return;
    try {
      await Spaces.softDelete(s.id);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao desativar');
    }
  };

  const reactivate = async (s: Space) => {
    try {
      await Spaces.update(s.id, { active: true });
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao reativar');
    }
  };

  const [projectsBySpace, setProjectsBySpace] = React.useState<
    Record<string, number>
  >({});

  const refresh = React.useCallback(() => {
    setErr(null);
    Promise.all([
      Spaces.list({ limit: 200 }),
      Projects.list({ include_inactive: true }),
    ])
      .then(([sp, projs]) => {
        setSpaces(sp);
        // Sprint UX-3.2: count Operações por Espaço.
        const map: Record<string, number> = {};
        for (const p of projs) {
          const sid = (p as { space_id?: string | null }).space_id;
          if (sid) map[sid] = (map[sid] ?? 0) + 1;
        }
        setProjectsBySpace(map);
      })
      .catch((e) => setErr(e?.message ?? 'Falha ao carregar Espaços'));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Spaces.create({
        slug: slug.trim(),
        display_name: displayName.trim(),
        description: description.trim() || undefined,
      });
      setSlug('');
      setDisplayName('');
      setDescription('');
      setCreating(false);
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Espaço');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequirePerm perm="space.read">
      <CpPageHeader
        title={t('espacos.title')}
        subtitle={t('espacos.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            data-testid="espacos-toggle-create"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {creating ? t('common.cancel') : t('espacos.new')}
          </button>
        }
      />
      <div className="p-6 max-w-4xl space-y-4">
        {creating && (
          <form
            onSubmit={submit}
            data-testid="espacos-form"
            className="bg-canvas-light border border-border-light p-4 space-y-3"
          >
            <header className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <p className="text-[10px] uppercase tracking-[0.16em] font-semibold">
                {t('espacos.newHeader')}
              </p>
            </header>
            <Field label={t('common.slugLabel')}>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                data-testid="espacos-slug"
                placeholder="ex: seguranca"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
              />
            </Field>
            <Field label={t('common.nameLabel')}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                data-testid="espacos-display-name"
                placeholder="Nome do espaço"
                className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <Field label={t('common.descriptionLabel')}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                data-testid="espacos-description"
                placeholder={t('espacos.descPlaceholder')}
                className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
              />
            </Field>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                data-testid="espacos-submit"
                className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? t('common.creating') : t('espacos.createSubmit')}
              </button>
            </div>
          </form>
        )}

        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="espacos-error">
            {err}
          </p>
        )}
        {!spaces && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {spaces && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('common.filterNameSlug')}
            data-testid="espacos-filter"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        )}
        {spaces && spaces.length === 0 && (
          <p
            data-testid="espacos-empty"
            className="text-[11.5px] text-muted-on-light italic"
          >
            {t('espacos.empty')}
          </p>
        )}
        {spaces && spaces.length > 0 && (
          <ul className="space-y-2" data-testid="espacos-list">
            {spaces
              .filter((s) => {
                if (!filter.trim()) return true;
                const q = filter.trim().toLowerCase();
                return (
                  s.display_name.toLowerCase().includes(q) ||
                  s.slug.toLowerCase().includes(q)
                );
              })
              .map((s) => (
                <li
                  key={s.id}
                  data-testid={`espaco-${s.slug}`}
                  className={`bg-canvas-light border border-border-light p-3 flex items-start gap-3 ${
                    !s.active ? 'opacity-60' : ''
                  }`}
                >
                  <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
                    <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-text-on-light truncate">
                        {s.display_name}
                      </p>
                      <span className="text-[10px] font-mono text-muted-on-light">
                        {s.slug}
                      </span>
                      {!s.active && (
                        <span className="text-[10px] font-mono bg-canvas-light border border-border-light px-1.5 h-4 inline-flex items-center text-muted-on-light uppercase">
                          {t('common.inactiveBadgeM')}
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-[11.5px] text-muted-on-light mt-0.5">
                        {s.description}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-on-light mt-1 font-mono">
                      {t('espacos.orgMembers')
                        .replace('{n}', String(s.organizations.length))
                        .replace(
                          '{orgWord}',
                          s.organizations.length === 1
                            ? t('common.orgSingular')
                            : t('common.orgPlural'),
                        )
                        .replace(
                          '{memberWord}',
                          s.organizations.length === 1
                            ? t('common.memberSingular')
                            : t('common.memberPlural'),
                        )}
                      {projectsBySpace[s.id] > 0 && (
                        <>
                          {' · '}
                          <span
                            data-testid={`espaco-projects-count-${s.slug}`}
                            className="text-primary"
                          >
                            {projectsBySpace[s.id]}{' '}
                            {projectsBySpace[s.id] === 1
                              ? t('common.operationSingular')
                              : t('common.operationPlural')}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(s)}
                      data-testid={`espaco-edit-${s.slug}`}
                      className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                    >
                      <Pencil className="w-3 h-3" strokeWidth={1.5} />
                      {t('common.edit')}
                    </button>
                    {s.active ? (
                      <button
                        type="button"
                        onClick={() => deactivate(s)}
                        aria-label={t('common.deactivate')}
                        title={t('common.deactivate')}
                        data-testid={`espaco-deactivate-${s.slug}`}
                        className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivate(s)}
                        aria-label={t('common.reactivate')}
                        title={t('common.reactivate')}
                        data-testid={`espaco-reactivate-${s.slug}`}
                        className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-primary"
                      >
                        <ArchiveRestore className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditEspacoDialog
          space={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </RequirePerm>
  );
}

function EditEspacoDialog({
  space,
  onClose,
  onSaved,
}: {
  space: Space;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [displayName, setDisplayName] = React.useState(space.display_name);
  const [description, setDescription] = React.useState(space.description ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Spaces.update(space.id, {
        display_name: displayName.trim(),
        description: description.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="espaco-edit-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">{t('espacos.editTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-on-light hover:text-text-on-light"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>
        <form onSubmit={save} className="p-4 space-y-3">
          <Field label={t('common.nameLabel')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              data-testid="espaco-edit-name"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          <Field label={t('common.descriptionLabel')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="espaco-edit-desc"
              className="w-full px-2 py-1.5 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          <Field label={t('common.slugLabel')}>
            <input
              type="text"
              value={space.slug}
              disabled
              data-testid="espaco-edit-slug"
              className="w-full h-8 px-2 text-[12px] bg-canvas-light border border-border-light font-mono text-muted-on-light"
            />
          </Field>
          {err && (
            <p
              className="text-[11px] text-danger font-mono"
              data-testid="espaco-edit-error"
            >
              {err}
            </p>
          )}
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('espacos.slugImmutable')}
          </p>
          <div className="flex items-center gap-2 pt-2 border-t border-border-light">
            <button
              type="submit"
              disabled={busy}
              data-testid="espaco-edit-save"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-on-light font-semibold">
        {label}
      </p>
      {children}
    </div>
  );
}
