'use client';

/**
 * Organizações — Painel de Controle (Sprint Foundry-A + UX-2.2 · 2026-05-22).
 *
 * Lista + Editar inline. Slug imutável (preserva referências); display_name
 * + active editáveis. Soft-delete via active=false. Delete hard só por admin
 * via console (Tenant tem dependências profundas em assets/auditoria —
 * intencionalmente fora do UI).
 */
import * as React from 'react';
import { Building2, Pencil, Trash2, ArchiveRestore, X, Plus } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { ACESSO_ORG_TABS } from '@/components/control-panel/hub-tabs';
import { useConfirm } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';
import { Organizations, type Organization } from '@/lib/api';

export default function OrganizacoesPage() {
  const askConfirm = useConfirm();
  const t = useT();
  const [orgs, setOrgs] = React.useState<Organization[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Organization | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  const refresh = React.useCallback(() => {
    setErr(null);
    Organizations.list({ limit: 100 })
      .then(setOrgs)
      .catch((e) => setErr(e?.message ?? 'Falha ao carregar Organizações'));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleActive = async (o: Organization) => {
    const next = !o.active;
    const ok = await askConfirm({
      title: (next ? t('orgs.reactivateTitle') : t('orgs.deactivateTitle')).replace(
        '{name}',
        o.display_name,
      ),
      description: next ? t('orgs.reactivateDesc') : t('orgs.deactivateDesc'),
      tone: next ? 'default' : 'warning',
      confirmLabel: next ? t('common.reactivate') : t('common.deactivate'),
    });
    if (!ok) return;
    try {
      await Organizations.update(o.id, { active: next });
      refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao alterar Organização');
    }
  };

  return (
    <RequirePerm perm="organization.read">
      <CpPageHeader
        title={t('orgs.title')}
        subtitle={t('orgs.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => setCreating(true)}
            data-testid="orgs-create"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
            {t('orgs.new')}
          </button>
        }
      />
      <CpHubSubnav group="Organizações" tabs={ACESSO_ORG_TABS} />
      <div className="p-6 max-w-4xl space-y-4">
        {orgs && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('common.filterNameSlug')}
            data-testid="orgs-filter"
            className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
          />
        )}
        {err && (
          <p className="text-[11px] text-danger font-mono" data-testid="orgs-error">
            {err}
          </p>
        )}
        {!orgs && !err && (
          <p className="text-[11.5px] text-muted-on-light italic">{t('common.loading')}</p>
        )}
        {orgs && orgs.length === 0 && (
          <p
            data-testid="orgs-empty"
            className="text-[11.5px] text-muted-on-light italic"
          >
            {t('orgs.empty')}
          </p>
        )}
        {orgs && orgs.length > 0 && (
          <ul className="space-y-2" data-testid="orgs-list">
            {orgs
              .filter((o) => {
                if (!filter.trim()) return true;
                const q = filter.trim().toLowerCase();
                return (
                  o.display_name.toLowerCase().includes(q) ||
                  o.slug.toLowerCase().includes(q)
                );
              })
              .map((o) => (
                <li
                  key={o.id}
                  data-testid={`org-${o.slug}`}
                  className={`bg-canvas-light border border-border-light p-3 flex items-start gap-3 ${
                    !o.active ? 'opacity-60' : ''
                  }`}
                >
                  <span className="inline-flex w-9 h-9 items-center justify-center bg-white border border-border-light shrink-0">
                    <Building2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-text-on-light truncate">
                        {o.display_name}
                      </p>
                      <span className="text-[10px] font-mono text-muted-on-light">
                        {o.slug}
                      </span>
                      {!o.active && (
                        <span className="text-[10px] font-mono bg-canvas-light border border-border-light px-1.5 h-4 inline-flex items-center text-muted-on-light uppercase">
                          {t('common.inactiveBadge')}
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-muted-on-light mt-0.5 font-mono">
                      {o.features.length > 0
                        ? o.features.join(' · ')
                        : t('orgs.noFeatures')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(o)}
                      data-testid={`org-edit-${o.slug}`}
                      aria-label={t('common.edit')}
                      title={t('common.edit')}
                      className="h-7 px-2.5 text-[11px] bg-white border border-border-light hover:border-primary flex items-center gap-1.5"
                    >
                      <Pencil className="w-3 h-3" strokeWidth={1.5} />
                      {t('common.edit')}
                    </button>
                    {o.active ? (
                      <button
                        type="button"
                        onClick={() => toggleActive(o)}
                        aria-label={t('common.deactivate')}
                        title={t('common.deactivate')}
                        data-testid={`org-deactivate-${o.slug}`}
                        className="h-7 w-7 flex items-center justify-center bg-white border border-border-light hover:border-danger hover:text-danger"
                      >
                        <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleActive(o)}
                        aria-label={t('common.reactivate')}
                        title={t('common.reactivate')}
                        data-testid={`org-reactivate-${o.slug}`}
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
        <EditOrgDialog
          org={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {creating && (
        <CreateOrgDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </RequirePerm>
  );
}

function CreateOrgDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [slug, setSlug] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Organizations.create({
        slug: slug.trim(),
        display_name: displayName.trim(),
      });
      onSaved();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Falha ao criar Organização');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      data-testid="org-create-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">{t('orgs.createTitle')}</h2>
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
          <Field label={t('common.slugLabel')}>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              data-testid="org-create-slug"
              placeholder="ex: ssp-rs"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            />
          </Field>
          <Field label={t('common.nameLabel')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              data-testid="org-create-name"
              placeholder="Nome da organização"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          {err && (
            <p
              className="text-[11px] text-danger font-mono"
              data-testid="org-create-error"
            >
              {err}
            </p>
          )}
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('orgs.createHint')}
          </p>
          <div className="flex items-center gap-2 pt-2 border-t border-border-light">
            <button
              type="submit"
              disabled={busy}
              data-testid="org-create-submit"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? t('common.creating') : t('orgs.createSubmit')}
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

function EditOrgDialog({
  org,
  onClose,
  onSaved,
}: {
  org: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [displayName, setDisplayName] = React.useState(org.display_name);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await Organizations.update(org.id, { display_name: displayName.trim() });
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
      data-testid="org-edit-dialog"
      className="fixed inset-0 z-50 flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" strokeWidth={1.5} />
          <h2 className="text-[13px] font-semibold flex-1">{t('orgs.editTitle')}</h2>
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
              data-testid="org-edit-name"
              className="w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary"
            />
          </Field>
          <Field label={t('common.slugLabel')}>
            <input
              type="text"
              value={org.slug}
              disabled
              data-testid="org-edit-slug"
              className="w-full h-8 px-2 text-[12px] bg-canvas-light border border-border-light font-mono text-muted-on-light"
            />
          </Field>
          {err && (
            <p className="text-[11px] text-danger font-mono" data-testid="org-edit-error">
              {err}
            </p>
          )}
          <p className="text-[10.5px] text-muted-on-light italic">
            {t('common.slugImmutable')}
          </p>
          <div className="flex items-center gap-2 pt-2 border-t border-border-light">
            <button
              type="submit"
              disabled={busy}
              data-testid="org-edit-save"
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
