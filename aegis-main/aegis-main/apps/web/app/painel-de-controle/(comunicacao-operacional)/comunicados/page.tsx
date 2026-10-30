'use client';

/**
 * /painel-de-controle/comunicados — Onda I.5 (2026-05-23).
 *
 * CRUD admin dos banners globais agendados (fecha a lacuna H.4.B: o
 * backend `/platform/v23/comunicados` já existia, faltava a UI de gestão).
 *
 * Layout 3-col (Palantir sharp):
 *   ┌──────────────┬─────────────────────────────┬────────────────┐
 *   │ Lista 320px  │   Form (centro)             │  Preview vivo  │
 *   │ filtros +    │   title/body/kind/icon/cta  │  380px         │
 *   │ busca + rows │   + agenda + audiência      │  ComunicadoPreview
 *   └──────────────┴─────────────────────────────┴────────────────┘
 *
 * Ações: Criar (Novo), Editar (click row), Excluir (ConfirmDialog com
 * requireConfirmText="excluir"), Duplicar, Publicar/Agendar. Cada mutação
 * emite LineageEvent no backend (comunicado.create/update/delete).
 *
 * Permissão: ``app_shell.manage`` (catálogo IAM; admin sempre passa). O
 * backend aceita ``app_shell.manage`` OU ``workspace.publish``.
 *
 * Memórias honradas:
 *  - feedback_no_localstorage_for_persistence · backend (ontology-module)
 *    é o único storage; nada de localStorage pra config de domínio.
 *  - feedback_no_rounded_no_sparkles · zero rounded-*, zero Sparkles.
 *  - feedback_no_emojis_in_ui · só ícones lucide-react.
 *  - feedback_no_palantir_product_names · "Comunicados" é o nome visível.
 *  - feedback_new_pages_link_iam · perm_key no catálogo + RequirePerm +
 *    sidenav (control-panel-shell.tsx) + atribuição ao admin.
 *  - feedback_workshop_edit_palantir_quality · 3-pane palette/canvas/inspector.
 */
import * as React from 'react';
import { Copy, Megaphone, Save, Send, Trash2, X } from 'lucide-react';
import { RequirePerm } from '@/components/auth/require-perm';
import {
  CpPageHeader,
} from '@/components/control-panel/control-panel-shell';
import { CpSkeleton, CpErrorState } from '@/components/control-panel/cp-skeleton';
import { ConfirmProvider, useConfirm } from '@/components/dialog/confirm-dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  Comunicados,
  type ComunicadoOut,
  type ComunicadoCreate,
} from '@/lib/api';
import {
  ComunicadosList,
  type ListStatusFilter,
  type ListKindFilter,
} from '@/components/comunicados-admin/comunicados-list';
import {
  ComunicadoForm,
  EMPTY_FORM,
  type ComunicadoFormValue,
} from '@/components/comunicados-admin/comunicado-form';
import { ComunicadoPreview } from '@/components/comunicados-admin/comunicado-preview';

/** Estado de seleção: 'new' = criando, string = id em edição, null = nada. */
type Selection = { mode: 'new' } | { mode: 'edit'; id: string } | null;

function outToForm(c: ComunicadoOut): ComunicadoFormValue {
  return {
    kind: c.kind,
    title: c.title,
    body: c.body ?? '',
    icon: c.icon,
    closable: c.closable,
    duration_s: c.duration_s,
    audience_roles: c.audience_roles,
    audience_iam_perms: c.audience_iam_perms,
    audience_groups: c.audience_groups,
    schedule_start: c.schedule_start,
    schedule_end: c.schedule_end,
    schedule_days_of_week: c.schedule_days_of_week,
    cta_label: c.cta_label,
    cta_href: c.cta_href,
  };
}

function formToCreate(v: ComunicadoFormValue): ComunicadoCreate {
  return {
    kind: v.kind,
    title: v.title,
    body: v.body,
    icon: v.icon,
    closable: v.closable,
    duration_s: v.duration_s,
    audience_roles: v.audience_roles,
    audience_iam_perms: v.audience_iam_perms,
    audience_groups: v.audience_groups,
    schedule_start: v.schedule_start,
    schedule_end: v.schedule_end,
    schedule_days_of_week: v.schedule_days_of_week,
    cta_label: v.cta_label,
    cta_href: v.cta_href,
  };
}

export default function ComunicadosAdminPage() {
  return (
    <RequirePerm perm="app_shell.manage">
      <ConfirmProvider>
        <ComunicadosAdminInner />
      </ConfirmProvider>
    </RequirePerm>
  );
}

