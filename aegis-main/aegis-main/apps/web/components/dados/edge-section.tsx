'use client';

/**
 * Dispositivos — Tarefa B (2026-06-11), central de Conectores.
 *
 * Seção de pareamento e gestão dos dispositivos do tenant: o dispositivo é o
 * aparelho instalado no local (gateway que conecta as câmeras da rede interna
 * à plataforma, ou estação de mensageria). Aqui o operador:
 *   - vê a FICHA TÉCNICA de cada aparelho — cabeçalho (nome + estado + tipo) e
 *     grade densa de metadados (versão, heartbeat, último contato, câmeras ok)
 *     — GET /edge/nodes;
 *   - "Parear novo dispositivo" → gera um código single-use de TTL curto (POST
 *     /edge/pairing-codes) num dialog REAL (padrão confirm-dialog, NUNCA
 *     diálogo nativo) com código mono em destaque + contagem de expiração
 *     + copiar;
 *   - "Parear" NO CARD de um aparelho que pareia por conector (estação de
 *     mensageria, ponte AutoSync — o node traz `pairing` = agente+slug+skill):
 *     abre o StationPairingDialog, que decide QR ou código digitável pelo que
 *     o backend devolver;
 *   - "Configurar" NO CARD desse mesmo aparelho: monta o form pelo
 *     `param_schema` da skill e aplica pela ACTION GOVERNADA
 *     (aegis.connector.configure) — o MESMO trilho dos conectores, zero
 *     mecanismo paralelo;
 *   - Revoga um edge (confirmModal destrutivo) — o aparelho perde o acesso
 *     na hora.
 *
 * Régua visual: cantos retos; profundidade por BORDA + tonalidade (a faixa
 * `bg-panel-light` da grade de metadados), NUNCA sombra em card; #2D77BE só
 * como acento de ação/seleção; cor de estado sempre acompanhada de RÓTULO;
 * dado estruturado em JetBrains Mono; LINHAS sem ícone decorativo (só o
 * cabeçalho da seção tem um); botões de ação são texto (verbo).
 *
 * Sem jargão de máquina (nada de "token"/"multipart" nas strings); i18n
 * via useT() (pt-BR + en-US); toda a seção atrás de useCan('connectors.manage').
 */
import * as React from 'react';
import {
  AlertCircle, ArrowUpCircle, CheckCircle2, Loader2, Plus, RefreshCw, Server, X,
  Copy, KeyRound, QrCode,
} from 'lucide-react';

import { confirmModal, grantsModal } from '@/components/dialog/confirm-dialog';
import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { ConfigureDialog } from '@/components/dados/configure-dialog';
import { SectionHead } from '@/components/dados/section-head';
import { DeviceFormDialog } from '@/components/dados/device-form-dialog';
import { DeviceLinkDialog } from '@/components/dados/device-link-dialog';
import { NumberFormDialog } from '@/components/dados/number-form-dialog';
import { StationPairingDialog } from '@/components/dados/station-pairing-dialog';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useCan } from '@/lib/auth/useAuth';
import { useT } from '@/lib/i18n/provider';
import { skillLabel } from '@/lib/i18n/skill-labels';
import { schemaIssue, schemaIssueMessage } from '@/lib/dados/schema-issue';
import {
  ActionTypes, Connectors, Edge, Skills,
  type EdgeDiagnosticsSummary,
  type EdgeNodeRow,
  type EdgeNodesResult,
  type EdgePairingCode,
  type EdgePoolAutomation,
  type EdgePoolNumber,
  type EdgeBenchDevice,
  type EdgeBenchSummary,
  type EdgePoolSeenDevice,
  type EdgePoolSummary,
  type SkillParam,
} from '@/lib/api';

// Janela de "online": heartbeat mais recente que isto = aparelho conectado.
// O backend agora DERIVA o status efetivo na leitura (offline após 3× o
// período de heartbeat; revogado prevalece) — a janela local só existe como
// rebaixamento honesto de um 'online' que envelheceu no cache do cliente.
const ONLINE_WINDOW_MS = 5 * 60_000;

// A ActionType global da configuração governada, resolvida por code_ref (nunca
// id chumbado) — o MESMO ref que a central de conectores usa.
const CONFIGURE_ACTION_REF = 'aegis.connector.configure';

type UiStatus = 'online' | 'offline' | 'paired' | 'revoked';
type DevicePairing = {
  agent_id: string; slug: string; skill_key: string; capabilities?: string[];
};

// A tela gateia CADA gesto pela capability que a skill declara — nunca por
// tipo de dispositivo. Sem isto, "cadastrar número" precisaria saber que
// "estação de pool tem números", que é conhecimento de vertical dentro da UI.
function can(p: DevicePairing | null, capability: string): boolean {
  return Boolean(p?.capabilities?.includes(capability));
}

// O status vem MASTIGADO do backend — aqui ele é REFLETIDO, nunca inventado.
// A única liberdade local é rebaixar um 'online' que envelheceu no cache do
// cliente; nenhum outro estado é promovido a online.
function edgeUiStatus(n: EdgeNodeRow): UiStatus {
  if (n.status === 'revoked') return 'revoked';
  // offline derivado pelo backend (staleness) prevalece sobre a janela local
  if (n.status === 'offline') return 'offline';
  // pareado e ainda sem contato: não é offline (nunca deveria ter reportado
  // ainda) e muito menos online.
  if (n.status === 'paired') return 'paired';
  if (n.status === 'online') {
    return n.last_seen_at && Date.now() - Date.parse(n.last_seen_at) <= ONLINE_WINDOW_MS
      ? 'online'
      : 'offline';
  }
  // status desconhecido (payload novo/legado): offline é a leitura honesta.
  return 'offline';
}

// Último contato humanizado (linguagem do operador, nunca timestamp cru).
function fmtLastSeen(t: (k: string) => string, iso: string | null): string {
  if (!iso) return t('edge.last_seen.never');
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return t('edge.last_seen.now');
  if (diff < 3_600_000) {
    return t('edge.last_seen.min').replace('{n}', String(Math.floor(diff / 60_000)));
  }
  if (diff < 86_400_000) {
    return t('edge.last_seen.h').replace('{n}', String(Math.floor(diff / 3_600_000)));
  }
  return t('edge.last_seen.d').replace('{n}', String(Math.floor(diff / 86_400_000)));
}

// Cor SEMPRE com rótulo junto (regra da cor falante): a borda/texto do chip e o
// ponto quadrado ao lado dizem a mesma coisa que a palavra.
const STATUS_CLS: Record<UiStatus, string> = {
  online: 'border-success text-success',
  offline: 'border-border-light text-muted-on-light',
  paired: 'border-primary text-primary',
  revoked: 'border-danger text-danger',
};
const DOT_CLS: Record<UiStatus, string> = {
  online: 'bg-success',
  offline: 'bg-muted-on-light',
  paired: 'bg-primary',
  revoked: 'bg-danger',
};
// Frescor do heartbeat derivado do estado — sem inventar cadência que o
// backend não manda (a janela real vive no servidor).
const HEARTBEAT_KEY: Record<UiStatus, string> = {
  online: 'edge.hb.active',
  offline: 'edge.hb.silent',
  paired: 'edge.hb.pending',
  revoked: 'edge.hb.stopped',
};

