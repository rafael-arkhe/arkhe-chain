'use client';

/**
 * WebhookConfigPanel — painel de gerenciamento de webhooks (Fase 4).
 *
 * Renderiza como um dropdown/panel acoplado ao BoardToolbar. Mostra:
 * - Lista de webhooks existentes (slug + status + URL + botão excluir)
 * - Formulário de criação (slug input + criar)
 * - Secret exibido UMA VEZ após criação (copiar/fechar)
 *
 * Design: cantos retos, text-[11px], monocromático, #2D77BE só no acento.
 */
import * as React from 'react';
import { Webhook, Plus, Trash2, Copy, Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { PipelineBuilder } from '@/lib/api';
import { useConfirm } from '@/components/dialog/confirm-dialog';

interface WebhookTrigger {
  id: string;
  slug: string;
  board_id: string;
  active: boolean;
}

interface WebhookConfigPanelProps {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

export function WebhookConfigPanel({ boardId, isOpen, onClose, embedded = false }: WebhookConfigPanelProps) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [triggers, setTriggers] = React.useState<WebhookTrigger[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newSlug, setNewSlug] = React.useState('');
  const [secret, setSecret] = React.useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load triggers on open
  React.useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    PipelineBuilder.listTriggers()
      .then((all) => setTriggers(all.filter((tr) => tr.board_id === boardId)))
      .catch(() => { setTriggers([]); setError(null); })
      .finally(() => setLoading(false));
  }, [isOpen, boardId]);

  const handleCreate = async () => {
    if (!newSlug.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await PipelineBuilder.createTrigger(newSlug.trim(), boardId);
      setSecret(result.secret);
      setWebhookUrl(`${window.location.origin}/api/platform/v23/pipeline/trigger/${result.slug}`);
      setTriggers((prev) => [...prev, { id: result.id, slug: result.slug, board_id: boardId, active: true }]);
      setNewSlug('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pbw.webhookCreateErr'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t('pbw.webhookConfirmDelete'),
      description: t('pbw.webhookConfirmDeleteDesc'),
      confirmLabel: t('pbw.webhookDelete'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await PipelineBuilder.deleteTrigger(id);
      setTriggers((prev) => prev.filter((tr) => tr.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pbw.webhookDeleteErr'));
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className={(embedded ? 'relative w-full' : 'absolute top-full right-0 mt-1 z-50 w-80') + ' bg-white border border-border-light shadow-md'} data-testid="pb-webhook-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-on-light">
          <Webhook className="w-3.5 h-3.5 text-muted-on-light" strokeWidth={1.5} />
          {t('pbw.webhookTitle')}
        </div>
        <button type="button" onClick={onClose} className="text-muted-on-light hover:text-text-on-light" data-testid="pb-webhook-close">
          <X className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* Secret display (shown once after creation) */}
      {secret && (
        <div className="px-3 py-2 border-b border-border-light bg-yellow-50/50">
          <p className="text-[10px] text-muted-on-light mb-1">{t('pbw.webhookSecret')}</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[10px] font-mono bg-white border border-border-light px-2 py-1 truncate">{secret}</code>
            <button
              type="button" onClick={copySecret}
              className="h-6 px-2 text-[10px] flex items-center gap-1 border border-border-light bg-white hover:border-primary"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {copied ? t('pbw.webhookCopied') : ''}
            </button>
          </div>
          {webhookUrl && (
            <div className="mt-2">
              <p className="text-[10px] text-muted-on-light mb-1">{t('pbw.webhookUrl')}</p>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-[10px] font-mono bg-white border border-border-light px-2 py-1 truncate">{webhookUrl}</code>
                <button
                  type="button" onClick={() => copyUrl(webhookUrl)}
                  className="h-6 px-2 text-[10px] flex items-center gap-1 border border-border-light bg-white hover:border-primary"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
          <button
            type="button" onClick={() => { setSecret(null); setWebhookUrl(null); }}
            className="mt-2 h-6 px-2 text-[10px] border border-border-light bg-white hover:border-primary"
          >
            <X className="w-3 h-3 inline mr-1" /> {t('common.close')}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 border-b border-border-light bg-red-50/50 text-[10px] text-danger">
          {error}
        </div>
      )}

      {/* List */}
      <div className="max-h-48 overflow-y-auto">
        {loading && <p className="px-3 py-2 text-[11px] text-muted-on-light italic">{t('common.loading')}</p>}
        {!loading && triggers.length === 0 && (
          <p className="px-3 py-2 text-[11px] text-muted-on-light italic">{t('pbw.webhookEmpty')}</p>
        )}
        {triggers.map((tr) => {
          const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/platform/v23/pipeline/trigger/${tr.slug}`;
          return (
            <div key={tr.id} className="px-3 py-2 border-b border-border-light/60 flex items-center gap-2" data-testid={`pb-webhook-${tr.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono truncate">{tr.slug}</span>
                  <span className={`text-[9px] uppercase ${tr.active ? 'text-success' : 'text-muted-on-light'}`}>
                    {tr.active ? t('pbw.webhookActive') : t('pbw.webhookInactive')}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <code className="text-[9px] font-mono text-muted-on-light truncate flex-1">{url}</code>
                  <button
                    type="button" onClick={() => copyUrl(url)}
                    className="text-muted-on-light hover:text-text-on-light"
                    title={t('pbw.webhookCopyUrl')}
                  >
                    <Copy className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <button
                type="button" onClick={() => handleDelete(tr.id)}
                className="text-muted-on-light hover:text-danger shrink-0"
                title={t('pbw.webhookDelete')}
                data-testid={`pb-webhook-delete-${tr.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Create form */}
      <div className="px-3 py-2 border-t border-border-light">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder={t('pbw.webhookSlugPlaceholder')}
            className="flex-1 h-7 px-2 text-[11px] bg-white border border-border-light outline-none focus:border-primary font-mono"
            data-testid="pb-webhook-slug-input"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !newSlug.trim()}
            className="h-7 px-3 text-[11px] flex items-center gap-1 bg-primary text-white disabled:opacity-50"
            data-testid="pb-webhook-create"
          >
            {creating ? '...' : <><Plus className="w-3 h-3" /> {t('pbw.webhookCreateConfirm')}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
