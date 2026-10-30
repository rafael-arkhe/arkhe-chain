'use client';

/**
 * Editor de instância — V2 visão→georref→mapa (spec §V2).
 *
 * Widget GENÉRICO que edita UMA instância canônica da ontologia selecionada
 * (lê de uma variável; o map_live/globe_live emite `select_change` →
 * `set_variable` popula essa variável). Edita o geopoint (lat/lng) + as
 * properties escalares (metadata) e remove a instância — tudo governado
 * (PUT/DELETE /ontology/nodes/{id} + lineage). No sucesso emite `value_change`
 * → o app declara `refresh_all` + `close_overlay`, e o mapa atualiza SEM
 * reload. Multidomínio: nomes de campo são DADO; nada hardcodado.
 *
 * NÃO usa o writeback-form: aquele grava em `schema_definition` (não em
 * `properties`, onde mora o geopoint e o que o mapa lê) e só faz POST.
 */
import * as React from 'react';
import { AlertCircle, Loader2, MapPin, Save, Trash2 } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '@/components/workshop/WorkshopV2Renderer';
import { Ontology } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { confirmModal } from '@/components/dialog/confirm-dialog';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';

const INP =
  'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:outline-none focus:border-primary';

type Geo = { lat: number; lng: number };

function isGeo(v: unknown): v is Geo {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    typeof (v as Geo).lat === 'number' && typeof (v as Geo).lng === 'number';
}

/** Acha a chave de geopoint nas properties (a configurada, senão a 1ª com cara
 *  de {lat,lng}). Função pura — testável. */
export function findGeoKey(props: Record<string, unknown>, preferred?: string): string | null {
  if (preferred && isGeo(props[preferred])) return preferred;
  if (preferred && props[preferred] === undefined) return preferred; // ainda não setado
  for (const [k, v] of Object.entries(props)) if (isGeo(v)) return k;
  return preferred || null;
}

