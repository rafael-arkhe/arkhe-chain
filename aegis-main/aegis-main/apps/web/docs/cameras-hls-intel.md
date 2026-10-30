
# `/cameras` — HLS via ontology-module (bridge para intel-module)

> Como o painel consome video stream do AEGIS SDK · contrato HLS · LPR e overlays AR.
>
> Ver também [`cctv-ontology-bridge.md`](./cctv-ontology-bridge.md) para o
> contrato detalhado do webhook que o `intel-module` (PC GPU) usa para
> publicar detecções no ontology.

## Quem produz, quem consome

```
┌───────────────────────────────────────────────┐
│         intel-module (FastAPI, port 8002)     │
│                                               │
│  GET  /api/v1/cctv/streams                    │  ← lista de câmeras
│  GET  /api/v1/cctv/streams/{id}               │
│  POST /api/v1/cctv/streams                    │  ← criar (concessionária / RTSP / HLS)
│  GET  /api/v1/cctv/streams/{id}/detections    │  ← LPR / face / object
│  GET  /api/v1/cctv/count                      │
│  POST /api/v1/cctv/webcam   (mini-API)        │  ← webcam USB local → HLS
└────────────────┬──────────────────────────────┘
                 │ HLS .m3u8 (HTTPS público da concessionária
                 │ ou /api/v1/cctv/webcam/{slug}/hls/index.m3u8)
                 ▼
┌───────────────────────────────────────────────┐
│           security-app (Next.js, port 3002)   │
│                                               │
│  /cameras — HlsPlayer (hls.js + native HLS)   │
│  + LprOverlay (SVG) lendo /detections          │
│  + StreamSwitcher (presets SP-XXX + custom)   │
└───────────────────────────────────────────────┘
```

## Endpoints utilizados (todos já existentes no intel-module)

Arquivo: `intel-module/src/api/cctv.py` · prefix `app.include_router(cctv.router, prefix="/api/v1/cctv")`.

| Método | Path | Função |
|---|---|---|
| `GET`    | `/streams` | lista paginada (filtros: `status`, `country`, `city`, `detection_enabled`) |
| `GET`    | `/streams/{id}` | detalhe |
| `POST`   | `/streams` | criar (concessionária / RTSP gateway / HLS direto) |
| `DELETE` | `/streams/{id}` | desativar |
| `GET`    | `/streams/{id}/detections` | últimas N detecções (LPR/face/object) |
| `GET`    | `/count` | total + online |
| `POST`   | `/scrape` | trigger do scraper público (não-rodovia) |

Cliente no `security-app`: `lib/api/intel.ts` (objeto `Intel.cctv`).

## Fluxo na UI

1. `useEffect` chama `Intel.cctv.streams()` → atualiza lista lateral.
2. Operador clica numa câmera → `setActiveUrl(stream.url)`.
3. `<HlsPlayer url={activeUrl} />` carrega:
   - **Safari/iOS** → `video.src = url` (HLS nativo).
   - **Chrome/Firefox** → `hls.js` import dinâmico, `Hls.loadSource(url)`.
4. `Intel.cctv.detections(stream.id, 50)` traz LPR/face/object.
5. `<LprOverlay detections={...}>` desenha bboxes em SVG sobre o vídeo.
6. Toggles AR · LPR · Face · Objeto controlam o que aparece no overlay.

## Trocador de stream (StreamSwitcher)

Componente: `components/cameras/stream-switcher.tsx`.

- **Presets** carregados (todos no host `34.104.32.249.nip.io`, HLS ao vivo validado em 2026-05-17):
  - `sp055-110a` — SP-055 · Rio-Santos · KM 110 · Sentido A (Bertioga/SP)
  - `sp055-110b` — SP-055 · Rio-Santos · KM 110 · Sentido B (Bertioga/SP)
  - `sp123-026b` — SP-123 · Rodovia dos Tamoios · KM 26 · Sentido B (Litoral → Capital)
