# CCTV ↔ Ontologia · ponte de eventos

> Todo stream HLS e toda detecção (LPR / face / objeto) passa pelo
> `ontology-module` antes de chegar na UI do `security-app`. Isso garante
> que a placa lida agora aparece automaticamente em **Buscar**, **Ficha**,
> **Rede**, **Alertas** e na **Linha do tempo** do **Início**.

## Fluxo end-to-end

```
   ┌───────────────────────────────────────────────────────────────┐
   │                          PC com GPU                            │
   │                                                                │
   │   intel-module · uvicorn :8002                                 │
   │   │                                                            │
   │   ├─ /api/v1/cctv/streams (Postgres local)                    │
   │   ├─ cctv-worker  ── consome HLS/RTSP                         │
   │   │      │                                                     │
   │   │      ├─ LPR/face/object detection (GPU)                   │
   │   │      └─ services.ontology_publisher  ──┐                  │
   │   └─ webcam.py    (mini-API /dev/video0)    │                  │
   └─────────────────────────────────────────────┼──────────────────┘
                                                 │ HTTPS POST
                                                 ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                       PC do operador                           │
   │                                                                │
   │   ontology-module · uvicorn :8002                              │
   │   │                                                            │
   │   ├─ POST /api/v1/cctv/detections/ingest                       │
   │   │     ↳ cria Entity(kind="lpr_plate"/"face_match"/...)       │
   │   │     ↳ cria EntityLink(stream → detection, rel="observed")  │
   │   │     ↳ cria Evidence(payload_sha256, source_tool)           │
   │   │     ↳ se placa existe como Entity(kind="veiculo")          │
   │   │        cria EntityLink rel="lpr_match" cross-tipo          │
   │   ├─ GET  /api/v1/cctv/streams          (list)                 │
   │   ├─ GET  /api/v1/cctv/streams/{id}/detections                 │
   │   ├─ GET  /api/v1/cctv/lpr/{placa}/observations                │
   │   └─ GET  /api/v1/cctv/count                                   │
   │                                                                │
   │   security-app · next :3002                                    │
   │   └─ lib/api/cctv.ts  ── consome SÓ o ontology-module          │
   └───────────────────────────────────────────────────────────────┘
```

## Modelo no ontology

Reusa as 3 tabelas já existentes em `ontology-module/app/models/entities.py`:

| Tabela | Linha por |
|---|---|
| `entities` | 1 por stream (`kind="cctv_stream"`) + 1 por placa única (`kind="lpr_plate"`) + 1 por face (`kind="face_match"`) + 1 por obj (`kind="object_det"`) |
| `entity_links` | stream → detection (`rel="observed"`, `properties={t_start_ms, bbox, kind}`) e, quando aplicável, detection → veículo (`rel="lpr_match"`) |
| `evidence` | payload bruto do `intel-module` com `payload_sha256` (auditoria + cadeia de custódia) |

Vantagem: o operador busca uma placa em `/buscar`, abre a ficha, e
naturalmente vê quando e onde foi observada — sem tabelas paralelas.

## Endpoints (`/api/v1/cctv`)

| Método | Path | Função |
|---|---|---|
| `GET`    | `/streams` | Lista streams (filtros `status`, `city`, `detection_enabled`, `limit`) |
| `GET`    | `/streams/{id}` | Detalhe |
| `POST`   | `/streams` | Upsert (idempotente por URL) |
| `DELETE` | `/streams/{id}` | Soft-delete (marca `status="offline"`) |
| `GET`    | `/streams/{id}/detections` | Últimas N detecções vinculadas |
| `POST`   | `/detections/ingest` | **Webhook** do `intel-module` |
| `GET`    | `/lpr/{plate}/observations` | Cruzamento por placa (todas câmeras, todo tempo) |
| `GET`    | `/count` | `{ streams_total, streams_online, detections_total }` |

## Webhook · contrato `POST /detections/ingest`

