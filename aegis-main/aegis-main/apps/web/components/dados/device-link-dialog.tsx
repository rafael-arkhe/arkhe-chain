'use client';

/**
 * DeviceLinkDialog — vincula um aparelho da bancada ao número que ele religa.
 *
 * O gesto existia só no formulário do NÚMERO, no cartão da estação. Mas quem lê
 * "sem número atribuído" é a linha do APARELHO, no cartão da bancada — e mandar
 * o operador procurar o gesto noutro cartão é mandá-lo adivinhar onde fica a
 * resposta que a própria tela acabou de pedir.
 *
 * Mesmo trilho de sub-unidade (capability `inventory`): o vínculo mora no
 * número (é ele que a estação consulta na hora de religar), e escrever daqui é
 * o mesmo `update` que o formulário do número faz. Nada de caminho paralelo.
 *
 * Um aparelho serve UM número: o código de um digitado no aplicativo do outro
 * invalida os dois. Por isso a lista mostra quem já está ocupado por outro
 * aparelho, em vez de deixar o operador criar a colisão e descobrir depois.
 */
import * as React from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useT } from '@/lib/i18n/provider';
import {
  Connectors, type EdgeBenchDevice, type EdgePoolNumber,
} from '@/lib/api';

export function DeviceLinkDialog({
  agentId, skillKey, device, numeros, onClose, onDone,
}: {
  agentId: string;
  skillKey: string;
  device: EdgeBenchDevice;
  numeros: EdgePoolNumber[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const dialogRef = useDialogA11y({ open: true, onClose });
  // O vínculo é gravado no número usando o ENDEREÇO do adb (é o que a estação
  // manda ao runner), não o IP que identifica a linha na bancada.
  const alvo = device.addr || device.serial;
  const atual = numeros.find((n) => n.device_serial === alvo);
  const [escolhido, setEscolhido] = React.useState(atual?.id ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function salvar() {
    setBusy(true);
    setErr(null);
    try {
      // Trocar de número exige SOLTAR o anterior: sem isso, dois números
      // apontariam para o mesmo aparelho e o runner digitaria o código de um no
      // aplicativo do outro.
      if (atual && atual.id !== escolhido) {
        const solta = await Connectors.inventoryApply(
          agentId, skillKey, 'update', { id: atual.id, device_serial: '' },
        );
        if (!solta.ok) {
          setErr(solta.detail || t('edge.bench.form.error'));
          return;
        }
      }
      if (escolhido) {
        const res = await Connectors.inventoryApply(
          agentId, skillKey, 'update',
          { id: escolhido, device_serial: alvo },
        );
        if (!res.ok) {
          setErr(res.detail || t('edge.bench.form.error'));
          return;
        }
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('edge.bench.form.error'));
    } finally {
      setBusy(false);
    }
  }

  const label = 'block text-[10px] uppercase tracking-wider text-muted-on-light mb-1';

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-link-title"
        data-testid="device-link-modal"
        className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="w-full max-w-[420px] bg-white border border-border-light text-text-on-light"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <h2 id="device-link-title" className="text-[13px] font-medium flex-1 min-w-0">
              {t('edge.bench.atribuir.title')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-6 h-6 flex items-center justify-center text-muted-on-light hover:text-text-on-light"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </header>

          <div className="px-4 py-3 space-y-3">
            <p className="text-[11px] text-muted-on-light">
              {device.model ? `${device.model} · ` : ''}
              <span className="font-mono">{alvo}</span>
            </p>

            {numeros.length === 0 ? (
              <p data-testid="device-link-vazio" className="text-[11px] text-muted-on-light">
                {t('edge.bench.atribuir.vazio')}
              </p>
            ) : (
              <div>
                <label className={label} htmlFor="device-link-numero">
                  {t('edge.pool.title')}
                </label>
                <select
                  id="device-link-numero"
                  data-testid="device-link-numero"
                  value={escolhido}
                  onChange={(e) => setEscolhido(e.target.value)}
                  className="w-full h-8 px-2 bg-canvas-light border border-border-light text-[12px] text-text-on-light focus:outline-none focus:border-primary"
                >
                  <option value="">{t('edge.bench.atribuir.nenhum')}</option>
                  {numeros.map((n) => {
                    // Número já preso a OUTRO aparelho: aparece, e desabilitado.
                    // Some da lista, o operador acha que sumiu; selecionável,
                    // ele cria a colisão e descobre pelo número que não volta.
                    const preso = Boolean(n.device_serial)
                      && n.device_serial !== alvo;
                    return (
                      <option key={n.id} value={n.id} disabled={preso}>
                        {n.msisdn || n.id}
                        {preso ? ` — ${t('edge.bench.serves').replace('{n}', n.device_serial ?? '')}` : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-[10px] text-muted-on-light">
                  {t('edge.bench.atribuir.hint')}
                </p>
              </div>
            )}

            {err && (
              <div data-testid="device-link-error"
                className="flex items-start gap-2 p-2 border border-danger text-[11px] text-danger">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0">{err}</span>
              </div>
            )}
          </div>

          <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-7 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="device-link-save"
              disabled={busy}
              onClick={() => void salvar()}
              className="h-7 px-3 text-[11px] bg-primary text-white disabled:opacity-40 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {t('common.save')}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