// Tipo do dispositivo (campo aditivo `kind`): só os conhecidos rendem badge;
// kind desconhecido ou ausente NÃO renderiza (nunca o valor cru).
const KIND_KEYS = new Set([
  'camera_gateway', 'whatsapp_station', 'whatsapp_pool', 'autosync_bridge',
  'android_bench', 'desk_app',
]);
function kindLabel(t: (k: string) => string, kind?: string): string | null {
  if (!kind || !KIND_KEYS.has(kind)) return null;
  return t(`edge.kind.${kind}`);
}
// Diagnóstico de câmeras (autoteste do modelo etc.) só faz sentido em gateway
// de câmeras — kind ausente = legado, tratado como camera_gateway.
function isCameraKind(n: EdgeNodeRow): boolean {
  return n.kind == null || n.kind === 'camera_gateway';
}

// Onda 4 (débito 3c) — a linha de diagnóstico só existe quando há ALGO a
// dizer (autoteste rodou, houve reinício ou erro). Edge mudo/payload legado
// sem o resumo: zero ruído na lista.
function hasDiagSignal(d?: EdgeDiagnosticsSummary | null): d is EdgeDiagnosticsSummary {
  return Boolean(
    d && (d.selftest_ok !== null || d.loop_restarts_total > 0 || d.last_error),
  );
}

// ── Pool de números (estação multi-número) ──────────────────────────────────
// A lista rende pela PRESENÇA do dado (nodes[].pool com números), nunca por
// kind/vertical — qualquer dispositivo que publique inventário ganha a seção.
function hasPoolNumbers(p?: EdgePoolSummary | null): p is EdgePoolSummary {
  return Boolean(p && Array.isArray(p.numbers) && p.numbers.length > 0);
}

// Bancada: rende quando o nó TRAZ bancada — mesmo vazia, porque "bancada sem
// aparelho" é justamente o diagnóstico que o operador precisa ver (ele estava
// tendo que ler log de container pra descobrir isso).
function hasBench(b?: EdgeBenchSummary | null): b is EdgeBenchSummary {
  return !!b && Array.isArray(b.devices);
}

// Vocabulário do adb → rótulo do operador. Desconhecido cai no cru (é dado de
// diagnóstico: esconder o que não conheço apaga a pista).
const BENCH_STATES = new Set(['device', 'unauthorized', 'offline', 'no permissions']);
function benchStateLabel(t: (k: string) => string, state?: string): string {
  const s = (state || '').trim();
  if (!s) return t('edge.bench.state.unknown');
  return BENCH_STATES.has(s) ? t(`edge.bench.state.${s.replace(/ /g, '_')}`) : s;
}

// Estágio da adoção (o que o OPERADOR pediu) — distinto do estado do adb (o que
// a máquina vê). Aparelho declarado e ainda ausente só faz sentido com isto na
// tela: sem o estágio, ele seria um serial mudo numa lista.
const ADOPTION_STATES = new Set(['queued', 'pairing', 'ready', 'failed']);
function adoptionLabel(t: (k: string) => string, s?: string): string | null {
  const v = (s || '').trim();
  return v && ADOPTION_STATES.has(v) ? t(`edge.bench.adoption.${v}`) : null;
}

// Vocabulário do pool → tom visual. Cor SEMPRE acompanhada do rótulo (regra
// da cor falante); estado fora do vocabulário → rótulo neutro de desconhecido.
const POOL_STATE_KEYS = new Set([
  'paired', 'awaiting_scan', 'temp_banned', 'needs_relink', 'dead', 'quarantined',
]);
const POOL_STATE_CLS: Record<string, string> = {
  paired: 'border-success text-success',
  awaiting_scan: 'border-primary text-primary',
  temp_banned: 'border-warning text-warning',
  needs_relink: 'border-danger text-danger',
  dead: 'border-danger text-danger',
  quarantined: 'border-border-light text-muted-on-light',
};
const POOL_DOT_CLS: Record<string, string> = {
  paired: 'bg-success',
  awaiting_scan: 'bg-primary',
  temp_banned: 'bg-warning',
  needs_relink: 'bg-danger',
  dead: 'bg-danger',
  quarantined: 'bg-muted-on-light',
};

function poolStateLabel(t: (k: string) => string, state?: string): string {
  return POOL_STATE_KEYS.has(state ?? '')
    ? t(`edge.pool.state.${state}`)
    : t('edge.pool.state.unknown');
}

// Quando o ban temporário vence (futuro): "volta em 12 min". Vencido ou sem
// prazo → nada (o número já pode voltar sozinho).
function fmtBannedUntil(t: (k: string) => string, iso?: string | null): string | null {
  if (!iso) return null;
  const diff = Date.parse(iso) - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const txt = diff < 3_600_000
    ? `${Math.max(1, Math.round(diff / 60_000))} min`
    : `${Math.round(diff / 3_600_000)} h`;
  return t('edge.pool.banned_until').replace('{t}', txt);
}

// ── Automação de religação (o celular é um edge) ────────────────────────────
// Aparece SÓ quando o número tem aparelho declarado; `idle` não diz nada
// (número saudável não precisa de linha nova). Mesma disciplina do estado do
// pool: vocabulário conhecido → rótulo traduzido, desconhecido → rótulo
// neutro, valor cru NUNCA.
const AUTO_STATE_KEYS = new Set([
  'pending', 'attempting', 'confirming', 'needs_human',
]);
const AUTO_STATE_CLS: Record<string, string> = {
  pending: 'border-border-light text-muted-on-light',
  attempting: 'border-primary text-primary',
  confirming: 'border-primary text-primary',
  needs_human: 'border-danger text-danger',
};
const AUTO_DOT_CLS: Record<string, string> = {
  pending: 'bg-muted-on-light',
  attempting: 'bg-primary',
  confirming: 'bg-primary',
  needs_human: 'bg-danger',
};
// Abaixo disto o aparelho é o incidente, não o número — é o que separa "a
// sessão caiu" de "o celular está morrendo na bancada".
const BATTERY_LOW = 20;

function autoLabel(t: (k: string) => string, a: EdgePoolAutomation): string {
  const state = a.state ?? '';
  if (state === 'attempting') {
    return t('edge.pool.auto.attempting')
      .replace('{n}', String(a.attempts ?? 1))
      .replace('{m}', String(a.max_attempts ?? a.attempts ?? 1));
  }
  return AUTO_STATE_KEYS.has(state)
    ? t(`edge.pool.auto.${state}`)
    : t('edge.pool.auto.unknown');
}

// Nada a dizer sobre número saudável (ou sem automação): silêncio é o
// comportamento correto — a linha só ganha conteúdo quando há incidente.
function hasAutomationSignal(a?: EdgePoolAutomation | null): a is EdgePoolAutomation {
  return Boolean(a && a.state && a.state !== 'idle');
}