```json
{
  "stream_url": "https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8",
  "kind": "lpr",
  "label": "ABC1D23",
  "confidence": 0.96,
  "t_start_ms": 53121000,
  "t_end_ms": 53122500,
  "bbox": [620, 380, 740, 430],
  "metadata": { "veiculo": "GM/ONIX BR" },
  "source_tool": "intel-module/cctv-worker",
  "tool_version": "0.4.1"
}
```

Resposta:
```json
{
  "id": "9f2c…",
  "stream_id": "1a3e…",
  "kind": "lpr",
  "label": "ABC1D23",
  "confidence": 0.96,
  "t_start_ms": 53121000,
  "t_end_ms": 53122500,
  "bbox": [620, 380, 740, 430],
  "metadata": { "veiculo": "GM/ONIX BR" },
  "detected_at": "2026-05-17T14:42:01Z",
  "linked_entity_id": "8d11…"
}
```

`linked_entity_id` é o ID da `Entity(kind="lpr_plate")`. O `security-app` usa
esse ID para abrir a ficha quando o operador clica numa detecção.

## Cliente `security-app/lib/api/cctv.ts`

```ts
import { Cctv } from '@/lib/api/cctv';

const streams = await Cctv.streams.list();
const det = await Cctv.streams.detections(stream.id, 50);
const obs = await Cctv.lpr.observations('ABC1D23');
const total = await Cctv.count();
```

Variável de ambiente:
```
NEXT_PUBLIC_ONTOLOGY_API_URL=http://localhost:8002   # PC do operador
```

Fallback offline: `FALLBACK_CCTV_STREAMS` e `FALLBACK_CCTV_DETECTIONS` —
mesmas 2 câmeras reais SP-055 KM110A e SP-123 KM026B.

## Configuração no intel-module (PC GPU)

`intel-module/.env` (ou compose `environment:`):
```
ONTOLOGY_URL=http://192.168.0.42:8002       # IP do operador na LAN
ONTOLOGY_TOKEN=                              # opcional, se IAM habilitado
ONTOLOGY_TIMEOUT=5
```

`src/services/ontology_publisher.py` é fire-and-forget: se o ontology
estiver offline, loga warning e o cctv-worker segue (não pode bloquear
captura). Quando voltar, próximas detecções recomeçam a chegar.

## Ligando o cctv-worker existente ao publisher

Em `intel-module/src/workers/cctv_worker.py`, após cada detecção:

```python
from src.services.ontology_publisher import publish_detection

async def on_detection(stream, det):
    # ... persistência local existente ...
    await publish_detection(
        stream_url=stream.url,
        kind=det.kind,              # "lpr" | "face" | "object"
        label=det.label,
        confidence=det.confidence,
        t_start_ms=det.t_start_ms,
        t_end_ms=det.t_end_ms,
        bbox=det.bbox,
        metadata=det.metadata,
    )
```

## Cenário operacional

1. Operador olha `/cameras` no security-app
2. cctv-worker no PC GPU detecta placa `ABC1D23` no SP-055 KM110A
3. Publisher faz `POST` no ontology · cria `Entity(kind="lpr_plate", display="ABC1D23")` + `EntityLink` ao stream
4. Frontend faz poll de `Cctv.streams.detections(streamId)` a cada 5s e renderiza no painel direito
5. Operador clica em "LPR · ABC1D23" → router navega para `/ficha/<entity_id>`
6. Ficha já existe na ontologia com:
   - histórico de observações (`/api/v1/cctv/lpr/ABC1D23/observations`)
   - vínculos cruzados (se a placa já tinha `Entity(kind="veiculo")`, aparece como `rel="lpr_match"`)
   - evidence com `payload_sha256` para cadeia de custódia
7. Em paralelo: alerta automático (`/alertas`) dispara se a placa tem mandado em aberto, e o pino aparece em `/geo` na coordenada do stream
