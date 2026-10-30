'use client';

/**
 * NumberFormDialog — cadastra ou corrige uma sub-unidade do conector
 * (capability genérica `inventory`; hoje: um número da estação).
 *
 * Existe porque administrar o inventário tem de ser BOTÃO: antes disto, mexer
 * nos números de uma estação exigia editar variável de ambiente e re-deployar
 * — gesto de shell para tarefa de operação diária.
 *
 * Quem valida vocabulário e regra é o driver (papel desconhecido, id repetido,
 * estado que só o gateway dita); a tela mostra a frase que ele devolve, em vez
 * de dizer "falhou" e mandar o operador adivinhar.
 *
 * Molde do StationPairingDialog: ModalPortal/useDialogA11y, cantos retos,
 * borda no lugar de sombra, lucide neutro, dado em mono.
 */
import * as React from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useT } from '@/lib/i18n/provider';
import {
  Connectors, type EdgePoolNumber, type EdgePoolSeenDevice,
} from '@/lib/api';

// O identificador é a chave do número na estação (e no mapa de aparelhos da
// automação). Restrito de propósito: ele viaja em URL e em nome de instância
// do gateway, onde espaço e acento viram bug silencioso.
const ID_OK = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function NumberFormDialog({
  agentId, skillKey, edit, seen, onClose, onDone,
}: {
  agentId: string;
  skillKey: string;
  // Ausente = cadastro; presente = correção (o identificador não muda: ele é
  // a chave que a estação e o mapa de aparelhos usam).
  edit?: EdgePoolNumber;
  // Aparelhos que os runners enxergam no adb AGORA. O operador ESCOLHE de uma
  // lista: serial digitado à mão é opaco, longo e sem validação possível — e o
  // erro só apareceria quando o número caísse e ninguém religasse.
  seen?: EdgePoolSeenDevice[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const dialogRef = useDialogA11y({ open: true, onClose });
  const editing = Boolean(edit);
  const [id, setId] = React.useState(edit?.id ?? '');
  const [msisdn, setMsisdn] = React.useState(edit?.msisdn ?? '');
  const [role, setRole] = React.useState(edit?.role === 'titular' ? 'titular' : 'vazao');
  const [owner, setOwner] = React.useState(edit?.owner === 'cliente' ? 'cliente' : 'vendor');
  // Aparelho que religa este número. Vazio = automação desligada — gesto
  // legítimo, e por isso vai no corpo mesmo vazio (o backend distingue
  // "não mandei" de "mandei vazio para desligar").
  const [device, setDevice] = React.useState(edit?.device_serial ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const idInvalid = !editing && id.trim() !== '' && !ID_OK.test(id.trim());
  const digits = msisdn.replace(/\D/g, '');
  const canSave = !busy && digits.length >= 10 && (editing || (id.trim() !== '' && !idInvalid));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await Connectors.inventoryApply(
        agentId, skillKey, editing ? 'update' : 'add',
        editing
          ? { id: edit!.id, msisdn: digits, role, owner, device_serial: device.trim() }
          : { id: id.trim(), msisdn: digits, role, owner,
              ...(device.trim() ? { device_serial: device.trim() } : {}) },
      );
      if (!res.ok) {
        // A frase do driver É o diagnóstico ("já existe número com este
        // identificador", "papel inválido") — trocá-la por "falhou" jogaria
        // fora a única informação acionável.
        setErr(res.detail || t('edge.pool.form.error'));
        return;
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('edge.pool.form.error'));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full h-8 px-2 bg-canvas-light border border-border-light text-[12px] '
    + 'text-text-on-light focus:outline-none focus:border-primary';
  const label = 'block text-[10px] uppercase tracking-wider text-muted-on-light mb-1';

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="number-form-title"
        data-testid="number-form-modal"
        className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="w-full max-w-[420px] bg-white border border-border-light text-text-on-light"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <h2 id="number-form-title" className="text-[13px] font-medium flex-1 min-w-0">
              {editing ? t('edge.pool.form.title.edit') : t('edge.pool.form.title.add')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-6 h-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="px-4 py-3 space-y-3">
            <div>
              <label className={label} htmlFor="nf-id">{t('edge.pool.form.id')}</label>
              <input
                id="nf-id"
                data-testid="number-form-id"
                value={id}
                disabled={editing}
                onChange={(e) => setId(e.target.value)}
                placeholder="tit"
                className={field + ' font-mono' + (editing ? ' opacity-60' : '')}
              />
              <p className="mt-1 text-[10px] text-muted-on-light">
                {editing ? t('edge.pool.form.id.locked') : t('edge.pool.form.id.hint')}
              </p>
              {idInvalid && (
                <p data-testid="number-form-id-invalid" className="mt-1 text-[10px] text-danger">
                  {t('edge.pool.form.id.invalid')}
                </p>
              )}
            </div>

            <div>
              <label className={label} htmlFor="nf-msisdn">{t('edge.pool.form.msisdn')}</label>
              <input
                id="nf-msisdn"
                data-testid="number-form-msisdn"
                value={msisdn}
                onChange={(e) => setMsisdn(e.target.value)}
                placeholder="+55 15 99104-4002"
                className={field + ' font-mono'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="nf-role">{t('edge.pool.form.role')}</label>
                <select id="nf-role" data-testid="number-form-role" value={role}
                  onChange={(e) => setRole(e.target.value)} className={field}>
                  <option value="vazao">{t('edge.pool.role.vazao')}</option>
                  <option value="titular">{t('edge.pool.role.titular')}</option>
                </select>
                <p className="mt-1 text-[10px] text-muted-on-light">
                  {t('edge.pool.form.role.hint')}
                </p>
              </div>
              <div>
                <label className={label} htmlFor="nf-owner">{t('edge.pool.form.owner')}</label>
                <select id="nf-owner" data-testid="number-form-owner" value={owner}
                  onChange={(e) => setOwner(e.target.value)} className={field}>
                  <option value="vendor">{t('edge.pool.owner.vendor')}</option>
                  <option value="cliente">{t('edge.pool.owner.cliente')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className={label} htmlFor="nf-device">
                {t('edge.pool.form.device')}
              </label>
              {(seen ?? []).length > 0 ? (
                <select
                  id="nf-device"
                  data-testid="number-form-device"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className={field + ' font-mono'}
                >
                  <option value="">{t('edge.pool.form.device.none')}</option>
                  {/* aparelho já declarado que o runner não enxerga: mantém na
                      lista para não apagá-lo em silêncio ao salvar */}
                  {device && !(seen ?? []).some((d) => d.serial === device) && (
                    <option value={device}>
                      {device} — {t('edge.pool.form.device.absent')}
                    </option>
                  )}
                  {(seen ?? []).map((d) => (
                    <option key={d.serial} value={d.serial}
                      disabled={d.state !== undefined && d.state !== 'device'}>
                      {d.serial}
                      {d.model ? ` — ${d.model}` : ''}
                      {d.state && d.state !== 'device'
                        ? ` — ${t(`edge.pool.form.device.state.${d.state}`)}`
                        : ''}
                    </option>
                  ))}
                </select>
              ) : (
                // Nenhum runner reportou aparelho: cair para texto seria pedir
                // um serial que ninguém sabe. Diz o que falta.
                <p data-testid="number-form-device-empty"
                  className="text-[11px] text-muted-on-light border border-border-light px-2 py-1.5">
                  {t('edge.pool.form.device.empty')}
                </p>
              )}
              <p className="mt-1 text-[10px] text-muted-on-light">
                {t('edge.pool.form.device.hint')}
              </p>
            </div>

            {err && (
              <div data-testid="number-form-error"
                className="flex items-start gap-1.5 text-[11px] text-danger">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                <span className="min-w-0 break-words">{err}</span>
              </div>
            )}
          </div>

          <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
              className="h-7 px-3 text-[11px] border border-border-light text-muted-on-light hover:text-text-on-light">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="number-form-save"
              disabled={!canSave}
              onClick={() => void save()}
              className="h-7 px-3 text-[11px] border border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-primary inline-flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
              {t('common.save')}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