// Uma linha do inventário: identidade (número mono + papel) → estado com
// rótulo → contadores; "Parear" só em quem depende de gesto humano. Sem
// ícone decorativo (regra das linhas), profundidade por borda.
function PoolNumberRow({
  t, edgeId, num, onPair, onEdit, onRemove, onRetry,
}: {
  t: (k: string) => string;
  edgeId: string;
  num: EdgePoolNumber;
  onPair?: (numberId: string) => void;
  // "Tentar de novo": o operador consertou o aparelho e devolve a chance para a
  // automacao. Sem isto, `needs_human` era um beco — a automacao so voltava se o
  // numero reconectasse sozinho, e em campo ninguem podia dizer "pronto".
  onRetry?: (numberId: string) => void;
  // Presentes só quando a skill declara a capability `inventory` — a tela
  // gateia o gesto pela capability, nunca por tipo de dispositivo.
  onEdit?: (num: EdgePoolNumber) => void;
  onRemove?: (num: EdgePoolNumber) => void;
}) {
  const state = num.state ?? '';
  const banned = state === 'temp_banned' ? fmtBannedUntil(t, num.banned_until) : null;
  const roleKey = num.role === 'titular' || num.role === 'vazao'
    ? t(`edge.pool.role.${num.role}`)
    : null;
  const auto = hasAutomationSignal(num.automation) ? num.automation : null;
  const bat = auto?.device?.battery ?? 0;
  const battery = bat > 0 && bat <= BATTERY_LOW ? bat : null;
  return (
    <div
      data-testid={`edge-pool-num-${edgeId}-${num.id}`}
      className="flex items-center flex-wrap gap-x-3 gap-y-1 py-1.5 border-t border-border-light first:border-t-0 min-w-0"
    >
      <span className="font-mono text-[11px] text-text-on-light shrink-0">
        {num.msisdn || num.id}
      </span>
      {roleKey && (
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border-light text-muted-on-light shrink-0">
          {roleKey}
        </span>
      )}
      <span
        data-testid={`edge-pool-state-${edgeId}-${num.id}`}
        className={'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border shrink-0 inline-flex items-center gap-1.5 '
          + (POOL_STATE_CLS[state] ?? 'border-border-light text-muted-on-light')}
      >
        <span aria-hidden="true" className={'w-1.5 h-1.5 shrink-0 ' + (POOL_DOT_CLS[state] ?? 'bg-muted-on-light')} />
        {poolStateLabel(t, state)}
      </span>
      {banned && (
        <span className="text-[10px] font-mono text-muted-on-light shrink-0">{banned}</span>
      )}
      {auto && (
        <span
          data-testid={`edge-pool-auto-${edgeId}-${num.id}`}
          className={'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border shrink-0 inline-flex items-center gap-1.5 '
            + (AUTO_STATE_CLS[auto.state ?? ''] ?? 'border-border-light text-muted-on-light')}
        >
          <span aria-hidden="true" className={'w-1.5 h-1.5 shrink-0 ' + (AUTO_DOT_CLS[auto.state ?? ''] ?? 'bg-muted-on-light')} />
          {autoLabel(t, auto)}
        </span>
      )}
      <span className="text-[10px] font-mono text-muted-on-light shrink-0 ml-auto">
        {t('edge.pool.sent').replace('{n}', String(num.sent ?? 0))}
      </span>
      {battery !== null && (
        // Bateria só quando ela é o problema: um número perfeito com celular
        // descarregando é um incidente do APARELHO, e sem isto o operador
        // procuraria defeito na mensageria.
        <span
          data-testid={`edge-pool-battery-${edgeId}-${num.id}`}
          className="text-[10px] font-mono text-warning shrink-0"
        >
          {t('edge.pool.auto.battery').replace('{n}', String(battery))}
        </span>
      )}
      {num.needs_gesture && onPair && (
        <button
          type="button"
          data-testid={`edge-pool-pair-${edgeId}-${num.id}`}
          onClick={() => onPair(num.id)}
          // nome acessível DISTINTO por linha: N botões "Parear" no mesmo card
          // seriam indistinguíveis pra leitor de tela/controle por voz.
          aria-label={`${t('edge.pair.action')} ${num.msisdn || num.id}`}
          className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
        >
          {t('edge.pair.action')}
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          data-testid={`edge-pool-edit-${edgeId}-${num.id}`}
          onClick={() => onEdit(num)}
          aria-label={`${t('edge.pool.edit')} ${num.msisdn || num.id}`}
          className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
        >
          {t('edge.pool.edit')}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          data-testid={`edge-pool-remove-${edgeId}-${num.id}`}
          onClick={() => onRemove(num)}
          aria-label={`${t('edge.pool.remove')} ${num.msisdn || num.id}`}
          className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger shrink-0"
        >
          {t('edge.pool.remove')}
        </button>
      )}
      {num.device_serial && (
        // Qual aparelho religa este número. Sem isto, o operador não tem como
        // saber se a automação está armada nem em qual celular.
        <span
          data-testid={`edge-pool-device-${edgeId}-${num.id}`}
          className="text-[10px] font-mono text-muted-on-light shrink-0"
        >
          {t('edge.pool.device').replace('{n}', num.device_serial)}
        </span>
      )}
      {num.msisdn_mismatch && num.connected_msisdn && (
        // O chip pareado contradiz o cadastro. Linha inteira e em danger de
        // propósito: era exatamente isto que passava em silêncio, e o operador
        // só descobriria quando a mensagem saísse do telefone errado.
        <span
          data-testid={`edge-pool-mismatch-${edgeId}-${num.id}`}
          className="basis-full min-w-0 truncate text-[10px] font-mono text-danger"
        >
          {t('edge.pool.mismatch').replace('{n}', num.connected_msisdn)}
        </span>
      )}
      {auto?.state === 'needs_human' && onRetry && (
        <button
          type="button"
          data-testid={`edge-pool-retry-${edgeId}-${num.id}`}
          onClick={() => onRetry(num.id)}
          title={t('edge.pool.retry.hint')}
          className="h-6 px-2 text-[10px] bg-canvas-light border border-danger text-danger hover:border-primary hover:text-primary shrink-0"
        >
          {t('edge.pool.retry')}
        </button>
      )}
      {auto?.state === 'needs_human' && auto.last_error && (
        // O motivo da desistência é DADO vindo do aparelho, não texto de UI:
        // "não achei a tela X" e "aparelho não conectado ao adb" mandam
        // procurar defeito em lugares diferentes.
        <span
          data-testid={`edge-pool-auto-reason-${edgeId}-${num.id}`}
          title={auto.last_error}
          className="basis-full min-w-0 truncate text-[10px] font-mono text-danger"
        >
          {auto.last_error}
        </span>
      )}
    </div>
  );
}

// Seção do inventário: as contagens do cabeçalho saem do health do snapshot
// e, quando ele vier vazio/ausente, DERIVAM das próprias linhas — o resumo
// nunca pode contradizer os estados visíveis logo abaixo.
function PoolSection({
  t, edgeId, pool, onPair, onAdd, onEdit, onRemove, onRetry,
}: {
  t: (k: string) => string;
  edgeId: string;
  pool: EdgePoolSummary;
  onPair?: (numberId: string) => void;
  onAdd?: () => void;
  onEdit?: (num: EdgePoolNumber) => void;
  onRemove?: (num: EdgePoolNumber) => void;
  onRetry?: (numberId: string) => void;
}) {
  const numbers = pool.numbers ?? [];
  const sendable = pool.health?.sendable
    ?? numbers.filter((x) => x.sendable).length;
  const total = pool.health?.total ?? numbers.length;
  const queue = pool.health?.needs_gesture
    ?? numbers.filter((x) => x.needs_gesture).length;
  return (
    <div data-testid={`edge-pool-${edgeId}`}
      className="pt-1.5 border-t border-border-light">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('edge.pool.title')}
        </span>
        <span data-testid={`edge-pool-summary-${edgeId}`}
          className="text-[10px] font-mono text-muted-on-light">
          {t('edge.pool.summary')
            .replace('{n}', String(sendable))
            .replace('{m}', String(total))}
        </span>
        {queue > 0 && (
          <span data-testid={`edge-pool-queue-${edgeId}`}
            className="text-[10px] font-mono text-danger">
            {t('edge.pool.queue').replace('{n}', String(queue))}
          </span>
        )}
        {onAdd && (
          <button
            type="button"
            data-testid={`edge-pool-add-${edgeId}`}
            onClick={onAdd}
            className="ml-auto h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
          >
            {t('edge.pool.add')}
          </button>
        )}
      </div>
      <div className="mt-1">
        {numbers.map((num) => (
          <PoolNumberRow key={num.id} t={t} edgeId={edgeId} num={num}
            onPair={onPair} onEdit={onEdit} onRemove={onRemove}
            onRetry={onRetry} />
        ))}
      </div>
    </div>
  );
}

