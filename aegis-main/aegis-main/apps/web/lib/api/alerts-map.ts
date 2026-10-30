/**
 * Mapeamento wire → UI dos alertas (store na ontologia, 2026-06-12).
 *
 * O backend serve o Alert canônico (OntologyNode projetado):
 *   {id, kind, fired_at, classification, status, severity, title,
 *    object_id, actor_id, payload, redacted, ack_by?, ack_at?}
 * A página /alertas consome `AlertItem`. Este módulo é puro (testável
 * sem fetch) e é a ÚNICA ponte entre os dois shapes.
 */
import type { AlertItem } from './types';

export interface BackendAlert {
  id: string;
  kind: 'search_feed' | 'object_watch' | 'geofence' | 'share' | 'lpr_hotlist' | string;
  fired_at: string;
  classification: string;
  status: 'pending' | 'acknowledged' | 'silenced' | string;
  severity?: 'low' | 'medium' | 'high' | 'critical' | string;
  title?: string | null;
  object_id?: string | null;
  actor_id?: string | null;
  payload?: Record<string, unknown> | null;
  redacted?: boolean;
  ack_by?: string | null;
  ack_at?: string | null;
  /**
   * BACKLOG #6a (gestão/auditoria): MTTR por-alerta — segundos entre fired_at e
   * ack_at, gravado no gesto de ack pelo store (`to_alert_dict`). `null` enquanto
   * pendente (ou em acks antigos, antes do campo existir). Mostrado na ficha do
   * alerta (drawer de auditoria).
   */
  ack_latency_s?: number | null;
  /**
   * BACKLOG #6a: `true` quando o alerta tem AlertEscalation efetivamente
   * re-notificado (status='done') — anotado por-página pelo inbox (uma query,
   * escala com a página). Alimenta o filtro "Escalados" da gestão.
   */
  escalated?: boolean;
}

/**
 * BACKLOG #6a ELO 2 — um gesto da trilha de auditoria de UM alerta
 * (`GET /alerts/{id}/trail`). Ordem cronológica garantida pelo backend
 * (`chain_seq` asc); só a família `alert.*` (emitido → entregue → reconhecido →
 * escalado/silenciado). Shape cru do LineageEvent projetado — a UI traduz o
 * `event_type` pra rótulo humano (nunca o token cru).
 */
export interface AlertTrailEvent {
  /** id do LineageEvent. */
  id: string;
  /** alert.emitted | alert.delivered | alert.acknowledged | alert.escalated | alert.silenced */
  event_type: string;
  actor: string | null;
  /** ISO8601 (created_at) — null em eventos sem carimbo. */
  at: string | null;
  /** completed | failed. */
  status: string;
  /** canal de entrega/escalonamento (delivered/escalated/silenced); null nos demais. */
  channel: string | null;
  /** metadata_ cru do LineageEvent (route_id, severity, detail, status…). */
  meta: Record<string, unknown>;
}

const KIND_TO_FEED_KIND: Record<string, AlertItem['feed_kind']> = {
  search_feed: 'feed',
  object_watch: 'watch',
  geofence: 'geofence',
  share: 'share',
  // Placa procurada (hotlist LPR) — semanticamente um objeto observado: a
  // placa rastreada disparou ao ser lida. feed_kind 'watch' agrupa com os
  // demais alertas de observação; o rótulo humano vem do KIND_LABEL do widget.
  lpr_hotlist: 'watch',
};

function priorityOf(severity?: string): AlertItem['priority'] {
  if (severity === 'critical') return 'critica';
  if (severity === 'high') return 'alta';
  return 'normal';
}

function snippetOf(a: BackendAlert): string {
  if (a.redacted || !a.payload) return '';
  const p = a.payload as Record<string, unknown>;
  switch (a.kind) {
    case 'search_feed': {
      const n = Array.isArray(p.matched_object_ids) ? p.matched_object_ids.length : 0;
      return `${String(p.feed_name ?? '')} · ${n}`.trim();
    }
    case 'object_watch':
      return [p.event_type, p.diff_summary].filter(Boolean).map(String).join(' · ');
    case 'lpr_hotlist':
      // payload do match: {plate, camera, reason, watched_plate_id}. A placa
      // é PII — só aparece quando o alerta NÃO está redigido (guard acima).
      return [p.plate, p.camera, p.reason].filter(Boolean).map(String).join(' · ');
    case 'geofence':
      return [p.geofence_name, p.event, p.object_id].filter(Boolean).map(String).join(' · ');
    case 'share':
      return [p.shared_resource_kind, p.shared_resource_id].filter(Boolean).map(String).join(' · ');
    default:
      return '';
  }
}

export function mapBackendAlert(a: BackendAlert): AlertItem {
  return {
    id: a.id,
    feed_kind: KIND_TO_FEED_KIND[a.kind] ?? 'feed',
    title: a.redacted ? '' : (a.title ?? ''),
    snippet: snippetOf(a),
    priority: priorityOf(a.severity),
    channel: a.kind,
    created_at: a.fired_at,
    acknowledged_at: a.status === 'acknowledged' ? (a.ack_at ?? a.fired_at) : null,
    classification: a.classification,
    severity: a.severity,
    payload: a.payload ?? null,
    redacted: Boolean(a.redacted),
  };
}
