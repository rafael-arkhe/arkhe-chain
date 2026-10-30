'use client';

/**
 * Superfície pública de acesso por token (`/m/<token>`) — genérica (2026-05-25).
 *
 * Sem chrome, sem login. **Dirigida 100% pelos DADOS do token**: as Ações
 * autorizadas e o escopo geográfico opcional (cerca/destino/rota) vêm do
 * backend. Nada de domínio no código — "visitante/condomínio" é DADO, não
 * string fixa; o título sai de `token.subject`.
 *
 * Reusa peças MODULARES:
 *   - widget `map_live` (MapboxGL, genérico) pro mapa — ligado a um object set
 *     montado a partir do token (destino + posição viva) + rota + cerca;
 *   - hook `useDeviceLocation` pra consumir a posição do device por
 *     CONSENTIMENTO e transmitir cada fix pro `/fix` (que avalia a cerca e
 *     dirige o ciclo: chegada -> finalizado; desvio -> alerta).
 */
import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, MapPin, Navigation, ShieldCheck,
} from 'lucide-react';

import '@/components/workshop/widgets'; // registra TODOS os widgets no registry (mesma engine do operador)
import { MapLive } from '@/components/workshop/widgets/map-live';
import { WorkshopV2Renderer } from '@/components/workshop/WorkshopV2Renderer';
import { WorkshopSurfaceContext, type WorkshopWritebackPayload } from '@/lib/workshop/surface';
import type { ResolvedVariableMap, WorkshopApp } from '@/lib/workshop/types';
import { useDeviceLocation, type DeviceFix } from '@/lib/geo/use-device-location';
import { WidgetSectionView } from '@/components/relatorios/widget-section';
import type { NotepadSection } from '@/lib/api';

interface GuestAction { id: string; name: string; description: string; input_schema: Record<string, unknown>; }
interface GuestGeo {
  fence?: [number, number][];
  target?: [number, number];
  route?: [number, number][];
  arrival_radius_m?: number;
  deviation_threshold_m?: number;
}
interface GuestMenu {
  label: string; subject: string; expires_at: string | null;
  status?: string; requires_location?: boolean; geo?: GuestGeo | null;
  actions: GuestAction[];
  // Superfície de PÁGINA: quando setado, o /m renderiza a MESMA engine de widgets
  // genéricos (WorkshopV2Renderer) escopada pelo token, não o lançador de ações.
  page_slug?: string | null;
  // Superfície de DOCUMENTO (T3-B): token escopa um Document (Transmitir); o /m
  // renderiza o documento read-only.
  document_id?: string | null;
}
interface GuestDocSection {
  id?: string; heading?: string; kind?: string; body?: string;
  data_summary?: string;
  // T3-G3 — seção de widget no documento transmitido (renderizada via a MESMA
  // engine do operador, dados/mídia resolvidos por endpoints guest token-scoped).
  widget?: string; props?: Record<string, unknown>; object_type?: string; node_id?: string;
  generated?: { body?: string; citations?: string[] };
}
interface GuestDoc {
  title: string; classification_level: string | null; version: number;
  signed: boolean; sections: GuestDocSection[]; body_md: string;
}

const CLS_BANNER: Record<string, { bg: string; fg: string; label: string }> = {
  publico: { bg: '#3D9F58', fg: '#ffffff', label: 'PÚBLICO' },
  restrito: { bg: '#E8B33B', fg: '#14181E', label: 'RESTRITO' },
  confidencial: { bg: '#E97D2A', fg: '#ffffff', label: 'CONFIDENCIAL' },
  sigiloso: { bg: '#C8341F', fg: '#ffffff', label: 'SIGILOSO' },
};
interface FixOut {
  status: string; inside_fence: boolean | null; arrived: boolean | null;
  deviated: boolean | null; distance_to_target_m: number | null;
  deviation_m: number | null; finalized: boolean;
}