// Seção da BANCADA DE APARELHOS: cada celular que os runners enxergam, com o
// número que ele religa. Sem isso o operador não tinha ONDE ver a bancada —
// dependia de log de container. Nada aqui é gesto: aparelho é DESCOBERTO
// (plugou/pareou o adb, aparece), e a atribuição a um número se faz no
// inventário, que é onde o vínculo mora.
function BenchSection({
  t, edgeId, bench, onConnect, onPin, onForget, onAtribuir,
}: {
  t: (k: string) => string;
  edgeId: string;
  bench: EdgeBenchSummary;
  // Gestos: ausentes = sem permissão ou conector sem a capability declarada. A
  // tela nunca oferece um botão que o backend recusaria.
  onConnect?: () => void;
  onPin?: (d: EdgeBenchDevice) => void;
  onForget?: (d: EdgeBenchDevice) => void;
  // Vincular aparelho→número AQUI: é aqui que o operador lê "sem número
  // atribuído", e mandá-lo procurar o formulário do número noutro cartão é
  // mandá-lo adivinhar onde fica o gesto que a própria tela pediu.
  onAtribuir?: (d: EdgeBenchDevice) => void;
}) {
  const devices = bench.devices ?? [];
  const ready = bench.ready ?? devices.filter((d) => d.state === 'device').length;
  const total = bench.total ?? devices.length;
  return (
    <div data-testid={`edge-bench-${edgeId}`}
      className="pt-1.5 border-t border-border-light">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-on-light">
          {t('edge.bench.title')}
        </span>
        <span data-testid={`edge-bench-summary-${edgeId}`}
          className="text-[10px] font-mono text-muted-on-light">
          {t('edge.bench.summary')
            .replace('{n}', String(ready))
            .replace('{m}', String(total))}
        </span>
        {onConnect && (
          <button
            type="button"
            data-testid={`edge-bench-connect-${edgeId}`}
            onClick={onConnect}
            className="ml-auto h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
          >
            {t('edge.bench.connect')}
          </button>
        )}
      </div>
      {devices.length === 0 ? (
        <p data-testid={`edge-bench-empty-${edgeId}`}
          className="mt-1 text-[11px] text-muted-on-light">
          {t('edge.bench.empty')}
        </p>
      ) : (
        <div className="mt-1">
          {devices.map((d) => (
            <div key={`${d.runner || ''}:${d.serial}`}
              data-testid={`edge-bench-dev-${edgeId}-${d.serial}`}
              className="flex items-center flex-wrap gap-x-3 gap-y-0.5 py-1 border-b border-border-light last:border-b-0">
              <span className="text-[11px] font-mono text-fg-on-light">
                {d.model || d.serial}
              </span>
              {d.model && (
                <span className="text-[10px] font-mono text-muted-on-light">
                  {d.serial}
                </span>
              )}
              {/* O estado do ADB manda quando o aparelho está visível: "pronto"
                  é a máquina dizendo device. Ausente do adb, quem fala é o
                  estágio da adoção — senão o serial ficaria mudo. */}
              {/* Aparelho DECLARADO que sumiu do adb: dizer "Declarado" seria
                  verdade inútil. O caso mais comum é o celular ter reiniciado —
                  o Android desliga a Depuração sem fio a cada reinício, por
                  projeto — e é isso que o operador precisa ler. */}
              <span data-testid={`edge-bench-state-${edgeId}-${d.serial}`}
                title={!d.state && d.declared && d.adoption === 'ready'
                  ? t('edge.bench.adoption.ausente.hint') : undefined}
                className={`text-[10px] font-mono ${d.state === 'device'
                  ? 'text-ok'
                  : (!d.state && d.declared && d.adoption === 'ready') ? 'text-danger' : 'text-warn'}`}>
                {d.state
                  ? benchStateLabel(t, d.state)
                  : (d.declared && d.adoption === 'ready')
                    ? t('edge.bench.adoption.ausente')
                    : adoptionLabel(t, d.adoption) ?? t('edge.bench.state.unknown')}
              </span>
              {/* Fora do carregador o aparelho dorme, o Wi-Fi cai e a estação
                  perde contato — a automação para sem que nada esteja
                  "quebrado". O aviso vem ANTES de o número deixar de voltar. */}
              {d.charging === false && (
                <span data-testid={`edge-bench-energia-${edgeId}-${d.serial}`}
                  title={t('edge.bench.nocarregador.hint')}
                  className="text-[10px] font-mono text-warn">
                  {t('edge.bench.nocarregador')}
                </span>
              )}
              {d.has_pin && (
                <span data-testid={`edge-bench-pin-${edgeId}-${d.serial}`}
                  className="text-[10px] font-mono text-muted-on-light">
                  {t('edge.bench.pin.on')}
                </span>
              )}
              {/* Aplicativo: o aparelho pode ter WhatsApp e WhatsApp Business.
                  Sem escolher, a automação abre o errado e cai na tela de
                  cadastro — falha silenciosa, e o número não volta. */}
              {d.app ? (
                <span data-testid={`edge-bench-app-${edgeId}-${d.serial}`}
                  className="text-[10px] font-mono text-muted-on-light">
                  {t(`edge.bench.app.${d.app}`) === `edge.bench.app.${d.app}`
                    ? d.app
                    : t(`edge.bench.app.${d.app}`)}
                </span>
              ) : (d.apps?.length ?? 0) > 1 && (
                <span data-testid={`edge-bench-app-falta-${edgeId}-${d.serial}`}
                  className="text-[10px] font-mono text-danger">
                  {t('edge.bench.app.pendente')}
                </span>
              )}
              {/* o vínculo é o que dá sentido ao serial: sem ele, o operador vê
                  um código opaco e não sabe qual titular depende dele. */}
              {onAtribuir ? (
                <button
                  type="button"
                  data-testid={`edge-bench-atribuir-${edgeId}-${d.serial}`}
                  onClick={() => onAtribuir(d)}
                  aria-label={`${t('edge.bench.atribuir')} ${d.serial}`}
                  className={`ml-auto h-6 px-2 text-[10px] font-mono border shrink-0 ${d.atende
                    ? 'bg-canvas-light border-border-light text-muted-on-light hover:border-primary hover:text-primary'
                    : 'bg-canvas-light border-warn text-warn hover:border-primary hover:text-primary'}`}
                >
                  {d.atende
                    ? t('edge.bench.serves').replace('{n}', d.atende)
                    : t('edge.bench.unassigned')}
                </button>
              ) : (
                <span data-testid={`edge-bench-serves-${edgeId}-${d.serial}`}
                  className="text-[10px] font-mono text-muted-on-light ml-auto">
                  {d.atende
                    ? t('edge.bench.serves').replace('{n}', d.atende)
                    : t('edge.bench.unassigned')}
                </span>
              )}
              {onPin && (
                <button
                  type="button"
                  data-testid={`edge-bench-pin-set-${edgeId}-${d.serial}`}
                  onClick={() => onPin(d)}
                  aria-label={`${t('edge.bench.pin.set')} ${d.serial}`}
                  className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-primary hover:text-primary shrink-0"
                >
                  {t('edge.bench.pin.set')}
                </button>
              )}
              {onForget && (
                <button
                  type="button"
                  data-testid={`edge-bench-forget-${edgeId}-${d.serial}`}
                  onClick={() => onForget(d)}
                  aria-label={`${t('edge.bench.forget')} ${d.serial}`}
                  className="h-6 px-2 text-[10px] bg-canvas-light border border-border-light hover:border-danger hover:text-danger shrink-0"
                >
                  {t('edge.bench.forget')}
                </button>
              )}
              {/* Aparelho sumido: a instrução vai na linha, não só no title —
                  operador não passa o mouse procurando ajuda escondida. */}
              {!d.state && d.declared && d.adoption === 'ready' && (
                <p data-testid={`edge-bench-ausente-${edgeId}-${d.serial}`}
                  className="w-full text-[10px] text-danger">
                  {t('edge.bench.adoption.ausente.hint')}
                </p>
              )}
              {/* O motivo da falha é o que diz ao operador O QUE FAZER
                  ("o código expira em segundos — peça um novo"). */}
              {d.detail && (
                <p data-testid={`edge-bench-detail-${edgeId}-${d.serial}`}
                  className="w-full text-[10px] text-danger">
                  {d.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Primitivas do card ──────────────────────────────────────────────────────

// Par rótulo→valor da ficha técnica: rótulo Inter 10px MAIÚSCULO muted, valor
// SEMPRE em JetBrains Mono (é dado estruturado).
function Meta({
  label, testid, children,
}: {
  label: string;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-on-light truncate">
        {label}
      </dt>
      <dd
        data-testid={testid}
        className="text-[11px] font-mono text-text-on-light mt-0.5 truncate"
      >
        {children}
      </dd>
    </div>
  );
}

// Botão de ação do rodapé: TEXTO (verbo+objeto), reto, com borda. Sem ícone
// decorativo — só o spinner quando ocupado.
function CardAction({
  children, onClick, busy, tone = 'default', testid, className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: 'default' | 'danger';
  testid?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testid}
      className={
        'h-7 px-2.5 text-[11px] bg-canvas-light border border-border-light '
        + 'flex items-center gap-1.5 disabled:opacity-60 '
        + (tone === 'danger'
          ? 'hover:border-danger hover:text-danger '
          : 'hover:border-primary hover:text-primary ')
        + (className ?? '')
      }
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.5} />}
      {children}
    </button>
  );
}

// Linha discreta de diagnóstico por edge (dados em fonte mono): autoteste do
// modelo (ok/falha/—), reinícios do watchdog e último erro truncado por CSS
// com o texto completo no title= (tooltip nativo).
function EdgeDiagLine({
  t, edgeId, diag,
}: {
  t: (k: string) => string;
  edgeId: string;
  diag: EdgeDiagnosticsSummary;
}) {
  const selftest =
    diag.selftest_ok === null
      ? '—'
      : diag.selftest_ok
        ? t('edge.diag.selftest.ok')
        : t('edge.diag.selftest.fail');
  return (
    <div
      data-testid={`edge-diag-${edgeId}`}
      className="text-[10px] font-mono text-muted-on-light flex items-center gap-1.5 min-w-0 pt-1.5 border-t border-border-light"
    >
      <span className="shrink-0">
        {t('edge.diag.selftest')}{' '}
        <span className={diag.selftest_ok === false ? 'text-danger' : undefined}>
          {selftest}
        </span>
      </span>
      <span className="shrink-0">
        {'· '}
        {t('edge.diag.restarts').replace('{n}', String(diag.loop_restarts_total))}
      </span>
      {diag.last_error ? (
        <span
          data-testid={`edge-diag-error-${edgeId}`}
          title={diag.last_error}
          className="truncate text-danger"
        >
          {'· '}
          {diag.last_error}
        </span>
      ) : null}
    </div>
  );
}

export function EdgeSection() {
  const t = useT();
  const canManage = useCan('connectors.manage');
  const [data, setData] = React.useState<EdgeNodesResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pairing, setPairing] = React.useState<EdgePairingCode | null>(null);
  // Retorno honesto por dispositivo (configuração aplicada / enviada / falhou).
  const [res, setRes] = React.useState<Record<string, { ok: boolean; msg: string }>>({});
  // Pareamento POR DISPOSITIVO (estação/ponte): o par agente+skill vem do
  // próprio node (`pairing`). `target` (estação de pool) dirige o gesto a UM
  // número do inventário — nada de adivinhar slug de conector aqui.
  const [stationPair, setStationPair] =
    React.useState<(DevicePairing & { target?: string }) | null>(null);
  // Cadastro/correção de número (capability `inventory`). `edit` ausente =
  // cadastro novo.
  const [numberForm, setNumberForm] =
    React.useState<(DevicePairing & {
      edit?: EdgePoolNumber; seen?: EdgePoolSeenDevice[];
    }) | null>(null);
  // Conectar aparelho / senha da tela (capability `devices`). `edit` ausente =
  // aparelho novo.
  const [deviceForm, setDeviceForm] =
    React.useState<(DevicePairing & { edit?: EdgeBenchDevice }) | null>(null);
  // Vínculo aparelho→número, aberto a partir da BANCADA.
  const [vinculo, setVinculo] = React.useState<
    (DevicePairing & { device: EdgeBenchDevice; numeros: EdgePoolNumber[] }) | null
  >(null);

  // deps [] de propósito: refresh estável (o efeito de mount roda UMA vez).
  // err='' = falha sem mensagem → o render cai no t('edge.error').
  const refresh = React.useCallback(async () => {
    setErr(null);
    try {
      setData(await Edge.nodes());
    } catch (e) {
      setErr((e as Error)?.message ?? '');
    }
  }, []);

  // Status VIVO: além do mount, faz polling do /nodes enquanto a aba está
  // visível. Um painel de heartbeat/status TEM que ser vivo — sem isto a lista
  // congela no estado do carregamento (o operador via "offline" de uma lacuna
  // de restart e achava que o heartbeat não pegou, quando o backend já estava
  // online). Pausa com a aba oculta (não desperdiça); ~15s < janela de 180s.
  // Os números moram no cartão da ESTAÇÃO; o vínculo é feito no cartão da
  // BANCADA. Buscar aqui evita que a bancada precise saber de qual Dispositivo
  // vieram — ela só precisa da lista.
  const numerosDaEstacao = React.useMemo(
    () => (data?.nodes ?? []).flatMap((n) => n.pool?.numbers ?? []),
    [data],
  );

  const EDGE_POLL_MS = 15_000;
  // Aparelho recém-conectado fica em trânsito por segundos, e o operador está
  // OLHANDO a tela esperando o desfecho: nesse intervalo a lista atualiza mais
  // rápido. Sem isto ele atualiza a página na mão para saber se deu certo — foi
  // o que aconteceu na primeira vez que o dono usou.
  const emTransito = React.useMemo(
    () => (data?.nodes ?? []).some((n) => (n.bench?.devices ?? []).some(
      (d) => d.adoption === 'queued' || d.adoption === 'pairing')),
    [data],
  );
  React.useEffect(() => {
    if (!canManage) return;
    void refresh();
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    };
    const id = setInterval(tick, emTransito ? 4_000 : EDGE_POLL_MS);
    return () => clearInterval(id);
  }, [canManage, refresh, emTransito]);

  // ── Configurar POR SCHEMA (o MESMO trilho governado dos conectores) ────────
  const [cfg, setCfg] = React.useState<{
    edgeId: string;
    name: string;
    pairing: DevicePairing;
    skillName: string;
    schema: SkillParam[];
    values: Record<string, unknown>;
    loading: boolean;
  } | null>(null);
  const [cfgErr, setCfgErr] = React.useState<string | null>(null);
  const [cfgWarnings, setCfgWarnings] = React.useState<string[]>([]);
  const [cfgBusy, setCfgBusy] = React.useState(false);
  // id da ActionType global (resolvido 1x por code_ref — nunca chumbado).
  const configureActionId = React.useRef<string | null>(null);

  const openConfigure = React.useCallback(async (n: EdgeNodeRow, p: DevicePairing) => {
    const name = n.name || t('edge.unnamed');
    setCfgErr(null);
    setCfgWarnings([]);
    setCfg({
      edgeId: n.edge_id, name, pairing: p,
      skillName: skillLabel(t, p.skill_key), schema: [], values: {}, loading: true,
    });
    try {
      // Schema DECLARADO da skill (catálogo) + config ATUAL do binding real do
      // agente — as duas fontes que o form precisa, nada inventado aqui.
      const [catalog, bindings] = await Promise.all([
        Skills.catalog(),
        Connectors.bindings(p.agent_id),
      ]);
      const row = catalog.find((r) => r.skill_key === p.skill_key) ?? null;
      const binding = bindings.find((b) => b.skill_key === p.skill_key)
        ?? bindings.find((b) => b.active) ?? bindings[0];
      setCfg((prev) => (prev && prev.edgeId === n.edge_id
        ? {
          ...prev,
          skillName: skillLabel(t, p.skill_key, row?.label),
          schema: row?.param_schema ?? [],
          values: { ...(binding?.config ?? {}) },
          loading: false,
        }
        : prev));
    } catch (e) {
      setCfg((prev) => (prev && prev.edgeId === n.edge_id ? { ...prev, loading: false } : prev));
      setCfgErr((e as Error)?.message ?? t('conectores.configure.failed'));
    }
  }, [t]);

  const submitConfigure = React.useCallback(async () => {
    if (!cfg) return;
    const issue = schemaIssue(cfg.schema, cfg.values);
    if (issue) {
      setCfgErr(schemaIssueMessage(t, issue));
      return;
    }
    setCfgBusy(true);
    setCfgErr(null);
    setCfgWarnings([]);
    try {
      if (!configureActionId.current) {
        const rows = await ActionTypes.list();
        configureActionId.current =
          rows.find((r) => r.code_ref === CONFIGURE_ACTION_REF)?.id ?? null;
      }
      if (!configureActionId.current) {
        setCfgErr(t('conectores.configure.action_missing'));
        return;
      }
      // Só as chaves DECLARADAS no param_schema viajam (o merge no backend é
      // não-destrutivo por chave); o conector é identificado pelo SLUG.
      const params = Object.fromEntries(
        cfg.schema
          .map((p) => [p.key, cfg.values[p.key]] as const)
          .filter(([, v]) => v !== undefined && v !== ''),
      );
      const r = await ActionTypes.execute(configureActionId.current, {
        connector: cfg.pairing.slug, params,
      });
      if (r.status === 'PENDING_APPROVAL') {
        setRes((p) => ({ ...p, [cfg.edgeId]: { ok: true, msg: t('conectores.configure.pending') } }));
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
      void refresh();
      const clamped = out?.result?.clamped ?? [];
      setRes((p) => ({ ...p, [cfg.edgeId]: { ok: true, msg: t('conectores.configure.applied') } }));
      if (clamped.length > 0) {
        // valores ajustados pelos limites declarados — o aviso fica visível no
        // modal (fechar aqui esconderia o ajuste do operador).
        setCfgWarnings(clamped);
        return;
      }
      setCfg(null);
    } catch (e) {
      setCfgErr((e as Error)?.message ?? t('conectores.configure.failed'));
    } finally {
      setCfgBusy(false);
    }
  }, [cfg, refresh, t]);

  // Toda a seção é gesto de gestão de conectores: sem a perm, não existe.
  if (!canManage) return null;

  // As concessoes viram GESTOS no codigo: quem resgatar ganha exatamente os
  // marcados, e eles morrem junto com o Dispositivo quando o operador revoga.
  // `retry` e `qr` sao INDEPENDENTES (checkbox, nao escolha binaria) — ver
  // GESTOS em app/services/edge_desk.py: quem ve o QR pode assumir a sessao
  // do numero, risco diferente de pedir religacao via bancada. Default
  // NENHUM marcado: um app de alerta so precisa AVISAR; agir e' escolha
  // consciente, e o texto do dialogo diz o que esta sendo dado.
  //
  // Fechar o dialog sem marcar nada e' tratado IGUAL a confirmar vazio
  // (segue para o pareamento so-leitura) — o dialogo decide CONCESSAO, nunca
  // se o pareamento acontece.
  const pair = async () => {
    const grants = (await grantsModal({
      title: t('edge.pair.grant.title'),
      description: t('edge.pair.grant.body'),
      confirmLabel: t('edge.pair.grant.confirm'),
      options: [
        {
          key: 'retry',
          label: t('edge.pair.grant.yes'),
          hint: t('edge.pair.grant.yes_hint'),
          icon: RefreshCw,
        },
        {
          key: 'qr',
          label: t('edge.pair.grant.qr'),
          hint: t('edge.pair.grant.qr_hint'),
          icon: QrCode,
          sensitive: true,
          sensitiveLabel: t('edge.pair.grant.sensitive'),
        },
      ],
      footnote: t('edge.pair.grant.none_footnote'),
    })) ?? [];
    setBusy('pair');
    setErr(null);
    try {
      setPairing(await Edge.createPairingCode(grants.length ? { grants } : {}));
    } catch (e) {
      setErr((e as Error)?.message ?? t('edge.pair.error'));
    } finally {
      setBusy(null);
    }
  };

  // Devolver a chance à automação depois de ela desistir. Gesto de UM clique
  // porque é o que o operador faz LOGO DEPOIS de consertar o aparelho — pedir
  // confirmação aqui seria atrito sem risco (nada é destruído).
  const tentarDeNovo = async (p: DevicePairing, numberId: string) => {
    setBusy(`retry-${numberId}`);
    setErr(null);
    try {
      const r = await Connectors.inventoryApply(
        p.agent_id, p.skill_key, 'retry', { id: numberId });
      if (!r.ok) {
        setErr(r.detail || t('edge.error'));
        return;
      }
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('edge.error'));
    } finally {
      setBusy(null);
    }
  };

  // Esquecer aparelho é destrutivo (a automação para de usá-lo) e o backend
  // recusa quando ele ainda religa um número — a frase dele é o diagnóstico.
  const forgetDevice = async (p: DevicePairing, d: EdgeBenchDevice) => {
    const ok = await confirmModal({
      title: t('edge.bench.forget.confirm.title').replace('{n}', d.serial),
      description: t('edge.bench.forget.confirm.body'),
      confirmLabel: t('edge.bench.forget'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(`device-${d.serial}`);
    setErr(null);
    try {
      const r = await Connectors.inventoryApply(
        p.agent_id, p.skill_key, 'remove', { kind: 'device', serial: d.serial });
      if (!r.ok) {
        setErr(r.detail || t('edge.error'));
        return;
      }
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('edge.error'));
    } finally {
      setBusy(null);
    }
  };

  // Remoção é destrutiva e silenciosa se der errado: passa pelo confirmModal
  // (nunca confirm() nativo) e a falha do driver aparece na faixa de erro em
  // vez de sumir.
  const removeNumber = async (p: DevicePairing, num: EdgePoolNumber) => {
    const label = num.msisdn || num.id;
    const ok = await confirmModal({
      title: t('edge.pool.remove.confirm.title').replace('{n}', label),
      description: t('edge.pool.remove.confirm.body'),
      confirmLabel: t('edge.pool.remove'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(`number-${num.id}`);
    setErr(null);
    try {
      const r = await Connectors.inventoryApply(
        p.agent_id, p.skill_key, 'remove', { id: num.id });
      if (!r.ok) {
        setErr(r.detail || t('edge.error'));
        return;
      }
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('edge.error'));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (n: EdgeNodeRow) => {
    const name = n.name || t('edge.unnamed');
    const ok = await confirmModal({
      title: t('edge.confirm.revokeTitle'),
      description: t('edge.confirm.revokeDesc').replace('{name}', name),
      confirmLabel: t('edge.revoke'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(`revoke-${n.edge_id}`);
    setErr(null);
    try {
      await Edge.revoke(n.edge_id);
      await refresh();
    } catch (e) {
      setErr((e as Error)?.message ?? t('edge.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3" data-testid="edge-section">
      <SectionHead
        testid="edge-head"
        icon={<Server className="w-4 h-4" strokeWidth={1.5} />}
        title={t('edge.title')}
        subtitle={t('edge.subtitle')}
        count={data ? data.nodes.length : null}
        note={data && data.expected_version
          ? (
            <span data-testid="edge-expected-version">
              {t('edge.expected_version').replace('{v}', data.expected_version)}
            </span>
          )
          : null}
        actions={(
          <>
            <button type="button" onClick={() => void refresh()} data-testid="edge-refresh"
              aria-label={t('edge.refresh')} title={t('edge.refresh')}
              className="h-8 px-2.5 text-[12px] bg-canvas-light border border-border-light hover:border-primary flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <button type="button" onClick={() => void pair()} disabled={busy === 'pair'} data-testid="edge-pair"
              className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
              {busy === 'pair'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                : <Plus className="w-3.5 h-3.5" strokeWidth={2} />}
              {t('edge.pair')}
            </button>
          </>
        )}
      />

      {err !== null && (
        <div className="flex items-start gap-2 text-danger text-[13px]" role="alert" data-testid="edge-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> <span className="min-w-0 break-words">{err || t('edge.error')}</span>
        </div>
      )}

      {/* GRADE, não pilha. Uma ilha tem gateway de cameras, estacao de numeros,
          ponte e bancada — empilhados em lista, o operador rola para achar o que
          ja deveria estar a vista, e o cartao mais alto (a estacao, com N
          numeros) empurrava todo o resto para fora da tela. Em colunas, cada
          Dispositivo e um cartao independente e a leitura e por varredura. */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2" data-testid="edge-list">
        {data === null && !err && (
          <div className="col-span-full border border-border-light bg-canvas-light p-3 text-[12px] text-muted-on-light flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
          </div>
        )}
        {data && data.nodes.length === 0 && (
          <div className="col-span-full border border-border-light bg-canvas-light p-3 text-[12px] text-muted-on-light italic" data-testid="edge-empty">
            {t('edge.empty')}
          </div>
        )}
        {data && data.nodes.map((n) => {
          const st = edgeUiStatus(n);
          const pairTarget = (n.pairing ?? null) as DevicePairing | null;
          const r = res[n.edge_id];
          return (
            <article key={n.edge_id} data-testid={`edge-card-${n.edge_id}`}
              className="border border-border-light bg-canvas-light flex flex-col min-w-0">
              {/* Cabeçalho: identidade + estado. LINHA NÃO TEM ícone decorativo. */}
              <header className="px-3 pt-2.5 pb-2 flex items-center flex-wrap gap-x-2 gap-y-1.5 min-w-0">
                <h3 className="text-[13px] font-semibold text-text-on-light truncate min-w-0">
                  {n.name || t('edge.unnamed')}
                </h3>
                <span data-testid={`edge-status-${n.edge_id}`}
                  className={'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border shrink-0 inline-flex items-center gap-1.5 ' + STATUS_CLS[st]}>
                  <span aria-hidden="true" className={'w-1.5 h-1.5 shrink-0 ' + DOT_CLS[st]} />
                  {t(`edge.status.${st}`)}
                </span>
                {kindLabel(t, n.kind) && (
                  <span data-testid={`edge-kind-${n.edge_id}`}
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-border-light text-muted-on-light shrink-0">
                    {kindLabel(t, n.kind)}
                  </span>
                )}
                {n.update_available && (
                  <span data-testid={`edge-update-${n.edge_id}`}
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-warning text-warning shrink-0 flex items-center gap-1">
                    <ArrowUpCircle className="w-3 h-3" strokeWidth={1.5} /> {t('edge.update_available')}
                  </span>
                )}
              </header>

              {/* Ficha técnica: faixa tonal (profundidade por tonalidade+borda,
                  nunca sombra) com a grade densa de metadados. */}
              <div className="px-3 py-2 bg-panel-light border-t border-border-light space-y-1.5">
                <dl data-testid={`edge-meta-${n.edge_id}`}
                  className="grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-x-4 gap-y-2">
                  <Meta label={t('edge.meta.version')} testid={`edge-version-${n.edge_id}`}>
                    {n.version || t('edge.meta.version.none')}
                  </Meta>
                  <Meta label={t('edge.meta.heartbeat')} testid={`edge-heartbeat-${n.edge_id}`}>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span aria-hidden="true"
                        className={'w-1.5 h-1.5 shrink-0 ' + DOT_CLS[st]
                          + (st === 'online' ? ' motion-safe:animate-pulse' : '')} />
                      <span className="truncate">{t(HEARTBEAT_KEY[st])}</span>
                    </span>
                  </Meta>
                  <Meta label={t('edge.meta.last_seen')} testid={`edge-lastseen-${n.edge_id}`}>
                    {fmtLastSeen(t, n.last_seen_at)}
                  </Meta>
                  {n.cameras_ok != null && (
                    <Meta label={t('edge.meta.cameras')} testid={`edge-cameras-${n.edge_id}`}>
                      {n.cameras_ok}
                    </Meta>
                  )}
                </dl>
                {isCameraKind(n) && hasDiagSignal(n.diagnostics_summary) && (
                  <EdgeDiagLine t={t} edgeId={n.edge_id} diag={n.diagnostics_summary} />
                )}
                {/* Estação de POOL: inventário de números publicado pelo tick
                    (nodes[].pool). Cabeçalho com o resumo de prontidão + fila
                    de gesto; linha a linha, "Parear" só em quem depende de
                    gesto humano — dirigido ao número (target). */}
                {hasPoolNumbers(n.pool) && (
                  <PoolSection t={t} edgeId={n.edge_id} pool={n.pool}
                    onPair={pairTarget
                      ? (id) => setStationPair({ ...pairTarget, target: id })
                      : undefined}
                    onAdd={canManage && can(pairTarget, 'inventory') && pairTarget
                      ? () => setNumberForm({
                        ...pairTarget, seen: n.pool?.devices_seen })
                      : undefined}
                    onEdit={canManage && can(pairTarget, 'inventory') && pairTarget
                      ? (num) => setNumberForm({
                        ...pairTarget, edit: num, seen: n.pool?.devices_seen })
                      : undefined}
                    onRemove={canManage && can(pairTarget, 'inventory') && pairTarget
                      ? (num) => void removeNumber(pairTarget, num)
                      : undefined}
                    onRetry={canManage && can(pairTarget, 'inventory') && pairTarget
                      ? (id) => void tentarDeNovo(pairTarget, id)
                      : undefined} />
                )}
                {/* Bancada de Aparelhos: os celulares que a automação usa para
                    religar os números (nodes[].bench). Mesma regra de sempre —
                    rende pela PRESENÇA do dado, nunca pelo kind. */}
                {hasBench(n.bench) && (
                  <BenchSection t={t} edgeId={n.edge_id} bench={n.bench}
                    onAtribuir={canManage && can(pairTarget, 'inventory') && pairTarget
                      ? (d) => setVinculo({
                        ...pairTarget, device: d, numeros: numerosDaEstacao,
                      })
                      : undefined}
                    onConnect={canManage && can(pairTarget, 'devices') && pairTarget
                      ? () => setDeviceForm({ ...pairTarget })
                      : undefined}
                    onPin={canManage && can(pairTarget, 'devices') && pairTarget
                      ? (d) => setDeviceForm({ ...pairTarget, edit: d })
                      : undefined}
                    onForget={canManage && can(pairTarget, 'devices') && pairTarget
                      ? (d) => void forgetDevice(pairTarget, d)
                      : undefined} />
                )}
              </div>

              {/* Retorno da última configuração aplicada neste aparelho. */}
              {r && (
                <div className={'px-3 pt-2 flex items-start gap-1.5 text-[11px] ' + (r.ok ? 'text-success' : 'text-danger')}
                  data-testid={`edge-res-${n.edge_id}`}>
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />
                    : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" strokeWidth={1.5} />}
                  <span className="min-w-0 break-words">{r.msg}</span>
                </div>
              )}

              {/* Rodapé de ações: verbos, sem ícone decorativo. */}
              <footer className="px-3 py-2 border-t border-border-light flex flex-wrap items-center gap-1.5">
                {/* Dispositivo que pareia por conector (estação de mensageria,
                    ponte AutoSync): configuração e pareamento são DELE, no card
                    dele — não do código global do Edge, que serve gateway de
                    câmeras. Aparecem também em offline/revogado: parear é
                    justamente o gesto de reconectar. */}
                {pairTarget && (
                  <CardAction testid={`device-configurar-${n.edge_id}`}
                    onClick={() => void openConfigure(n, pairTarget)}>
                    {t('conectores.configure')}
                  </CardAction>
                )}
                {pairTarget && (
                  <CardAction testid={`device-pair-${n.edge_id}`}
                    onClick={() => setStationPair(pairTarget)}>
                    {t('edge.pair.action')}
                  </CardAction>
                )}
                {st !== 'revoked' && (
                  <CardAction testid={`edge-revoke-${n.edge_id}`} tone="danger"
                    className="ml-auto"
                    busy={busy === `revoke-${n.edge_id}`}
                    onClick={() => void revoke(n)}>
                    {t('edge.revoke')}
                  </CardAction>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      {pairing && (
        <PairDialog
          t={t}
          pairing={pairing}
          onClose={() => {
            setPairing(null);
            // o aparelho pode ter pareado enquanto o modal estava aberto.
            void refresh();
          }}
        />
      )}

      {stationPair && (
        <StationPairingDialog
          agentId={stationPair.agent_id}
          skillKey={stationPair.skill_key}
          pairingTarget={stationPair.target}
          onClose={() => {
            setStationPair(null);
            void refresh();
          }}
        />
      )}

      {vinculo && (
        <DeviceLinkDialog
          agentId={vinculo.agent_id}
          skillKey={vinculo.skill_key}
          device={vinculo.device}
          numeros={vinculo.numeros}
          onClose={() => setVinculo(null)}
          onDone={() => void refresh()}
        />
      )}

      {deviceForm && (
        <DeviceFormDialog
          agentId={deviceForm.agent_id}
          skillKey={deviceForm.skill_key}
          edit={deviceForm.edit}
          onClose={() => setDeviceForm(null)}
          onDone={() => void refresh()}
        />
      )}

      {numberForm && (
        <NumberFormDialog
          agentId={numberForm.agent_id}
          skillKey={numberForm.skill_key}
          edit={numberForm.edit}
          seen={numberForm.seen}
          onClose={() => setNumberForm(null)}
          onDone={() => void refresh()}
        />
      )}

      {cfg && (
        <ConfigureDialog
          t={t}
          title={t('edge.configure.title')}
          name={cfg.name}
          skillName={cfg.skillName}
          schema={cfg.schema}
          values={cfg.values}
          loading={cfg.loading}
          busy={cfgBusy}
          error={cfgErr}
          warnings={cfgWarnings}
          testidPrefix="device-configurar"
          formTestidPrefix="dev-cfg"
          onChange={(k, v) => setCfg((p) => (p ? { ...p, values: { ...p.values, [k]: v } } : p))}
          onCancel={() => { setCfg(null); setCfgErr(null); setCfgWarnings([]); }}
          onSubmit={() => void submitConfigure()}
        />
      )}
    </section>
  );
}

// ── Dialog do código de pareamento (padrão confirm-dialog; NUNCA nativo) ─────

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function PairDialog({
  t, pairing, onClose,
}: {
  t: (k: string) => string;
  pairing: EdgePairingCode;
  onClose: () => void;
}) {
  const dialogRef = useDialogA11y({ open: true, onClose });
  const [remaining, setRemaining] = React.useState(
    () => Date.parse(pairing.expires_at) - Date.now(),
  );
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(
      () => setRemaining(Date.parse(pairing.expires_at) - Date.now()),
      1000,
    );
    return () => clearInterval(id);
  }, [pairing.expires_at]);

  const expired = remaining <= 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pairing.code);
      setCopied(true);
    } catch {
      // clipboard indisponível (http/permissão): o código segue visível.
    }
  };

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edge-pair-title"
      data-testid="edge-pair-modal"
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
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
          </span>
          <h2 id="edge-pair-title" className="text-[13px] font-semibold flex-1">
            {t('edge.pair.title')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            data-testid="edge-pair-close"
            className="text-muted-on-light hover:text-text-on-light">
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-4 space-y-3 text-[12px]">
          <p className="text-text-on-light">{t('edge.pair.instruction')}</p>
          <div className="bg-canvas-light border border-border-light px-4 py-3 text-center">
            <span data-testid="edge-pair-code"
              className="font-mono text-[22px] tracking-[0.2em] font-semibold text-text-on-light select-all">
              {pairing.code}
            </span>
          </div>
          <p data-testid="edge-pair-expiry"
            className={'text-[11px] font-mono ' + (expired ? 'text-danger' : 'text-muted-on-light')}>
            {expired
              ? t('edge.pair.expired')
              : t('edge.pair.expires_in').replace('{time}', fmtCountdown(remaining))}
          </p>
        </div>

        <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} data-testid="edge-pair-close-btn"
            className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary">
            {t('common.close')}
          </button>
          <button type="button" onClick={() => void copy()} disabled={expired}
            data-testid="edge-pair-copy"
            className="h-8 px-3 text-[12px] bg-primary text-white border border-primary hover:opacity-90 flex items-center gap-1.5 disabled:opacity-60">
            <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
            {copied ? t('edge.pair.copied') : t('edge.pair.copy')}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
}
