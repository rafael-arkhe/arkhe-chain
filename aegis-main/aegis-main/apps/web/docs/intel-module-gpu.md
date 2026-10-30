# intel-module em PC com GPU

> Como rodar o `intel-module` (CCTV + LPR + face-match + object) num host
> dedicado com placa NVIDIA, separado do `security-app`.

## Topologia

```
┌────────────────────────────┐          ┌────────────────────────────┐
│ PC do operador (CPU)       │          │ PC com GPU (Linux+NVIDIA)  │
│                            │          │                            │
│  security-app  :3002       │  HTTPS   │  intel-module  :8002       │
│  ontology-mod  :8002       │ ───────→ │  Postgres+PostGIS  :5433   │
│  (single-tenant local)     │          │  Redis  :6379              │
│                            │          │  MinIO  :9000/9001         │
│  NEXT_PUBLIC_INTEL_API_URL │          │  cctv-worker (GPU LPR)     │
│     = http://gpu-host:8002 │          │  + webcam USB /dev/video0  │
└────────────────────────────┘          └────────────────────────────┘
```

A LAN entre os dois hosts deve permitir TCP 8002 (HTTP HLS + REST) — abrir firewall.

## Pré-requisitos no host GPU

A AEGIS padroniza em **Podman** (rootless, sem daemon).

| Item | Como verificar |
|---|---|
| NVIDIA Driver R535+ | `nvidia-smi` mostra placa e versão |
| `nvidia-container-toolkit` (CDI) | `nvidia-ctk --version` |
| CDI gerado | `podman info \| grep -A2 CDI` lista `nvidia.com/gpu` |
| Podman ≥ 4.6 + compose | `podman --version` / `podman compose version` |
| Porta 8002 liberada | `ss -tlnp \| grep :8002` (deve ficar livre) |

Geração CDI (uma vez por host):
```bash
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
```

Teste rápido se a GPU está exposta:
```bash
podman run --rm --device nvidia.com/gpu=all \
  nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```
Deve listar a placa.

## Subir a stack

```bash
cd intel-module

# 1) Configurar .env (mesma convenção do compose.yaml CPU)
cp .env.example .env
# Edite .env e ajuste no mínimo ONTOLOGY_URL para o IP do PC do operador:
#   ONTOLOGY_URL=http://192.168.0.42:8002

# 2) build + start (CUDA via CDI)
podman compose -f compose.gpu.yaml up -d --build

# 3) verificar
curl http://localhost:8002/api/v1/health
curl http://localhost:8002/api/v1/cctv/count

# 4) semear câmeras SP-055 + SP-123 (2 streams reais)
podman compose -f compose.gpu.yaml exec api python -m scripts.seed_security_streams

# 5) opcional: ligar webcam USB local /dev/video0
curl -X POST http://localhost:8002/api/v1/cctv/webcam \
  -H "Content-Type: application/json" \
  -d '{"device":"/dev/video0","name":"GPU host · webcam","latitude":-23.55,"longitude":-46.63}'
```

## Apontar o security-app para o host GPU

No PC operador, em `security-app/.env.local`:
```
NEXT_PUBLIC_INTEL_API_URL=http://<ip-do-gpu-host>:8002
```
Reinicie o dev/build:
```bash
cd security-app
npm run dev
```
A página `/cameras` agora consome o intel-module remoto. Indicador `intel-module` (verde) aparece no canto superior direito da lista de streams quando a chamada `Intel.cctv.streams()` retorna live.

## Diferenças vs. `compose.yaml` (CPU)

| Aspecto | `compose.yaml` (CPU) | `compose.gpu.yaml` (Podman+GPU) |
|---|---|---|
| GPU | — | `devices: nvidia.com/gpu=all` (CDI) |
| `NVIDIA_VISIBLE_DEVICES` | — | `all` |
| `NVIDIA_DRIVER_CAPABILITIES` | — | `compute,utility,video` |
| LPR/face/object | CPU (lento) | GPU (real-time) |
| `cctv-worker.CCTV_WORKER_USE_GPU` | `0` | `1` |
| `cctv-worker.CCTV_WORKER_BATCH` | `1` | `4` |
| Portas Postgres/Redis/MinIO | `127.0.0.1` | `0.0.0.0` (LAN) |
| `/dev/video*` bind | não | sim (opcional, USB webcam) |
| Webhook ontology | — | `ONTOLOGY_URL=http://<ip-operador>:8002` |
| extra_hosts | — | `host.containers.internal:host-gateway` + fallback |
| SELinux | — | `security_opt: label=disable` + `:z` / `:Z` em volumes |

## Quando reiniciar

| Quando | Comando |
|---|---|
| Mudou `.env`/`ONTOLOGY_URL` | `podman compose -f compose.gpu.yaml up -d --force-recreate api collector cctv-worker` |
| Reseedar câmeras | `podman compose -f compose.gpu.yaml exec api python -m scripts.seed_security_streams` |
| Derrubar tudo | `podman compose -f compose.gpu.yaml down` |
| Derrubar e zerar dados | `podman compose -f compose.gpu.yaml down -v` |
| Ver logs do webhook ontology | `podman compose -f compose.gpu.yaml logs cctv-worker \| grep "\[ontology\]"` |

## Troubleshooting

| Sintoma | Diagnóstico | Fix |
|---|---|---|
| `intel-module` retorna 502/timeout no painel | host GPU offline ou firewall | `curl http://<gpu>:8002/api/v1/health` da máquina do operador |
| `nvidia.com/gpu=all` desconhecido | CDI não gerado | `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml` |
| `nvidia-smi` falha no container | toolkit não instalado | `apt install nvidia-container-toolkit && sudo nvidia-ctk cdi generate ...` |
| `host.containers.internal` não resolve | Podman antigo / rootless | já temos `extra_hosts: host.containers.internal:host-gateway` no compose |
| Permission denied em volume com SELinux | `:z`/`:Z` faltando | confira no compose; já está aplicado |
| Webcam não inicia ffmpeg | `/dev/video0` não montado | descomente em `devices:` do compose |
| LPR retorna confidence baixa | modelo CPU | confirmar `CCTV_WORKER_USE_GPU=1` e `nvidia-smi` mostrando GPU em uso |

## Segurança

- O host GPU expõe Postgres em `0.0.0.0:5433` e MinIO em `0.0.0.0:9000` para o operador acessar. Numa instalação real, restrinja por iptables ou rode atrás de VPN/Wireguard.
- O `cctv-worker` baixa modelos pré-treinados na primeira execução; em rede classificada, popule o cache `~/.cache/torch` em build-time.
- `WEBCAM_HLS_ROOT` é por padrão `/tmp/aegis-webcam-hls` — em produção, mude para volume persistente.
