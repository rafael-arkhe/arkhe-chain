'use client';

/**
 * Bancada de prontidão do Warm-up Validated Training (WVT).
 *
 * Mostra, antes de qualquer treino longo: FONTE → DATASET → PIPELINE →
 * MODELO → ARTEFATOS → WARM-UP, com o Configuration ID, validade e o motivo
 * exato quando o deep training está BLOQUEADO (fail-closed). O relatório abre
 * com as etapas (PASS/WARN/FAIL), falhas, avisos, métricas e a galeria de
 * evidências visuais preservadas no MinIO.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play, RefreshCcw, ShieldCheck, ShieldX, Trash2, X } from 'lucide-react';
import { Cctv, type AquecimentoDetalhe, type ProntidaoData } from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { cn } from '@/lib/cn';

const cardCls = 'border border-border-light bg-panel-light p-3';
const tituloCls =
  'text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold';
const btnGhost =
  'h-7 px-2 text-[10px] border border-border-light hover:border-primary flex items-center gap-1 disabled:opacity-50';

const ESTADO_CLS: Record<string, string> = {
  VALID: 'text-success border-success',
  RUNNING: 'text-primary border-primary',
  NONE: 'text-muted-on-light border-border-light',
  UNKNOWN: 'text-warning border-warning',
  FAILED: 'text-danger border-danger',
  EXPIRED: 'text-warning border-warning',
  INVALIDATED: 'text-danger border-danger',
};

const ESTADO_KEY: Record<string, string> = {
  VALID: 'wvt.estadoVALID',
  RUNNING: 'wvt.estadoRUNNING',
  NONE: 'wvt.estadoNONE',
  UNKNOWN: 'wvt.estadoUNKNOWN',
  FAILED: 'wvt.estadoFAILED',
  EXPIRED: 'wvt.estadoEXPIRED',
  INVALIDATED: 'wvt.estadoINVALIDATED',
};

const ETAPA_TONE: Record<string, string> = {
  PASS: 'text-success',
  WARN: 'text-warning',
  FAIL: 'text-danger',
  NOT_EXECUTED: 'text-muted-on-light',
};

function fmtData(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtBytes(n?: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  presetId: string | null;
  cameraId: string;
  dsWorkspace: string;
  dsProjeto: string;
  dsVersao: string;
  podeAquecer: boolean;
  onProntidao: (p: ProntidaoData | null) => void;
}

export function AquecimentoPanel({
  presetId,
  cameraId,
  dsWorkspace,
  dsProjeto,
  dsVersao,
  podeAquecer,
  onProntidao,
}: Props) {
  const t = useT();
  const [pront, setPront] = useState<ProntidaoData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AquecimentoDetalhe | null>(null);
  const [nota, setNota] = useState('');
  const [notaSalva, setNotaSalva] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const params = useMemo(
    () => ({
      preset: presetId || 'padrao',
      camera_id: cameraId || null,
      workspace: dsWorkspace.trim() || null,
      projeto: dsProjeto.trim() || null,
      versao: dsVersao.trim() ? Math.max(1, Number(dsVersao)) : null,
    }),
    [presetId, cameraId, dsWorkspace, dsProjeto, dsVersao],
  );

  const load = useCallback(
    async (silencioso = false) => {
      if (!presetId) {
        setPront(null);
        onProntidao(null);
        return;
      }
      try {
        const p = await Cctv.aquecimento.prontidao(params);
        setPront(p);
        onProntidao(p);
        if (!silencioso) setErr(null);
      } catch (e) {
        if (!silencioso) setErr((e as Error)?.message || String(e));
        setPront(null);
        onProntidao(null);
      }
    },
    [presetId, params, onProntidao],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto roda, atualiza sozinho (progresso durável do TrainingRun).
  useEffect(() => {
    const rodando = pront?.run?.status === 'running';
    if (timerRef.current) clearInterval(timerRef.current);
    if (rodando) {
      timerRef.current = setInterval(() => void load(true), 15000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pront?.run?.status, load]);

  const rodar = async () => {
    if (busy || !presetId) return;
    setBusy('aquecer');
    setErr(null);
    try {
      await Cctv.aquecimento.iniciar(params);
      await load(true);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  const cancelar = async () => {
    const id = pront?.run?.id;
    if (!id || busy) return;
    setBusy('cancelar');
    try {
      await Cctv.aquecimento.cancelar(id);
      await load(true);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const descartar = async () => {
    const id = pront?.run?.id;
    if (!id || busy) return;
    setBusy('descartar');
    try {
      await Cctv.aquecimento.descartar(id);
      await load(true);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const abrirRelatorio = async () => {
    const id = pront?.run?.id;
    if (!id) return;
    setBusy('relatorio');
    try {
      const d = await Cctv.aquecimento.detalhe(id);
      setDetalhe(d);
      setNota(d.note || '');
      setNotaSalva(false);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const salvarNota = async () => {
    if (!detalhe) return;
    try {
      await Cctv.aquecimento.nota(detalhe.id, nota);
      setNotaSalva(true);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    }
  };

  const estado = pront?.prontidao.estado ?? 'NONE';
  const estagios = ((detalhe?.relatorio as Record<string, unknown> | undefined)
    ?.estagios ?? []) as { nome: string; estado: string; detalhe?: string }[];
  const amostras = (detalhe?.artefatos ?? []).filter(
    (a) => /\.(jpe?g|png)$/i.test(a.path) && a.path.startsWith('samples/'),
  );
  const fonte = (detalhe?.relatorio as Record<string, unknown> | undefined)?.fonte as
    | Record<string, unknown>
    | undefined;
  const manifest = (detalhe?.relatorio as Record<string, unknown> | undefined)?.dataset as
    | Record<string, unknown>
    | undefined;
  const metricas = (detalhe?.relatorio as Record<string, unknown> | undefined)?.metricas as
    | Record<string, unknown>
    | undefined;
  const sistema = (detalhe?.relatorio as Record<string, unknown> | undefined)?.sistema as
    | Record<string, unknown>
    | undefined;
  const veredito = detalhe?.veredito ?? pront?.run?.veredito ?? null;
  const rodando = pront?.run?.status === 'running';
  const configId = pront?.config_id ?? '—';

  return (
    <div
      className={cardCls}
      data-testid="wvt-panel"
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.93), rgba(255,255,255,0.93)), url('/dominio/linha-1.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="flex items-center gap-2">
        <p className={tituloCls}>{t('wvt.titulo')}</p>
        <div className="flex-1" />
        <span
          className={cn(
            'px-1.5 py-0.5 text-[9px] uppercase tracking-wider border font-mono',
            ESTADO_CLS[estado] ?? ESTADO_CLS.NONE,
          )}
          data-testid="wvt-estado"
        >
          {t(ESTADO_KEY[estado] ?? 'wvt.estadoNONE')}
        </span>
        <button type="button" className={btnGhost} onClick={() => void load()}>
          <RefreshCcw className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>
      <p className="text-[10px] text-muted-on-light mt-1">{t('wvt.subtitulo')}</p>

      {/* Bancada: fonte/dataset/pipeline/modelo/artefatos */}
      <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px] font-mono" data-testid="wvt-board">
        <div className="border border-border-light px-2 py-1">
          <span className="text-muted-on-light">{t('wvt.fonte')}: </span>
          {pront?.fonte.online ? (
            <span className={pront.fonte.captura ? 'text-success' : 'text-warning'}>
              {pront.fonte.modo} · {pront.fonte.captura ? t('wvt.online') : t('wvt.semCaptura')}
            </span>
          ) : (
            <span className="text-danger">{t('wvt.offline')}</span>
          )}
        </div>
        <div className="border border-border-light px-2 py-1">
          <span className="text-muted-on-light">{t('wvt.dataset')}: </span>
          {pront?.run?.veredito?.passed ? (
            <span className="text-success">{t('wvt.validado')}</span>
          ) : (
            <span className="text-muted-on-light">{t('wvt.naoExecutado')}</span>
          )}
        </div>
        <div className="border border-border-light px-2 py-1">
          <span className="text-muted-on-light">{t('wvt.pipeline')}: </span>
          {pront?.run?.veredito?.passed ? (
            <span className="text-success">{t('wvt.validado')}</span>
          ) : (
            <span className="text-muted-on-light">{t('wvt.naoExecutado')}</span>
          )}
        </div>
        <div className="border border-border-light px-2 py-1">
          <span className="text-muted-on-light">{t('wvt.modelo')}: </span>
          {pront?.fonte.modelo_info ? (
            <span title={JSON.stringify(pront.fonte.modelo_info)}>
              {String(pront.fonte.modelo_info.arquitetura ?? '—')}
              {pront.fonte.modelo_info.sha256
                ? ` · ${String(pront.fonte.modelo_info.sha256).slice(0, 8)}`
                : ''}
            </span>
          ) : (
            <span className="text-muted-on-light">—</span>
          )}
        </div>
        <div className="border border-border-light px-2 py-1 col-span-2">
          <span className="text-muted-on-light">{t('wvt.artefatos')}: </span>
          {pront?.artefatos ? (
            <span className="text-success">
              {t('wvt.preservados')} · {pront.artefatos}
            </span>
          ) : (
            <span className="text-muted-on-light">{t('wvt.naoExecutado')}</span>
          )}
        </div>
      </div>

      {/* Validade + Configuration ID */}
      <div className="mt-2 text-[10px] font-mono leading-relaxed">
        <p>
          <span className="text-muted-on-light">{t('wvt.configId')}: </span>
          <span title={configId}>{configId.slice(0, 16)}</span>
          {pront?.prontidao.config_id_aquecimento &&
            pront.prontidao.config_id_aquecimento !== configId && (
              <span className="text-danger"> · diverge do aquecimento</span>
            )}
        </p>
        <p>
          <span className="text-muted-on-light">{t('wvt.validadoEm')}: </span>
          {fmtData(pront?.prontidao.validado_em)}
          {' · '}
          <span className="text-muted-on-light">{t('wvt.expiraEm')}: </span>
          {fmtData(pront?.prontidao.expira_em)}
        </p>
      </div>

      {/* Divergências (o PORQUÊ do INVALIDATED) */}
      {!!pront?.prontidao.divergencias?.length && (
        <div className="mt-2 border border-danger/50 px-2 py-1" data-testid="wvt-divergencias">
          <p className="text-[9px] uppercase tracking-wider text-danger">
            {t('wvt.divergencias')}
          </p>
          {pront.prontidao.divergencias.slice(0, 8).map((d) => (
            <p key={d.campo} className="text-[10px] font-mono">
              {d.campo}: <span className="text-muted-on-light">{String(d.aquecimento)}</span> →{' '}
              {String(d.atual)}
            </p>
          ))}
        </div>
      )}

      {/* Nota de confiança + para leigos + benchmark de mercado */}
      {veredito?.qualidade && (
        <div
          className="mt-2 border border-border-light px-2 py-1.5 bg-panel-light/70"
          data-testid="wvt-qualidade"
        >
          <div className="flex items-center gap-2">
            <span className={tituloCls}>{t('wvt.notaTitulo')}</span>
            <span className="text-[16px] font-mono font-semibold">
              {veredito.qualidade.nota}
            </span>
            <span className="text-[10px] text-muted-on-light">/100</span>
            <span
              className={cn(
                'px-1.5 py-0.5 text-[9px] uppercase tracking-wider border font-mono',
                veredito.qualidade.nivel === 'ALTA'
                  ? 'text-success border-success'
                  : veredito.qualidade.nivel === 'MEDIA'
                    ? 'text-warning border-warning'
                    : 'text-danger border-danger',
              )}
            >
              {veredito.qualidade.nivel}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            {veredito.qualidade.componentes.map((c) => (
              <div key={c.nome} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="w-36 shrink-0">{c.nome}</span>
                <span className="w-12 shrink-0 text-muted-on-light">
                  {c.pontos}/{c.maximo}
                </span>
                <div className="flex-1 h-1 bg-border-light">
                  <div
                    className={cn(
                      'h-1',
                      c.pontos >= c.maximo * 0.9
                        ? 'bg-success'
                        : c.pontos >= c.maximo * 0.5
                          ? 'bg-primary'
                          : 'bg-danger',
                    )}
                    style={{ width: `${(c.pontos / c.maximo) * 100}%` }}
                  />
                </div>
                <span className="w-48 shrink-0 text-muted-on-light truncate" title={c.detalhe}>
                  {c.detalhe}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-1">{veredito.qualidade.frase}</p>
        </div>
      )}

      {!!veredito?.benchmark?.length && (
        <details className="mt-2" data-testid="wvt-benchmark">
          <summary className={cn(tituloCls, 'cursor-pointer select-none')}>
            {t('wvt.benchmark')} — {t('wvt.benchmarkMercado')}
          </summary>
          <div className="mt-1 flex flex-col">
            {veredito.benchmark.map((b) => (
              <div
                key={b.metrica}
                className="border-b border-border-light/60 py-0.5 text-[10px] font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1">{b.metrica}</span>
                  <span className="text-text-on-light">{b.medido}</span>
                  <span
                    className={cn(
                      'px-1 text-[9px] uppercase border',
                      b.estado === 'OK'
                        ? 'text-success border-success'
                        : b.estado === 'ATENCAO'
                          ? 'text-warning border-warning'
                          : 'text-muted-on-light border-border-light',
                    )}
                  >
                    {b.estado}
                  </span>
                </div>
                <p className="text-muted-on-light">
                  referência: {b.referencia} · {b.contexto}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {veredito?.para_leigos && (
        <details className="mt-2" data-testid="wvt-leigo">
          <summary className={cn(tituloCls, 'cursor-pointer select-none')}>
            {veredito.para_leigos.titulo}
          </summary>
          {veredito.para_leigos.paragrafos.map((p, i) => (
            <p key={i} className="text-[11px] text-text-on-light mt-1 leading-relaxed">
              {p}
            </p>
          ))}
          <dl className="mt-1.5">
            {veredito.para_leigos.glossario.map((g) => (
              <div key={g.termo} className="text-[10px] leading-relaxed">
                <dt className="font-semibold inline">{g.termo}: </dt>
                <dd className="inline text-muted-on-light">{g.explicacao}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {/* Falhas/Warns do veredito */}
      {!!veredito?.falhas?.length && (
        <div className="mt-2" data-testid="wvt-falhas">
          {veredito.falhas.slice(0, 6).map((f, i) => (
            <p key={i} className="text-[10px] font-mono text-danger">
              FAIL — {f.estagio}: {f.detalhe}
            </p>
          ))}
        </div>
      )}
      {!!veredito?.warns?.length && (
        <div className="mt-1">
          {veredito.warns.slice(0, 4).map((f, i) => (
            <p key={i} className="text-[10px] font-mono text-warning">
              WARN — {f.estagio}: {f.detalhe}
            </p>
          ))}
        </div>
      )}

      {/* Progresso do run em execução */}
      {rodando && (
        <p className="text-[10px] font-mono text-primary mt-2" data-testid="wvt-progresso">
          <Loader2 className="w-3 h-3 inline animate-spin mr-1" strokeWidth={1.5} />
          {String((pront?.run?.progresso as Record<string, unknown>)?.estagio ?? '')}
          {' · '}
          {String((pront?.run?.progresso as Record<string, unknown>)?.detalhe ?? '')}
        </p>
      )}

      {/* Ações */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <button
          type="button"
          data-testid="wvt-rodar"
          onClick={() => void rodar()}
          disabled={!podeAquecer || !presetId || busy !== null || rodando}
          className="h-7 px-3 text-[10px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          {busy === 'aquecer' ? (
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
          ) : estado === 'NONE' ? (
            <Play className="w-3 h-3" strokeWidth={1.5} />
          ) : (
            <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
          )}
          {estado === 'NONE' ? t('wvt.rodar') : t('wvt.rodarDeNovo')}
        </button>
        {rodando && (
          <button type="button" className={btnGhost} onClick={() => void cancelar()}>
            <X className="w-3 h-3" strokeWidth={1.5} /> {t('wvt.cancelar')}
          </button>
        )}
        {!!pront?.run && (
          <button
            type="button"
            data-testid="wvt-relatorio"
            className={btnGhost}
            onClick={() => void abrirRelatorio()}
          >
            {busy === 'relatorio' ? (
              <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
            ) : (
              <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
            )}
            {t('wvt.verDetalhes')}
          </button>
        )}
        {!!pront?.run && !rodando && (
          <button
            type="button"
            data-testid="wvt-descartar"
            className={btnGhost}
            onClick={() => void descartar()}
          >
            <Trash2 className="w-3 h-3" strokeWidth={1.5} /> {t('wvt.descartar')}
          </button>
        )}
      </div>

      {!podeAquecer && (
        <p className="text-[10px] text-muted-on-light mt-1">{t('wvt.aguardandoProvider')}</p>
      )}
      <p
        className={cn(
          'text-[10px] font-mono mt-1',
          estado === 'VALID' ? 'text-success' : 'text-warning',
        )}
        data-testid="wvt-deep-gate"
      >
        {estado === 'VALID' ? t('wvt.deepLiberado') : t('wvt.deepBloqueado')}
      </p>
      {err && <p className="text-[10px] text-danger mt-1">{err}</p>}

      {/* Relatório completo */}
      {detalhe && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4"
          data-testid="wvt-relatorio-modal"
        >
          <div className="bg-panel-light border border-border-light w-full max-w-4xl my-4">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border-light">
              <p className="text-[11px] font-semibold uppercase tracking-wider">
                {t('wvt.relatorio')} ·{' '}
                <span className="font-mono text-muted-on-light">{detalhe.id.slice(0, 8)}</span>
              </p>
              <div className="flex-1" />
              {veredito && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-[9px] uppercase tracking-wider border font-mono',
                    veredito.passed ? 'text-success border-success' : 'text-danger border-danger',
                  )}
                >
                  {veredito.resumo}
                </span>
              )}
              <button
                type="button"
                className={btnGhost}
                onClick={() => setDetalhe(null)}
                aria-label={t('common.cancel')}
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Etapas */}
              <div>
                <p className={tituloCls}>{t('wvt.estagios')}</p>
                <div className="mt-1 flex flex-col">
                  {estagios.map((s) => (
                    <div
                      key={s.nome}
                      className="flex items-start gap-2 text-[10px] font-mono border-b border-border-light/50 py-0.5"
                    >
                      <span className={cn('w-24 shrink-0', ETAPA_TONE[s.estado] ?? '')}>
                        {s.estado}
                      </span>
                      <span className="w-40 shrink-0">{s.nome}</span>
                      <span className="text-muted-on-light truncate" title={s.detalhe}>
                        {s.detalhe}
                      </span>
                    </div>
                  ))}
                </div>
                {!!veredito?.falhas?.length && (
                  <div className="mt-2">
                    <p className={cn(tituloCls, 'text-danger')}>{t('wvt.falhas')}</p>
                    {veredito.falhas.map((f, i) => (
                      <p key={i} className="text-[10px] font-mono text-danger">
                        FAIL — {f.estagio}: {f.detalhe}
                      </p>
                    ))}
                  </div>
                )}
                {!!veredito?.warns?.length && (
                  <div className="mt-2">
                    <p className={cn(tituloCls, 'text-warning')}>{t('wvt.avisos')}</p>
                    {veredito.warns.map((f, i) => (
                      <p key={i} className="text-[10px] font-mono text-warning">
                        WARN — {f.estagio}: {f.detalhe}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Dados/ambiente */}
              <div className="flex flex-col gap-2">
                {fonte && (
                  <div>
                    <p className={tituloCls}>{t('wvt.fonteStats')}</p>
                    <p className="text-[10px] font-mono">
                      frames: {String(fonte.frames_recebidos ?? '—')} · fps:{' '}
                      {String(fonte.fps_observado ?? '—')} · res:{' '}
                      {String(fonte.resolucao_principal ?? '—')} · inválidos:{' '}
                      {String(fonte.frames_invalidos ?? '—')} · dup:{' '}
                      {String(fonte.frames_duplicados ?? '—')} · corrompidos:{' '}
                      {String(fonte.frames_corrompidos ?? '—')} · interrupções:{' '}
                      {String(fonte.interrupcoes ?? '—')} · perda:{' '}
                      {String(fonte.perda_pct ?? '—')}%
                    </p>
                  </div>
                )}
                {manifest && (
                  <div>
                    <p className={tituloCls}>{t('wvt.manifest')}</p>
                    <p className="text-[10px] font-mono">
                      imagens: {String(manifest.total ?? '—')} · train:{' '}
                      {String((manifest.splits as Record<string, unknown>)?.train ?? '—')} · val:{' '}
                      {String((manifest.splits as Record<string, unknown>)?.val ?? '—')} · sha:{' '}
                      {String(manifest.sha_conteudo ?? '—').slice(0, 12)}
                    </p>
                  </div>
                )}
                {metricas && (
                  <div>
                    <p className={tituloCls}>{t('wvt.metricas')}</p>
                    <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-on-light">
                      {JSON.stringify(metricas, null, 1)}
                    </pre>
                  </div>
                )}
                {sistema && (
                  <div>
                    <p className={tituloCls}>{t('wvt.sistema')}</p>
                    <p className="text-[10px] font-mono truncate" title={JSON.stringify(sistema)}>
                      {String(sistema.gpu ?? sistema.cpu ?? '—')} · cuda:{' '}
                      {String(sistema.cuda_disponivel ?? '—')} · torch:{' '}
                      {String(sistema.torch ?? '—')} · vram:{' '}
                      {String(sistema.vram_gb ?? '—')}GB
                    </p>
                  </div>
                )}
                {/* Notas humanas */}
                <div>
                  <p className={tituloCls}>{t('wvt.notas')}</p>
                  <textarea
                    data-testid="wvt-nota"
                    value={nota}
                    onChange={(e) => {
                      setNota(e.target.value);
                      setNotaSalva(false);
                    }}
                    rows={3}
                    className="w-full mt-1 text-[11px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none p-1"
                  />
                  <button type="button" className={btnGhost} onClick={() => void salvarNota()}>
                    {t('wvt.salvarNotas')}
                  </button>
                  {notaSalva && <span className="text-[10px] text-success ml-2">ok</span>}
                </div>
              </div>
            </div>

            {/* Galeria de evidências visuais */}
            {amostras.length > 0 && (
              <div className="px-3 pb-3">
                <p className={tituloCls}>{t('wvt.evidencias')}</p>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mt-1">
                  {amostras.slice(0, 20).map((a) => (
                    <a
                      key={a.path}
                      href={Cctv.aquecimento.artefatoUrl(detalhe.id, a.path)}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-border-light block"
                      title={`${a.path} (${fmtBytes(a.bytes)})`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={Cctv.aquecimento.artefatoUrl(detalhe.id, a.path)}
                        alt={a.path}
                        loading="lazy"
                        className="w-full h-24 object-cover"
                      />
                      <span className="block text-[8px] font-mono px-1 py-0.5 truncate text-muted-on-light">
                        {a.path.replace('samples/', '')}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {!veredito?.passed && veredito && (
              <div className="px-3 pb-3">
                <p className="text-[10px] font-mono text-danger flex items-center gap-1">
                  <ShieldX className="w-3 h-3" strokeWidth={1.5} />
                  {veredito.critical_issues} critical issue(s) — o deep training fica
                  bloqueado até um novo aquecimento passar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