- **Custom**: operador digita o código (`SP{XXX}-KM{XXX}{A|B}`) + host (default `34.104.32.249.nip.io`), clica **Conectar** → o player tenta carregar.
- Outras câmeras IP / RTSP: adicionar via `POST /api/v1/cctv/streams` ou via webcam mini-API (ver `webcam-mini-api.md`).

Padrão de URL detectado em campo:
```
https://{host}/SP{XXX}-KM{XXX}{A|B}/stream.m3u8
```

Concessionárias diferentes mantêm padrões similares (geralmente IDs estilo `KM{XXX}{A|B}`); o host muda. Operador pode colar o host fornecido pela concessionária diretamente.

## Webcam local USB (mini-API)

Endpoint: `intel-module/src/api/webcam.py` · mount `POST /api/v1/cctv/webcam`.

Captura `/dev/video<N>` (UVC), encapsula em HLS via ffmpeg e cria entrada CCTVStream automaticamente, então a câmera aparece em `Intel.cctv.streams()` exatamente como qualquer outra.

```bash
# Inicia
curl -X POST http://intel.tenant:8002/api/v1/cctv/webcam \
  -H "Content-Type: application/json" \
  -d '{
    "device": "/dev/video0",
    "name": "Sala de operações · webcam principal",
    "latitude": -23.5505,
    "longitude": -46.6333,
    "width": 1280,
    "height": 720,
    "fps": 15,
    "detection_enabled": true
  }'
# → { "slug": "sala-de-operacoes-webcam-principal", "stream_id": 42,
#     "url": "/api/v1/cctv/webcam/sala-de-operacoes-webcam-principal/hls/index.m3u8" }
```

Stops:
```bash
curl -X DELETE http://intel.tenant:8002/api/v1/cctv/webcam/sala-de-operacoes-webcam-principal
```

Restrições:
- Linux (v4l2). macOS requer ajuste para `-f avfoundation` no ffmpeg.
- ffmpeg já está no `Dockerfile` do intel-module.
- Pasta `WEBCAM_HLS_ROOT` (default `/tmp/aegis-webcam-hls`) precisa ser writable.

Para o player consumir, basta apontar para a URL retornada — o painel não distingue webcam de rodovia.

## Seed dos 2 streams de exemplo

```bash
cd intel-module
INTEL_BASE=http://localhost:8002 python -m scripts.seed_security_streams
```

Output esperado:
```
[seed] target = http://localhost:8002
[seed] OK id=1 · Demonstração HLS · validação do player + AR/LPR
[seed] OK id=2 · SP-123 · Tamoios · KM 26 · Sentido B (Litoral → Capital)
[seed] done
```

Depois disso, `Intel.cctv.streams()` retorna as 2 câmeras com `detection_enabled=true`. O `cctv-worker` (background) consome os streams e popula `/streams/{id}/detections` com LPR.

## Quando o intel-module está offline

`lib/api/intel.ts` exporta `FALLBACK_INTEL_STREAMS` com as 2 câmeras SP-123 + `FALLBACK_INTEL_DETECTIONS` com 5 detecções mock. A página `/cameras` chama `Intel.cctv.streams().then(...).catch(...)` — em catch usa o fallback. O operador ainda vê o player real (URLs HLS funcionam mesmo sem o intel-module, pois apontam para o servidor público da concessionária).

## Configuração de ambiente

`.env.local` do security-app:
```
NEXT_PUBLIC_INTEL_API_URL=http://intel.tenant:8002
# Quando intel-module está em outro host (PC GPU):
# NEXT_PUBLIC_INTEL_API_URL=http://192.168.0.42:8002
```

## Referências

- intel-module routers: `intel-module/src/api/cctv.py`, `intel-module/src/api/webcam.py`
- intel-module schemas: `intel-module/src/schemas/cctv.py`
- intel-module models (Postgres + PostGIS): `intel-module/src/models/cctv.py`
- Player no security-app: `security-app/components/cameras/hls-player.tsx`
- Overlay AR: `security-app/components/cameras/lpr-overlay.tsx`
- Trocador: `security-app/components/cameras/stream-switcher.tsx`
- Página: `security-app/app/cameras/page.tsx`
