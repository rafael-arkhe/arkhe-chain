# T3-G2 — Arquivos/imagens/vídeos via MinIO (upload real no documento)

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `security-app` + `ontology-module`

Os widgets de mídia (`figure`, `image`, `video_player`, `audio_player`,
`pdf_viewer`) numa seção de documento agora aceitam **upload real de arquivo →
MinIO**, em vez de URL manual.

## Por que não reusar o upload do Workshop

O upload existente (`POST /workshop/apps/{id}/uploads`) é preso a um **app** e
devolve **URL presignada com TTL de 5 min** — que **expira**. Inútil num documento
salvo/reaberto/transmitido/PDF. Por isso o documento ganhou upload próprio +
**serve estável**.

## Backend (`app/routers/platform_v23/notepad.py`)

- `POST /platform/v23/notepad/{doc_id}/uploads` — body `{data_url, original_filename?,
  max_bytes?}`. Gate: `_load(doc)` + perm `relatorios.edit`. Reusa os helpers MinIO do
  Workshop (`_parse_data_url`, `_ext_for`, `_put_object`, bucket `MINIO_BUCKET_WORKSHOP`),
  object_key `notepad/{doc_id}/{uuid}.{ext}`, cap 25 MB, `LineageEvent` (document.upload).
  Devolve `{object_key, content_type, bytes}` — o key é **estável**.
- `GET /platform/v23/notepad/{doc_id}/media?key=` — **serve estável** (stream do MinIO),
  gateado pelo doc (`_load` → tenant+markings+project) e pela **pertinência da chave**
  (`key` precisa começar com `notepad/{doc_id}/`; bloqueia traversal/cross-doc → 400).

## Frontend

- `Notepad.upload(docId, {data_url})` + `Notepad.mediaUrl(docId, objectKey)` (caminho
  de serve estável via proxy `/api`).
- `MediaUploadField` (`components/relatorios/widget-section.tsx`): file → `FileReader`
  data URL → `Notepad.upload` → grava a URL de serve no campo certo do widget
  (`figure/image/audio_player`→`url`, `video_player/pdf_viewer`→`source`) + `object_key`.
  Mostrado no `WidgetSectionEditor` para widgets de mídia (substitui o bind de ontologia).

## Verificação

- **tsc** limpo · **jest** 20/20 (sem regressão).
- **e2e** `relatorios-media-upload` (2): (1) upload → object_key `notepad/{id}/` +
  content_type/bytes; serve **200** image/png com bytes corretos; chave cross-doc → **400**;
  figura renderiza a mídia. (2) gesto do operador: Widget → Figura → Enviar arquivo →
  `<img src>` aponta pra `/media?key=`.

## Gaps remanescentes (T3-G3)

- **/m guest** + **PDF**: o serve exige auth do operador (proxy Bearer). Guest e o
  burn-in do PDF precisam de um caminho de mídia próprio (token-scoped / resolução
  server-side por object_key). Próximo.
- Re-presign não é necessário (serve é estável, não presignado).
