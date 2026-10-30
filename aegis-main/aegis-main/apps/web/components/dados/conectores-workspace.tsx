'use client';

/**
 * Conectores — Painel de Controle (M4.2, 2026-05-25 · operacional WP-F, 2026-06-10).
 *
 * Painel genérico de conectores HTTP: registra um conector (cria um Agent +
 * binda a skill `connector.http` com a config), **Testa a conexão** ("conectado"),
 * **Roda agora** (enfileira ingestão), **Ativa/Pausa** o agendamento (PATCH de
 * status) e mostra o **histórico de execuções** (com retry de run falho).
 * Multi-domínio: o conector ingere QUALQUER API — aqui só se configura o DADO
 * (URL, método, auth, paginação, markings, tipo de objeto). Backed por
 * `governance/agents`. i18n via useT() (pt-BR + en-US).
 */
import * as React from 'react';
import { Plug, Plus, Timer, Loader2, AlertCircle } from 'lucide-react';

import { CpPageHeader } from '@/components/control-panel/control-panel-shell';
import { ConfigureDialog } from '@/components/dados/configure-dialog';
import { EdgeSection } from '@/components/dados/edge-section';
import { OsdkTokensPanel } from '@/components/iam/OsdkTokensPanel';
import { ConnectorRegistrationForm } from '@/components/dados/connector-registration-form';
import { ConnectorCard } from '@/components/dados/connector-card';
import { HubHeader } from '@/components/dados/hub-header';
import { SectionHead } from '@/components/dados/section-head';
import { InfoTip } from '@/components/ui/info-tip';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { skillDesc, skillLabel } from '@/lib/i18n/skill-labels';
import { schemaIssue, schemaIssueMessage } from '@/lib/dados/schema-issue';
import {
  ActionTypes, Connectors, Skills,
  type ConnectorAgent, type ConnectorRun, type SyncPreviewResult,
  type SkillCatalogRow, type SkillParam,
} from '@/lib/api';

type Res = { ok: boolean; msg: string };

// P6a — formatos do serializer da Sincronização (vocabulário fechado).
const SERIALIZER_FORMATS = ['json', 'jsonl', 'csv', 'xml'] as const;

// WP-F — auth do connector.http (api_key em header OU query; oauth2 client
// credentials). 'api_key_query' é só apresentação: vira mode:'api_key' + in:'query'.
const AUTH_MODES = [
  { v: 'none', labelKey: 'conectores.auth.none' },
  { v: 'api_key', labelKey: 'conectores.auth.api_key' },
  { v: 'api_key_query', labelKey: 'conectores.auth.api_key_query' },
  { v: 'bearer', labelKey: 'conectores.auth.bearer' },
  { v: 'basic', labelKey: 'conectores.auth.basic' },
  { v: 'oauth2_cc', labelKey: 'conectores.auth.oauth2_cc' },
];
// WP-F — os 8 presets REAIS do agendador (scheduler.PRESET_MIN) + manual.
const CRON = [
  { v: '', labelKey: 'conectores.cron.manual' },
  // 1min/2min (Sprint 4 · Onda 2): cadência sem buraco p/ fontes de janela
  // curta (ex.: gravação de câmera — playlist HLS viva ≈ 200s < 5min).
  { v: '1min', labelKey: 'conectores.cron.1min' },
  { v: '2min', labelKey: 'conectores.cron.2min' },
  { v: '5min', labelKey: 'conectores.cron.5min' },
  { v: '15min', labelKey: 'conectores.cron.15min' },
  { v: '30min', labelKey: 'conectores.cron.30min' },
  { v: 'hourly', labelKey: 'conectores.cron.hourly' },
  { v: '2h', labelKey: 'conectores.cron.2h' },
  { v: '6h', labelKey: 'conectores.cron.6h' },
  { v: '12h', labelKey: 'conectores.cron.12h' },
  { v: 'daily', labelKey: 'conectores.cron.daily' },
];
const PAGINATION_MODES = ['none', 'page', 'offset', 'cursor', 'link'] as const;
const STATUS_KEYS = new Set(['inactive', 'active', 'running', 'degraded', 'failed']);
const CRON_KEYS = new Set(CRON.map((c) => c.v).filter(Boolean));