function InstanceEditorWidget({ config, variables, bindings, emit }: WidgetRenderProps) {
  const t = useT();
  const source = typeof config.source === 'string' ? config.source : 'selecionado';
  const geoPref = typeof config.geo_property === 'string' ? config.geo_property : 'localizacao';

  // A seleção do mapa vem via set_variable → bindings (não é variável
  // declarada do app). Lê de variables (caso seja declarada) E de bindings.
  const inst = (variables[source] ?? bindings[source]) as
    | { id?: string; name?: string; properties?: Record<string, unknown> }
    | undefined;
  const id = inst && typeof inst === 'object' ? inst.id : undefined;
  const props = (inst?.properties && typeof inst.properties === 'object'
    ? inst.properties : {}) as Record<string, unknown>;
  const geoKey = findGeoKey(props, geoPref);
  const geo = geoKey ? props[geoKey] : undefined;

  // Form local (reidrata quando a instância selecionada muda).
  const [lat, setLat] = React.useState('');
  const [lng, setLng] = React.useState('');
  const [meta, setMeta] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    setErr(null);
    setLat(isGeo(geo) ? String(geo.lat) : '');
    setLng(isGeo(geo) ? String(geo.lng) : '');
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(props)) {
      if (k === geoKey) continue;
      if (v == null || typeof v === 'object') continue; // só escalares (metadata)
      m[k] = String(v);
    }
    setMeta(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) {
    return (
      <div data-testid="instance-editor" className="border border-border-light bg-canvas-light p-3">
        <p className="text-[12px] text-muted-on-light flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('instanceEditor.empty')}
        </p>
      </div>
    );
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const geoValid = lat.trim() !== '' && lng.trim() !== '' && Number.isFinite(latNum) && Number.isFinite(lngNum);

  const save = async () => {
    if (!geoValid) { setErr(t('instanceEditor.geoInvalid')); return; }
    setBusy('save'); setErr(null);
    try {
      const nextProps: Record<string, unknown> = { ...props };
      if (geoKey) nextProps[geoKey] = { lat: latNum, lng: lngNum };
      for (const [k, v] of Object.entries(meta)) nextProps[k] = v;
      await Ontology.updateNode(id, { properties: nextProps });
      emit?.('value_change', { saved_id: id, action: 'update' });
    } catch (e) {
      setErr(humanizeApiError((e as Error)?.message ?? 'falha ao salvar'));
    } finally { setBusy(null); }
  };

  const remove = async () => {
    // Confirma via confirmModal (portal compartilhado, NUNCA diálogo nativo nem
    // confirm inline) antes de remover (irreversível).
    const okConfirm = await confirmModal({
      title: t('instanceEditor.confirmQ'),
      tone: 'danger',
      confirmLabel: t('instanceEditor.confirmYes'),
    });
    if (!okConfirm) return;
    setBusy('del'); setErr(null);
    try {
      await Ontology.deleteNode(id);
      emit?.('value_change', { saved_id: id, action: 'delete' });
    } catch (e) {
      setErr(humanizeApiError((e as Error)?.message ?? 'falha ao remover'));
    } finally { setBusy(null); }
  };

  return (
    <div data-testid="instance-editor" className="border border-border-light bg-canvas-light p-3 space-y-3">
      <div className="text-[12px] font-semibold text-text-on-light flex items-center gap-1.5">
        <MapPin className="w-4 h-4 text-primary" strokeWidth={1.5} />
        {inst?.name || t('instanceEditor.title')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-[10px] text-muted-on-light">{t('instanceEditor.lat')}</span>
          <input data-testid="ie-lat" value={lat} onChange={(e) => setLat(e.target.value)} className={INP} inputMode="decimal" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] text-muted-on-light">{t('instanceEditor.lng')}</span>
          <input data-testid="ie-lng" value={lng} onChange={(e) => setLng(e.target.value)} className={INP} inputMode="decimal" />
        </label>
      </div>

      {Object.keys(meta).length > 0 && (
        <div className="space-y-2" data-testid="ie-metadata">
          {Object.keys(meta).map((k) => (
            <label key={k} className="block space-y-1">
              <span className="text-[10px] text-muted-on-light">{k}</span>
              <input
                data-testid={`ie-meta-${k}`}
                value={meta[k]}
                onChange={(e) => setMeta((p) => ({ ...p, [k]: e.target.value }))}
                className={INP}
              />
            </label>
          ))}
        </div>
      )}

      {err && (
        <p data-testid="ie-error" className="text-[12px] text-danger flex items-start gap-1.5" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> <span>{err}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button" data-testid="ie-save" onClick={save}
          disabled={busy !== null || !geoValid}
          className="h-8 px-3 text-[12px] bg-primary text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Save className="w-3.5 h-3.5" strokeWidth={1.5} />}
          {t('instanceEditor.save')}
        </button>
        <button
          type="button" data-testid="ie-remove" onClick={() => void remove()}
          disabled={busy !== null}
          className="h-8 px-3 text-[12px] border border-border-light hover:border-danger text-danger flex items-center gap-1.5 disabled:opacity-60"
        >
          {busy === 'del' ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />} {t('instanceEditor.remove')}
        </button>
      </div>
    </div>
  );
}

registerWidget('instance_editor', InstanceEditorWidget, {
  group: 'data',
  label: 'Editor de item',
  description: 'Edita a localização (lat/lng) e os dados de um item selecionado no mapa, ou o remove. Governado e auditado.',
  icon: 'map-pin',
  defaultColSpan: 6,
  mockConfig: { source: 'selecionado', geo_property: 'localizacao' },
  mockVariables: {
    selecionado: {
      id: 'demo-1', name: 'Item 1',
      properties: { localizacao: { lat: -23.55, lng: -46.63 }, observacao: 'exemplo' },
    },
  },
  config_schema: [
    { name: 'source', label: 'Item selecionado (variável)',
      description: 'Variável que recebe o item clicado no mapa (select_change → set_variable).',
      field: 'variable-ref' },
    { name: 'geo_property', label: 'Propriedade de localização', field: 'string', default: 'localizacao' },
  ],
});

export { InstanceEditorWidget };
