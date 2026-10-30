'use client';

/**
 * /conectores — Saúde dos conectores (smoke-test ao vivo de cada fonte).
 *
 * Mapa re-rodável: bate em GET /mcp-adapters/health, que roda um smoke-test por
 * conector e classifica ok / vazio / fora / timeout. Quando um upstream muda e
 * quebra, ele aparece vermelho aqui — sem ninguém ler código. O dossiê/busca já
 * degradam suave (conector caído não derruba a consulta).
 */
import * as React from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { CpHubSubnav } from '@/components/control-panel/cp-hub-subnav';
import { AGENTES_TABS } from '@/components/control-panel/hub-tabs';
import { Mcp, type ConnectorHealth, type ConnectorStatus } from '@/lib/api/mcp';

const STATUS_META: Record<ConnectorStatus, { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-success/10 text-success border-success/40' },
  ok_vazio: { label: 'Vazio', cls: 'bg-warning/10 text-warning border-warning/40' },
  down: { label: 'Fora', cls: 'bg-danger/10 text-danger border-danger/40' },
  timeout: { label: 'Timeout', cls: 'bg-danger/10 text-danger border-danger/40' },
  ausente: { label: 'Ausente', cls: 'bg-muted/10 text-muted-on-light border-border-light' },
};

export default function ConectoresPage() {
  const [data, setData] = React.useState<ConnectorHealth | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Re-teste FRESCO (lento — roda os smoke ao vivo + re-persiste).
  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await Mcp.health());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao testar os conectores.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Abre JÁ com o último mapa persistido (rápido). Só roda fresco se não houver
  // nenhum snapshot ainda — evita esperar os smoke a cada abertura.
  React.useEffect(() => {
    let cancel = false;
    Mcp.healthLatest()
      .then((snap) => {
        if (cancel) return;
        // Usa o cache se for recente (<20h); senão re-testa fresco = "diário na
        // prática" (toda abertura após 1 dia revalida que as fontes funcionam).
        const ageMs = snap?.checked_at
          ? Date.now() - new Date(snap.checked_at).getTime()
          : Infinity;
        if (snap?.checked_at && ageMs < 20 * 3600 * 1000) setData(snap);
        else void run();
      })
      .catch(() => {
        if (!cancel) void run();
      });
    return () => {
      cancel = true;
    };
  }, [run]);

  const resumo = data?.resumo ?? {};
  const verificadoEm = data?.checked_at
    ? new Date(data.checked_at).toLocaleString('pt-BR')
    : null;
  const subtitle = data
    ? `${data.total_testado} testados · ${resumo.ok ?? 0} OK · ${(resumo.down ?? 0) + (resumo.timeout ?? 0)} fora${verificadoEm ? ` · última verificação ${verificadoEm}` : ''}`
    : 'Carregando…';

  return (
    <RequirePerm perm="security.buscar.view">
      <PageShell
        title="Saúde dos conectores"
        subtitle={subtitle}
        classification="restrito"
        classificationLabel="DIAGNÓSTICO DE FONTES"
        theme="light"
        subnav={<CpHubSubnav group="Agentes" tabs={AGENTES_TABS} />}
        toolbar={
          <button
            type="button"
            onClick={run}
            disabled={loading}
            data-testid="conectores-refresh"
            className="h-8 px-3 text-[12px] font-semibold bg-primary text-white border border-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
            )}
            {loading ? 'Testando…' : 'Re-testar'}
          </button>
        }
      >
        <div className="h-full overflow-auto p-4">
          <p className="text-[12px] text-muted-on-light mb-3 max-w-3xl">
            Cada conector é testado ao vivo com uma entrada canônica. Conectores
            <span className="text-danger font-semibold"> fora</span> indicam
            mudança/queda do serviço externo — a busca e o dossiê seguem funcionando
            com as demais fontes. Re-rodável a qualquer momento.
          </p>

          {error && (
            <div className="border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-text-on-light mb-3">
              {error}
            </div>
          )}

          {data && (
            <table className="w-full text-[12px] border border-border-light">
              <thead>
                <tr className="bg-canvas-light border-b border-border-light text-left text-muted-on-light">
                  <th className="px-3 py-2 font-semibold">Conector</th>
                  <th className="px-3 py-2 font-semibold">Provedor</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold text-right">Itens</th>
                  <th className="px-3 py-2 font-semibold text-right">ms</th>
                  <th className="px-3 py-2 font-semibold">Detalhe</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {data.conectores.map((c) => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.ausente;
                  return (
                    <tr key={c.tool} className="border-b border-border-light/60">
                      <td className="px-3 py-1.5">{c.tool}</td>
                      <td className="px-3 py-1.5 text-muted-on-light">{c.provider ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold border ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">{c.item_count ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right text-muted-on-light">{c.ms ?? '—'}</td>
                      <td className="px-3 py-1.5 text-danger">{c.erro ?? c.nota ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PageShell>
    </RequirePerm>
  );
}