// Skills que tornam um agente um CONECTOR da central: ingestão genérica
// (connector.*) + câmeras (camera.detect_tick — varredura, Tarefa Y; e
// camera.stream — UMA câmera como sensor dedicado, Tarefa B), mesmo trilho
// genérico, zero mecanismo paralelo.
function isConnectorSkill(k: string): boolean {
  return k.startsWith('connector.') || k === 'camera.detect_tick' || k === 'camera.stream';
}

// A skill REAL do binding do agente — test/run/badge nunca assumem connector.http.
function skillOf(a: ConnectorAgent): string {
  return (a.skill_keys ?? []).find(isConnectorSkill) ?? 'connector.http';
}

// Conectores é PIPELINE DE DADOS. Fora daqui:
//  - estações que pareiam um APARELHO (mensageria, ponte AutoSync) — a casa
//    delas é "Dispositivos", onde o pareamento é por dispositivo;
//  - "Portaria — Visitantes", conector antigo substituído pela estação.
// Filtro pela skill do binding (skill_keys do backend); os slugs do seed
// entram só como rede de segurança p/ instalação antiga cujo agente tenha
// perdido o skill_key no payload.
const NON_PIPELINE_SKILLS = new Set([
  'connector.whatsapp_station', 'connector.autosync', 'connector.portaria',
]);
const NON_PIPELINE_SLUGS = new Set([
  'estacao-whatsapp', 'autosync-ponte', 'portaria-visitantes',
]);
function isPipelineConnector(a: ConnectorAgent): boolean {
  if (NON_PIPELINE_SLUGS.has(a.slug)) return false;
  return !(a.skill_keys ?? []).some((k) => NON_PIPELINE_SKILLS.has(k));
}

const HTTP_SKILL = 'connector.http';

// Tarefa H — a escrita de config de conector NUNCA é PATCH cru: passa pela
// ACTION GOVERNADA da plataforma (clamp pelo param_schema + re-espelho +
// ActionExecution + LineageEvent). A ActionType global é resolvida por
// code_ref via o trilho de actions (ActionTypes.list) — nunca id chumbado.
const CONFIGURE_ACTION_REF = 'aegis.connector.configure';

// A validação client-side dirigida pelo param_schema (obrigatórios + min/max
// estruturado) vive em lib/dados/schema-issue — COMPARTILHADA com o Configurar
// do dispositivo (Dispositivos). O clamp server-side permanece como defesa em
// profundidade.

// Catálogo → form de criação: só skills de conector PRONTAS entram no seletor
// (native = registrada com param_schema; clawhub = requer ativação, fica fora).
function isReadyConnectorSkill(r: SkillCatalogRow): boolean {
  return isConnectorSkill(r.skill_key) && r.source !== 'clawhub';
}

// Defaults do param_schema pré-preenchidos no form dinâmico.
function skillParamDefaults(params: SkillParam[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params) {
    if (p.default !== undefined && p.default !== null) out[p.key] = p.default;
  }
  return out;
}

