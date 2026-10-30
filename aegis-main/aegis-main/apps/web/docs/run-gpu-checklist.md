# Checklist · rodar IA do `intel-module` no PC com GPU (Podman)

> Passo-a-passo do que o operador faz no PC com placa NVIDIA usando **Podman**,
> e o que o operador do `security-app` faz no PC que segura a UI.
>
> A AEGIS padroniza em Podman (rootless, sem daemon, melhor pra sala-cofre).
> Funciona tanto em Linux puro quanto em Windows + WSL2.

## 0. Pré-requisitos no PC GPU

Confirme cada item antes de seguir:

| Item | Como verificar |
|---|---|
| NVIDIA Driver R535+ | `nvidia-smi` mostra a placa |
| `podman ≥ 4.6` | `podman --version` |
| `podman-compose` | `podman-compose --version` ou `podman compose version` |
| `nvidia-container-toolkit` + CDI | `podman info \| grep -i cdi` lista `nvidia.com/gpu` |
| Porta `8002/TCP` livre | `ss -tlnp \| grep :8002` retorna vazio |

### Habilitar GPU via CDI no Podman (uma vez por host)

```bash
# Linux puro
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
podman info | grep -A2 "CDI"        # deve listar nvidia.com/gpu=all
```

Teste o GPU dentro de container:
```bash
podman run --rm --device nvidia.com/gpu=all \
  nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```
Tem que listar a placa.

Se algum item falhar, ajuste antes — sem CDI a stack sobe mas o `cctv-worker` cai pra CPU e LPR fica lento.

### 0.b · Windows + Podman Desktop (WSL2 backend) — passo a passo testado

Cenário validado em 2026-05-17 com `Podman Desktop 5.7.1` + `WSL 2.7.3` +
Fedora 43 podman-machine + driver NVIDIA Windows R582.28 + GTX 1050 Ti.

Diferença em relação ao Linux puro:
- Recursos da podman machine WSL **não** são alterados via `podman machine
  set --memory/--cpus` (WSL ignora). Use `.wslconfig` global do Windows.
- A GPU é exposta pelo driver Windows automaticamente via `/dev/dxg` mas o
  binário `nvidia-smi` fica em `/usr/lib/wsl/lib/` que **não está no PATH
  padrão** da podman-machine.
- O `nvidia-container-toolkit` precisa ser instalado **dentro** da podman
  machine, não no host Windows.

Sequência:

```powershell
# 1) Ajustar recursos da podman machine WSL (8 GiB + 6 CPUs recomendado)
@"
[wsl2]
memory=8GB
processors=6
swap=4GB
"@ | Out-File -Encoding ASCII $env:USERPROFILE\.wslconfig

wsl --shutdown
podman machine start
podman info | Select-String -SimpleMatch "memTotal","cpus"
# Esperado: memTotal ~8 GiB · cpus: 8 (ou mais)
```

```bash
# 2) Entrar na podman machine
podman machine ssh

# 3) Confirmar que o WSL expôs a GPU
ls /dev/dxg                      # tem que existir
ls /usr/lib/wsl/lib/nvidia-smi    # tem que existir
/usr/lib/wsl/lib/nvidia-smi       # tem que listar a placa
```

Se `/usr/lib/wsl/lib/nvidia-smi` lista a placa mas `nvidia-smi` puro
(sem path) reclama "command not found" → é só falta de PATH. Aplica:

```bash
# 4) Persistir /usr/lib/wsl/lib no PATH da podman machine
echo 'export PATH=/usr/lib/wsl/lib:$PATH' | sudo tee /etc/profile.d/wsl-gpu.sh
sudo chmod +x /etc/profile.d/wsl-gpu.sh
export PATH=/usr/lib/wsl/lib:$PATH
nvidia-smi                        # agora resolve sem path

# 5) Instalar nvidia-container-toolkit (Fedora 43)
curl -fsSL -o /tmp/nv.repo https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo
sudo mv /tmp/nv.repo /etc/yum.repos.d/nvidia-container-toolkit.repo
sudo dnf install -y nvidia-container-toolkit
```

> **Importante:** o `%post` do RPM dispara `nvidia-cdi-refresh` automaticamente
> e imprime `>>> Regenerating NVIDIA CDI specification...` — mas em WSL ele
> roda sem o PATH ajustado e **não gera `/etc/cdi/nvidia.yaml`**. Você precisa
> rodar o gerador manualmente:

```bash
# 6) Gerar CDI (precisa do PATH com nvidia-smi para descobrir libs)
sudo PATH=/usr/lib/wsl/lib:$PATH nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml

# Warnings benignos esperados (NÃO são erro):
#   WARN[0000] Ignoring error in locating libnvidia-sandboxutils.so.1: ...not found
#   WARN[0000] Failed to init nvsandboxutils: ERROR_LIBRARY_LOAD; ignoring
# Importante a linha final:
#   INFO[0000] Generated CDI spec with version 0.3.0
#   INFO[0000] Auto-detected mode as 'wsl'
#   INFO[0000] Selecting /dev/dxg as /dev/dxg

# 7) Confirma que o arquivo foi gerado
ls -la /etc/cdi/nvidia.yaml      # tem que existir, ~3-4 KB
head -20 /etc/cdi/nvidia.yaml    # cdiVersion: 0.3.0 + kind: nvidia.com/gpu

# 8) Sair da machine
exit
```

