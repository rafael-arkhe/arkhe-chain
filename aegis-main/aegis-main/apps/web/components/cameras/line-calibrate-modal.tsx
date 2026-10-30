'use client';

/**
 * LineCalibrateModal — desenho da LINHA de contagem + ÁREA (ROI) no frame
 * da câmera, direto do /cameras (vertical contagem de sacos).
 *
 * UX em 3 passos, cada um com estado VISÍVEL:
 *   1 · Linha — 2 cliques no frame definem A→B (o segundo fecha o passo);
 *   2 · Área (opcional) — cliques fazem o polígono; duplo clique ou
 *       "Fechar área" encerra; "Desfazer" remove o último clique;
 *   3 · Direção + salvar — confiança mínima opcional.
 *
 * As coordenadas viajam NORMALIZADAS 0..1 no PUT /api/v1/streams/{id}/
 * calibracao (mesmo formato do `calibracao.json` de clipe) — o serviço
 * `contagem-sacos` lê por polling e aplica na cena sem reiniciar nada.
 * Perms: o gesto é gated na página por `security.cameras.manage`.
 */
import * as React from 'react';
import { Ban, X } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import {
  Cctv,
  framePathToUrl,
  type CalibracaoLinha,
  type CCTVStream,
  type PontoNormalizado,
} from '@/lib/api/cctv';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useT } from '@/lib/i18n/provider';

/** ViewBox canônico do frame (o MESMO eixo dos bboxes das detecções). */
const VIEW_W = 1280;
const VIEW_H = 720;

type Modo = 'linha' | 'roi';

export interface LineCalibrateModalProps {
  stream: CCTVStream;
  /** Frame mais recente arquivado da câmera (detectionFrameUrl) — null =
   *  sem frame ainda; o modal BUSCA o quadro da fonte (snapshot do serviço
   *  ou frame.jpeg da ponte — NUNCA job de GPU). */
  frameUrl: string | null;
  onClose: () => void;
  /** Notifica a página após salvar/remover (recarregar estado). */
  onChanged?: () => void;
}

const toPixels = (p: PontoNormalizado): { x: number; y: number } => ({
  x: p[0] * VIEW_W,
  y: p[1] * VIEW_H,
});
const toNormal = (px: number, py: number): PontoNormalizado => [
  Math.round((px / VIEW_W) * 1000) / 1000,
  Math.round((py / VIEW_H) * 1000) / 1000,
];

