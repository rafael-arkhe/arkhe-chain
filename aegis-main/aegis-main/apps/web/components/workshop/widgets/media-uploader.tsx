'use client';

/**
 * Media Uploader — E5 do V1 visão→georref→mapa (porte do web-app).
 *
 * File picker genérico: lê o arquivo como data URL, mostra preview inline
 * (imagem/áudio/vídeo/pdf) e no Enviar pré-processa os bytes via
 * `/workshop/apps/{id}/uploads` (MinIO governado + lineage). A URL presignada
 * devolvida é o que a Ação configurada recebe — não o data URL cru.
 * Multi-domínio: o widget não sabe O QUE é o arquivo; isso é dado.
 */
import * as React from 'react';
import { FileUp, Loader2, X } from 'lucide-react';

import { registerWidget, type WidgetRenderProps } from '@/components/workshop/WorkshopV2Renderer';
import { useT } from '@/lib/i18n/provider';
import { Workshop } from '@/lib/workshop/client';
import { humanizeApiError } from '@/lib/workshop/missing-inputs';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

type Picked = { dataUrl: string; name: string; size: number; type: string };

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('FileReader retornou resultado não-string'));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader falhou'));
    reader.readAsDataURL(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaUploaderWidget({ appId, config, emit }: WidgetRenderProps) {
  const t = useT();
  const accept = typeof config.accept === 'string' ? config.accept : undefined;
  const maxBytes = Math.max(1, Number(config.max_bytes) || DEFAULT_MAX_BYTES);
  const submitActionId = typeof config.submit_action_id === 'string' ? config.submit_action_id : '';
  const paramName = typeof config.submit_param_name === 'string' && config.submit_param_name
    ? config.submit_param_name : 'file_data_url';

  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null); setDone(null);
    if (file.size > maxBytes) {
      setError(`${t('mediaUploader.tooLarge')}: ${formatBytes(file.size)} > ${formatBytes(maxBytes)}`);
      if (inputRef.current) inputRef.current.value = '';
      setPicked(null);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setPicked({ dataUrl, name: file.name, size: file.size, type: file.type });
    } catch (err) {
      setError((err as Error)?.message ?? 'falha de leitura');
    }
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true); setError(null);
    try {
      const up = await Workshop.upload(appId, {
        data_url: picked.dataUrl,
        original_filename: picked.name,
        max_bytes: maxBytes,
      });
      if (submitActionId) {
        await Workshop.invokeAction(appId, submitActionId, {
          params: { [paramName]: up.url, file_object_key: up.object_key, original_filename: picked.name },
        });
      }
      setDone(t('mediaUploader.sent'));
      emit?.('value_change', { upload_url: up.url, object_key: up.object_key, name: picked.name });
    } catch (err) {
      setError(`${t('mediaUploader.failed')}: ${humanizeApiError((err as Error)?.message ?? '')}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setPicked(null); setError(null); setDone(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div data-testid="media-uploader" className="border border-border-light bg-canvas-light p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          data-testid="media-uploader-input"
          type="file"
          accept={accept}
          onChange={onChange}
          disabled={busy}
          className="block text-[12px] text-text-on-light file:mr-2 file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-white file:cursor-pointer disabled:opacity-50"
        />
        {picked && (
          <>
            <button type="button" data-testid="media-uploader-submit" onClick={submit} disabled={busy}
              className="h-8 px-3 text-[12px] bg-primary text-white font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2} /> : <FileUp className="w-3.5 h-3.5" strokeWidth={1.5} />}
              {t('mediaUploader.send')}
            </button>
            <button type="button" data-testid="media-uploader-clear" onClick={clear} disabled={busy}
              className="h-8 px-2.5 text-[12px] border border-border-light hover:border-primary flex items-center gap-1">
              <X className="w-3.5 h-3.5" strokeWidth={1.5} /> {t('common.cancel')}
            </button>
          </>
        )}
      </div>
      {error && <p data-testid="media-uploader-error" className="text-[12px] text-danger" role="alert">{error}</p>}
      {done && <p data-testid="media-uploader-done" className="text-[12px] text-success">{done}</p>}
      {picked && picked.type.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-testid="media-uploader-preview" src={picked.dataUrl} alt={picked.name}
          className="max-h-72 w-full border border-border-light object-contain" />
      )}
      {picked && !picked.type.startsWith('image/') && (
        <p data-testid="media-uploader-preview" className="text-[12px] text-muted-on-light">
          {picked.name} · {formatBytes(picked.size)}
        </p>
      )}
    </div>
  );
}

registerWidget('media_uploader', MediaUploaderWidget, {
  group: 'content',
  label: 'Enviar arquivo',
  description: 'Seleciona um arquivo, mostra preview e envia governado (evidência com lineage). Opcional: dispara uma Ação com a URL.',
  icon: 'file-up',
  defaultColSpan: 6,
  mockConfig: { accept: 'image/*' },
  mockVariables: {},
});
