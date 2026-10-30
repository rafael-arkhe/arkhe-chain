'use client';

/**
 * TREINAMENTOS — peça GENÉRICA do AEGIS (marketplace de runs).
 *
 * NADA de domínio hardcoded aqui: os cards são DADO do backend
 * (GET /api/v1/contagem-treino/presets, com `categoria` + `tags`), as
 * câmeras vêm de /status, os labels de useT(). Um vertical novo (LPR, OCR,
 * outra coisa) acrescenta presets com a sua categoria e a página renderiza
 * — a mesma peça serve para todos, com filtros como os filter-pills.
 *
 * Layout DS: grid assimétrico (ciclo à esquerda · run à direita), cantos
 * retos, #2D77BE só no estado, mono nos dados.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  Brain,
  KeyRound,
  Loader2,
  RefreshCcw,
  Square,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { AquecimentoPanel } from '@/components/treino/aquecimento-panel';
import {
  Cctv,
  type ProntidaoData,
  type TreinoPreset,
  type TreinoStatus,
} from '@/lib/api/cctv';
import { useT } from '@/lib/i18n/provider';
import { useContextClassification } from '@/lib/use-context-classification';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { cn } from '@/lib/cn';

const inputCls =
  'w-full h-8 px-2 text-[12px] font-mono bg-canvas-light border border-border-light focus:border-primary outline-none';
const cardCls = 'border border-border-light bg-panel-light p-3';
const tituloCls =
  'text-[10px] uppercase tracking-[0.18em] text-muted-on-light font-semibold';

function fmtUptime(seg: number): string {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function TreinamentosPage() {
  const t = useT();
  const shell = useContextClassification();
  const [status, setStatus] = useState<TreinoStatus | null>(null);
  const [presets, setPresets] = useState<TreinoPreset[] | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [catFiltro, setCatFiltro] = useState<string | null>(null);
  const [tagFiltro, setTagFiltro] = useState<string | null>(null);
  const [podsList, setPodsList] = useState<
    {
      id: string; nome: string; status?: string; gpu?: string | null;
      cost_usd_hr?: number | null; custo_acumulado_usd?: number | null;
      uptime_s?: number | null; camera?: string | null; dataset?: string | null;
      receita?: string | null; disk_gb?: number | null;
    }[]
  >([]);
  const [progressoPorPod, setProgressoPorPod] = useState<
    Record<string, { fase: string; linha: string; ts: string; atrasado: boolean }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [iniciado, setIniciado] = useState<string | null>(null);
  const [credChave, setCredChave] = useState('');
  const [credOk, setCredOk] = useState(false);
  const [cameraId, setCameraId] = useState('');
  const [dsWorkspace, setDsWorkspace] = useState('');
  const [dsProjeto, setDsProjeto] = useState('');
  const [dsVersao, setDsVersao] = useState('');
  // WVT: a prontidão corrente (o gate do deep training na UI espelha o do
  // backend — fail-closed nos dois lados).
  const [prontidao, setProntidao] = useState<ProntidaoData | null>(null);

  const load = useCallback(() => {
    Cctv.treino.status()
      .then((s) => { setStatus(s); setCredOk(!!s.credencial_dataset); })
      .catch(() => setStatus(null));
    Cctv.treino.presets()
      .then((r) => setPresets(r.presets))
      .catch(() => setPresets([]));
    Cctv.treino.pods()
      .then((r) => setPodsList(r.pods))
      .catch(() => setPodsList([]));
    Cctv.treino.progresso()
      .then((r) => setProgressoPorPod(Object.fromEntries(r.progresso.map((v) => [v.pod_id, v]))))
      .catch(() => setProgressoPorPod({}));
  }, []);

  useEffect(() => { load(); }, [load]);

  const guardarCredencial = async () => {
    if (busy || !credChave.trim()) return;
    setBusy('credencial');
    setErr(null);
    try {
      await Cctv.treino.salvarCredencial(credChave.trim());
      setCredOk(true);
      setCredChave('');
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const iniciar = async () => {
    if (busy || !presetId) return;
    setBusy('iniciar');
    setErr(null);
    setIniciado(null);
    try {
      const out = await Cctv.treino.iniciar({
        preset: presetId as 'padrao' | 'rapido' | 'preciso',
        camera_id: cameraId || null,
        workspace: dsWorkspace.trim() || null,
        projeto: dsProjeto.trim() || null,
        versao: dsVersao.trim() ? Math.max(1, Number(dsVersao)) : null,
        aquecimento_id:
          prontidao?.prontidao.estado === 'VALID'
            ? prontidao.prontidao.aquecimento_id
            : null,
      });
      setIniciado(`${out.nome} · ${out.gpu ?? ''}`);
      Cctv.treino.pods().then((r) => setPodsList(r.pods)).catch(() => undefined);
    } catch (e) {
      setErr((e as Error)?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const encerrar = async (id: string, nome: string) => {
    const ok = await confirmModal({
      title: t('treino.encerrar'),
      description: nome,
      tone: 'danger',
      confirmLabel: t('common.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try { await Cctv.treino.encerrar(id); } catch { /* estado real manda */ }
    Cctv.treino.pods().then((r) => setPodsList(r.pods)).catch(() => undefined);
  };

  // Filtros derivados DOS DADOS (nada hardcoded): categorias e tags dos presets.
  const categorias = Array.from(
    new Set((presets ?? []).map((p) => p.categoria).filter(Boolean)),
  ) as string[];
  const tags = Array.from(
    new Set((presets ?? []).flatMap((p) => p.tags ?? [])),
  );
  const visiveis = (presets ?? []).filter(
    (p) =>
      (!catFiltro || p.categoria === catFiltro) &&
      (!tagFiltro || (p.tags ?? []).includes(tagFiltro)),
  );
  const presetSel = (presets ?? []).find((p) => p.id === presetId) ?? null;

  const warmupValido = prontidao?.prontidao.estado === 'VALID';
  const podeIniciar =
    !!status?.provider.presente && credOk && busy === null && !!presetSel && warmupValido;

  return (
    <RequirePerm perm="security.cameras.view">
      <PageShell
        title={t('treino.title')}
        subtitle={t('treino.subtitle')}
        classification={shell.level}
        classificationLabel={shell.label}
        theme="light"
      >
        <div className="h-full overflow-y-auto scrollbar-hide p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-4 items-start">

            {/* ── CICLO (esquerda) ─────────────────────────────────────── */}
            <div className="flex flex-col gap-4 min-w-0">

              {/* Estado do ciclo — header de linha */}
              <div className="border border-border-light bg-panel-light px-3 py-2 flex items-center gap-4 flex-wrap text-[10px] font-mono">
                <span>
                  {t('treino.modeloTitulo')}:{' '}
                  {status?.modelo.online ? (
                    <span className="text-success">{t('treino.modeloOnline')} · {status.modelo.modo}</span>
                  ) : (
                    <span className="text-muted-on-light">{status ? t('treino.modeloOffline') : t('common.loading')}</span>
                  )}
                </span>
                <span className="opacity-40">·</span>
                <span>
                  {t('treino.gpuTitulo')}:{' '}
                  {status?.provider.presente ? (
                    <span className="text-success">{t('treino.gpuPronta')}</span>
                  ) : (
                    <span className="text-warning">{t('treino.gpuAusente')}</span>
                  )}
                </span>
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1.5">
                  {t('treino.credencialTitulo')}:{' '}
                  {credOk ? (
                    <span className="text-success flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3" strokeWidth={1.5} /> {t('treino.credencialOk')}
                    </span>
                  ) : (
                    <span className="text-muted-on-light">{t('common.loading')}</span>
                  )}
                </span>
              </div>

              {!credOk && (
                <div className={cardCls} data-testid="treino-credencial">
                  <p className={tituloCls}>{t('treino.credencialTitulo')}</p>
                  <p className="text-[11px] text-muted-on-light mt-1">
                    {t('treino.credencialFalta')}
                  </p>
                  <div className="flex items-end gap-2 mt-2">
                    <div className="flex-1">
                      <input
                        type="password"
                        data-testid="treino-credencial-chave"
                        className={inputCls}
                        value={credChave}
                        onChange={(e) => setCredChave(e.target.value)}
                        placeholder={t('treino.credencialPh')}
                      />
                    </div>
                    <button
                      type="button"
                      data-testid="treino-credencial-salvar"
                      onClick={() => void guardarCredencial()}
                      disabled={busy !== null || credChave.trim().length < 8}
                      className="h-8 px-3 text-[11px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                    >
                      {busy === 'credencial'
                        ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                        : <KeyRound className="w-3 h-3" strokeWidth={1.5} />}
                      {t('treino.credencialSalvar')}
                    </button>
                  </div>
                </div>
              )}

              {/* Filtros — derivados dos dados */}
              {(categorias.length > 0 || tags.length > 0) && (
                <div className="flex items-center gap-2 flex-wrap" data-testid="treino-filtros">
                  <span className={tituloCls}>{t('treino.filtros')}</span>
                  {categorias.map((c) => (
                    <button
                      key={c}
                      type="button"
                      data-testid={`treino-filtro-cat-${c}`}
                      onClick={() => setCatFiltro((v) => (v === c ? null : c))}
                      className={`h-6 px-2 text-[10px] uppercase tracking-wider border ${
                        catFiltro === c
                          ? 'bg-primary text-white border-primary'
                          : 'border-border-light text-muted-on-light hover:border-primary'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                  {tags.map((tg) => (
                    <button
                      key={tg}
                      type="button"
                      onClick={() => setTagFiltro((v) => (v === tg ? null : tg))}
                      className={`h-6 px-2 text-[10px] border ${
                        tagFiltro === tg
                          ? 'border-primary text-primary'
                          : 'border-border-light text-muted-on-light hover:border-primary'
                      }`}
                    >
                      #{tg}
                    </button>
                  ))}
                  {(catFiltro || tagFiltro) && (
                    <button
                      type="button"
                      onClick={() => { setCatFiltro(null); setTagFiltro(null); }}
                      aria-label={t('common.cancel')}
                      className="w-6 h-6 flex items-center justify-center border border-border-light hover:border-primary"
                    >
                      <X className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}

              {/* Cards de treinamento — grade */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2" data-testid="treino-presets">
                {(visiveis).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`treino-preset-${p.id}`}
                    onClick={() => setPresetId(p.id)}
                    style={{
                      backgroundImage: `linear-gradient(rgba(255,255,255,0.94), rgba(255,255,255,0.94)), url('${
                        p.recomendado
                          ? '/dominio/linha-1.jpg'
                          : p.id === 'preciso'
                            ? '/dominio/linha-2.jpg'
                            : '/dominio/esteira-1.jpg'
                      }')`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                    className={`text-left border p-3 flex flex-col gap-1.5 min-w-0 ${
                      presetId === p.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border-light hover:border-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-text-on-light">{p.nome}</span>
                      {p.recomendado && (
                        <span className="px-1 py-0.5 text-[9px] uppercase tracking-wider bg-primary text-white">
                          {t('treino.recomendado')}
                        </span>
                      )}
                      {presetId === p.id && (
                        <span className="px-1 py-0.5 text-[9px] uppercase tracking-wider border border-primary text-primary">
                          {t('treino.selecionado')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-on-light">{p.descricao}</p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-muted-on-light flex-wrap">
                      <span>{t('treino.metaTitulo')}: {p.meta.contagem_pct}</span>
                      <span>{t('treino.estimativa')}: {p.estimativa_horas}</span>
                      {(p.tags ?? []).map((tg) => (
                        <span key={tg} className="opacity-70">#{tg}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {/* Máquinas de treino */}
              <div className={cardCls} data-testid="treino-pods">
                <div className="flex items-center gap-2">
                  <p className={tituloCls}>{t('treino.maquinasTitulo')}</p>
                  <div className="flex-1" />
                  <button
                    type="button"
                    data-testid="treino-refresh"
                    onClick={load}
                    className="h-6 px-2 text-[10px] border border-border-light hover:border-primary flex items-center gap-1"
                  >
                    <RefreshCcw className="w-3 h-3" strokeWidth={1.5} /> {t('treino.refresh')}
                  </button>
                </div>
                {podsList.length === 0 ? (
                  <p className="text-[11px] text-muted-on-light mt-1">{t('treino.maquinasVazio')}</p>
                ) : (
                  <div className="flex flex-col gap-1 mt-2">
                    {podsList.map((p) => (
                      <div
                        key={p.id}
                        data-testid={`treino-pod-${p.id}`}
                        className="px-2 py-1.5 border border-border-light bg-raised-light flex items-start gap-2 text-[10px] font-mono"
                      >
                        <span
                          className={cn(
                            'w-1.5 h-1.5 shrink-0 mt-1.5',
                            String(p.status).toUpperCase() === 'RUNNING' ? 'bg-success' : 'bg-muted-on-light',
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate text-text-on-light">
                            {p.nome} · {p.status ?? '—'}{p.gpu ? ` · ${String(p.gpu)}` : ''}
                          </p>
                          <p className="text-[10px] text-muted-on-light truncate">
                            {p.cost_usd_hr != null ? `${t('treino.custoHora')} $${p.cost_usd_hr}` : ''}
                            {p.custo_acumulado_usd != null ? ` · ${t('treino.custoAcum')} $${p.custo_acumulado_usd}` : ''}
                            {p.uptime_s ? ` · ${t('treino.uptime')} ${fmtUptime(p.uptime_s)}` : ''}
                            {p.disk_gb != null ? ` · ${p.disk_gb}GB` : ''}
                          </p>
                          <p className="text-[10px] text-muted-on-light truncate">
                            {p.dataset ? `${t('treino.datasetRotulo')}: ${p.dataset}` : ''}
                            {p.camera ? ` · ${t('treino.paraCamera')}: ${p.camera}` : ''}
                            {p.receita ? ` · ${p.receita}` : ''}
                          </p>
                          {progressoPorPod[p.id] && (
                            <p
                              className={cn(
                                'text-[10px] font-mono truncate',
                                progressoPorPod[p.id].atrasado ? 'text-warning' : 'text-success',
                              )}
                              title={progressoPorPod[p.id].linha}
                            >
                              {progressoPorPod[p.id].fase}
                              {progressoPorPod[p.id].atrasado ? ` · ${t('treino.progressoAtrasado')}` : ''}
                              {progressoPorPod[p.id].linha ? ` · ${progressoPorPod[p.id].linha.slice(0, 90)}` : ''}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          data-testid={`treino-encerrar-${p.id}`}
                          onClick={() => void encerrar(p.id, p.nome)}
                          className="h-6 px-2 text-[10px] border border-border-light hover:border-danger hover:text-danger shrink-0 flex items-center gap-1"
                        >
                          <Square className="w-3 h-3" strokeWidth={1.5} /> {t('treino.encerrar')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-on-light mt-2">{t('treino.teardownHint')}</p>
              </div>
            </div>

            {/* ── RUN (direita) ────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 min-w-0">

              {/* Bancada de prontidão (WVT): o gate do treino profundo */}
              <AquecimentoPanel
                presetId={presetId}
                cameraId={cameraId}
                dsWorkspace={dsWorkspace}
                dsProjeto={dsProjeto}
                dsVersao={dsVersao}
                podeAquecer={!!status?.provider.presente && credOk}
                onProntidao={setProntidao}
              />

              {/* Diálogo do run */}
              <div className={cardCls} data-testid="treino-run">
                <p className={tituloCls}>{t('treino.runTitulo')}</p>
                {presetSel ? (
                  <>
                    <p className="text-[12px] font-semibold text-text-on-light mt-1.5">
                      {presetSel.nome}
                    </p>
                    <p className="text-[11px] text-muted-on-light mt-0.5">
                      {presetSel.descricao}
                    </p>
                    <label className="block mt-2">
                      <span className="text-[10px] text-muted-on-light">{t('treino.paraCamera')}</span>
                      <select
                        data-testid="treino-camera-destino"
                        className={`${inputCls} mt-1`}
                        value={cameraId}
                        onChange={(e) => setCameraId(e.target.value)}
                      >
                        <option value="">{t('treino.cameraLivre')}</option>
                        {(status?.cameras ?? []).map((c) => (
                          <option key={c.id} value={c.nome}>{c.nome}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block mt-2">
                      <span className="text-[10px] text-muted-on-light">{t('treino.datasetRotulo')}</span>
                      <input
                        data-testid="treino-dataset"
                        className={inputCls}
                        value={dsWorkspace || dsProjeto ? `${dsWorkspace}/${dsProjeto}` : ''}
                        onChange={() => undefined}
                        placeholder={t('treino.datasetPublicoHint')}
                        readOnly
                      />
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                      <input data-testid="treino-ds-workspace" className={inputCls} value={dsWorkspace} onChange={(e) => setDsWorkspace(e.target.value)} placeholder={t('treino.workspace')} />
                      <input data-testid="treino-ds-projeto" className={inputCls} value={dsProjeto} onChange={(e) => setDsProjeto(e.target.value)} placeholder={t('treino.projeto')} />
                      <input data-testid="treino-ds-versao" className={inputCls} value={dsVersao} onChange={(e) => setDsVersao(e.target.value)} inputMode="numeric" />
                    </div>
                    <button
                      type="button"
                      data-testid="treino-iniciar"
                      onClick={() => void iniciar()}
                      disabled={!podeIniciar}
                      className="w-full h-8 mt-2 text-[11px] bg-primary text-white border border-primary hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {busy === 'iniciar'
                        ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                        : <Brain className="w-3 h-3" strokeWidth={1.5} />}
                      {t('treino.iniciar')}
                    </button>
                    {!credOk && (
                      <p className="text-[10px] text-muted-on-light mt-1">
                        {t('treino.iniciarBloqueado')}
                      </p>
                    )}
                    {credOk && !warmupValido && (
                      <p
                        className="text-[10px] font-mono text-warning mt-1"
                        data-testid="treino-warmup-bloqueio"
                      >
                        {t('wvt.deepBloqueado')}
                      </p>
                    )}
                    {iniciado && (
                      <p className="text-[11px] font-mono text-success mt-1" data-testid="treino-iniciado">
                        {t('treino.iniciado')}: {iniciado}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-on-light mt-1">
                    {t('treino.runEscolha')}
                  </p>
                )}
              </div>

              {/* Câmeras da operação — o material in-domain */}
              {!!status?.cameras && status.cameras.length > 0 && (
                <div className={cardCls} data-testid="treino-cameras">
                  <p className={tituloCls}>{t('treino.camerasTitulo')}</p>
                  <div className="flex flex-col gap-1 mt-2">
                    {status.cameras.map((c) => (
                      <div
                        key={c.id}
                        data-testid={`treino-camera-${c.id}`}
                        className="px-2 py-1 border border-border-light bg-raised-light flex items-center gap-2 text-[10px] font-mono"
                      >
                        <span
                          className={cn(
                            'w-1.5 h-1.5 shrink-0',
                            c.online ? 'bg-success' : 'bg-muted-on-light',
                          )}
                        />
                        <span className="text-[11px] font-medium flex-1 truncate text-text-on-light">
                          {c.nome}
                        </span>
                        <span className="shrink-0 text-muted-on-light">
                          {t('treino.quadrosArquivados')}:{' '}
                          <span className={c.quadros > 0 ? 'text-success' : 'text-warning'}>
                            {c.quadros}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-on-light mt-2">
                    {t('treino.camerasHint')}
                  </p>
                </div>
              )}

              <div className="border-l-2 border-warning/70 pl-2 py-1">
                <p className="text-[11px] text-muted-on-light">{t('treino.dadosAviso')}</p>
              </div>
            </div>
          </div>

          {err && (
            <p className="text-[11px] text-danger mt-3" data-testid="treino-erro">{err}</p>
          )}
        </div>
      </PageShell>
    </RequirePerm>
  );
}