export function LineCalibrateModal({
  stream,
  frameUrl,
  onClose,
  onChanged,
}: LineCalibrateModalProps) {
  const t = useT();
  const [modo, setModo] = React.useState<Modo>('linha');
  const [linha, setLinha] = React.useState<PontoNormalizado[] | null>(null);
  const [roi, setRoi] = React.useState<PontoNormalizado[]>([]);
  const [direcao, setDirecao] = React.useState<1 | -1>(1);
  const [confMin, setConfMin] = React.useState('');
  const [current, setCurrent] = React.useState<CalibracaoLinha | null>(null);
  const [salva, setSalva] = React.useState<CalibracaoLinha | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Quadro a desenhar: o arquivado (prop) OU o buscado da FONTE (snapshot do
  // serviço / frame.jpeg da ponte — sem GPU, mesmo caminho do vertical).
  const [frameSrc, setFrameSrc] = React.useState<string | null>(frameUrl);

  // Sem frame arquivado → busca o quadro da FONTE (snapshot/frame.jpeg —
  // a contagem é acoplada ao AEGIS como módulo próprio, sem RunPod).
  React.useEffect(() => {
    if (frameUrl) return;
    let cancelled = false;
    Cctv.streams
      .frame(stream.id)
      .then((r) => {
        if (cancelled) return;
        const raw = (r as { frame_url?: string | null })?.frame_url;
        if (typeof raw === 'string' && raw) setFrameSrc(framePathToUrl(raw));
      })
      .catch(() => {
        // sem quadro publicável — estado honesto abaixo
      });
    return () => {
      cancelled = true;
    };
  }, [frameUrl, stream.id]);

  // Estado vigente: pré-carrega linha/ROI/direção/conf_min para revisão.
  React.useEffect(() => {
    let cancelled = false;
    Cctv.calibracao
      .get(stream.id)
      .then((r) => {
        if (cancelled) return;
        const cal = r.calibracao;
        if (cal?.status === 'calibrated' && cal.linha && cal.linha.length === 2) {
          setLinha([cal.linha[0], cal.linha[1]]);
          setDirecao(cal.direcao === -1 ? -1 : 1);
          if (cal.conf_min != null) setConfMin(String(cal.conf_min));
          if (cal.roi && cal.roi.length >= 3) setRoi(cal.roi);
          setCurrent(cal);
        }
      })
      .catch(() => {
        // leitura falhou — segue descalibrada na UI (o PUT continua possível)
      });
    return () => {
      cancelled = true;
    };
  }, [stream.id]);

  const passo1Feito = !!linha && linha.length === 2;
  const passo2Ativo = passo1Feito && modo === 'roi';
  const passo2Feito = roi.length >= 3;
  const podeSalvar = passo1Feito && !busy;
  const passoAtivo = !passo1Feito ? 1 : passo2Ativo && !passo2Feito ? 2 : 3;

  const onFrameClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const py = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const p = toNormal(
      Math.min(VIEW_W, Math.max(0, px)),
      Math.min(VIEW_H, Math.max(0, py)),
    );
    setSalva(null);
    if (modo === 'linha') {
      const next = !linha || linha.length >= 2 ? [p] : [linha[0], p];
      setLinha(next);
      if (next.length === 2) setModo('roi'); // passos 1→2: cliques viram vértices
      return;
    }
    setRoi((prev) => (prev.length >= 24 ? prev : [...prev, p]));
  };

  // Duplo clique fecha a área (o gesto natural de "terminei o polígono").
  const onFrameDblClick = () => {
    if (modo === 'roi' && roi.length >= 3) setModo('linha');
  };

  const desfazer = () => {
    setSalva(null);
    setErr(null);
    if (modo === 'roi' && roi.length > 0) {
      setRoi((prev) => prev.slice(0, -1));
      return;
    }
    if (linha && linha.length === 2) {
      setLinha([linha[0]]);
      setModo('linha');
      return;
    }
    setLinha(null);
  };

  const limpar = () => {
    setLinha(null);
    setRoi([]);
    setModo('linha');
    setConfMin('');
    setSalva(null);
    setErr(null);
  };

  const save = async () => {
    if (!linha || linha.length !== 2 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        linha: [linha[0], linha[1]] as [
          PontoNormalizado,
          PontoNormalizado,
        ],
        direcao,
        roi: roi.length >= 3 ? roi : null,
        conf_min: confMin.trim() === '' ? null : Number(confMin),
      };
      const out = await Cctv.calibracao.put(stream.id, body);
      setCurrent(out.calibracao);
      setSalva(out.calibracao);
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmModal({
      title: t('cameras.linhaRemove'),
      description: t('cameras.linhaRemoveConfirm'),
      tone: 'danger',
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await Cctv.calibracao.remove(stream.id);
      setCurrent(null);
      limpar();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const a = linha?.[0] ? toPixels(linha[0]) : null;
  const b = linha?.[1] ? toPixels(linha[1]) : null;
  const passo =
    !linha || linha.length === 0
      ? t('cameras.linhaClickA')
      : linha.length === 1
        ? t('cameras.linhaClickB')
        : passo2Ativo
          ? t('cameras.linhaRoiClick')
          : t('cameras.linhaPronto');

  const chipCls = (estado: 'ativo' | 'feito' | 'pendente') =>
    `h-7 px-2.5 text-[10px] uppercase tracking-wider border flex items-center gap-1.5 ${
      estado === 'ativo'
        ? 'bg-primary text-white border-primary'
        : estado === 'feito'
          ? 'bg-raised-light border-success text-success'
          : 'bg-raised-light border-border-light text-muted-on-light'
    }`;

  return (
    <ModalPortal>
      <div
        data-testid="linha-modal"
        className="fixed inset-0 z-50 ds-overlay flex items-center justify-center p-4"
      >
        <div className="bg-white text-text-on-light border border-border-light w-full max-w-[860px] max-h-[92vh] overflow-y-auto flex flex-col">
          <div className="h-10 px-3 border-b border-border-light flex items-center gap-2 bg-raised-light shrink-0">
            <Ban className="w-3.5 h-3.5" strokeWidth={1.5} />
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold flex-1 truncate">
              {t('cameras.linhaTitle')} · {stream.name}
            </p>
            <button
              type="button"
              data-testid="linha-close"
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-6 h-6 flex items-center justify-center border border-border-light hover:border-primary"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-3 flex flex-col gap-3">
            {/* Trilha de passos — sempre visível, estado sempre honesto */}
            <div
              data-testid="linha-passos"
              className="flex items-center gap-2 flex-wrap"
            >
              <span className={chipCls(passoAtivo === 1 ? 'ativo' : passo1Feito ? 'feito' : 'pendente')}>
                {t('cameras.linhaPasso1')}
              </span>
              <span className={chipCls(passoAtivo === 2 ? 'ativo' : passo2Feito ? 'feito' : 'pendente')}>
                {t('cameras.linhaPasso2')}
              </span>
              <span className={chipCls(passoAtivo === 3 ? 'ativo' : 'pendente')}>
                {t('cameras.linhaPasso3')}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                data-testid="linha-undo"
                onClick={desfazer}
                disabled={busy || (!linha && roi.length === 0)}
                title={t('cameras.linhaUndoTitle')}
                className="h-6 px-2 text-[10px] border border-border-light hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('cameras.linhaUndo')}
              </button>
              <button
                type="button"
                data-testid="linha-reset"
                onClick={limpar}
                className="h-6 px-2 text-[10px] border border-border-light hover:border-primary text-muted-on-light"
              >
                {t('cameras.linhaReset')}
              </button>
            </div>

            {current && !salva && (
              <div
                data-testid="linha-current"
                className="px-2 py-1.5 border border-border-light bg-raised-light flex items-center gap-2 text-[10px] font-mono"
              >
                <span className="flex-1 truncate">
                  {t('cameras.linhaCurrent')
                    .replace('{n}', String(current.versao ?? '—'))
                    .replace('{quando}', current.atualizado_em?.slice(0, 16)?.replace('T', ' ') ?? '—')}
                </span>
                <button
                  type="button"
                  data-testid="linha-remove"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="h-6 px-2 text-[10px] border border-border-light hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  {t('cameras.linhaRemove')}
                </button>
              </div>
            )}

            {salva && (
              <p
                data-testid="linha-salva"
                className="text-[11px] font-mono text-success"
              >
                {t('cameras.linhaSalva').replace(
                  '{n}',
                  String(salva.versao ?? ''),
                )}
              </p>
            )}

            {frameSrc ? (
              <div
                data-testid="linha-frame"
                onClick={onFrameClick}
                onDoubleClick={onFrameDblClick}
                className="relative aspect-video bg-black cursor-crosshair border border-border-light overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frameSrc}
                  alt={t('cameras.linhaPane')}
                  className="absolute inset-0 w-full h-full object-fill select-none"
                  draggable={false}
                />
                <svg
                  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  {roi.length >= 2 && (
                    <polygon
                      points={roi.map((p) => `${p[0] * VIEW_W},${p[1] * VIEW_H}`).join(' ')}
                      fill="#2D77BE22"
                      stroke="#2D77BE"
                      strokeWidth={2}
                    />
                  )}
                  {roi.length === 1 && (
                    <circle
                      cx={roi[0][0] * VIEW_W}
                      cy={roi[0][1] * VIEW_H}
                      r={10}
                      fill="#2D77BE"
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  )}
                  {a && (
                    <circle cx={a.x} cy={a.y} r={9} fill="#2D77BE" stroke="#fff" strokeWidth={2} />
                  )}
                  {a && !b && linha && linha.length === 1 && (
                    <circle cx={a.x} cy={a.y} r={16} fill="none" stroke="#F59E0B" strokeWidth={3} />
                  )}
                  {a && b && (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#3D9F58"
                      strokeWidth={3}
                      strokeDasharray="10 6"
                    />
                  )}
                  {b && (
                    <circle cx={b.x} cy={b.y} r={9} fill="#3D9F58" stroke="#fff" strokeWidth={2} />
                  )}
                </svg>
              </div>
            ) : (
              <div
                data-testid="linha-no-frame"
                className="aspect-video border border-border-light bg-raised-light flex items-center justify-center p-4"
              >
                <p className="text-[11px] text-muted-on-light text-center max-w-[360px]">
                  {t('cameras.linhaNoFrame')}
                </p>
              </div>
            )}

            <p data-testid="linha-step" className="text-[11px] font-mono text-muted-on-light">
              {passo}
              {passo2Ativo && roi.length >= 3 && (
                <> {' · '}{t('cameras.linhaDuploClique')}</>
              )}
              {' · '}
              {t('cameras.linhaRoiPontos')} {roi.length}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                  {t('cameras.linhaDirecao')}
                </span>
                <select
                  data-testid="linha-direcao"
                  value={direcao}
                  onChange={(e) => setDirecao(Number(e.target.value) === -1 ? -1 : 1)}
                  className="mt-1 w-full h-8 px-2 text-[12px] bg-canvas-light border border-border-light focus:border-primary outline-none"
                >
                  <option value={1}>{t('cameras.linhaDirecaoAB')}</option>
                  <option value={-1}>{t('cameras.linhaDirecaoBA')}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold">
                  {t('cameras.linhaConfMin')}
                </span>
                <input
                  data-testid="linha-conf-min"
                  className="mt-1 w-full h-8 px-2 text-[12px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none"
                  value={confMin}
                  onChange={(e) => setConfMin(e.target.value)}
                  placeholder={t('cameras.linhaConfPh')}
                  inputMode="decimal"
                />
              </label>
            </div>

            {err && (
              <p data-testid="linha-error" className="text-[11px] text-danger">
                {t('cameras.linhaError')}: {err}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-border-light pt-3">
              <button
                type="button"
                data-testid="linha-cancel"
                onClick={onClose}
                className="h-7 px-3 text-[11px] border border-border-light hover:border-primary"
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                data-testid="linha-save"
                onClick={() => void save()}
                disabled={!podeSalvar}
                title={!podeSalvar ? t('cameras.linhaClickA') : t('cameras.linhaSave')}
                className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('cameras.linhaSave')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
