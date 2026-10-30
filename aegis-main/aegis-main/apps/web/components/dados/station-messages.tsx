'use client';

/**
 * StationMessages — "Últimas mensagens" de uma Estação WhatsApp no drilldown
 * do conector. Alimentado por object-sets query sobre os nós de ontologia
 * `node_type="MessageDelivery"`, filtrando `properties.station_slug` pelo slug
 * do agente, ordenado por created_at desc, limite 20.
 *
 * Usa o client de nós existente (Ontology.listNodes) e filtra/ordena no
 * cliente (o volume por estação é pequeno). Dados em JetBrains Mono; destino
 * mascarado; estados de loading/vazio/erro honestos.
 */
import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { useT } from '@/lib/i18n/provider';
import { Ontology, type OntologyNode } from '@/lib/api';

const MESSAGE_NODE_TYPE = 'MessageDelivery';
const FETCH_LIMIT = 200; // teto folgado; filtramos p/ a estação e cortamos em 20
const SHOW = 20;
const STATUS_KEYS = new Set(['queued', 'accepted', 'delivered', 'read', 'failed']);

type MsgRow = {
  id: string;
  to: string;
  status: string;
  createdAt: string | null;
};

function createdAtOf(n: OntologyNode): string | null {
  const p = (n.properties ?? {}) as Record<string, unknown>;
  const raw = p.created_at;
  if (typeof raw === 'string' && raw) return raw;
  return n.created_at || null;
}

// Destino mascarado: preserva os primeiros 4 e os 2 últimos, oculta o miolo.
function maskTo(to: string): string {
  const s = to.trim();
  if (s.length <= 6) return s;
  return `${s.slice(0, 4)}••••${s.slice(-2)}`;
}

function fmtTime(iso: string | null): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '—';
}

function statusCls(status: string): string {
  if (status === 'failed') return 'border-danger text-danger';
  if (status === 'delivered' || status === 'read') return 'border-success text-success';
  return 'border-border-light text-muted-on-light';
}

export function StationMessages({ slug }: { slug: string }) {
  const t = useT();
  const [rows, setRows] = React.useState<MsgRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setRows(null);
    setFailed(false);
    Ontology.listNodes({ node_type: MESSAGE_NODE_TYPE, limit: FETCH_LIMIT })
      .then((nodes) => {
        if (!alive) return;
        const mapped = (nodes ?? [])
          .filter((n) => {
            const p = (n.properties ?? {}) as Record<string, unknown>;
            return p.station_slug === slug;
          })
          .map<MsgRow>((n) => {
            const p = (n.properties ?? {}) as Record<string, unknown>;
            return {
              id: n.id,
              // o outbox só expõe `to_masked` ("…4002") — o destino pleno vive
              // cifrado em payload_enc, nunca em properties (review F6)
              to: typeof p.to_masked === 'string' ? p.to_masked : '',
              status: typeof p.status === 'string' ? p.status : '',
              createdAt: createdAtOf(n),
            };
          })
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .slice(0, SHOW);
        setRows(mapped);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [slug]);

  return (
    <div className="space-y-1.5" data-testid="station-messages">
      <h4 className="text-[11px] uppercase tracking-wider text-muted-on-light">
        {t('conectores.msgs.title')}
      </h4>
      {rows === null && !failed && (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> {t('common.loading')}
        </p>
      )}
      {failed && (
        <p className="text-[11px] text-muted-on-light italic" data-testid="station-messages-error">
          {t('conectores.msgs.unavailable')}
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="text-[11px] text-muted-on-light italic" data-testid="station-messages-empty">
          {t('conectores.msgs.empty')}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="bg-white border border-border-light">
          <div className="grid grid-cols-[1fr_90px_120px] gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-on-light border-b border-border-light">
            <span>{t('conectores.msgs.col.to')}</span>
            <span>{t('conectores.msgs.col.status')}</span>
            <span>{t('conectores.msgs.col.when')}</span>
          </div>
          {rows.map((m) => (
            <div key={m.id} data-testid={`station-msg-${m.id}`}
              className="grid grid-cols-[1fr_90px_120px] gap-2 px-2 py-1.5 text-[11px] border-b border-border-light last:border-b-0 items-center">
              <span className="font-mono truncate text-text-on-light">{maskTo(m.to) || '—'}</span>
              <span>
                <span data-testid={`station-msg-status-${m.id}`}
                  className={'text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ' + statusCls(m.status)}>
                  {STATUS_KEYS.has(m.status) ? t(`conectores.msgs.status.${m.status}`) : (m.status || '—')}
                </span>
              </span>
              <span className="font-mono text-muted-on-light">{fmtTime(m.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
