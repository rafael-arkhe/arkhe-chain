'use client';

/**
 * Painel "Identidades possíveis" da ficha — o pivô nome→identidade na tela.
 *
 * Lista os candidatos correlatos por SINAL REAL (confiança + sinais + proveniência)
 * e deixa o operador CONFIRMAR (→ aprofunda: fan-out no perfil) ou DESCARTAR. Nada é
 * afirmado: tudo é "possível, confirme", reversível e auditado no backend.
 *
 * Bespoke (não-Workshop) por ser interativo/tempo-real — alinhado à arquitetura híbrida.
 */
import * as React from 'react';
import { Check, ExternalLink, Loader2, RefreshCw, Scale, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Entities, type IdentidadePossivel, type IdentidadeVeredito } from '@/lib/api';

const TIPO_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', x_twitter: 'X', facebook: 'Facebook',
  tiktok: 'TikTok', youtube: 'YouTube', github: 'GitHub', email: 'E-mail',
};

const PERSON_KINDS = new Set(['person', 'pessoa', 'cpf']);

export function WidgetIdentidades({
  entityId,
  entityType,
}: {
  entityId: string;
  entityType?: string;
}) {
  const personLike = PERSON_KINDS.has((entityType || '').toLowerCase());
  const [items, setItems] = React.useState<IdentidadePossivel[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [judging, setJudging] = React.useState<string | null>(null);
  const [verdicts, setVerdicts] = React.useState<Record<string, IdentidadeVeredito>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await Entities.identidades(entityId);
      setItems(r.identidades || []);
    } catch {
      setErr('Não foi possível carregar as identidades.');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  React.useEffect(() => {
    if (personLike) void load();
  }, [personLike, load]);

  if (!personLike) return null;

  const rowKey = (p: IdentidadePossivel) => `${p.tipo}-${p.identificador}`;

  const act = async (p: IdentidadePossivel, kind: 'confirmar' | 'descartar') => {
    setBusy(rowKey(p));
    setErr(null);
    try {
      if (kind === 'confirmar') {
        // se a IA rebaixou este candidato, a aresta nasce com a confiança REBAIXADA
        // (o sinal informa o gesto; nunca infla de volta).
        const ver = verdicts[rowKey(p)];
        const conf =
          ver?.arbitrado && typeof ver.confianca === 'number'
            ? Math.min(p.confianca, ver.confianca)
            : p.confianca;
        await Entities.confirmarIdentidade(entityId, {
          tipo: p.tipo, identificador: p.identificador, url: p.url, confianca: conf,
        });
      } else {
        await Entities.descartarIdentidade(entityId, { tipo: p.tipo, identificador: p.identificador });
      }
      // decisão humana supera o sinal da IA → limpa o veredito daquela linha
      setVerdicts((prev) => {
        const n = { ...prev };
        delete n[rowKey(p)];
        return n;
      });
      await load();
    } catch {
      setErr('A ação falhou. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  // LLM-juiz sob gesto: arbitra o candidato (cita trecho, só rebaixa). É um SINAL —
  // não confirma nem descarta; o operador decide depois.
  const julgar = async (p: IdentidadePossivel) => {
    setJudging(rowKey(p));
    setErr(null);
    try {
      const v = await Entities.julgarIdentidade(entityId, {
        tipo: p.tipo,
        identificador: p.identificador,
      });
      setVerdicts((prev) => ({ ...prev, [rowKey(p)]: v }));
    } catch {
      // erro co-localizado na linha (mesmo lugar do arbitrado:false do backend), não no topo
      setVerdicts((prev) => ({
        ...prev,
        [rowKey(p)]: { arbitrado: false, motivo: 'A arbitragem por IA falhou. Tente de novo.' },
      }));
    } finally {
      setJudging(null);
    }
  };

  const visible = (items || []).filter((p) => p.status !== 'rejected');

  return (
    <section
      data-testid="ficha-identidades"
      className="m-3 border border-border-light bg-panel-light"
    >
      <header className="h-9 px-3 border-b border-border-light flex items-center gap-2">
        <p className="text-[11px] uppercase tracking-wider font-semibold flex-1">
          Identidades possíveis
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="w-5 h-5 flex items-center justify-center text-muted-on-light hover:text-primary disabled:opacity-50"
          title="Recorrelacionar"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} strokeWidth={1.5} />
        </button>
      </header>

      <p className="px-3 py-1.5 text-[10px] text-muted-on-light italic border-b border-border-light/60">
        Correlação por sinal real — <strong>possíveis, confirme</strong>. Nada é afirmado
        automaticamente; confirmar aprofunda o perfil.
      </p>

      {loading && !items && (
        <div className="p-3 text-[11px] text-muted-on-light flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Correlacionando…
        </div>
      )}
      {err && <div className="p-3 text-[11px] text-danger">{err}</div>}
      {items && visible.length === 0 && !loading && (
        <div className="p-3 text-[11px] text-muted-on-light italic">
          Nenhuma identidade correlata encontrada.
        </div>
      )}

      <ul>
        {visible.map((p) => {
          const confirmed = p.status === 'confirmed';
          const pct = Math.min(100, Math.round((p.confianca || 0) * 100));
          const isBusy = busy === rowKey(p);
          const isJudging = judging === rowKey(p);
          const v = verdicts[rowKey(p)];
          return (
            <li
              key={`${p.tipo}-${p.identificador}`}
              className={cn('px-3 py-2 border-b border-border-light/50', confirmed && 'bg-primary/5')}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase text-muted-on-light w-16 shrink-0">
                  {TIPO_LABEL[p.tipo] || p.tipo}
                </span>
                <span className="flex-1 text-[12px] font-mono truncate" title={p.identificador}>
                  {p.identificador}
                </span>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-on-light hover:text-primary shrink-0"
                    title="Abrir fonte"
                  >
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </a>
                )}
              </div>

              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1 bg-raised-light">
                  <div className="h-1 bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-muted-on-light shrink-0">
                  {pct}% · {p.nivel}
                </span>
              </div>

              {p.sinais && p.sinais.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.sinais.map((s) => (
                    <span
                      key={s}
                      className="text-[9px] px-1 py-0.5 bg-raised-light border border-border-light text-muted-on-light"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-1.5 flex items-center gap-2">
                {confirmed ? (
                  <span className="text-[10px] font-mono text-primary flex items-center gap-1">
                    <Check className="w-3 h-3" strokeWidth={2} /> identidade confirmada
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void act(p, 'confirmar')}
                      disabled={isBusy}
                      data-testid={`identidade-confirmar-${p.identificador}`}
                      className="h-6 px-2 text-[10px] font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Check className="w-3 h-3" strokeWidth={2} />
                      )}
                      {isBusy ? 'Aprofundando…' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(p, 'descartar')}
                      disabled={isBusy}
                      className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-danger disabled:opacity-50 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" strokeWidth={1.5} /> Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => void julgar(p)}
                      disabled={isBusy || isJudging || !!(v && v.arbitrado)}
                      data-testid={`identidade-julgar-${p.identificador}`}
                      className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary disabled:opacity-50 flex items-center gap-1"
                      title="Arbitrar com IA — cita trecho literal e só rebaixa"
                    >
                      {isJudging ? (
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Scale className="w-3 h-3" strokeWidth={1.5} />
                      )}
                      {isJudging ? 'Arbitrando…' : 'Arbitrar com IA'}
                    </button>
                  </>
                )}
                {p.fontes_total ? (
                  <span className="text-[9px] font-mono text-muted-on-light ml-auto">
                    {p.fontes_total} fonte{p.fontes_total > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>

              {v && (
                <div
                  className="mt-1.5 border-l-2 border-primary/40 pl-2 text-[10px] space-y-0.5"
                  data-testid={`identidade-veredito-${p.identificador}`}
                >
                  {!v.arbitrado ? (
                    <div className="text-muted-on-light italic">IA: {v.motivo}</div>
                  ) : (
                    <>
                      <div className="font-mono text-muted-on-light">
                        IA arbitrou:{' '}
                        <strong className={v.e_a_pessoa ? 'text-primary' : 'text-danger'}>
                          {v.e_a_pessoa ? 'provável a mesma pessoa' : 'provavelmente não é a pessoa'}
                        </strong>{' '}
                        · {Math.round((v.confianca_anterior || 0) * 100)}% →{' '}
                        {Math.round((v.confianca || 0) * 100)}% ({v.nivel})
                      </div>
                      {v.justificativa && (
                        <div className="text-muted-on-light">
                          <span className="text-muted-on-light/70">
                            raciocínio da IA (fonte não verificada):{' '}
                          </span>
                          {v.justificativa}
                        </div>
                      )}
                      {v.trecho_citado && (
                        <div className="italic text-muted-on-light">“{v.trecho_citado}”</div>
                      )}
                      {v.nota && (
                        <div className="text-[9px] text-muted-on-light/70">{v.nota}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
