'use client';

/**
 * <ImportarZonaModal /> — B5.2 (MAPA /geo). Importa zonas operacionais
 * (exclusão/engajamento/observação/seguras) de um arquivo GeoJSON, KML ou KMZ
 * para o registro do tenant (POST /api/v1/geo/zones/import via `importZones`).
 *
 * Fluxo:
 *   1. o operador escolhe o arquivo (`.geojson/.json` ou `.kml/.kmz`);
 *   2. GeoJSON → JSON.parse; KMZ/KML → `import('cesium')` + KmlDataSource,
 *      cada polígono vira uma Feature GeoJSON-like (anel em [lon,lat]);
 *   3. `geojsonToZoneFeatures` normaliza no corpo que o backend importa;
 *   4. preview de N zonas + tipo padrão + propriedade de categoria + extrusão;
 *   5. Confirmar → `importZones` → toast + fecha.
 *
 * DS honrado: modal DS (ModalPortal + ds-overlay), NUNCA diálogo nativo;
 * cantos retos; #2D77BE só no primário; ícones lucide neutros; números em
 * font-mono; strings via useT(). Erros de parse caem em toast (nunca crash).
 */
import * as React from 'react';
import { FileUp, Upload, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';
import { ModalPortal } from '@/components/ui/modal-backdrop';
import { useDialogA11y } from '@/components/dialog/use-dialog-a11y';
import { geojsonToZoneFeatures, ZONE_TYPES, type ZoneFeature } from './geo-zones';

/** FeatureCollection GeoJSON-like (o mínimo que `geojsonToZoneFeatures` lê). */
type RawFC = { type: 'FeatureCollection'; features: unknown[] } | Record<string, unknown>;

export function ImportarZonaModal({
  importZones,
  onClose,
}: {
  importZones: (
    features: ZoneFeature[],
    opts?: { source?: string; extruded_height?: number },
  ) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useDialogA11y({ open: true, onClose });

  const [rawFc, setRawFc] = React.useState<RawFC | null>(null);
  const [fileName, setFileName] = React.useState('');
  const [defaultZoneType, setDefaultZoneType] = React.useState<string>('observation');
  const [categoryProp, setCategoryProp] = React.useState('');
  const [extrudedHeight, setExtrudedHeight] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  // Features derivadas do RAW + parâmetros — recalcula sem reler o arquivo
  // quando o operador troca o tipo padrão ou a propriedade de categoria.
  const features = React.useMemo<ZoneFeature[]>(() => {
    if (!rawFc) return [];
    try {
      return geojsonToZoneFeatures(rawFc, {
        categoryProp: categoryProp.trim() || undefined,
        defaultZoneType,
      });
    } catch {
      return [];
    }
  }, [rawFc, categoryProp, defaultZoneType]);

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json') || lower.endsWith('.geojson')) {
        const text = await file.text();
        const json = JSON.parse(text) as RawFC;
        setRawFc(json);
        setFileName(file.name);
      } else if (lower.endsWith('.kml') || lower.endsWith('.kmz')) {
        const Cesium = await import('cesium');
        const ds = await Cesium.KmlDataSource.load(URL.createObjectURL(file), {
          clampToGround: true,
        });
        const now = Cesium.JulianDate.now();
        const feats: unknown[] = [];
        for (const entity of ds.entities.values) {
          const poly = entity.polygon;
          if (!poly || !poly.hierarchy) continue;
          const hierarchy = poly.hierarchy.getValue(now) as
            | { positions?: import('cesium').Cartesian3[] }
            | undefined;
          const positions = hierarchy?.positions;
          if (!positions || positions.length < 3) continue;
          const ring = positions.map((p) => {
            const carto = Cesium.Cartographic.fromCartesian(p);
            return [
              Cesium.Math.toDegrees(carto.longitude),
              Cesium.Math.toDegrees(carto.latitude),
            ];
          });
          feats.push({
            type: 'Feature',
            properties: { name: entity.name },
            geometry: { type: 'Polygon', coordinates: [ring] },
          });
        }
        setRawFc({ type: 'FeatureCollection', features: feats });
        setFileName(file.name);
      } else {
        toast.error(t('geo.zone.importUnsupported'));
      }
    } catch {
      setRawFc(null);
      setFileName('');
      toast.error(t('geo.zone.importParseError'));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (features.length === 0 || busy) return;
    setBusy(true);
    try {
      await importZones(features, {
        source: fileName || undefined,
        extruded_height: extrudedHeight,
      });
      toast.success(t('geo.zone.imported'));
      onClose();
    } catch {
      toast.error(t('geo.zone.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = features.length > 0 && !busy;
  const inputCls =
    'w-full h-8 px-2 text-[12px] bg-white border border-border-light outline-none focus:border-primary';

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="importar-zona-title"
        data-testid="importar-zona-modal"
        className="fixed inset-0 z-[60] flex items-start justify-center p-12 ds-overlay"
        onClick={onClose}
      >
        <div
          ref={dialogRef}
          className="w-full max-w-[480px] bg-white border border-border-light shadow-2xl text-text-on-light"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="px-4 py-3 border-b border-border-light flex items-center gap-2">
            <span className="inline-flex w-7 h-7 items-center justify-center bg-canvas-light border border-primary text-primary">
              <FileUp className="w-3.5 h-3.5" strokeWidth={1.5} />
            </span>
            <h2 id="importar-zona-title" className="text-[13px] font-semibold flex-1">
              {t('geo.zone.import')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel')}
              data-testid="importar-zona-close"
              className="text-muted-on-light hover:text-text-on-light"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </header>

          <div className="p-4 space-y-3 text-[12px]">
            {/* Arquivo — GeoJSON parseado no cliente; KML/KMZ via Cesium. */}
            <label className="block space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-on-light">
                {t('geo.zone.file')}
              </span>
              <input
                type="file"
                accept=".geojson,.json,.kml,.kmz"
                data-testid="zona-file"
                onChange={(e) => onFile(e.target.files?.[0])}
                className={cn(
                  inputCls,
                  'file:mr-2 file:h-6 file:px-2 file:text-[11px] file:bg-canvas-light file:border file:border-border-light file:text-text-on-light hover:file:border-primary py-1',
                )}
              />
            </label>

            {/* Preview da contagem — prova honesta do que será importado. */}
            {rawFc && (
              <div
                data-testid="zona-preview"
                className="bg-canvas-light border border-border-light px-3 py-2 flex items-baseline gap-1.5"
              >
                <span className="font-mono text-[14px] text-text-on-light">
                  {features.length}
                </span>
                <span className="text-[11px] text-muted-on-light">
                  {t('geo.zone.zonesUnit')}
                </span>
                {features.length === 0 && (
                  <span className="ml-auto text-[10.5px] text-warning">
                    {t('geo.zone.importEmpty')}
                  </span>
                )}
              </div>
            )}

            {/* Tipo padrão (aplicado às zonas sem categoria própria). */}
            <label className="block space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-on-light">
                {t('geo.zone.defaultType')}
              </span>
              <select
                value={defaultZoneType}
                data-testid="zona-default-type"
                onChange={(e) => setDefaultZoneType(e.target.value)}
                className={inputCls}
              >
                {ZONE_TYPES.map((zt) => (
                  <option key={zt} value={zt}>
                    {t(`geo.zone.type.${zt}`)}
                  </option>
                ))}
              </select>
            </label>

            {/* Propriedade de categoria — opcional: lê o tipo de cada zona
                de uma propriedade do arquivo (senão usa o tipo padrão). */}
            <label className="block space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-on-light">
                {t('geo.zone.categoryProp')}
              </span>
              <input
                type="text"
                value={categoryProp}
                data-testid="zona-category-prop"
                onChange={(e) => setCategoryProp(e.target.value)}
                placeholder={t('geo.zone.categoryPropHint')}
                className={inputCls}
              />
            </label>

            {/* Extrusão (m) — altura do prisma 3D no globo (0 = plano). */}
            <label className="block space-y-1">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-on-light">
                {t('geo.zone.extrusion')}
              </span>
              <input
                type="number"
                min={0}
                value={extrudedHeight}
                data-testid="zona-extruded-height"
                onChange={(e) =>
                  setExtrudedHeight(Math.max(0, Number(e.target.value) || 0))
                }
                className={cn(inputCls, 'font-mono')}
              />
            </label>
          </div>

          <footer className="px-4 py-3 border-t border-border-light flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              data-testid="zona-import-cancel"
              className="h-8 px-3 text-[12px] bg-canvas-light border border-border-light hover:border-primary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              data-testid="zona-import-confirm"
              className="h-8 px-3 text-[12px] border bg-primary text-white border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
              {t('geo.zone.importConfirm')}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
