'use client';

/**
 * ContagemProof — "Provar a contagem (janela)" DIRETO no /cameras, para
 * câmera CON (tag `bc-ready`), bem no alto do painel de detecções.
 *
 * O operador assiste o vídeo e conta os sacos de verdade; informa a janela
 * e o número — o sistema busca as contagens do modelo no MESMO período e
 * devolve a acurácia com o veredito de aceite (≥ 99,4%). Nada de arquivo
 * técnico: o sistema busca os eventos sozinho no serviço da linha.
 */
import * as React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  Cctv,
  type AvaliarResultado,
} from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';

function fmtHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ContagemProof({ streamId }: { streamId: string }) {
  const t = useT();
  const [inicio, setInicio] = React.useState('');
  const [fim, setFim] = React.useState('');
  const [manual, setManual] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [out, setOut] = React.useState<AvaliarResultado | null>(null);

  // Trocou de câmera → zera o veredito e pré-preenche a última hora.
  React.useEffect(() => {
    const agora = new Date();
    const uma = new Date(agora.getTime() - 3_600_000);
    const fmt = (d: Date) => {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setInicio(fmt(uma));
    setFim(fmt(agora));
    setManual('');
    setOut(null);
    setErr(null);
  }, [streamId]);

  const comparar = async () => {
    if (busy || manual.trim() === '') return;
    setBusy(true);
    setErr(null);
    try {
      const r = await Cctv.treino.avaliar({
        desde: inicio || null,
        ate: fim || null,
        manual: Math.max(0, Number(manual) || 0),
      });
      setOut(r);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="px-3 py-2 border-b-2 border-primary/60 bg-primary/5 shrink-0"
      data-testid="contagem-proof"
    >
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-primary flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        {t('treino.janelaTitulo')}
      </p>
      <p className="text-[10px] text-muted-on-light mt-0.5 leading-snug">
        {t('treino.janelaHint')}
      </p>
      <div className="grid grid-cols-2 gap-1.5 mt-1.5">
        <label className="block min-w-0">
          <span className="sr-only">{t('treino.inicio')}</span>
          <input
            type="datetime-local"
            data-testid="proof-inicio"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className="w-full h-7 px-1.5 text-[10px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none"
          />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">{t('treino.fim')}</span>
          <input
            type="datetime-local"
            data-testid="proof-fim"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className="w-full h-7 px-1.5 text-[10px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none"
          />
        </label>
      </div>
      <div className="flex items-end gap-1.5 mt-1.5">
        <label className="block flex-1 min-w-0">
          <span className="sr-only">{t('treino.manual')}</span>
          <input
            data-testid="proof-manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="numeric"
            placeholder={t('treino.manual')}
            className="w-full h-7 px-2 text-[11px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none placeholder:text-muted-on-light"
          />
        </label>
        <button
          type="button"
          data-testid="proof-comparar"
          onClick={() => void comparar()}
          disabled={busy || manual.trim() === ''}
          className="h-7 px-3 text-[11px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          ) : (
            t('treino.avaliar')
          )}
        </button>
      </div>
      {out && (
        <div className="mt-1.5 text-[10px] font-mono space-y-0.5" data-testid="proof-resultado">
          <p>
            {t('treino.acuracia')}: {out.acuracia_pct.toFixed(2)}% ·{' '}
            {t('treino.erro')} {out.erro_absoluto} ·{' '}
            {t('treino.contados')} {out.eventos}/{out.manual}
          </p>
          <p className={out.aceite_99_4 ? 'text-success' : 'text-warning'}>
            {out.aceite_99_4 ? t('treino.aceite') : t('treino.reprovado')}
          </p>
        </div>
      )}
      {err && (
        <p data-testid="proof-erro" className="text-[10px] text-danger mt-1">
          {err}
        </p>
      )}
    </div>
  );
}
