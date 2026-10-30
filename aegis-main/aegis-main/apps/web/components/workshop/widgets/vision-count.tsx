'use client';

/**
 * Contagem por imagem — V1 visão→georref→mapa (spec §B1–B3 + E4).
 *
 * Fluxo operador-no-loop, genérico e multi-domínio (o "o quê" contar é DADO):
 *   1. foto (data URL, com upload governado como evidência);
 *   2. âncora geográfica NW/SE (projeção afim px→geo no backend);
 *   3. instrução ("conte as casas") → provider REGISTRADO (gate de jurisdição
 *      fail-closed; auditado no log de inferência);
 *   4. REVISÃO: caixas sobre a foto, operador remove falsos positivos;
 *   5. Confirmar → materialização em LOTE de instâncias canônicas do tipo
 *      configurado (geopoint no shape canônico) → o mapa (map_live) exibe.
 *
 * NUNCA materializa sem revisão — contagem por visão é aproximada e a
 * auditabilidade exige o humano confirmando (quem confirmou fica no lineage).
 */
import * as React from 'react';
import { AlertCircle, CheckCircle2, Cpu, Loader2, ScanSearch, X } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '@/components/workshop/WorkshopV2Renderer';
import { Compute, Ontology, type SelectModelResult, type VisionDetection } from '@/lib/api';
import { useT } from '@/lib/i18n/provider';
import { Workshop } from '@/lib/workshop/client';
import { formatBytes, readAsDataUrl } from './media-uploader';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';

const INP =
  'w-full h-8 px-2 text-[12px] bg-white border border-border-light focus:outline-none focus:border-primary';
const MAX_BYTES = 8 * 1024 * 1024;

type Det = VisionDetection & { kept: boolean };