function fmtTime(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—';
}
function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function ConectoresWorkspace({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  // Tarefa H — Configurar é gestão de conector: sem connectors.manage o botão
  // não existe (mesmo padrão do widget connector-status).
  const canManage = useCan('connectors.manage');
  // Gerar token OSDK é primitiva de PLATAFORMA (IAM), não específica de conector:
  // gate pela permissão sensível de emitir token (o papel admin passa por tudo).
  const canOsdk = useCan('governance.tokens.write');
  const [list, setList] = React.useState<ConnectorAgent[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [res, setRes] = React.useState<Record<string, Res>>({});

  const [f, setF] = React.useState({
    slug: '', display_name: '', base_url: '', path: '', method: 'GET', node_type: '',
    id_field: '', name_field: '', records_path: '', request_body: '',
    auth_mode: 'none', auth_secret_ref: '', auth_header: 'Authorization', auth_username: '',
    auth_query_param: 'api_key', auth_token_url: '', auth_client_id: '', auth_scope: '',
    cron_preset: '', serializer_format: 'json', csv_delimiter: ',',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Sprint 1 — form CATALOG-DRIVEN: a skill do conector vem do catálogo real
  // (GET /governance/agents/skills), nunca digitada na mão. connector.http é
  // só mais uma skill (default; mantém o form HTTP rico sem regressão); as
  // demais rendem o FORM DINÂMICO do param_schema declarado.
  const [skillCatalog, setSkillCatalog] = React.useState<SkillCatalogRow[] | null>(null);
  const [skillKey, setSkillKey] = React.useState(HTTP_SKILL);
  const [skillParams, setSkillParams] = React.useState<Record<string, unknown>>({});
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await Skills.catalog();
        if (alive) setSkillCatalog(rows);
      } catch {
        // fail-soft: sem catálogo o seletor ainda oferece o connector.http.
        if (alive) setSkillCatalog([]);
      }
    })();
    return () => { alive = false; };
  }, []);
  const connectorSkills = React.useMemo<SkillCatalogRow[]>(() => {
    const rows = (skillCatalog ?? []).filter(isReadyConnectorSkill);
    if (!rows.some((r) => r.skill_key === HTTP_SKILL)) {
      rows.unshift({
        skill_key: HTTP_SKILL, label: t('conectores.skill.http'), description: '',
        category: 'ingestion', source: 'native', platforms: [], requires_secrets: [],
        param_schema: [],
      });
    }
    return rows;
  }, [skillCatalog, t]);
  const selectedSkill = React.useMemo(
    () => connectorSkills.find((c) => c.skill_key === skillKey) ?? null,
    [connectorSkills, skillKey],
  );
  // Tarefa E — label de skill no DISPLAY LAYER: dict (pt-BR espelha o
  // backend + en-US peer) vence; catálogo segue a fonte p/ skills novas.
  const catalogLabelBySkill = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of skillCatalog ?? []) m[r.skill_key] = r.label;
    return m;
  }, [skillCatalog]);
  // Estação WhatsApp — capacidades declaradas por skill (campo aditivo do
  // catálogo). Habilita "Parear"/"Últimas mensagens" no card do conector.
  const capabilitiesBySkill = React.useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of skillCatalog ?? []) m[r.skill_key] = r.capabilities ?? [];
    return m;
  }, [skillCatalog]);
  const selectedSkillDesc = selectedSkill
    ? skillDesc(t, selectedSkill.skill_key, selectedSkill.description)
    : '';
  const isHttp = skillKey === HTTP_SKILL;
  const onSkillChange = (key: string) => {
    setSkillKey(key);
    setErr(null);
    const cap = connectorSkills.find((c) => c.skill_key === key);
    setSkillParams(skillParamDefaults(cap?.param_schema ?? []));
  };

  // WP-F — query params como KV editável (serializa pra objeto no submit).
  const [query, setQuery] = React.useState<{ k: string; v: string }[]>([]);
  // WP-F — markings do catálogo real (vazio = default do skill, ["OFICIAL"]).
  const [markings, setMarkings] = React.useState<string[]>([]);
  // WP-F — paginação por modo (campos do contrato do connector.http).
  const [pag, setPag] = React.useState({
    mode: 'none', page_param: 'page', size_param: '', page_size: '', start_page: '',
    offset_param: 'offset', limit_param: 'limit', cursor_param: 'cursor', cursor_path: '',
    max_pages: '',
  });
  const setP = (k: string, v: string) => setPag((p) => ({ ...p, [k]: v }));

  // P6a — preview da Sincronização (serializer + schema inferido).
  const [sample, setSample] = React.useState('');
  const [preview, setPreview] = React.useState<SyncPreviewResult | null>(null);
  const [previewErr, setPreviewErr] = React.useState<string | null>(null);

  // WP-F — Execuções: histórico por conector (expandível, com retry de falha).
  const [openRuns, setOpenRuns] = React.useState<string | null>(null);
  const [runsBy, setRunsBy] = React.useState<Record<string, ConnectorRun[] | null>>({});

  const runPreview = async () => {
    setBusy('preview'); setPreviewErr(null); setPreview(null);
    try {
      const r = await Connectors.syncPreview({
        format: f.serializer_format,
        // amostra colada OU busca da URL base+caminho (fonte pública).
        ...(sample.trim()
          ? { sample: sample }
          : { source_url: (f.base_url.trim() + f.path.trim()) || undefined }),
      });
      setPreview(r);
    } catch (e) {
      setPreviewErr((e as Error)?.message ?? 'Falha na pré-visualização');
    } finally { setBusy(null); }
  };

  const refresh = React.useCallback(() => {
    setErr(null);
    Connectors.list()
      // WP-F — só agentes com skill de conector (connector.* + camera.detect_tick)
      // aparecem aqui (skill_keys do backend); um worker genérico de visão/coleta não.
      // Estações/portaria saem da lista: são Dispositivos (ou descontinuados).
      .then((rows) => setList(
        rows.filter((a) => (a.skill_keys ?? []).some(isConnectorSkill) && isPipelineConnector(a)),
      ))
      .catch((e) => setErr((e as Error)?.message ?? 'Falha ao carregar conectores'));
  }, []);
  React.useEffect(() => { refresh(); }, [refresh]);

  function buildAuth() {
    if (f.auth_mode === 'api_key') return { mode: 'api_key', secret_ref: f.auth_secret_ref, header: f.auth_header || 'Authorization', scheme: '' };
    if (f.auth_mode === 'api_key_query') return { mode: 'api_key', in: 'query', query_param: f.auth_query_param || 'api_key', secret_ref: f.auth_secret_ref };
    if (f.auth_mode === 'bearer') return { mode: 'bearer', secret_ref: f.auth_secret_ref };
    if (f.auth_mode === 'basic') return { mode: 'basic', secret_ref: f.auth_secret_ref, username: f.auth_username };
    if (f.auth_mode === 'oauth2_cc') {
      return {
        mode: 'oauth2_cc', secret_ref: f.auth_secret_ref, token_url: f.auth_token_url.trim(),
        client_id: f.auth_client_id.trim(), ...(f.auth_scope.trim() ? { scope: f.auth_scope.trim() } : {}),
      };
    }
    return { mode: 'none' };
  }

  function buildPagination(): Record<string, unknown> {
    if (pag.mode === 'none') return { mode: 'none' };
    const out: Record<string, unknown> = { mode: pag.mode };
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    const put = (k: string, v: unknown) => { if (v !== undefined && v !== '') out[k] = v; };
    if (pag.mode === 'page') {
      put('page_param', pag.page_param.trim());
      put('size_param', pag.size_param.trim());
      put('page_size', num(pag.page_size));
      put('start_page', num(pag.start_page));
    } else if (pag.mode === 'offset') {
      put('offset_param', pag.offset_param.trim());
      put('limit_param', pag.limit_param.trim());
      put('page_size', num(pag.page_size));
    } else if (pag.mode === 'cursor') {
      put('cursor_param', pag.cursor_param.trim());
      put('cursor_path', pag.cursor_path.trim());
    }
    put('max_pages', num(pag.max_pages));
    return out;
  }

  // Submit do trilho genérico (qualquer skill do catálogo ≠ connector.http):
  // valida obrigatórios do param_schema e registra Agent + SkillBinding.
  const submitSkill = async () => {
    if (!f.slug.trim()) return;
    const schema = selectedSkill?.param_schema ?? [];
    // Tarefa C — obrigatórios + min/max ESTRUTURADO do param_schema: valor
    // fora do limite bloqueia o submit com mensagem honesta (o clamp
    // server-side permanece como defesa em profundidade).
    const issue = schemaIssue(schema, skillParams);
    if (issue) {
      setErr(schemaIssueMessage(t, issue));
      return;
    }
    setBusy('register'); setErr(null);
    try {
      await Connectors.registerSkill({
        slug: f.slug.trim(),
        display_name: f.display_name.trim() || f.slug.trim(),
        skill_key: skillKey,
        description: selectedSkill?.description || '',
        config: Object.fromEntries(
          Object.entries(skillParams).filter(([, v]) => v !== undefined && v !== ''),
        ),
        cron_preset: f.cron_preset || null,
      });
      setShowForm(false);
      setF((p) => ({ ...p, slug: '', display_name: '' }));
      setSkillParams(skillParamDefaults(schema));
      refresh();
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Falha ao registrar conector');
    } finally { setBusy(null); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHttp) { await submitSkill(); return; }
    if (!f.slug.trim() || !f.base_url.trim() || !f.node_type.trim()) return;
    // body só viaja em POST e precisa ser JSON válido (o backend manda como json=).
    let requestBody: Record<string, unknown> = {};
    if (f.method === 'POST' && f.request_body.trim()) {
      try {
        requestBody = JSON.parse(f.request_body);
      } catch {
        setErr(t('conectores.err.body_json'));
        return;
      }
    }
    setBusy('register'); setErr(null);
    try {
      await Connectors.register({
        slug: f.slug.trim(), display_name: f.display_name.trim() || f.slug.trim(),
        base_url: f.base_url.trim(), path: f.path.trim(), method: f.method,
        node_type: f.node_type.trim(),
        id_field: f.id_field.trim() || 'id', name_field: f.name_field.trim(),
        records_path: f.records_path.trim(),
        query: Object.fromEntries(query.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v])),
        request_body: requestBody,
        markings,
        auth: buildAuth(),
        pagination: buildPagination(),
        cron_preset: f.cron_preset || null,
        serializer: {
          format: f.serializer_format,
          ...(f.serializer_format === 'csv' && f.csv_delimiter
            ? { options: { delimiter: f.csv_delimiter } }
            : {}),
        },
      });
      setShowForm(false);
      setF((p) => ({ ...p, slug: '', display_name: '', base_url: '', path: '', node_type: '', request_body: '' }));
      setQuery([]); setMarkings([]);
      refresh();
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'Falha ao registrar conector');
    } finally { setBusy(null); }
  };

  const test = async (a: ConnectorAgent) => {
    setBusy(`test-${a.id}`);
    try {
      const r = await Connectors.test(a.id, skillOf(a));
      setRes((p) => ({ ...p, [a.id]: { ok: r.ok, msg: r.message } }));
    } catch (e) {
      setRes((p) => ({ ...p, [a.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally { setBusy(null); }
  };

  const run = async (a: ConnectorAgent) => {
    setBusy(`run-${a.id}`);
    try {
      const r = await Connectors.run(a.id, skillOf(a));
      setRes((p) => ({ ...p, [a.id]: { ok: true, msg: `${t('conectores.enqueued')} (${r.status})` } }));
    } catch (e) {
      setRes((p) => ({ ...p, [a.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally { setBusy(null); }
  };

  // WP-F — Ativar/Pausar: PATCH de status com modal de confirmação (nunca
  // confirm nativo). 'active' é o estado que o tick do agendador seleciona.
  const toggleStatus = async (a: ConnectorAgent) => {
    const next = a.status === 'active' ? 'inactive' : 'active';
    const name = a.display_name || a.slug;
    const ok = await confirmModal({
      title: t(next === 'active' ? 'conectores.confirm.activateTitle' : 'conectores.confirm.pauseTitle'),
      description: t(next === 'active' ? 'conectores.confirm.activateDesc' : 'conectores.confirm.pauseDesc').replace('{name}', name),
      confirmLabel: t(next === 'active' ? 'conectores.activate' : 'conectores.pause'),
      cancelLabel: t('common.cancel'),
      tone: next === 'active' ? 'default' : 'warning',
    });
    if (!ok) return;
    setBusy(`toggle-${a.id}`);
    try {
      await Connectors.update(a.id, { status: next });
      refresh();
    } catch (e) {
      setRes((p) => ({ ...p, [a.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally { setBusy(null); }
  };

  const loadRuns = React.useCallback(async (a: ConnectorAgent) => {
    setRunsBy((p) => ({ ...p, [a.id]: null }));
    try {
      const rows = await Connectors.runs(a.id, 20);
      setRunsBy((p) => ({ ...p, [a.id]: rows }));
    } catch (e) {
      setRunsBy((p) => ({ ...p, [a.id]: [] }));
      setRes((p) => ({ ...p, [a.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    }
  }, []);

  const toggleRuns = (a: ConnectorAgent) => {
    if (openRuns === a.id) { setOpenRuns(null); return; }
    setOpenRuns(a.id);
    void loadRuns(a);
  };

  const retry = async (a: ConnectorAgent, runId: string) => {
    setBusy(`retry-${runId}`);
    try {
      await Connectors.retryRun(runId);
      await loadRuns(a);
    } catch (e) {
      setRes((p) => ({ ...p, [a.id]: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally { setBusy(null); }
  };

  // ── Tarefa H — Configurar (ACTION GOVERNADA, nunca PATCH cru) ──────────────
  // Modal com o MESMO form dinâmico do param_schema, pré-preenchido com a
  // config ATUAL do binding; submit invoca aegis.connector.configure pelo
  // trilho de actions da plataforma (clamp + re-espelho + auditoria de graça).
  const [cfg, setCfg] = React.useState<{
    agent: ConnectorAgent;
    skillKey: string;
    values: Record<string, unknown>;
    loading: boolean;
  } | null>(null);
  const [cfgErr, setCfgErr] = React.useState<string | null>(null);
  const [cfgWarnings, setCfgWarnings] = React.useState<string[]>([]);
  const [cfgBusy, setCfgBusy] = React.useState(false);
  // id da ActionType global (resolvido 1x por code_ref — nunca chumbado).
  const configureActionId = React.useRef<string | null>(null);

  // O schema do modal é derivado do catálogo (reativo: se o catálogo chega
  // depois do clique, o form aparece quando ele carrega).
  const cfgSchema = React.useMemo<SkillParam[]>(() => {
    if (!cfg) return [];
    return (skillCatalog ?? []).find((r) => r.skill_key === cfg.skillKey)?.param_schema ?? [];
  }, [cfg, skillCatalog]);

  const openConfigure = async (a: ConnectorAgent) => {
    const sk = skillOf(a);
    setCfgErr(null); setCfgWarnings([]);
    setCfg({ agent: a, skillKey: sk, values: {}, loading: true });
    try {
      // Config ATUAL: o binding real do agente (a listagem só traz o config do
      // Agent — cron etc.; os params da skill vivem no SkillBinding/espelho).
      const bindings = await Connectors.bindings(a.id);
      const binding = bindings.find((b) => b.skill_key === sk)
        ?? bindings.find((b) => b.active) ?? bindings[0];
      setCfg((p) => (p && p.agent.id === a.id
        ? { ...p, values: { ...(binding?.config ?? {}) }, loading: false }
        : p));
    } catch (e) {
      setCfg((p) => (p && p.agent.id === a.id ? { ...p, loading: false } : p));
      setCfgErr((e as Error)?.message ?? 'falha');
    }
  };

  const submitConfigure = async () => {
    if (!cfg) return;
    const issue = schemaIssue(cfgSchema, cfg.values);
    if (issue) {
      setCfgErr(schemaIssueMessage(t, issue));
      return;
    }
    setCfgBusy(true); setCfgErr(null); setCfgWarnings([]);
    try {
      // Trilho de actions da plataforma: resolve a ActionType por code_ref…
      if (!configureActionId.current) {
        const rows = await ActionTypes.list();
        configureActionId.current =
          rows.find((r) => r.code_ref === CONFIGURE_ACTION_REF)?.id ?? null;
      }
      if (!configureActionId.current) {
        setCfgErr(t('conectores.configure.action_missing'));
        return;
      }
      // …e executa com {connector, params}. Só as chaves DECLARADAS no
      // param_schema viajam (o form é a superfície editável; o merge no
      // backend é não-destrutivo por chave).
      const params = Object.fromEntries(
        cfgSchema
          .map((p) => [p.key, cfg.values[p.key]] as const)
          .filter(([, v]) => v !== undefined && v !== ''),
      );
      const r = await ActionTypes.execute(configureActionId.current, {
        connector: cfg.agent.slug, params,
      });
      if (r.status === 'PENDING_APPROVAL') {
        // confirm-mode/4-olhos: a mudança só aplica quando um aprovador
        // confirmar — mensagem honesta, nunca falso "aplicado".
        setRes((p) => ({ ...p, [cfg.agent.id]: { ok: true, msg: t('conectores.configure.pending') } }));
        setCfg(null);
        return;
      }
      const out = r.output as {
        ok?: boolean; error?: string; result?: { clamped?: string[] };
      } | undefined;
      if (r.status !== 'SUCCESS' || out?.ok === false) {
        setCfgErr(out?.error || t('conectores.configure.failed'));
        return;
      }
      refresh();
      const clamped = out?.result?.clamped ?? [];
      if (clamped.length > 0) {
        // valores ajustados pelos limites declarados — avisos visíveis no
        // modal (fechar aqui esconderia o ajuste do operador).
        setCfgWarnings(clamped);
        setRes((p) => ({ ...p, [cfg.agent.id]: { ok: true, msg: t('conectores.configure.applied') } }));
        return;
      }
      setRes((p) => ({ ...p, [cfg.agent.id]: { ok: true, msg: t('conectores.configure.applied') } }));
      setCfg(null);
    } catch (e) {
      setCfgErr((e as Error)?.message ?? t('conectores.configure.failed'));
    } finally { setCfgBusy(false); }
  };

  const tick = async () => {
    setBusy('tick');
    try {
      const r = await Connectors.schedulerTick();
      setRes((p) => ({ ...p, __tick: { ok: true, msg: `${r.enqueued}/${r.checked}` } }));
    } catch (e) {
      setRes((p) => ({ ...p, __tick: { ok: false, msg: (e as Error)?.message ?? 'falha' } }));
    } finally { setBusy(null); }
  };

  // F7.3c — embedded usa botões compactos (h-7) no HubHeader h-9 da casca;
  // a rota standalone mantém o CpPageHeader com CTAs cheios.
  const actions = (compact = false) => (
    <div className="flex items-center gap-2">
      <button type="button" onClick={tick} disabled={busy === 'tick'} data-testid="conectores-scheduler"
        className={(compact ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]') + ' bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5'}>
        <Timer className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('conectores.scheduler_now')}
      </button>
      <button type="button" onClick={() => setShowForm((v) => !v)} data-testid="conectores-novo"
        className={(compact ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-[12px]') + ' bg-primary text-white hover:opacity-90 flex items-center gap-1.5'}>
        <Plus className="w-3.5 h-3.5" strokeWidth={2} /> {showForm ? t('common.cancel') : t('conectores.register')}
      </button>
    </div>
  );
  return (
    <>
      {embedded
        ? <HubHeader label={t('conectores.title')}>{actions(true)}</HubHeader>
        : <CpPageHeader title={t('conectores.title')} subtitle={t('conectores.subtitle')} actions={actions()} />}
      {/* FIX #1 (scroll conectores, 2026-06-28): `pb-12` garante folga abaixo
          da última seção (Pipeline/DLQ) para que o rodapé NUNCA encoste na
          borda do scroll (o container rolável é o <main>/aba pai — um único
          overflow-y-auto). */}
      <div className="p-6 pb-12 max-w-6xl space-y-8">
        {(res.__tick || err) && (
          <div className="space-y-2">
            {res.__tick && (
              <p className={'text-[12px] ' + (res.__tick.ok ? 'text-success' : 'text-danger')} data-testid="conectores-tick-res">
                {t('conectores.scheduler_now')}: <span className="font-mono">{res.__tick.msg}</span>
              </p>
            )}
            {err && (
              <div className="flex items-start gap-2 text-danger text-[13px]" role="alert" data-testid="conectores-error">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> <span className="min-w-0 break-words">{err}</span>
              </div>
            )}
          </div>
        )}

        {showForm && (
          <ConnectorRegistrationForm
            onSubmit={submit}
            onCancel={() => setShowForm(false)}
            busy={busy === 'register'}
            error={err}
            form={f}
            setField={set}
            connectorSkills={connectorSkills}
            skillKey={skillKey}
            onSkillChange={onSkillChange}
            selectedSkill={selectedSkill}
            selectedSkillDesc={selectedSkillDesc}
            isHttp={isHttp}
            skillParams={skillParams}
            onSkillParamsChange={(k, v) => setSkillParams((p) => ({ ...p, [k]: v }))}
            query={query}
            setQuery={setQuery}
            markings={markings}
            setMarkings={setMarkings}
            pag={pag}
            setPagField={setP}
            sample={sample}
            setSample={setSample}
            preview={preview}
            previewErr={previewErr}
            onPreview={runPreview}
            previewBusy={busy === 'preview'}
          />
        )}

        {/* Pipelines de ingestão: cabeçalho forte (título + contagem) e a lista
            densa de fichas de conector. */}
        <section className="space-y-3" data-testid="conectores-section">
          <SectionHead
            testid="conectores-head"
            icon={<Plug className="w-4 h-4" strokeWidth={1.5} />}
            title={t('conectores.section.title')}
            subtitle={t('conectores.section.subtitle')}
            count={list ? list.length : null}
          />
          <div className="border border-border-light bg-canvas-light" data-testid="conectores-list">
            {list === null && <div className="p-3 text-[12px] text-muted-on-light flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> {t('common.loading')}</div>}
            {list && list.length === 0 && <div className="p-3 text-[12px] text-muted-on-light italic">{t('conectores.empty')}</div>}
            {list && list.map((a) => (
              <ConnectorCard
                key={a.id}
                agent={a}
                result={res[a.id]}
                runs={runsBy[a.id]}
                openRuns={openRuns === a.id}
                busy={busy}
                canManage={canManage}
                catalogLabelBySkill={catalogLabelBySkill}
                capabilitiesBySkill={capabilitiesBySkill}
                onToggleRuns={() => toggleRuns(a)}
                onTest={() => test(a)}
                onRun={() => run(a)}
                onToggleStatus={() => toggleStatus(a)}
                onConfigure={() => openConfigure(a)}
                onRetry={(runId) => retry(a, runId)}
              />
            ))}
          </div>
        </section>

        {/* Tarefa B — Dispositivos: pareamento e gestão dos equipamentos e
            estações do local. A seção se esconde sozinha sem connectors.manage. */}
        <EdgeSection />

        {/* Tokens OSDK — primitiva HORIZONTAL genérica (aplicações de integração:
            AutoSync, SDKs, automações). Domínio-neutro; cada vertical semeia as
            suas próprias Actions/dados — a UI só emite o token. */}
        {canOsdk && <OsdkTokensPanel />}

        {/* §C C5 — Placas procuradas (Hotlist) e Pipeline de detecções MIGRARAM
            para a seção "Câmeras" do Acervo (cameras-workspace), unificando a
            gestão de câmeras num só lugar de GESTOR. */}
      </div>

      {/* Tarefa H — modal Configurar (dialog REAL, padrão confirm-dialog;
          NUNCA diálogo nativo). */}
      {cfg && (
        <ConfigureDialog
          t={t}
          name={cfg.agent.display_name || cfg.agent.slug}
          skillName={skillLabel(t, cfg.skillKey, catalogLabelBySkill[cfg.skillKey])}
          schema={cfgSchema}
          values={cfg.values}
          loading={cfg.loading}
          busy={cfgBusy}
          error={cfgErr}
          warnings={cfgWarnings}
          onChange={(k, v) => setCfg((p) => (p ? { ...p, values: { ...p.values, [k]: v } } : p))}
          onCancel={() => { setCfg(null); setCfgErr(null); setCfgWarnings([]); }}
          onSubmit={submitConfigure}
        />
      )}
    </>
  );
}

const INP = 'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:outline-none focus:border-primary';

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-on-light flex items-center gap-1">
        {label}
        {tip && <InfoTip text={tip} label={label} />}
      </span>
      {children}
    </label>
  );
}
