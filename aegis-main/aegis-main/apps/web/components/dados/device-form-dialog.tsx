'use client';

/**
 * DeviceFormDialog — conecta um celular à BANCADA, pela tela.
 *
 * Este é o gesto que faltava. A bancada já era um Dispositivo com card próprio,
 * mas a única forma de conectar um aparelho era escrever
 * `RUNNER_ADB_CONNECT=ip:porta` num arquivo de env da ilha e re-deployar (mais o
 * mesmo para a senha da tela). O operador abria a tela, lia "nenhum aparelho
 * detectado" e não tinha nada para clicar — funcionalidade que existe no código
 * e não existe na operação.
 *
 * O diálogo pede UMA coisa: o que está dentro da janelinha "Pair with device" do
 * aparelho — o código de 6 dígitos e o endereço logo abaixo dele. Nada mais.
 *
 * Isto foi corrigido depois de o dono tentar usar: a tela do Android mostra DOIS
 * endereços com o rótulo IDÊNTICO ("IP address & Port") — um no alto e outro na
 * janelinha — e a versão anterior pedia os dois. Não há pista nenhuma na tela
 * para distingui-los; quem erra recebe "não alcancei" e não tem como saber por
 * quê. Um produto que exige esse acerto não é operável por cliente nenhum.
 * O endereço de conexão agora é DESCOBERTO pela estação (mesmo IP, porta achada
 * por sondagem — ver cmd/android-runner/descobrir.go).
 *
 * Quem executa o `adb pair` é o runner, na ilha. Por isso o retorno honesto é
 * "pedido aceito, acompanhe o card" — prometer "conectado" mandaria o operador
 * procurar na lista um aparelho que ainda não existe.
 *
 * Mesmo trilho de sub-unidade do NumberFormDialog (capability `devices`,
 * despacho por `kind: 'device'`): a plataforma não ganha um caminho novo só
 * porque a sub-unidade é física.
 */
import * as React from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useT } from '@/lib/i18n/provider';
import { Connectors, type EdgeBenchDevice } from '@/lib/api';

// "ip:porta" — o que o Android mostra na Depuração sem fio. Validar aqui evita o
// caso mais comum: colar só o IP e esperar que funcione.
const ENDERECO_OK = /^[\w.-]+:\d{2,5}$/;
const SO_DIGITOS = /^\d*$/;

type Modo = 'rede' | 'usb';