export default function GuestPublicPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [menu, setMenu] = React.useState<GuestMenu | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [finalized, setFinalized] = React.useState(false);
  const [fix, setFix] = React.useState<FixOut | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [mapH, setMapH] = React.useState(380);

  const geo = menu?.geo || null;
  const hasGeo = !!(geo && (geo.fence || geo.route || geo.target));

  React.useEffect(() => {
    if (typeof window !== 'undefined') setMapH(Math.max(280, Math.round(window.innerHeight * 0.46)));
  }, []);

  const postFix = React.useCallback(async (f: DeviceFix) => {
    try {
      const r = await fetch(`/api/public/guest/${encodeURIComponent(token)}/fix`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: f.lat, lng: f.lng, accuracy: f.accuracy }),
      });
      if (r.status === 410) { setFinalized(true); return; }
      const d = (await r.json().catch(() => null)) as FixOut | null;
      if (d) { setFix(d); if (d.finalized) setFinalized(true); }
    } catch { /* transitório; o watch continua */ }
  }, [token]);

  const { sharing, position, error: geoErr, start, stop } = useDeviceLocation(postFix);
  React.useEffect(() => { if (finalized) stop(); }, [finalized, stop]);

  React.useEffect(() => {
    if (!token) return;
    fetch(`/api/public/guest/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 410) { setFinalized(true); return null; }
        if (!r.ok) throw new Error(r.status === 404 ? 'Link inválido ou expirado.' : 'Não foi possível carregar.');
        return r.json();
      })
      .then((m) => { if (m) setMenu(m); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [token]);

  // Superfície de PÁGINA: quando o token escopa uma página, montamos o MESMO
  // WorkshopApp do operador a partir do descritor público (layout + defs de
  // variáveis) e renderizamos pelo MESMO WorkshopV2Renderer — os VALORES vêm do
  // evaluate público token-scoped (sem cookie de operador).
  const [pageApp, setPageApp] = React.useState<WorkshopApp | null>(null);
  const pageSlug = menu?.page_slug || null;
  const [doc, setDoc] = React.useState<GuestDoc | null>(null);
  const docId = menu?.document_id || null;

  React.useEffect(() => {
    if (!token || !pageSlug) return;
    let cancelled = false;
    fetch(`/api/public/guest/${encodeURIComponent(token)}/pages/${encodeURIComponent(pageSlug)}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setPageApp({
          id: d.id,
          display: d.title,
          schema_version: 2,
          variables: d.variables ?? [],
          layout: d.layout ?? { root: [] },
          surface: 'standalone',
          markings: [],
        } as unknown as WorkshopApp);
      })
      .catch(() => { /* cai pro lançador de ações */ });
    return () => { cancelled = true; };
  }, [token, pageSlug]);

  // Superfície de DOCUMENTO (Transmitir): carrega o doc read-only do token.
  React.useEffect(() => {
    if (!token || !docId) return;
    let cancelled = false;
    fetch(`/api/public/guest/${encodeURIComponent(token)}/document`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setDoc(d as GuestDoc); })
      .catch(() => { /* link inválido cai no estado de erro do menu */ });
    return () => { cancelled = true; };
  }, [token, docId]);

  /** Provedor token-scoped: resolve as variáveis da página via o endpoint público
   *  (sem auth de operador). Injetado no WorkshopV2Renderer. */
  const guestEvaluator = React.useCallback(
    async (
      _appId: string,
      opts: { overrides: Record<string, unknown> },
    ): Promise<{ variables: ResolvedVariableMap }> => {
      const r = await fetch(
        `/api/public/guest/${encodeURIComponent(token)}/pages/${encodeURIComponent(pageSlug || '')}/evaluate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides: opts.overrides || {} }),
        },
      );
      if (!r.ok) throw new Error(`evaluate ${r.status}`);
      return (await r.json()) as { variables: ResolvedVariableMap };
    },
    [token, pageSlug],
  );

  /** Escrita escopada pelo token: o writeback_form despacha uma Action
   *  ALLOWLISTADA (gated + auditada) com os campos do form como input — nunca um
   *  write anônimo direto. Resolve a Action de criação dentre as allowlistadas no
   *  token (a que aceita {kind, properties}); o input_schema explícito por form é
   *  o refinamento (AIP wiring). */
  const guestWriteback = React.useCallback(
    async (payload: WorkshopWritebackPayload): Promise<{ id: string }> => {
      const acts = menu?.actions || [];
      const isCreate = (a: GuestAction) => {
        const props = (a.input_schema?.properties as Record<string, unknown>) || {};
        return 'kind' in props || /criar|cadastr|registr|create|nov[ao]/i.test(a.name || '');
      };
      const action = acts.find(isCreate) || acts[0];
      if (!action) throw new Error('Sem ação de escrita liberada neste link.');
      const r = await fetch(
        `/api/public/guest/${encodeURIComponent(token)}/actions/${encodeURIComponent(action.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: { kind: payload.target_kind, properties: payload.fields } }),
        },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.status !== 'SUCCESS') {
        throw new Error(
          r.status === 429 ? 'Aguarde um momento antes de enviar de novo.'
            : data?.detail === 'outside_fence' ? 'Você está fora da área autorizada.'
            : 'Não foi possível registrar.',
        );
      }
      return { id: String(data?.output?.object_id ?? '') };
    },
    [token, menu?.actions],
  );

  async function invoke(a: GuestAction) {
    setBusy(a.id); setResult(null);
    try {
      const r = await fetch(`/api/public/guest/${encodeURIComponent(token)}/actions/${encodeURIComponent(a.id)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: {} }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.status !== 'SUCCESS') {
        const msg = r.status === 429 ? 'Aguarde um momento antes de tentar de novo.'
          : r.status === 403 && data?.detail === 'outside_fence' ? 'Você está fora da área autorizada.'
          : r.status === 403 && data?.detail === 'location_required' ? 'Compartilhe sua localização primeiro.'
          : 'Não foi possível concluir. Tente novamente.';
        setResult({ id: a.id, ok: false, msg });
      } else setResult({ id: a.id, ok: true, msg: 'Pronto!' });
    } catch { setResult({ id: a.id, ok: false, msg: 'Sem conexão. Tente novamente.' }); }
    finally { setBusy(null); }
  }

  if (finalized) {
    return (
      <div className="min-h-screen w-full bg-canvas-light text-text-on-light flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border border-border-light p-6 text-center" data-testid="m-finalized">
          <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-3" strokeWidth={1.5} />
          <h1 className="text-base font-semibold mb-1">Acesso finalizado</h1>
          <p className="text-[13px] text-muted-on-light">Este link foi encerrado e não pode mais ser usado.</p>
        </div>
      </div>
    );
  }

  const inside = fix?.inside_fence;
  const liveColor = inside === false ? '#dc2626' : '#2563eb';
  const markers: Record<string, unknown>[] = [];
  if (geo?.target) markers.push({ id: 'target', lat: geo.target[0], lng: geo.target[1], color: '#16a34a', label: 'Destino' });
  if (position) markers.push({ id: 'me', lat: position.lat, lng: position.lng, color: liveColor, pulse: true, label: 'Você' });
  const mapVars = { objetos: markers, rota: geo?.route ?? [], area: geo?.fence ?? [] };
  // Centro ESTÁVEL do escopo da visita (destino > centróide da cerca > início da
  // rota) — sem isto o map-live tira a média dos markers (destino + posição
  // viva) e, longe do local, joga o mapa pro meio do caminho / Brasília, fazendo
  // a cerca "sumir". Ancorar no destino mantém a cerca sempre enquadrada.
  const fenceCentroid = (): [number, number] | undefined => {
    const f = geo?.fence;
    if (!f || !f.length) return undefined;
    return [f.reduce((s, p) => s + p[0], 0) / f.length, f.reduce((s, p) => s + p[1], 0) / f.length];
  };
  const mapCenter: [number, number] | undefined = geo?.target
    ? [geo.target[0], geo.target[1]]
    : fenceCentroid() ?? (geo?.route && geo.route.length ? [geo.route[0][0], geo.route[0][1]] : undefined);
  const mapCfg = {
    source: 'objetos',
    routeSource: geo?.route ? 'rota' : undefined,
    zoneSource: geo?.fence ? 'area' : undefined,
    view: 'streets' as const,
    height: mapH,
    center: mapCenter,
  };

  return (
    <div className="min-h-screen w-full bg-canvas-light text-text-on-light flex flex-col">
      {hasGeo && (
        <div className="relative">
          {/* reusa o widget map_live (genérico) — object set montado do token */}
          <MapLive appId="" config={mapCfg} variables={mapVars} bindings={{}} setBinding={() => {}} />
          <div className="absolute top-3 left-3 right-3 space-y-2 pointer-events-none z-10">
            {inside === false && (
              <div className="bg-danger text-white text-[12px] px-3 py-2 flex items-center gap-2" data-testid="m-outside">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.5} /> Você está fora da área autorizada.
              </div>
            )}
            {fix?.deviated && (
              <div className="bg-warning text-black text-[12px] px-3 py-2 flex items-center gap-2" data-testid="m-deviation">
                <Navigation className="w-4 h-4" strokeWidth={1.5} /> Você se afastou da rota sugerida.
              </div>
            )}
            {inside && !fix?.deviated && (
              <div className="bg-white/95 text-[12px] px-3 py-2 flex items-center gap-2 border border-border-light" data-testid="m-status">
                <MapPin className="w-4 h-4 text-primary" strokeWidth={1.5} />
                {typeof fix?.distance_to_target_m === 'number'
                  ? `Na área · ${Math.round(fix.distance_to_target_m)} m até o destino`
                  : 'Na área autorizada'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border-t border-border-light p-5 space-y-4">
        <div className="flex items-center gap-2 text-muted-on-light">
          <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-[11px] uppercase tracking-wider">Acesso seguro</span>
        </div>

        {err && (
          <div className="flex items-start gap-2 text-danger text-[13px]" role="alert" data-testid="m-error">
            <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} /> <span>{err}</span>
          </div>
        )}

        {!menu && !err && (
          <div className="flex items-center gap-2 text-muted-on-light text-[13px]">
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> Carregando…
          </div>
        )}

        {menu && (
          <div data-testid="m-menu">
            {(menu.subject || menu.label) && <h1 className="text-base font-semibold mb-1">{menu.subject || menu.label}</h1>}

            {hasGeo && !sharing && (
              <div className="my-3">
                <p className="text-[12px] text-muted-on-light mb-2">
                  Para liberar o acesso, compartilhe sua localização. Usada só durante este acesso.
                </p>
                <button type="button" onClick={start} data-testid="m-consent"
                  className="w-full h-12 px-4 bg-primary text-white text-[14px] font-semibold flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary">
                  <MapPin className="w-4 h-4" strokeWidth={2} /> Compartilhar minha localização
                </button>
              </div>
            )}

            {geoErr && (
              <div className="flex items-start gap-2 text-danger text-[12px] my-2" role="alert" data-testid="m-geoerr">
                <AlertCircle className="w-4 h-4 mt-0.5" strokeWidth={1.5} /> <span>{geoErr}</span>
              </div>
            )}

            {doc ? (
              <DocSurface doc={doc} token={token} />
            ) : pageApp ? (
              // Superfície de PÁGINA: a MESMA engine de widgets genéricos do
              // operador, escopada pelo token (Foundry: módulo embutido + module
              // interface). Sem atributo de audiência no widget.
              <div className="mt-3 -mx-5" data-testid="m-page">
                <WorkshopSurfaceContext.Provider value={{ writeback: guestWriteback }}>
                  <WorkshopV2Renderer app={pageApp} evaluator={guestEvaluator} flat />
                </WorkshopSurfaceContext.Provider>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-muted-on-light mt-3 mb-2">Toque para executar.</p>
                <div className="space-y-3">
                  {menu.actions.length === 0 && <p className="text-[12px] text-muted-on-light italic">Nenhuma ação disponível.</p>}
                  {menu.actions.map((a) => {
                    const running = busy === a.id;
                    const res = result && result.id === a.id ? result : null;
                    const blocked = hasGeo && inside !== true;
                    return (
                      <div key={a.id}>
                        <button type="button" disabled={running || blocked} onClick={() => invoke(a)} data-testid={`m-action-${a.id}`}
                          className="w-full h-12 px-4 bg-primary text-white text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary">
                          {running && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />} {a.name}
                        </button>
                        {a.description && <p className="text-[11px] text-muted-on-light mt-1">{a.description}</p>}
                        {res && (
                          <div className={'flex items-center gap-1.5 text-[12px] mt-1.5 ' + (res.ok ? 'text-success' : 'text-danger')}
                            role="status" data-testid={`m-result-${a.id}`}>
                            {res.ok ? <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} /> : <AlertCircle className="w-4 h-4" strokeWidth={1.5} />}
                            {res.msg}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Superfície de DOCUMENTO read-only (Transmitir) — banner de classificação +
 *  título + seções (narrativa/markdown/dados). O token É a autorização. */
function DocSurface({ doc, token }: { doc: GuestDoc; token: string }) {
  const cls = doc.classification_level ? CLS_BANNER[doc.classification_level] : undefined;
  return (
    <div className="mt-3" data-testid="m-document">
      {cls && (
        <div
          className="flex items-center justify-center gap-2 px-3 py-1 text-[11px] font-semibold tracking-wider mb-3"
          style={{ backgroundColor: cls.bg, color: cls.fg }}
        >
          <span className="w-1.5 h-1.5" style={{ backgroundColor: cls.fg }} aria-hidden />
          {cls.label}
        </div>
      )}
      <h1 className="text-lg font-semibold text-text-on-light">{doc.title}</h1>
      <p className="text-[11px] text-muted-on-light mb-4">
        Versão {doc.version} · {doc.signed ? 'Assinado' : 'Rascunho'}
      </p>
      <div className="space-y-5">
        {doc.sections.length === 0 && doc.body_md && (
          <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-text-on-light">
            {doc.body_md}
          </p>
        )}
        {doc.sections.map((s, i) => {
          // T3-G3 — seção de widget: renderiza pela MESMA engine do operador,
          // dados/mídia via endpoints guest token-scoped.
          if (s.kind === 'widget' && s.widget) {
            return (
              <section key={s.id || i}>
                {s.heading && (
                  <h2 className="text-[14px] font-semibold text-text-on-light mb-1">{s.heading}</h2>
                )}
                <WidgetSectionView section={s as unknown as NotepadSection} guestToken={token} />
              </section>
            );
          }
          const body =
            s.kind === 'narrative'
              ? s.generated?.body || ''
              : s.kind === 'object_set' || s.kind === 'aggregation'
                ? s.data_summary || ''
                : s.body || '';
          const cites = s.generated?.citations || [];
          return (
            <section key={s.id || i}>
              {s.heading && (
                <h2 className="text-[14px] font-semibold text-text-on-light mb-1">{s.heading}</h2>
              )}
              {body ? (
                <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-text-on-light">
                  {body}
                </p>
              ) : (
                <p className="text-[12px] text-muted-on-light italic">(seção sem conteúdo)</p>
              )}
              {cites.length > 0 && (
                <p className="text-[11px] text-muted-on-light mt-1">
                  Fontes: {cites.map((c) => `#${c}`).join(', ')}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