function ComunicadosAdminInner() {
  const confirm = useConfirm();

  // ── Lista state ─────────────────────────────────────────────────────────
  const [items, setItems] = React.useState<ComunicadoOut[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // ── Filtros (não persistem em localStorage — estado de UI puro) ─────────
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<ListStatusFilter>('all');
  const [kindFilter, setKindFilter] = React.useState<ListKindFilter>('all');

  // ── Editor state ────────────────────────────────────────────────────────
  const [selection, setSelection] = React.useState<Selection>(null);
  const [form, setForm] = React.useState<ComunicadoFormValue>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // include_deleted=false: histórico de soft-delete não polui a gestão.
      const rows = await Comunicados.list({ status_temporal: 'all' });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar comunicados');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const startNew = () => {
    setSelection({ mode: 'new' });
    setForm(EMPTY_FORM);
    setSaveErr(null);
  };

  const startEdit = (c: ComunicadoOut) => {
    setSelection({ mode: 'edit', id: c.id });
    setForm(outToForm(c));
    setSaveErr(null);
  };

  const cancelEdit = () => {
    setSelection(null);
    setForm(EMPTY_FORM);
    setSaveErr(null);
  };

  const validate = (v: ComunicadoFormValue): string | null => {
    if (!v.title.trim()) return 'Título é obrigatório.';
    if (v.cta_label && !v.cta_href)
      return 'Botão de ação precisa de URL quando o rótulo está preenchido.';
    if (v.cta_href && !v.cta_label)
      return 'Botão de ação precisa de rótulo quando a URL está preenchida.';
    return null;
  };

  async function handleSave() {
    const err = validate(form);
    if (err) {
      setSaveErr(err);
      return;
    }
    setSaving(true);
    setSaveErr(null);
    try {
      if (selection?.mode === 'edit') {
        const updated = await Comunicados.patch(selection.id, formToCreate(form));
        toast.success('Comunicado atualizado.');
        setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelection({ mode: 'edit', id: updated.id });
      } else {
        const created = await Comunicados.create(formToCreate(form));
        const scheduled = !!form.schedule_start &&
          Date.parse(form.schedule_start) > Date.now();
        toast.success(
          scheduled ? 'Comunicado agendado.' : 'Comunicado publicado.',
        );
        setItems((prev) => [created, ...prev]);
        setSelection({ mode: 'edit', id: created.id });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar';
      setSaveErr(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: ComunicadoOut) {
    const ok = await confirm({
      title: 'Excluir comunicado?',
      description: (
        <span>
          O comunicado <strong>{c.title}</strong> deixará de aparecer no
          shell dos operadores. Esta ação é registrada na trilha de
          auditoria.
        </span>
      ),
      dependencies: [
        'Operadores deixam de ver o banner imediatamente.',
        'O registro é preservado no histórico (soft-delete).',
      ],
      requireConfirmText: 'excluir',
      confirmLabel: 'Excluir comunicado',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await Comunicados.delete(c.id);
      toast.success('Comunicado excluído.');
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      if (selection?.mode === 'edit' && selection.id === c.id) {
        cancelEdit();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir');
    }
  }

  async function handleDuplicate(c: ComunicadoOut) {
    try {
      const copy = formToCreate(outToForm(c));
      copy.title = `${c.title} (cópia)`;
      const created = await Comunicados.create(copy);
      toast.success('Comunicado duplicado.');
      setItems((prev) => [created, ...prev]);
      startEditFromOut(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao duplicar');
    }
  }

  function startEditFromOut(c: ComunicadoOut) {
    setSelection({ mode: 'edit', id: c.id });
    setForm(outToForm(c));
    setSaveErr(null);
  }

  if (loading) {
    return (
      <div data-testid="comunicados-admin-loading" className="p-6">
        <CpSkeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <CpErrorState
          title="Não foi possível carregar os comunicados"
          description={error}
          retry={() => void reload()}
        />
      </div>
    );
  }

  const editing = selection !== null;
  const isEditMode = selection?.mode === 'edit';

  return (
    <div
      className="flex flex-col h-full"
      data-testid="comunicados-admin-root"
    >
      <CpPageHeader
        title={
          <span className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-text-on-light" strokeWidth={1.5} />
            Comunicados
          </span>
        }
        subtitle="Banners globais agendados por audiência, exibidos no topo do painel dos operadores."
        actions={
          <Button
            variant="default"
            size="sm"
            onClick={startNew}
            data-testid="comunicados-admin-new"
          >
            <Megaphone className="w-3.5 h-3.5" strokeWidth={1.5} />
            Novo Comunicado
          </Button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Esquerda — lista + filtros */}
        <ComunicadosList
          items={items}
          loading={false}
          error={null}
          selectedId={isEditMode ? selection.id : null}
          search={search}
          statusFilter={statusFilter}
          kindFilter={kindFilter}
          onSearch={setSearch}
          onStatusFilter={setStatusFilter}
          onKindFilter={setKindFilter}
          onSelect={startEdit}
          onNew={startNew}
          onDelete={(c) => void handleDelete(c)}
          onDuplicate={(c) => void handleDuplicate(c)}
        />

        {/* Centro — form ou empty-state. Fundo cinza (panel-light) faz os
            cartões brancos de cada seção do form se destacarem. */}
        <main
          data-testid="comunicados-admin-editor"
          className="flex-1 overflow-y-auto bg-panel-light"
        >
          {!editing ? (
            <div
              data-testid="comunicados-admin-empty-editor"
              className="h-full flex flex-col items-center justify-center text-center px-6 gap-3"
            >
              <span className="inline-flex w-12 h-12 items-center justify-center bg-white border border-border-light">
                <Megaphone
                  className="w-5 h-5 text-muted-on-light"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-text-on-light">
                  Nenhum comunicado selecionado
                </p>
                <p className="text-[12px] text-muted-on-light mt-1 max-w-[360px]">
                  Selecione um item na lista para editar ou crie um novo
                  comunicado para exibir um banner no painel dos operadores.
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={startNew}
                data-testid="comunicados-admin-empty-new"
              >
                <Megaphone className="w-3.5 h-3.5" strokeWidth={1.5} />
                Novo Comunicado
              </Button>
            </div>
          ) : (
            <div className="min-h-full flex flex-col">
              {/* Cabeçalho do editor — barra branca fixa no topo. */}
              <div className="sticky top-0 z-10 bg-white border-b border-border-light">
                <div className="max-w-[680px] mx-auto px-6 py-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Megaphone
                      className="w-4 h-4 text-text-on-light shrink-0"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-on-light truncate">
                      {isEditMode ? 'Editar comunicado' : 'Novo comunicado'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    data-testid="comunicados-admin-cancel"
                    aria-label="Fechar editor"
                    className="inline-flex items-center gap-1 h-7 px-2 text-[11px] bg-white border border-border-light hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus shrink-0"
                  >
                    <X className="w-3 h-3" aria-hidden strokeWidth={1.5} />
                    Fechar
                  </button>
                </div>
              </div>

              {/* Corpo — seções do form sobre o canvas cinza. */}
              <div className="flex-1 max-w-[680px] w-full mx-auto px-6 py-5 space-y-4">
                {saveErr && (
                  <p
                    data-testid="comunicados-admin-save-error"
                    role="alert"
                    className="text-[12px] text-danger bg-danger/10 border border-danger/40 px-3 py-2"
                  >
                    {saveErr}
                  </p>
                )}

                <ComunicadoForm value={form} onChange={setForm} />
              </div>

              {/* Rodapé de ações — barra branca fixa no fundo. */}
              <div className="sticky bottom-0 z-10 bg-white border-t border-border-light">
                <div className="max-w-[680px] mx-auto px-6 py-3 flex items-center gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    data-testid="comunicados-admin-save"
                  >
                    {isEditMode ? (
                      <Save className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                    {saving
                      ? 'Salvando…'
                      : isEditMode
                        ? 'Salvar alterações'
                        : form.schedule_start &&
                            Date.parse(form.schedule_start) > Date.now()
                          ? 'Agendar comunicado'
                          : 'Publicar comunicado'}
                  </Button>
                  {isEditMode && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const cur = items.find((x) => x.id === selection.id);
                          if (cur) void handleDuplicate(cur);
                        }}
                        data-testid="comunicados-admin-duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                        Duplicar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const cur = items.find((x) => x.id === selection.id);
                          if (cur) void handleDelete(cur);
                        }}
                        data-testid="comunicados-admin-delete"
                        className="hover:border-danger hover:text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                        Excluir
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Direita — preview vivo do banner */}
        <aside
          data-testid="comunicados-admin-preview-pane"
          className="w-[380px] shrink-0 bg-white border-l border-border-light overflow-y-auto"
        >
          <header className="px-3 py-2 border-b border-border-light">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-on-light">
              Pré-visualização ao vivo
            </p>
            <p className="text-[11px] text-muted-on-light italic mt-0.5">
              Espelha como o operador verá o banner no topo do painel.
            </p>
          </header>
          <div className="p-3">
            {editing ? (
              <ComunicadoPreview
                kind={form.kind}
                title={form.title}
                body={form.body}
                closable={form.closable}
                cta_label={form.cta_label}
                cta_href={form.cta_href}
              />
            ) : (
              <p
                data-testid="comunicados-admin-preview-empty"
                className="text-[11px] text-muted-on-light italic"
              >
                Comece a editar para ver a prévia do banner.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