Validação no Windows:
```powershell
# 8) Smoke test do CDI
podman info | Select-String -SimpleMatch "CDI"
podman run --rm --device nvidia.com/gpu=all `
  docker.io/nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
# Tem que listar a placa
```

Pegadinhas comuns:

| Sintoma | Causa | Fix |
|---|---|---|
| `Cannot connect to Podman` | machine parada | `podman machine start` |
| `Error: new disk size must be larger than 100` | flag `--disk-size` aceita só aumentar | omitir o flag |
| `Error: changing CPUs not supported for WSL machines` | WSL ignora `--cpus`/`--memory` | configurar `~/.wslconfig` no Windows e `wsl --shutdown` |
| `nvidia-smi: command not found` na podman machine | `/usr/lib/wsl/lib` fora do PATH | passo 4 acima |
| `nvidia-ctk: failed to discover libs` | `nvidia-ctk` rodou sem PATH | rodar com `sudo PATH=/usr/lib/wsl/lib:$PATH nvidia-ctk ...` |
| `/etc/cdi/nvidia.yaml: No such file` após dnf install | `nvidia-cdi-refresh` no `%post` roda sem PATH e falha silenciosamente | passo 6 (rodar `nvidia-ctk cdi generate` manualmente) |
| `WARN[0000] Ignoring error in locating libnvidia-sandboxutils.so.1` | lib opcional, não distribuída no WSL | ignorar — CDI é gerado mesmo assim |
| `Status code: 404 ... copr.fedorainfracloud.org/results/packit/containers-podman-27732` | repo COPR antigo na podman machine | ignorar — `dnf` continua com o repo nvidia |
| GPU some após reboot do PC | `wsl --shutdown` força reinit | `podman machine start` |

## 1. Subir o `intel-module` no PC GPU

```bash
# 1.1) Clonar o repo
cd ~/Documents
git clone https://github.com/Safe-Core/aegis-intel-module.git intel-module
cd intel-module

# 1.2) Configurar .env (mesma convenção do compose.yaml CPU)
cp .env.example .env
# Edite .env e ajuste:
#   ONTOLOGY_URL=http://192.168.0.42:8002    ← IP real do PC do operador
#   ONTOLOGY_TOKEN=                           ← vazio se IAM não habilitado
#
# Linux: editar inline
sed -i 's|^ONTOLOGY_URL=.*|ONTOLOGY_URL=http://192.168.0.42:8002|' .env

# 1.3) Build + subir stack GPU
podman compose -f compose.gpu.yaml up -d --build
# (alternativa) podman-compose -f compose.gpu.yaml up -d --build

# 1.4) Verificar
podman compose -f compose.gpu.yaml ps                            # 4 serviços UP
curl http://localhost:8002/api/v1/health                          # 200
curl http://localhost:8002/api/v1/cctv/count                      # contagem

# 1.5) Semear as 2 câmeras SP-055 + SP-123
podman compose -f compose.gpu.yaml exec api python -m scripts.seed_security_streams
```

## 2. Descobrir o IP do PC GPU para passar ao operador

**Windows (PowerShell):**
```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object IPAddress, InterfaceAlias, PrefixOrigin
```

Saída esperada:
```
IPAddress     InterfaceAlias  PrefixOrigin
---------     --------------  ------------
192.168.0.42  Wi-Fi           Dhcp
```

Alternativa rápida: `ipconfig | findstr "IPv4"`.

**Linux:**
```bash
ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '^127\.'
# ou
hostname -I | awk '{print $1}'
```

**Use esse IP** (no exemplo: `192.168.0.42`). A porta é fixa: **8002**.

## 3. Abrir o firewall para a porta 8002

**Windows (PowerShell como Administrador):**
```powershell
New-NetFirewallRule -DisplayName "AEGIS intel-module 8002" `
  -Direction Inbound `
  -LocalPort 8002 `
  -Protocol TCP `
  -Action Allow `
  -Profile Private,Domain
```

Para remover depois:
```powershell
Remove-NetFirewallRule -DisplayName "AEGIS intel-module 8002"
```

