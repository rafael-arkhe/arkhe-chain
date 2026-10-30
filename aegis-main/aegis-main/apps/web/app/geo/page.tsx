'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PageShell } from '@/components/shell/page-shell';
import { PainelCamadas } from '@/components/geo/painel-camadas';
import { MapaCanvas } from '@/components/geo/mapa';
import { PainelDetalheGeo } from '@/components/geo/painel-detalhe';
import { GeoProvider, useGeo } from '@/components/geo/geo-context';
import { RequirePerm } from '@/components/auth/require-perm';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { MeContextApi } from '@/lib/api';
import { useContextClassification } from '@/lib/use-context-classification';
import { useT } from '@/lib/i18n/provider';
import { toast } from '@/components/ui/toast';

/**
 * Classificação e rótulo do /geo vêm de DADO, não de código:
 *  - nível = `banner.classification_default` da config do app-shell do
 *    tenant (a MESMA fonte que o banner do header usa pra sobrescrever o
 *    nível) — quando o tenant não configurou, default honesto 'restrito';
 *  - rótulo = Operação ativa do operador (GET /me/context.project_name;
 *    fallback organization_name) — a MESMA fonte dos slots do banner.
 */
/** Exportar PNG REAL — captura o canvas WebGL do Cesium e baixa. */
function ExportPngButton() {
  const { capturePngRef } = useGeo();
  const t = useT();
  const onExport = () => {
    const dataUrl = capturePngRef.current?.();
    if (!dataUrl) {
      toast.error(t('geo.toolbar.exportNotReady'));
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `mapa-operacional-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
  };
  return (
    <button
      type="button"
      data-testid="exportar-png"
      onClick={onExport}
      className="h-7 px-2.5 text-[11px] bg-raised-light border border-border-light hover:border-primary flex items-center gap-1.5"
    >
      <Download className="w-3 h-3" strokeWidth={1.5} /> {t('geo.toolbar.exportPng')}
    </button>
  );
}

function GeoPageInner() {
  const { level, label } = useContextClassification();
  const t = useT();
  return (
    <PageShell
      title={t('geo.title')}
      subtitle={t('geo.subtitle')}
      classification={level}
      classificationLabel={label}
      theme="light"
      toolbar={<ExportPngButton />}
    >
      {/* id usado pelo botão Maximizar do MapaCanvas — fullscreen
          cobre os 3 painéis (camadas + mapa + detalhe) juntos. */}
      <div
        id="geo-fullscreen-root"
        className="h-full flex overflow-hidden bg-canvas-light"
      >
        <PainelCamadas />
        <MapaCanvas />
        <PainelDetalheGeo />
      </div>
    </PageShell>
  );
}

export default function GeoPage() {
  return (
    <RequirePerm perm="security.geo.view">
      <GeoProvider>
        <GeoPageInner />
      </GeoProvider>
    </RequirePerm>
  );
}