export function DeviceFormDialog({
  agentId, skillKey, edit, onClose, onDone,
}: {
  agentId: string;
  skillKey: string;
  // Presente = aparelho JÁ na bancada; o gesto passa a ser só a senha da tela
  // (reparear apagaria uma conexão que funciona).
  edit?: EdgeBenchDevice;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const dialogRef = useDialogA11y({ open: true, onClose });
  const editando = Boolean(edit);
  const [modo, setModo] = React.useState<Modo>('rede');
  // No Wi-Fi o operador informa SÓ o endereço da janelinha; `serial` existe
  // para o caminho de cabo (onde ele lê o número de série de verdade).
  const [serial, setSerial] = React.useState(edit?.serial ?? '');
  const [pair, setPair] = React.useState('');
  const [code, setCode] = React.useState('');
  // Endereço do ALTO da tela. Voltou a ser pedido depois da segunda tentativa
  // real: sem ele, a estação precisa PROCURAR a porta, o que leva mais de um
  // minuto (o Android dropa as portas fechadas em vez de recusar) e falha quando
  // o celular entra em sono profundo. Com o desenho da tela ao lado, não há o
  // que adivinhar — que era o problema da versão que pedia os dois sem dizer
  // onde ficavam.
  const [conn, setConn] = React.useState('');
  // O PIN NUNCA é pré-preenchido: o retrato traz `has_pin`, jamais a senha.
  const [pin, setPin] = React.useState('');
  // Aplicativo DESTE aparelho. Escolhido de uma lista do que o runner enxerga
  // instalado — digitar nome de pacote seria pedir uma informação que o
  // operador não tem, e adivinhar abriria o app errado.
  const [app, setApp] = React.useState(edit?.app ?? '');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const porRede = !editando && modo === 'rede';
  const pinOk = SO_DIGITOS.test(pin.trim());
  // Wi-Fi: endereço da janelinha + código, que andam juntos ali. Cabo: serial.
  const dadosOk = porRede
    ? (ENDERECO_OK.test(pair.trim()) && code.trim().length >= 6
       && ENDERECO_OK.test(conn.trim()))
    : serial.trim() !== '';
  const mudouApp = editando && app.trim() !== '' && app.trim() !== (edit?.app ?? '');
  const canSave = !busy && pinOk && (editando || dadosOk)
    && (!editando || pin.trim() !== '' || mudouApp);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const item: Record<string, unknown> = { kind: 'device' };
      if (porRede) {
        // Nada de endereço de conexão aqui: a estação o descobre. Pedi-lo era
        // pedir que o operador adivinhasse qual dos dois "IP address & Port"
        // idênticos da tela do Android era o certo.
        item.pair_addr = pair.trim();
        item.pair_code = code.trim();
        item.conn_addr = conn.trim();
      } else {
        item.serial = serial.trim();
      }
      if (editando) item.serial = edit!.serial;
      if (pin.trim()) item.pin = pin.trim();
      if (app.trim()) item.app = app.trim();
      const res = await Connectors.inventoryApply(
        agentId, skillKey, editando ? 'update' : 'add', item,
      );
      if (!res.ok) {
        // A frase do driver É o diagnóstico ("este aparelho ainda religa o
        // número X", "PIN só pode ter dígitos") — trocá-la por "falhou" jogaria
        // fora a única informação acionável.
        setErr(res.detail || t('edge.bench.form.error'));
        return;
      }
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('edge.bench.form.error'));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full h-8 px-2 bg-canvas-light border border-border-light text-[12px] '
    + 'text-text-on-light font-mono focus:outline-none focus:border-primary';
  const label = 'block text-[10px] uppercase tracking-wider text-muted-on-light mb-1';
  const hint = 'mt-1 text-[10px] text-muted-on-light';

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-form-title"
        data-testid="device-form-modal"
        className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="w-full max-w-[480px] bg-white border border-border-light text-text-on-light"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <h2 id="device-form-title" className="text-[13px] font-medium flex-1 min-w-0">
              {editando
                ? t('edge.bench.form.title.pin')
                : t('edge.bench.form.title.add')}
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
            {!editando && (
              <>
                {/* Cabo ou Wi-Fi muda o que precisa ser preenchido. Mostrar os
                    dois caminhos juntos deixaria a metade dos campos sem
                    sentido, o que lê como formulário quebrado. */}
                <div className="flex gap-0 border border-border-light">
                  {(['rede', 'usb'] as Modo[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-testid={`device-form-mode-${m === 'rede' ? 'wifi' : 'usb'}`}
                      onClick={() => setModo(m)}
                      className={`flex-1 h-7 text-[11px] ${modo === m
                        ? 'bg-primary text-white'
                        : 'bg-canvas-light text-muted-on-light hover:text-text-on-light'}`}
                    >
                      {t(`edge.bench.form.mode.${m}`)}
                    </button>
                  ))}
                </div>
                {/* O caminho no aparelho é a informação mais importante desta
                    tela: "Depuração sem fio" está atrás de Opções do
                    desenvolvedor, que por sua vez está escondida. */}
                <ol data-testid="device-form-steps"
                  className="text-[11px] text-muted-on-light leading-relaxed list-decimal pl-4 space-y-0.5">
                  <li>{t(`edge.bench.form.step1.${modo}`)}</li>
                  <li>{t(`edge.bench.form.step2.${modo}`)}</li>
                  <li>{t(`edge.bench.form.step3.${modo}`)}</li>
                </ol>
              </>
            )}

            {porRede ? (
              <>
                <div>
                  <label className={label} htmlFor="device-form-code">
                    {t('edge.bench.form.code')}
                  </label>
                  <input
                    id="device-form-code"
                    data-testid="device-form-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    placeholder="714348"
                    className={field}
                  />
                  {/* O endereço de pareamento morre quando a janelinha fecha.
                      Sem este aviso, o operador copia os dados, fecha a tela do
                      celular e recebe um "não alcancei" que não tem nada a ver
                      com o que ele fez de errado. */}
                  <p className={`${hint} text-warn`}>
                    {t('edge.bench.form.code.hint')}
                  </p>
                </div>
                {/* O DESENHO é o que resolve a ambiguidade. O Android escreve
                    "IP address & Port" nos dois lugares; mostrar a tela dele,
                    com as setas, é a única forma de o operador saber qual campo
                    corresponde a qual linha sem adivinhar. */}
                <pre data-testid="device-form-mapa"
                  className="text-[10px] leading-[1.5] font-mono bg-canvas-light border border-border-light p-2 overflow-x-auto text-muted-on-light">
{`Depuração sem fio
────────────────────────────
IP address & Port
192.168.1.64:39265      ← ${t('edge.bench.form.map.conn')}

Pair with device
  Wi-Fi pairing code
  714348                ← ${t('edge.bench.form.map.code')}
  IP address & Port
  192.168.1.64:44699    ← ${t('edge.bench.form.map.pair')}`}
                </pre>
                <div>
                  <label className={label} htmlFor="device-form-conn">
                    {t('edge.bench.form.conn')}
                  </label>
                  <input
                    id="device-form-conn"
                    data-testid="device-form-conn"
                    value={conn}
                    onChange={(e) => setConn(e.target.value)}
                    placeholder="192.168.1.64:39265"
                    className={field}
                  />
                  <p className={hint}>{t('edge.bench.form.conn.hint')}</p>
                </div>
                <div>
                  <label className={label} htmlFor="device-form-pair">
                    {t('edge.bench.form.pair')}
                  </label>
                  <input
                    id="device-form-pair"
                    data-testid="device-form-pair"
                    value={pair}
                    onChange={(e) => setPair(e.target.value)}
                    placeholder="192.168.1.64:44699"
                    className={field}
                  />
                  {/* O aparelho mostra "IP address & Port" DUAS vezes, com o
                      mesmo rótulo. Dizer QUAL é o único jeito de o operador
                      acertar — e ele só precisa deste, o de baixo. */}
                  <p className={hint}>{t('edge.bench.form.pair.hint')}</p>
                  {!ENDERECO_OK.test(pair.trim()) && pair.trim() !== '' && (
                    <p data-testid="device-form-pair-hint" className={`${hint} text-danger`}>
                      {t('edge.bench.form.serial.hint')}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label className={label} htmlFor="device-form-serial">
                  {t('edge.bench.form.serial.usb')}
                </label>
                <input
                  id="device-form-serial"
                  data-testid="device-form-serial"
                  value={editando ? edit!.serial : serial}
                  disabled={editando}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="R58M30ABCDE"
                  className={`${field} ${editando ? 'opacity-60' : ''}`}
                />
              </div>
            )}

            {editando && (edit?.apps?.length ?? 0) > 0 && (
              <div>
                <label className={label} htmlFor="device-form-app">
                  {t('edge.bench.app')}
                </label>
                <select
                  id="device-form-app"
                  data-testid="device-form-app"
                  value={app}
                  onChange={(e) => setApp(e.target.value)}
                  className={`${field} font-sans`}
                >
                  <option value="">{t('edge.bench.app.escolher')}</option>
                  {(edit?.apps ?? []).map((pkg) => (
                    <option key={pkg} value={pkg}>
                      {t(`edge.bench.app.${pkg}`) === `edge.bench.app.${pkg}`
                        ? pkg
                        : t(`edge.bench.app.${pkg}`)}
                    </option>
                  ))}
                </select>
                <p className={hint}>{t('edge.bench.app.hint')}</p>
              </div>
            )}

            <div>
              <label className={label} htmlFor="device-form-pin">
                {t('edge.bench.form.pin')}
              </label>
              <input
                id="device-form-pin"
                data-testid="device-form-pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={edit?.has_pin ? '••••••' : ''}
                className={field}
              />
              <p data-testid="device-form-pin-hint"
                className={`${hint} ${pinOk ? '' : 'text-danger'}`}>
                {pinOk
                  ? t('edge.bench.form.pin.hint')
                  : t('edge.bench.form.pin.digits')}
              </p>
            </div>

            {err && (
              <div data-testid="device-form-error"
                className="flex items-start gap-2 p-2 border border-danger text-[11px] text-danger">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span className="min-w-0">{err}</span>
              </div>
            )}
          </div>

          <footer className="px-4 py-3 border-t border-border-light flex items-center gap-2">
            {/* Expectativa honesta: quem executa o adb é o runner, na ilha. */}
            <p className="flex-1 text-[10px] text-muted-on-light">
              {editando ? '' : t('edge.bench.form.async')}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="h-7 px-3 text-[11px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-testid="device-form-save"
              disabled={!canSave}
              onClick={() => void save()}
              className="h-7 px-3 text-[11px] bg-primary text-white disabled:opacity-40 flex items-center gap-1.5"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />}
              {editando
                ? t('edge.bench.form.submit.pin')
                : t('edge.bench.form.submit.add')}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