**Linux (firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=8002/tcp
sudo firewall-cmd --reload
```

**Linux (ufw):**
```bash
sudo ufw allow 8002/tcp
```

## 4. Validar acesso da rede do operador

No PC do **operador** (não no GPU), abra um terminal:

```bash
# Substituir pelo IP capturado no passo 2
INTEL_GPU=192.168.0.42

# Teste 1 — health
curl -s http://$INTEL_GPU:8002/api/v1/health
# Esperado: { "status": "ok" } ou similar

# Teste 2 — count
curl -s http://$INTEL_GPU:8002/api/v1/cctv/count
# Esperado: { "total": 2, "online": 2 }

# Teste 3 — listar streams
curl -s http://$INTEL_GPU:8002/api/v1/cctv/streams | jq '.[].name'
# Esperado: 2 nomes (SP-055 e SP-123)
```

Se algum falhar:
- Tempo de espera (`curl --max-time 5`): pode estar bloqueado pelo firewall (volte ao passo 3)
- 404: stack não subiu (volte ao passo 1.3-1.4)
- Conexão recusada: IP errado ou serviço caído

## 5. Apontar o `security-app` para o PC GPU

No PC do operador:

```bash
cd <repo>/security-app
# editar .env.local
cat <<EOF >> .env.local
NEXT_PUBLIC_ONTOLOGY_API_URL=http://localhost:8002      # ontology-module local
NEXT_PUBLIC_INTEL_API_URL=http://192.168.0.42:8002      # intel-module no PC GPU
EOF
# reiniciar dev (ou rebuild se prod)
npm run dev
```

Abrir `http://localhost:3002/cameras`. A lista lateral deve mostrar as 2 câmeras
SP-055 e SP-123. Detecções LPR começam a chegar via webhook (`cctv-worker`
publica no `ontology-module` a cada placa lida).

## 6. Verificar o ciclo completo

No PC GPU, gere uma detecção sintética via webhook:

```bash
# Substitua pelo IP do operador
curl -X POST http://192.168.0.42:8002/api/v1/cctv/detections/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "stream_url": "https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8",
    "kind": "lpr",
    "label": "TESTE001",
    "confidence": 0.99,
    "t_start_ms": 1000,
    "t_end_ms": 2000,
    "bbox": [100, 100, 200, 200],
    "metadata": {"veiculo": "TESTE"}
  }'
```

Deve retornar `{ "id": "...", "linked_entity_id": "<uuid>" }`. Abrir
`/buscar` no security-app e procurar `TESTE001` — a entidade aparece.
Clicar nela abre a ficha (`/ficha/<uuid>`) com a observação registrada
e `Evidence` SHA-256 do payload.

## 7. Troubleshooting (Podman-específico)

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `nvidia.com/gpu=all` não encontrado | CDI não gerado | `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml` |
| `host.containers.internal` não resolve | Podman antigo ou rootless sem CNI plugins | já temos fallback `host.docker.internal` + `extra_hosts: host-gateway` no compose |
| Permission denied em volume com SELinux | falta `:z` (compartilhado) ou `:Z` (private) | já usamos `:z` / `:Z` no compose |
| Porta 8002 ocupada | outra stack rodando | `sudo lsof -i :8002` → `kill <pid>` |
| Detecções não chegam no ontology | `ONTOLOGY_URL` errado | `podman compose -f compose.gpu.yaml exec cctv-worker env \| grep ONTOLOGY` |
| Operador não enxerga o IP | mesma rede WiFi? VPN? | `ping <ip-gpu>` do operador deve responder |
| LPR sai com confidence baixa / CPU usage 100% | rodando em CPU porque GPU não foi exposta | confirmar `CCTV_WORKER_USE_GPU=1` e `podman logs <pod>-cctv-worker \| grep CUDA` |
| `Error: rootless network not supported` | precisa de `slirp4netns` | `sudo dnf install slirp4netns` (Fedora) / `apt install slirp4netns` (Debian/Ubuntu) |

## 8. Comandos úteis Podman

```bash
# Logs em tempo real
podman compose -f compose.gpu.yaml logs -f cctv-worker

# Reiniciar só o worker (após mudar ONTOLOGY_URL)
podman compose -f compose.gpu.yaml up -d --force-recreate cctv-worker

# Derrubar tudo
podman compose -f compose.gpu.yaml down

# Derrubar e zerar dados (cuidado: limpa Postgres)
podman compose -f compose.gpu.yaml down -v

# Shell dentro do api
podman compose -f compose.gpu.yaml exec api bash

# Ver se o cctv-worker está postando no ontology
podman compose -f compose.gpu.yaml logs cctv-worker | grep "\[ontology\]"
```

## 9. Resumo das variáveis

| Variável | PC GPU (`intel-module`) | PC operador (`security-app`) |
|---|---|---|
| `ONTOLOGY_URL` | `http://<ip-operador>:8002` | — |
| `ONTOLOGY_TOKEN` | (opcional) | — |
| `NEXT_PUBLIC_ONTOLOGY_API_URL` | — | `http://localhost:8002` |
| `NEXT_PUBLIC_INTEL_API_URL` | — | `http://<ip-gpu>:8002` (só para webcam mini-API) |
| `CCTV_WORKER_USE_GPU` | `1` | — |
