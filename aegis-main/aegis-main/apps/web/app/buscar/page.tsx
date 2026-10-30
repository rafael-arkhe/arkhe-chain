'use client';

/**
 * /buscar — Busca multi-fonte com fila em série.
 *
 * State + worker vivem no `useBuscarStore` (zustand persist), não no
 * React desta página. Assim a fila roda em background mesmo quando o
 * operador navega pra outra rota — Sherlock (que leva ~2min) termina
 * sozinho e o resultado aparece quando o operador volta.
 *
 * Layout 3-pane (Palantir-style):
 *   - Esquerda 280px: filtros (texto · tipo · classificação · período)
 *     + fontes externas agrupadas em categorias colapsáveis.
 *   - Centro: input principal + fila + lista de resultados agrupados.
 *   - Direita 320px: painel detalhe do resultado selecionado.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/shell/page-shell';
import { RequirePerm } from '@/components/auth/require-perm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BuscarInput } from '@/components/buscar/buscar-input';
import { PainelFiltros } from '@/components/buscar/painel-filtros';
import { DetalheResolver } from '@/components/buscar/detalhe-resolver';
import { Fila } from '@/components/buscar/fila';
import { Resultados } from '@/components/buscar/resultados';
import { Historico } from '@/components/buscar/historico';
import { DossiePreflightModal } from '@/components/buscar/dossie-preflight-modal';
import { Loader2 } from 'lucide-react';
import { Mcp } from '@/lib/api/mcp';
import { Alerts, Entities } from '@/lib/api';
// Histórico de buscas RICO (BACKLOG #7b ELO 2) — fonte da verdade no BACKEND
// (cerca tenant+user), nunca mais localStorage. Importado por path (não barrel).
import { SearchHistory, type SearchHistoryEntry } from '@/lib/api/search-history';
import { promptModal } from '@/components/dialog/confirm-dialog';
import { useBuscarStore } from '@/lib/buscar/store';
import { humaniseSearchError } from '@/lib/buscar/humanise';
import {
  type NormalizedResult,
  type SourceDef,
} from '@/lib/buscar/types';

// Classificador ÚNICO (lib/buscar/classify) — antes duplicado aqui e em workers.ts.
import {
  inferDossierKind,
  QUERY_ACCEPTS,
  acceptKind,
  canonicalFieldForKind,
  type DossierKind,
} from '@/lib/buscar/classify';
// Parâmetros POR-FONTE (ui_fields → sites/timeout/nsfw…) namespaced por fonte (FE-B).
import { buildPerSourceFields } from '@/lib/buscar/per-source-fields';
// Finalidades LGPD: default neutro (bases LGPD) + configurável por domínio via Workshop.
import { useDossierPurposes } from '@/lib/buscar/use-dossier-purposes';
// Fontes OFERECIDAS: vendor controla por tenant (esconder/fixar) via mesmo app Workshop.
import { useEnabledSources } from '@/lib/buscar/use-enabled-sources';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';

export default function BuscarPage() {
  const t = useT();
  // Form
  const query = useBuscarStore((s) => s.query);
  const setQuery = useBuscarStore((s) => s.setQuery);
  const selectedClass = useBuscarStore((s) => s.selectedClass);
  const toggleClass = useBuscarStore((s) => s.toggleClass);
  const selectedSourceKeys = useBuscarStore((s) => s.selectedSourceKeys);
  const toggleSource = useBuscarStore((s) => s.toggleSource);
  const advanced = useBuscarStore((s) => s.advanced);
  const setAdvanced = useBuscarStore((s) => s.setAdvanced);

  // Pipeline
  const fila = useBuscarStore((s) => s.fila);
  const selecionado = useBuscarStore((s) => s.selecionado);
  const setSelecionado = useBuscarStore((s) => s.setSelecionado);

  // Bootstrap
  const adapters = useBuscarStore((s) => s.adapters);
  const adaptersLoading = useBuscarStore((s) => s.adaptersLoading);
  const adaptersError = useBuscarStore((s) => s.adaptersError);
  const error = useBuscarStore((s) => s.error);

  // Dossiê (entity_dossier) — navegação p/ a /ficha + loading local.
  const router = useRouter();
  const [dossierLoading, setDossierLoading] = React.useState(false);
  // Progresso vivo do dossiê assíncrono (cada fonte que conclui, via SSE).
  const [dossierSteps, setDossierSteps] = React.useState<{ label: string; detail?: string }[]>([]);
  // Finalidades de acesso (LGPD) — neutras por default, configuráveis por domínio/tenant.
  const purposes = useDossierPurposes();
  // Fontes OFERECIDAS neste tenant — default = todas; vendor esconde/fixa via Workshop.
  // ÚNICO ponto: o catálogo derivado alimenta o painel E todos os pontos que iteram
  // fontes (handleSubmit/perSourceFields/…) — fontes escondidas somem e não viram busca.
  const { overrides: sourceOverrides, catalog: offeredCatalog } = useEnabledSources();
  const pinnedKeysSet = React.useMemo(
    () => new Set(sourceOverrides.pinned),
    [sourceOverrides],
  );
  // Gate do "Salvar busca + monitorar" (backend exige alerts.feeds.subscribe).
  const canMonitor = useCan('alerts.feeds.subscribe');

  // Actions
  const enqueue = useBuscarStore((s) => s.enqueue);
  const cancelAll = useBuscarStore((s) => s.cancelAll);
  const clearFila = useBuscarStore((s) => s.clearFila);
  const setSelectedSourceKeys = useBuscarStore((s) => s.setSelectedSourceKeys);
  const setAdapters = useBuscarStore((s) => s.setAdapters);
  const setAdaptersLoading = useBuscarStore((s) => s.setAdaptersLoading);
  const setAdaptersError = useBuscarStore((s) => s.setAdaptersError);
  const setError = useBuscarStore((s) => s.setError);

  // Sets derivados (zustand armazena array)
  const selectedSourceKeysSet = React.useMemo(
    () => new Set(selectedSourceKeys),
    [selectedSourceKeys],
  );
  const selectedClassSet = React.useMemo(() => new Set(selectedClass), [selectedClass]);

  // Bootstrap: lista de adapters. Extraído pra useCallback pra permitir
  // "tentar de novo" — antes a falha era engolida só com console.warn e TODAS
  // as fontes MCP sumiam sem o operador saber por quê (Onda 1).
  const loadAdapters = React.useCallback(() => {
    setAdaptersLoading(true);
    return Mcp.list()
      .then((d) => {
        setAdapters(d);
        setAdaptersError(null);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[/buscar] mcp-adapters/list indisponível:', humaniseSearchError(e));
        setAdaptersError(t('buscar.erro.conectoresIndisponiveis'));
      })
      .finally(() => {
        setAdaptersLoading(false);
      });
  }, [setAdapters, setAdaptersLoading, setAdaptersError, t]);

  React.useEffect(() => {
    // Bootstrap ÚNICO no mount. loadAdapters depende de `t` (instável entre renders),
    // então `[loadAdapters]` re-disparava o fetch a cada render → loop de /mcp-adapters/list
    // que mantinha adaptersLoading piscando true e BLOQUEAVA a busca ("Carregando os
    // conectores… tente novamente"). "Tentar novamente" re-chama loadAdapters manualmente.
    void loadAdapters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableMcpTools = React.useMemo(
    () => new Set((Array.isArray(adapters) ? adapters : []).map((a) => a.tool)),
    [adapters],
  );
  // Guia de fontes: contrato (accepts) por tool + tipo inferido do dado digitado.
  const acceptsByTool = React.useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const a of Array.isArray(adapters) ? adapters : []) {
      if (a.accepts?.length) m[a.tool] = a.accepts;
    }
    return m;
  }, [adapters]);
  // Busca avançada MODULAR: refines + exemplos por tool (do backend, Fase 1).
  const refinesByTool = React.useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const a of Array.isArray(adapters) ? adapters : []) {
      if (a.refines?.length) m[a.tool] = a.refines;
    }
    return m;
  }, [adapters]);
  const examplesByTool = React.useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const a of Array.isArray(adapters) ? adapters : []) {
      if (a.examples) m[a.tool] = a.examples;
    }
    return m;
  }, [adapters]);
  // Union dos refines das fontes que VÃO rodar (alwaysOn/selecionadas e disponíveis) +
  // 1 exemplo por refiner → os campos avançados saem DAQUI, não de um set fixo.
  const advancedRefiners = React.useMemo(() => {
    const set = new Set<string>();
    const ex: Record<string, string> = {};
    const addField = (k: string, exampleSrcKey: string, tool: string) => {
      set.add(k);
      // O exemplo é buscado pela chave de ORIGEM do accept (cpf/cnpj/cpf_cnpj),
      // mas indexado no campo CANÔNICO (doc) — Fase 4 colapsa 3 accepts num campo.
      const e = examplesByTool[tool]?.[exampleSrcKey];
      if (e && !ex[k]) ex[k] = e;
    };
    for (const s of offeredCatalog) {
      if (!(s.alwaysOn || selectedSourceKeysSet.has(s.key))) continue;
      if (!s.mcpTool || (!s.alwaysOn && !availableMcpTools.has(s.mcpTool))) continue;
      // Desambiguadores (refines: uf, nome_mae, datanascimento…) entram pela própria
      // chave — não são accepts, não colapsam.
      for (const r of refinesByTool[s.mcpTool] || []) addField(r, r, s.mcpTool);
      // ROTEAMENTO POR TIPO (FRENTE A, Fase 4): os INPUTS ESPECÍFICOS que a fonte pede
      // (accepts: cpf/cnpj/cpf_cnpj/username/email/telefone/placa…) são COLAPSADOS por
      // KIND canônico — em vez de 3 campos (CPF, CPF/CNPJ, CNPJ) gera 1 campo "CPF/CNPJ"
      // (kind doc) e 1 "Usuário" (kind username). O valor desse campo único é repartido
      // p/ cada fonte na chave certa pelo worker (Fase 2/3). EXCETO os genéricos
      // (termo/nome) que JÁ são a caixa de busca principal. Derivado do backend, ZERO
      // hardcode de vertical.
      for (const a of acceptsByTool[s.mcpTool] || []) {
        if (QUERY_ACCEPTS.has(a)) continue;
        const field = canonicalFieldForKind(acceptKind(a));
        addField(field, a, s.mcpTool);
      }
    }
    return { refiners: Array.from(set), examples: ex };
  }, [offeredCatalog, selectedSourceKeysSet, availableMcpTools, refinesByTool, acceptsByTool, examplesByTool]);

  // PARÂMETROS POR-FONTE (FE-B): além dos refiners colapsados por kind (acima),
  // cada fonte que VAI rodar contribui seus `ui_fields` como campos NAMESPACED
  // (`<toolBase>__<propKey>`) — NÃO colapsados entre fontes (sites do maigret ≠
  // sherlock). Derivado 100% do `ui_fields` do adapter, zero hardcode de fonte.
  const perSourceFields = React.useMemo(() => {
    const sources = offeredCatalog.filter(
      (s) =>
        (s.alwaysOn || selectedSourceKeysSet.has(s.key)) &&
        (s.alwaysOn || !s.mcpTool || availableMcpTools.has(s.mcpTool)),
    );
    return buildPerSourceFields(sources, Array.isArray(adapters) ? adapters : []);
  }, [offeredCatalog, selectedSourceKeysSet, availableMcpTools, adapters]);

  const inferredKind: DossierKind | null = React.useMemo(
    () => (query.trim() ? inferDossierKind(query).kind : null),
    [query],
  );

  // Fontes que VÃO rodar para um dado conjunto de chaves selecionadas: alwaysOn
  // (núcleo local) sempre + selecionadas que existem no backend. ÚNICO ponto de
  // filtragem — usado pelo submit, pelo "Criar"/aprofundar e pelo Re-rodar do
  // histórico (que recebe a seleção restaurada da entrada, não a seleção atual).
  const computeSources = React.useCallback(
    (selKeys: Set<string>) =>
      offeredCatalog.filter(
        (s) =>
          (s.alwaysOn || selKeys.has(s.key)) &&
          (s.alwaysOn || !s.mcpTool || availableMcpTools.has(s.mcpTool)),
      ),
    [offeredCatalog, availableMcpTools],
  );

  // Grava UMA entrada no histórico RICO (backend, cerca tenant+user). Best-effort:
  // o histórico NUNCA quebra a busca do operador. Lê do `getState()` pra capturar
  // a seleção + a Busca avançada ATUAIS (evita closure defasado em re-rodar/dossiê).
  const saveHistory = React.useCallback(
    (q: string, resultSummary?: Record<string, number> | null) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      const st = useBuscarStore.getState();
      void SearchHistory.save({
        query: trimmed,
        sources: Array.from(st.selectedSourceKeys),
        advanced: st.advanced,
        ...(resultSummary ? { result_summary: resultSummary } : {}),
      }).catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[/buscar] falha ao gravar histórico:', humaniseSearchError(e));
      });
    },
    [],
  );

  const handleSubmit = React.useCallback(() => {
    const q = query.trim();
    if (!q) return;
    // Corrida de bootstrap: submeter antes da lista de conectores carregar
    // filtraria as fontes MCP silenciosamente. Avisa em vez de buscar só local.
    if (adaptersLoading) {
      setError(t('buscar.erro.carregandoConectores'));
      return;
    }
    const sources = computeSources(selectedSourceKeysSet);
    if (sources.length === 0) {
      setError(t('buscar.erro.nenhumaFonte'));
      return;
    }
    setError(null);
    enqueue(q, sources);
    saveHistory(q);
  }, [query, adaptersLoading, computeSources, selectedSourceKeysSet, enqueue, saveHistory, setError, t]);

  // ── Montar dossiê (#10): PRÉ-VOO primeiro. O botão não dispara direto — abre o
  // modal que mostra a entidade, as fontes EXATAS que serão cruzadas e exige a
  // finalidade (LGPD). O fan-out real roda em runDossier após confirmar.
  const [preflightOpen, setPreflightOpen] = React.useState(false);
  const [dossierDone, setDossierDone] = React.useState<{ id: string; failed: number } | null>(null);
  const dossierAbortRef = React.useRef<AbortController | null>(null);
  // Properties (campos avançados preenchidos) → desambiguação no dossiê.
  const dossierProps = React.useMemo(() => {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(advanced.fields ?? {})) {
      if (v && v.trim()) p[k] = v.trim();
    }
    return p;
  }, [advanced.fields]);

  const handleDossier = React.useCallback(() => {
    const q = query.trim();
    if (!q || dossierLoading) return;
    setError(null);
    setPreflightOpen(true);
  }, [query, dossierLoading, setError]);

  const runDossier = React.useCallback(
    async (decision: { purpose: string; caseId: string }) => {
      const q = query.trim();
      if (!q) return;
      setPreflightOpen(false);
      setDossierDone(null);
      // Persiste a escolha do pré-voo no estado da busca (reflete no painel avançado).
      setAdvanced({ purpose: decision.purpose, caseId: decision.caseId });
      setError(null);
      setDossierLoading(true);
      setDossierSteps([]);
      const ctrl = new AbortController();
      dossierAbortRef.current = ctrl;
      try {
        const { kind, value } = inferDossierKind(q);
        const result = await Entities.dossierViaTask(
          {
            kind,
            value,
            purpose: decision.purpose,
            ...(decision.caseId ? { case_id: decision.caseId } : {}),
            ...(Object.keys(dossierProps).length ? { properties: dossierProps } : {}),
          },
          { onProgress: setDossierSteps, signal: ctrl.signal },
        );
        const entityId = (result?.entity_id as string) ?? null;
        saveHistory(q);
        if (entityId) {
          // Leva as fontes que falharam até a /ficha (régua: "fontes que falharam visíveis").
          const failed = result?.sources_failed;
          const failedN = Array.isArray(failed) ? failed.length : 0;
          if (failedN) {
            try {
              sessionStorage.setItem(`dossie_failed_${entityId}`, JSON.stringify(failed));
            } catch {
              /* sessionStorage indisponível — ignora */
            }
          }
          // NUNCA navega na mesma aba (quebra a pesquisa do operador). Abre a ficha em
          // NOVA ABA + deixa um banner com o link (fallback se o popup for bloqueado).
          setDossierDone({ id: entityId, failed: failedN });
          if (typeof window !== 'undefined') {
            window.open(`/ficha/${entityId}`, '_blank', 'noopener');
          }
        } else {
          setError(t('buscar.erro.dossieSemFicha'));
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(humaniseSearchError(e));
      } finally {
        setDossierLoading(false);
        dossierAbortRef.current = null;
      }
    },
    [query, dossierProps, router, saveHistory, setError, setAdvanced, t],
  );

  const cancelDossier = React.useCallback(() => {
    dossierAbortRef.current?.abort();
    setDossierLoading(false);
  }, []);
  // Resumo honesto do fan-out: quantas concluíram vs falharam ("4 fontes falhou" claro).
  const dossierStats = React.useMemo(() => {
    let ok = 0;
    let fail = 0;
    for (const s of dossierSteps) {
      if (!s.detail) continue;
      if (s.detail.startsWith('ok')) ok += 1;
      else fail += 1;
    }
    return { ok, fail };
  }, [dossierSteps]);

  // ── Salvar busca = criar um SearchFeed (busca salva + monitorável → /alertas).
  const [salvando, setSalvando] = React.useState(false);
  const [salvarOk, setSalvarOk] = React.useState<string | null>(null);
  const handleSalvarBusca = React.useCallback(async () => {
    const q = query.trim();
    if (!q || salvando) return;
    const nome = await promptModal({
      title: t('buscar.salvar.promptTitulo'),
      confirmLabel: t('buscar.salvar.promptConfirmar'),
    });
    if (!nome || !nome.trim()) return;
    setSalvando(true);
    setError(null);
    setSalvarOk(null);
    try {
      await Alerts.feeds.create({
        name: nome.trim(),
        filters: { query: q, sources: Array.from(selectedSourceKeys), advanced: { ...advanced } },
        cadence_seconds: 300,
      });
      // fecha o loop: sucesso visível + onde gerenciar (a seção mora na /alertas).
      setSalvarOk(nome.trim());
    } catch (e) {
      setError(humaniseSearchError(e));
    } finally {
      setSalvando(false);
    }
  }, [query, salvando, selectedSourceKeys, advanced, setError, t]);

  // Re-rodar do histórico RICO: restaura o CONTEXTO inteiro (consulta + fontes +
  // Busca avançada) E executa a busca — não é só `setQuery`. As fontes saem da
  // SELEÇÃO RESTAURADA da entrada (não da atual), e a re-execução grava uma nova
  // entrada (é um submit; o backend não deduplica por query, por design).
  const handleRerunHistory = React.useCallback(
    (entry: SearchHistoryEntry) => {
      const q = (entry.query || '').trim();
      if (!q) return;
      if (adaptersLoading) {
        setError(t('buscar.erro.carregandoConectores'));
        return;
      }
      setQuery(q);
      setSelectedSourceKeys(entry.sources ?? []);
      setAdvanced({
        fields: entry.advanced?.fields ?? {},
        purpose: entry.advanced?.purpose ?? '',
        caseId: entry.advanced?.caseId ?? '',
      });
      const sources = computeSources(new Set(entry.sources ?? []));
      if (sources.length === 0) {
        setError(t('buscar.erro.nenhumaFonte'));
        return;
      }
      setError(null);
      enqueue(q, sources);
      saveHistory(q);
    },
    [
      adaptersLoading,
      computeSources,
      enqueue,
      saveHistory,
      setQuery,
      setSelectedSourceKeys,
      setAdvanced,
      setError,
      t,
    ],
  );

  const handleSelect = React.useCallback(
    (result: NormalizedResult, source: SourceDef, originQuery: string) => {
      setSelecionado({ result, source, query: originQuery });
    },
    [setSelecionado],
  );

  const handleEnriquecer = React.useCallback(
    (result: NormalizedResult, targetSource: SourceDef) => {
      // Hard rule: fonte escondida pelo tenant NUNCA vira busca — nem pelo
      // gesto de enriquecer. alwaysOn passa sempre (núcleo local).
      if (!targetSource.alwaysOn && sourceOverrides.hidden.includes(targetSource.key)) {
        return;
      }
      enqueue(result.name, [targetSource]);
    },
    [enqueue, sourceOverrides],
  );

  // AÇÃO CONTEXTUAL que FUNCIONA (não-cega-não-morta): o antigo "Criar entidade"
  // só dava erro "sem fluxo" (morto). Agora re-enfileira a busca APROFUNDANDO com
  // o valor extraído (`result.action.value` = CPF formatado, número, e-mail) ou,
  // na falta, o próprio nome do resultado. Caminho seguro e já existente: o mesmo
  // enqueue do input principal, sobre as fontes disponíveis. NUNCA "sem fluxo".
  const handleCriar = React.useCallback(
    (result: NormalizedResult, _fromSource: SourceDef) => {
      const value = (result.action?.value ?? result.name ?? '').trim();
      if (!value) return;
      const sources = computeSources(selectedSourceKeysSet);
      if (sources.length === 0) {
        setError(t('buscar.erro.nenhumaFonte'));
        return;
      }
      setError(null);
      setQuery(value);
      enqueue(value, sources);
      saveHistory(value);
    },
    [computeSources, selectedSourceKeysSet, enqueue, saveHistory, setQuery, setError, t],
  );

  const totalSelecionadoFontes = React.useMemo(
    () => computeSources(selectedSourceKeysSet).length,
    [computeSources, selectedSourceKeysSet],
  );

  const totaisHeader = React.useMemo(() => {
    const concluidos = fila.filter((i) => i.status === 'done').length;
    const rodando = fila.filter((i) => i.status === 'running' || i.status === 'queued').length;
    const totalResults = fila
      .filter((i) => i.status === 'done')
      .reduce((acc, i) => acc + i.results.length, 0);
    return { concluidos, rodando, totalResults };
  }, [fila]);

  const concluidasTxt = `${totaisHeader.concluidos} ${
    totaisHeader.concluidos === 1
      ? t('buscar.subtitulo.concluidaSingular')
      : t('buscar.subtitulo.concluidaPlural')
  }`;
  const buscasConcluidasTxt = `${totaisHeader.concluidos} ${
    totaisHeader.concluidos === 1
      ? t('buscar.subtitulo.buscaConcluidaSingular')
      : t('buscar.subtitulo.buscaConcluidaPlural')
  }`;
  const resultadosTxt = `${totaisHeader.totalResults} ${
    totaisHeader.totalResults === 1
      ? t('buscar.subtitulo.resultadoSingular')
      : t('buscar.subtitulo.resultadoPlural')
  }`;
  const subtitle =
    totaisHeader.rodando > 0
      ? `${totaisHeader.rodando} ${t('buscar.subtitulo.emCurso')} · ${concluidasTxt} · ${resultadosTxt}`
      : `${buscasConcluidasTxt} · ${resultadosTxt}`;

  const selectedRowKey = React.useMemo(() => {
    if (!selecionado) return null;
    for (const it of fila) {
      if (it.source.key !== selecionado.source.key) continue;
      if (it.query !== selecionado.query) continue;
      for (let i = 0; i < it.results.length; i++) {
        if (it.results[i].externalId === selecionado.result.externalId) {
          return `${it.source.key}::${selecionado.result.externalId}::${0 * 100 + i}`;
        }
      }
    }
    return null;
  }, [selecionado, fila]);

  return (
    <RequirePerm perm="security.buscar.view">
      <PageShell
        title={t('buscar.titulo')}
        subtitle={subtitle}
        classification="restrito"
        classificationLabel={t('buscar.classificacao')}
        theme="light"
        toolbar={
          <div className="flex items-center gap-3">
            <a
              href="/conectores"
              data-testid="buscar-link-conectores"
              className="text-[11px] text-primary hover:underline whitespace-nowrap"
            >
              {t('buscar.toolbar.saudeFontes')}
            </a>
            <Historico onRerun={handleRerunHistory} />
          </div>
        }
      >
        <div className="h-full flex overflow-hidden">
          {/* ─── Esquerda: filtros + fontes ───────────────── */}
          <PainelFiltros
            query={query}
            setQuery={setQuery}
            selectedClass={selectedClassSet}
            toggleClass={toggleClass}
            selectedSourceKeys={selectedSourceKeysSet}
            toggleSource={toggleSource}
            catalog={offeredCatalog}
            pinnedKeys={pinnedKeysSet}
            availableMcpTools={availableMcpTools}
            loadingAdapters={adaptersLoading}
            inferredKind={inferredKind}
            acceptsByTool={acceptsByTool}
            onSubmit={handleSubmit}
            onSalvarBusca={handleSalvarBusca}
            salvando={salvando}
            canMonitor={canMonitor}
          />

          {/* ─── Centro: input + fila + resultados ────────── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <BuscarInput
              query={query}
              setQuery={setQuery}
              totalSelecionado={totalSelecionadoFontes}
              onSubmit={handleSubmit}
              onDossier={handleDossier}
              dossierLoading={dossierLoading}
              advanced={advanced}
              setAdvanced={setAdvanced}
              refiners={advancedRefiners.refiners}
              refinerExamples={advancedRefiners.examples}
              perSourceFields={perSourceFields}
              purposes={purposes}
            />

            {salvarOk && (
              <div
                className="mx-4 mt-2 border border-primary/30 bg-primary/5 p-2.5 text-[11px] flex items-center gap-2"
                data-testid="buscar-salvar-ok"
              >
                <span className="text-text-on-light">
                  {t('buscar.salvar.okPrefixo')} <strong>“{salvarOk}”</strong>{' '}
                  {t('buscar.salvar.okSufixo')}
                </span>
                <button
                  type="button"
                  onClick={() => window.open('/alertas', '_blank', 'noopener')}
                  className="text-primary hover:underline font-semibold"
                >
                  {t('buscar.salvar.gerenciarAlertas')}
                </button>
                <button
                  type="button"
                  onClick={() => setSalvarOk(null)}
                  className="ml-auto text-[10px] text-muted-on-light hover:text-text-on-light"
                >
                  {t('buscar.acao.dispensar')}
                </button>
              </div>
            )}

            {dossierDone && (
              <div
                className="mx-4 mt-2 border border-primary/30 bg-primary/5 p-2.5 text-[11px] flex items-center gap-2 flex-wrap"
                data-testid="buscar-dossie-pronto"
              >
                <span className="text-text-on-light">
                  {t('buscar.dossie.pronto')}
                  {dossierDone.failed > 0
                    ? ` · ${dossierDone.failed} ${t('buscar.dossie.prontoFalhas')}`
                    : ''}
                  .
                </span>
                <a
                  href={`/ficha/${dossierDone.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="buscar-dossie-abrir-ficha"
                  className="text-primary hover:underline font-semibold"
                >
                  {t('buscar.dossie.abrirFicha')}
                </a>
                <button
                  type="button"
                  onClick={() => setDossierDone(null)}
                  className="ml-auto text-[10px] text-muted-on-light hover:text-text-on-light"
                >
                  {t('buscar.acao.dispensar')}
                </button>
              </div>
            )}

            {dossierLoading && (
              <div
                className="mx-4 mt-2 border border-border-light bg-panel-light p-2 text-[11px]"
                data-testid="buscar-dossie-progresso"
              >
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-on-light flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-muted-on-light" strokeWidth={1.5} />
                    {t('buscar.dossie.montando')} — {dossierSteps.length}{' '}
                    {t('buscar.dossie.montandoFontes')}
                    {(dossierStats.ok > 0 || dossierStats.fail > 0) && (
                      <span className="normal-case tracking-normal text-muted-on-light">
                        ·{' '}
                        <span className="text-primary">
                          {dossierStats.ok} {t('buscar.dossie.statsOk')}
                        </span>
                        {dossierStats.fail > 0 && (
                          <>
                            {' · '}
                            <span className="text-danger">
                              {dossierStats.fail} {t('buscar.dossie.statsFalhou')}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={cancelDossier}
                    data-testid="dossie-cancelar"
                    className="ml-auto h-6 px-2 text-[10px] text-muted-on-light hover:text-text-on-light border border-border-light hover:border-primary"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
                {dossierSteps.length > 0 && (
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto scrollbar-hide">
                    {dossierSteps.map((s, i) => (
                      <li key={`${s.label}-${i}`} className="font-mono flex items-center gap-1.5">
                        <span className="text-text-on-light">{s.label}</span>
                        {s.detail && (
                          <span className={s.detail.startsWith('ok') ? 'text-primary' : 'text-danger'}>
                            · {s.detail}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {adaptersError && (
              <div className="px-4 pt-3">
                <div
                  data-testid="buscar-adapters-error"
                  className="flex items-center gap-3 border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] text-text-on-light"
                >
                  <span className="flex-1">{adaptersError}</span>
                  <button
                    type="button"
                    data-testid="buscar-adapters-retry"
                    onClick={() => void loadAdapters()}
                    disabled={adaptersLoading}
                    className="h-7 px-2.5 bg-white border border-border-light hover:border-primary disabled:opacity-50 shrink-0"
                  >
                    {adaptersLoading ? t('buscar.acao.carregando') : t('buscar.acao.tentarNovamente')}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="px-4 pt-3">
                <Alert variant="destructive">
                  <AlertDescription className="text-[11px]">{error}</AlertDescription>
                </Alert>
              </div>
            )}

            <Fila items={fila} onCancelAll={cancelAll} onClear={clearFila} />

            <Resultados
              items={fila}
              selectedKey={selectedRowKey}
              onSelect={handleSelect}
              onEnriquecer={handleEnriquecer}
              onCriar={handleCriar}
            />
          </div>

          {/* ─── Direita: detalhe do selecionado ──────────── */}
          <DetalheResolver
            selecionado={selecionado}
            onEnriquecer={handleEnriquecer}
            onCriar={handleCriar}
          />
        </div>

        <DossiePreflightModal
          open={preflightOpen}
          kind={inferredKind ?? 'person'}
          value={query.trim()}
          properties={dossierProps}
          purposes={purposes}
          defaultPurpose={advanced.purpose}
          defaultCaseId={advanced.caseId}
          onConfirm={runDossier}
          onCancel={() => setPreflightOpen(false)}
        />
      </PageShell>
    </RequirePerm>
  );
}
