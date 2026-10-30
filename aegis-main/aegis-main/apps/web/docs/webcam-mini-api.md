# Webcam local → HLS (mini-API)

> Encapsula `/dev/video<N>` (UVC USB) em HLS via ffmpeg e expõe como uma câmera
> regular do intel-module, automaticamente visível em `/cameras` do security-app.

## Endpoints

Tudo abaixo de `POST /api/v1/cctv/webcam` (router `intel-module/src/api/webcam.py`).

| Método | Path | Função |
|---|---|---|
| `POST`   | `/api/v1/cctv/webcam` | inicia captura (`device`, `name`, `lat`, `lon`, `width`, `height`, `fps`) |
| `GET`    | `/api/v1/cctv/webcam` | lista capturas ativas |
| `DELETE` | `/api/v1/cctv/webcam/{slug}` | encerra ffmpeg e marca `CCTVStream.status = "offline"` |
| `GET`    | `/api/v1/cctv/webcam/{slug}/hls/index.m3u8` | playlist HLS |
| `GET`    | `/api/v1/cctv/webcam/{slug}/hls/{segment}` | segmento `.ts` |

## Como funciona internamente

1. `POST` valida `device` existe, gera `slug` (do nome), spawna `ffmpeg`:
   ```
   ffmpeg -f v4l2 -framerate {fps} -video_size {w}x{h} -i {device}
          -c:v libx264 -preset ultrafast -tune zerolatency
          -pix_fmt yuv420p -g {fps*2}
          -f hls -hls_time 2 -hls_list_size 6
          -hls_flags delete_segments+independent_segments
          -hls_segment_filename {WEBCAM_HLS_ROOT}/{slug}/seg_%05d.ts
          {WEBCAM_HLS_ROOT}/{slug}/index.m3u8
   ```
2. Aguarda até 5s o `index.m3u8` aparecer (significa que ffmpeg encodando).
3. Insere `CCTVStream` no Postgres com `url = "/api/v1/cctv/webcam/{slug}/hls/index.m3u8"`.
4. `GET /streams` agora inclui a webcam — o painel a exibe ao lado das câmeras de rodovia.

## Restrições

- Linux somente (v4l2). macOS: trocar `-f v4l2 -i /dev/videoN` por `-f avfoundation -i "<index>"`.
- ffmpeg precisa estar no container (presente no `Dockerfile` do intel-module).
- Cada captura consome 1 instância ffmpeg. Para múltiplas câmeras USB simultâneas, garanta CPU/GPU adequados (use `compose.gpu.yaml`).
- Pasta `WEBCAM_HLS_ROOT` (default `/tmp/aegis-webcam-hls`) precisa ser writable.

## Exemplo: ligar 2 webcams (uma para sala de operações, outra para guarita)

```bash
# Sala de operações
curl -X POST http://intel.tenant:8002/api/v1/cctv/webcam \
  -H "Content-Type: application/json" \
  -d '{
    "device": "/dev/video0",
    "name": "Sala de operações",
    "latitude": -23.5505,
    "longitude": -46.6333,
    "width": 1280, "height": 720, "fps": 15
  }'

# Guarita
curl -X POST http://intel.tenant:8002/api/v1/cctv/webcam \
  -H "Content-Type: application/json" \
  -d '{
    "device": "/dev/video1",
    "name": "Guarita Norte",
    "latitude": -23.5500,
    "longitude": -46.6328,
    "width": 1920, "height": 1080, "fps": 30
  }'
```

Listar:
```bash
curl http://intel.tenant:8002/api/v1/cctv/webcam
```

No painel, `/cameras` mostra ambas com o badge `LPR` (porque `detection_enabled=true`).

## Encerrando

```bash
curl -X DELETE http://intel.tenant:8002/api/v1/cctv/webcam/sala-de-operacoes
```
ffmpeg recebe `SIGINT`, finaliza limpo, e a câmera vira `status="offline"` (o painel mostra placeholder offline mas mantém o último frame).

## Bind do device no compose

`compose.gpu.yaml` já inclui:
```yaml
api:
  devices:
    - "/dev/video0:/dev/video0"
```
Para mais câmeras, adicione `/dev/video1`, `/dev/video2`, etc.

## Performance / latência

- HLS tem latência mínima de 6-10s (segmentos 2s × 3 acumulados antes do player começar).
- Para latência sub-segundo, troque para WebRTC ou RTSP (próximas iterações).
- `-tune zerolatency` + `-preset ultrafast` mantêm CPU baixo no encoder.

## Quando usar em vez de RTSP/Onvif

| Use webcam mini-API | Use RTSP gateway |
|---|---|
| Câmera USB conectada no host do intel-module | Câmera IP na LAN (Hikvision/Dahua/Axis) |
| Demo, sala de operações, sala-cofre | Produção: dezenas/centenas de câmeras |
| 1-4 streams | Centenas — use go2rtc/Frigate como gateway |

A mini-API é leve, pensada para até ~8 câmeras locais; acima disso, conecte RTSP/Onvif diretamente como uma URL em `POST /api/v1/cctv/streams`.