function VisionCountWidget({ appId, config, emit }: WidgetRenderProps) {
  const t = useT();
  const targetKind = typeof config.target_kind === 'string' ? config.target_kind : '';
  const geoProperty =
    typeof config.geo_property === 'string' && config.geo_property
      ? config.geo_property
      : 'localizacao';
  const jurisdiction = typeof config.jurisdiction === 'string' ? config.jurisdiction : '';

  const [img, setImg] = React.useState<{ dataUrl: string; name: string; size: number } | null>(null);
  const [anchor, setAnchor] = React.useState({ nw_lat: '', nw_lng: '', se_lat: '', se_lng: '' });
  const [instruction, setInstruction] = React.useState('');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [dets, setDets] = React.useState<Det[] | null>(null);
  const [providerUsed, setProviderUsed] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // S4 — o AIP recomenda o modelo (intenção do usuário manda; provider é
  // consequência). 'point' = pino (sem geoshape) | 'geoshape' = polígono.
  const [outputAs, setOutputAs] = React.useState<'point' | 'geoshape'>('point');
  const [intention, setIntention] = React.useState<'' | 'edge' | 'shared' | 'dedicated'>('');
  const [rec, setRec] = React.useState<SelectModelResult | null>(null);
  const capability = outputAs === 'geoshape' ? 'segment' : 'detect';

  // Pede a recomendação ao AIP quando a instrução/intenção muda (sob demanda).
  const suggest = React.useCallback(async () => {
    if (!instruction.trim()) return;
    try {
      const r = await Compute.selectModel(
        instruction.trim(), intention || undefined, jurisdiction || undefined,
      );
      setRec(r);
      // alinha o modo de saída ao que a tarefa pede (operador pode trocar).
      if (r.classification?.output === 'polygon') setOutputAs('geoshape');
      else if (r.classification?.output === 'box' || r.classification?.output === 'point') setOutputAs('point');
    } catch {
      setRec(null);
    }
  }, [instruction, intention, jurisdiction]);

  const setA = (k: string, v: string) => setAnchor((p) => ({ ...p, [k]: v }));
  const anchorOk = Object.values(anchor).every((v) => v.trim() !== '' && Number.isFinite(Number(v)));

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setDets(null); setCreated(null);
    if (file.size > MAX_BYTES) {
      setErr(`${t('visionCount.tooLarge')}: ${formatBytes(file.size)}`);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setImg({ dataUrl, name: file.name, size: file.size });
      // Evidência governada (MinIO + lineage) — não bloqueia o fluxo se falhar.
      Workshop.upload(appId, { data_url: dataUrl, original_filename: file.name, max_bytes: MAX_BYTES })
        .catch(() => undefined);
    } catch (e2) {
      setErr((e2 as Error)?.message ?? 'falha de leitura');
    }
  };

  const count = async () => {
    if (!img || !instruction.trim() || !anchorOk) return;
    setBusy('count'); setErr(null); setCreated(null);
    try {
      const out = await Compute.visionCount({
        image_url: img.dataUrl,
        instruction: instruction.trim(),
        capability,
        output_as: outputAs,
        ...(jurisdiction ? { jurisdiction } : {}),
        geo_bounds: {
          nw: { lat: Number(anchor.nw_lat), lng: Number(anchor.nw_lng) },
          se: { lat: Number(anchor.se_lat), lng: Number(anchor.se_lng) },
        },
      });
      setDets(out.detections.map((d) => ({ ...d, kept: true })));
      setProviderUsed(out.provider);
    } catch (e2) {
      setErr(humanizeApiError((e2 as Error)?.message ?? 'falha na contagem'));
    } finally {
      setBusy(null);
    }
  };

  const kept = (dets || []).filter((d) => d.kept);

  const confirm = async () => {
    if (!targetKind || kept.length === 0) return;
    setBusy('confirm'); setErr(null);
    try {
      // S2 — materializa polígono (geoshape) OU pino (geopoint) conforme a
      // saída escolhida; o tipo da property coage. Desacoplado do modelo.
      const items = kept.map((d, i) => ({
        nome: `${targetKind} ${i + 1}`,
        [geoProperty]: outputAs === 'geoshape' && d.geoshape ? d.geoshape : d.geopoint,
        ...(d.confidence != null ? { confianca: d.confidence } : {}),
      }));
      const out = await Ontology.bulkCreate(targetKind, items);
      setCreated(out.created);
      setDets(null);
      emit?.('value_change', { created: out.created, kind: targetKind, object_ids: out.object_ids });
    } catch (e2) {
      setErr(humanizeApiError((e2 as Error)?.message ?? 'falha na materialização'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="vision-count" className="border border-border-light bg-canvas-light p-3 space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-text-on-light">
        <ScanSearch className="w-4 h-4 text-primary" strokeWidth={1.5} /> {t('visionCount.title')}
      </div>

      {/* 1 — foto */}
      <input
        ref={inputRef}
        data-testid="vc-file"
        type="file"
        accept="image/*"
        onChange={onPick}
        disabled={busy !== null}
        className="block text-[12px] text-text-on-light file:mr-2 file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white file:cursor-pointer disabled:opacity-50"
      />

      {img && (
        <>
          {/* 2 — âncora NW/SE */}
          <div className="grid grid-cols-4 gap-2">
            {([
              ['nw_lat', t('visionCount.nwLat')],
              ['nw_lng', t('visionCount.nwLng')],
              ['se_lat', t('visionCount.seLat')],
              ['se_lng', t('visionCount.seLng')],
            ] as const).map(([k, label]) => (
              <label key={k} className="block space-y-1">
                <span className="text-[10px] text-muted-on-light">{label}</span>
                <input
                  data-testid={`vc-${k}`}
                  value={anchor[k]}
                  onChange={(e) => setA(k, e.target.value)}
                  placeholder="-23.55"
                  className={INP}
                  inputMode="decimal"
                />
              </label>
            ))}
          </div>

          {/* 3 — instrução (pede recomendação ao AIP ao sair do campo) + contar */}
          <div className="flex items-end gap-2">
            <label className="block space-y-1 flex-1">
              <span className="text-[10px] text-muted-on-light">{t('visionCount.instruction')}</span>
              <input
                data-testid="vc-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onBlur={suggest}
                placeholder={t('visionCount.instructionPh')}
                className={INP}
              />
            </label>
            <button
              type="button"
              data-testid="vc-count"
              onClick={count}
              disabled={busy !== null || !instruction.trim() || !anchorOk}
              className="h-8 px-3 text-[12px] bg-primary text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"
            >
              {busy === 'count' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <ScanSearch className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
              {t('visionCount.count')}
            </button>
          </div>

          {/* S4 — modelo recomendado pelo AIP (por intenção, não por provider) */}
          {rec?.recommended && (
            <div data-testid="vc-rec" className="border border-border-light bg-white px-2.5 py-2 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 text-text-on-light">
                <Cpu className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                <span className="font-semibold">{t('visionCount.recModel')}:</span>
                <span data-testid="vc-rec-model">{rec.recommended.label}</span>
                <span className="text-muted-on-light">· {rec.recommended.route} / {rec.recommended.provider_hint}</span>
              </div>
              {rec.tradeoffs?.[0] && <div className="text-muted-on-light">{rec.tradeoffs[0]}</div>}
              {rec.candidates.length > 1 && (
                <div className="text-muted-on-light">
                  {t('visionCount.recAlts')}: {rec.candidates.slice(1).map((c) => c.label).join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* Saída (desacoplada do modelo) + intenção de hospedagem */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="group" aria-label={t('visionCount.outputMode')}>
              <span className="text-[10px] text-muted-on-light mr-1">{t('visionCount.outputMode')}:</span>
              {(['point', 'geoshape'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`vc-out-${m}`}
                  onClick={() => setOutputAs(m)}
                  aria-pressed={outputAs === m}
                  className={'h-7 px-2.5 text-[11px] border ' +
                    (outputAs === m ? 'border-primary text-primary bg-primary/5' : 'border-border-light hover:border-primary')}
                >
                  {m === 'point' ? t('visionCount.outPoint') : t('visionCount.outPolygon')}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-on-light">{t('visionCount.hosting')}:</span>
              <select
                data-testid="vc-intention"
                value={intention}
                onChange={(e) => { setIntention(e.target.value as typeof intention); }}
                onBlur={suggest}
                className="h-7 px-1.5 text-[11px] bg-white border border-border-light"
              >
                <option value="">{t('visionCount.hostAuto')}</option>
                <option value="edge">{t('visionCount.hostEdge')}</option>
                <option value="shared">{t('visionCount.hostShared')}</option>
                <option value="dedicated">{t('visionCount.hostDedicated')}</option>
              </select>
            </label>
          </div>

          {/* 4 — revisão: foto + caixas clicáveis */}
          <div className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-testid="vc-image" src={img.dataUrl} alt={img.name} className="max-h-96 border border-border-light" />
            {(dets || []).map((d, i) => (
              <button
                key={i}
                type="button"
                data-testid={`vc-det-${i}`}
                title={d.kept ? t('visionCount.clickRemove') : t('visionCount.clickRestore')}
                onClick={() =>
                  setDets((p) => (p ? p.map((x, j) => (j === i ? { ...x, kept: !x.kept } : x)) : p))
                }
                className={
                  'absolute border-2 ' +
                  (d.kept ? 'border-primary bg-primary/10' : 'border-danger/50 bg-danger/5 opacity-50')
                }
                style={{
                  left: `${d.x_min * 100}%`,
                  top: `${d.y_min * 100}%`,
                  width: `${(d.x_max - d.x_min) * 100}%`,
                  height: `${(d.y_max - d.y_min) * 100}%`,
                }}
              />
            ))}
          </div>

          {dets && (
            <div className="flex items-center gap-3 text-[12px]" data-testid="vc-review">
              <span className="font-semibold text-text-on-light">
                {t('visionCount.found')}: {kept.length}
                {dets.length !== kept.length ? ` (${dets.length - kept.length} ${t('visionCount.removed')})` : ''}
              </span>
              {providerUsed && (
                <span className="text-[10px] font-mono text-muted-on-light">{providerUsed}</span>
              )}
              <button
                type="button"
                data-testid="vc-confirm"
                onClick={confirm}
                disabled={busy !== null || kept.length === 0 || !targetKind}
                className="h-8 px-3 text-[12px] bg-primary text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy === 'confirm' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                )}
                {t('visionCount.confirm')}
              </button>
              {!targetKind && (
                <span className="text-[11px] text-danger flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('visionCount.noKind')}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {created != null && (
        <p data-testid="vc-created" className="text-[12px] text-success flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
          {t('visionCount.created')}: {created} · {targetKind}
        </p>
      )}
      {err && (
        <p data-testid="vc-error" className="text-[12px] text-danger flex items-start gap-1.5" role="alert">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> <span>{err}</span>
        </p>
      )}
      {!img && (
        <p className="text-[11px] text-muted-on-light flex items-center gap-1.5">
          <X className="w-3.5 h-3.5 invisible" /> {t('visionCount.hint')}
        </p>
      )}
    </div>
  );
}

registerWidget('vision_count', VisionCountWidget, {
  group: 'data',
  label: 'Contagem por imagem',
  description:
    'Detecta e conta estruturas numa foto (provider registrado, jurisdição respeitada), o operador revisa as caixas e confirma — vira instâncias com localização no mapa.',
  icon: 'scan-search',
  defaultColSpan: 8,
  previewWidth: 520,
  mockConfig: { target_kind: 'estrutura', geo_property: 'localizacao' },
  mockVariables: {},
  config_schema: [
    {
      name: 'target_kind',
      label: 'Tipo de objeto',
      description: 'Instâncias confirmadas viram objetos deste tipo (com localização).',
      field: 'node-type',
    },
    {
      name: 'geo_property',
      label: 'Propriedade de localização',
      description: 'Nome da propriedade geopoint do tipo (padrão: localizacao).',
      field: 'string',
      default: 'localizacao',
    },
    {
      name: 'jurisdiction',
      label: 'Jurisdição exigida',
      description: 'Quando preenchida, só roteia a provedores elegíveis nessa jurisdição (ex.: BR).',
      field: 'string',
    },
  ],
});
