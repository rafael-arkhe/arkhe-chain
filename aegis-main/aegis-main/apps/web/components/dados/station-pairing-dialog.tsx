'use client';

/**
 * StationPairingDialog — pareamento de um conector com capability 'pairing'.
 * Aberto pela linha do aparelho em Dispositivos (o dispositivo traz o par
 * agente+skill em `pairing`) e pelo drilldown do conector.
 *
 * Duas formas de pareamento, decididas pelo que o backend devolve:
 *  - QR (Estação WhatsApp): `qr_data_url` preenchido → renderiza a imagem.
 *  - CÓDIGO digitável (AutoSync): `qr_data_url` nulo + `code` "XXXX-XXXX-XXXX"
 *    → renderiza o código em destaque e o `detail` do backend como ajuda (a
 *    instrução do comando a rodar na ponta). A instrução de leitura do QR fica
 *    escondida nesse caso, porque só vale para o WhatsApp.
 *
 * Molde: o PairDialog do edge-section (mesmo ModalPortal/useDialogA11y, cantos
 * retos, borda, sem sombra, sem emoji, lucide neutro). Ao abrir chama
 * `pairingStart`; faz poll de `pairingPoll` a cada 3s enquanto aberto e para
 * quando conecta; "Gerar novo código" força um refresh. Sem nome de vendor na
 * UI — o runtime aparece só como "estação".
 */
import * as React from 'react';
import { AlertCircle, Check, Copy, Loader2, Plug, RefreshCw, X } from 'lucide-react';

import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useT } from '@/lib/i18n/provider';
import { Connectors, type PairingInfo } from '@/lib/api';

const POLL_MS = 3000;

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const STATE_KEYS = new Set(['connected', 'awaiting_scan', 'disconnected', 'error']);

// A ajuda do pareamento por código vem pronta do backend ("...rode: <comando>").
// Destaca em mono só o que vem depois do primeiro ": " — sem isso o comando some
// no meio da frase. Sem separador, mostra a frase inteira em texto normal.
function splitHint(detail: string): [string, string] {
  const i = detail.indexOf(': ');
  return i < 0 ? [detail, ''] : [detail.slice(0, i + 1), detail.slice(i + 2)];
}

export function StationPairingDialog({
  agentId, skillKey, pairingTarget, onClose,
}: {
  agentId: string;
  skillKey: string;
  // Estação de POOL: dirige o gesto a UM número do inventário (id do número).
  // Sem alvo, a estação escolhe quem precisa do gesto primeiro.
  pairingTarget?: string;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useDialogA11y({ open: true, onClose });
  const [info, setInfo] = React.useState<PairingInfo | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(true);
  const [now, setNow] = React.useState(() => Date.now());
  const [copied, setCopied] = React.useState(false);

  const connected = info?.state === 'connected';

  // Copiar o código (paridade com o modal de dispositivo). Clipboard pode não
  // existir (http/permissão) — o `select-all` do código continua servindo.
  const copyCode = React.useCallback(async () => {
    if (!info?.code) return;
    try {
      await navigator.clipboard.writeText(info.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sem clipboard: o operador seleciona e copia na mão */ }
  }, [info?.code]);

  // Inicia/renova o pareamento (POST). refresh=true força um novo código.
  const start = React.useCallback(async (refresh: boolean) => {
    setErr(null);
    setStarting(true);
    try {
      setInfo(await Connectors.pairingStart(agentId, skillKey, {
        ...(refresh ? { refresh: true } : {}),
        ...(pairingTarget ? { target: pairingTarget } : {}),
      }));
    } catch (e) {
      setErr((e as Error)?.message ?? '');
    } finally {
      setStarting(false);
    }
  }, [agentId, skillKey, pairingTarget]);

  // Mount: dispara o start uma vez.
  React.useEffect(() => { void start(false); }, [start]);

  // Poll read-only a cada 3s enquanto aberto e ainda não conectado; para ao
  // conectar (o efeito re-roda quando `connected` vira true e não reabre o
  // intervalo). Falha transitória mantém o QR na tela.
  React.useEffect(() => {
    if (connected) return;
    const id = setInterval(async () => {
      try {
        const polled = await Connectors.pairingPoll(
          agentId, skillKey, pairingTarget ? { target: pairingTarget } : {});
        setInfo((prev) => {
          // Pareamento por CÓDIGO (AutoSync): o poll (GET) NÃO retorna o código
          // — ele é hash-at-rest, o plaintext só existe no POST que o emitiu.
          // Se não preservarmos, a cada 3s o código sumiria da tela e o corpo
          // cairia no texto de leitura de QR (o bug que o dono viu). Preserva
          // código/prazo/instrução já emitidos e só ATUALIZA o estado (p/
          // detectar 'connected'). O QR (WhatsApp) rotaciona no poll → lá o
          // polled entra direto. Em erro, mostra o erro (não preserva).
          if (prev?.code && !polled.code && !polled.qr_data_url && polled.state !== 'error') {
            return {
              ...polled,
              code: prev.code,
              expires_at: prev.expires_at ?? polled.expires_at,
              detail: prev.detail ?? polled.detail,
            };
          }
          return polled;
        });
      } catch {
        // transitório — não derruba o QR nem interrompe o poll.
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [connected, agentId, skillKey, pairingTarget]);

  // Contagem de expiração (só enquanto há prazo e não conectou).
  React.useEffect(() => {
    if (!info?.expires_at || connected) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [info?.expires_at, connected]);

  const expiresAt = info?.expires_at ?? null;
  const remaining = expiresAt ? Date.parse(expiresAt) - now : null;
  const stateLabel =
    info && STATE_KEYS.has(info.state) ? t(`conectores.pair.state.${info.state}`) : '';
  // Mensagem-problema: exceção da chamada (err) OU o `detail` que o backend
  // devolve junto com state:"error" (ex.: "requer ativação de licença"). Sem
  // isto o operador via só "Erro" pelado, sem saber o motivo nem o que fazer.
  const problem =
    err ?? (info?.state === 'error' ? (info.detail || t('edge.pair.error')) : null);
  // Pareamento por código digitável: sem QR, com `code`. Nesse modo o `detail`
  // é instrução (ajuda), não erro — o erro continua vindo por state:"error".
  const byCode = !info?.qr_data_url && !!info?.code;
  const hint = byCode && info?.detail ? splitHint(info.detail) : null;

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="connector-pair-title"
      data-testid="connector-pair-modal"
      className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[440px] bg-white border border-border-light shadow-2xl text-text-on-light"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
          <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary">
            {/* Ícone NEUTRO de "ligar dispositivo": o mesmo diálogo serve
                estação de mensageria e ponte AutoSync — Smartphone prometia
                celular. */}
            <Plug className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 id="connector-pair-title" data-testid="connector-pair-title"
            className="text-[13px] font-semibold flex-1">
            {t('conectores.pair.title')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            data-testid="connector-pair-close"
            className="text-muted-on-light hover:text-text-on-light">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3 text-[12px]">
          {connected ? (
            <div className="flex flex-col items-center gap-2 py-6" data-testid="connector-pair-connected">
              <span className="inline-flex w-12 h-12 items-center justify-center border border-success text-success">
                <Check className="w-6 h-6" strokeWidth={1.5} />
              </span>
              <span className="text-[13px] font-semibold text-success">
                {t('conectores.pair.state.connected')}
              </span>
            </div>
          ) : (
            <>
              {!byCode && <p className="text-text-on-light">{t('conectores.pair.scan')}</p>}
              {/* Estação de pool: QUAL número está pareando (aditivo do
                  backend — instância única nunca preenche). */}
              {info?.pairing_number && (
                <p className="text-[11px] text-muted-on-light" data-testid="connector-pair-number">
                  {t('conectores.pair.number')}{': '}
                  <span className="font-mono text-text-on-light">{info.pairing_number}</span>
                </p>
              )}
              <div className="flex items-center justify-center">
                {starting && !info ? (
                  <div className="w-[240px] h-[240px] border border-border-light bg-canvas-light flex items-center justify-center"
                    data-testid="connector-pair-loading">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-on-light" strokeWidth={1.5} />
                  </div>
                ) : info?.qr_data_url ? (
                  <img
                    src={info.qr_data_url}
                    alt=""
                    width={240}
                    height={240}
                    data-testid="connector-pair-qr"
                    className="w-[240px] h-[240px] border border-border-light object-contain bg-white"
                  />
                ) : info?.code ? (
                  // MESMA apresentação do modal "Parear novo dispositivo"
                  // (edge-section/PairDialog): faixa compacta, não a caixa
                  // 240×240 do QR — pareamento por código não é leitura de QR.
                  <div className="w-full bg-canvas-light border border-border-light px-4 py-3 text-center">
                    <span data-testid="connector-pair-code"
                      className="font-mono text-[22px] tracking-[0.2em] font-semibold text-text-on-light select-all break-all">
                      {info.code}
                    </span>
                  </div>
                ) : (
                  <div className="w-[240px] h-[240px] border border-border-light bg-canvas-light flex items-center justify-center text-[11px] text-muted-on-light"
                    data-testid="connector-pair-noqr">
                    {stateLabel || t('conectores.pair.state.disconnected')}
                  </div>
                )}
              </div>
              {hint && (
                <p className="text-[11px] text-muted-on-light break-words" data-testid="connector-pair-hint">
                  {hint[0]}
                  {hint[1] ? <span className="font-mono text-text-on-light select-all"> {hint[1]}</span> : null}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                {stateLabel ? (
                  <span data-testid="connector-pair-state"
                    className={'text-[11px] uppercase tracking-wider px-1.5 py-0.5 border '
                      + (info?.state === 'error'
                        ? 'border-danger text-danger'
                        : 'border-border-light text-muted-on-light')}>
                    {stateLabel}
                  </span>
                ) : <span />}
                {remaining != null ? (
                  <span data-testid="connector-pair-expiry"
                    className={'text-[11px] font-mono ' + (remaining <= 0 ? 'text-danger' : 'text-muted-on-light')}>
                    {remaining <= 0
                      ? t('edge.pair.expired')
                      : t('edge.pair.expires_in').replace('{time}', fmtCountdown(remaining))}
                  </span>
                ) : null}
              </div>
            </>
          )}

          {problem !== null && (
            <p className="text-[11px] text-danger flex items-start gap-1.5" role="alert"
              data-testid="connector-pair-error">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0 break-words">{problem || t('edge.pair.error')}</span>
            </p>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} data-testid="connector-pair-close-btn"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary">
            {t('common.close')}
          </button>
          {/* Paridade com o modal de dispositivo: código se copia, não se digita. */}
          {byCode && info?.code && (
            <button type="button" onClick={() => void copyCode()}
              data-testid="connector-pair-copy"
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                      : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {copied ? t('edge.pair.copied') : t('edge.pair.copy')}
            </button>
          )}
          {!connected && (
            <button type="button" onClick={() => void start(true)} disabled={starting}
              data-testid="connector-pair-refresh"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
              {starting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                : <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('conectores.pair.refresh')}
            </button>
          )}
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
