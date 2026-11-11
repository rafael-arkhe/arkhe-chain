# Arkhe Testnet Specification & Operator Guide

Este documento define a arquitetura, topologia segura de consenso e procedimentos operacionais para a Testnet da rede **Arkhe**.

---

## 1. Topologia Segura de Consenso (BFT 3f + 1)

O protocolo de consenso de `arkhe-chain` implementa commit BFT onde:
$$\text{votos} \times 3 > \text{validadores} \times 2$$

Ou seja, para que um bloco seja confirmado em uma determinada rodada, é estritamente necessário quórum superior a dois terços ($> \frac{2}{3}$) dos validadores registrados no gênese.

| Número de Validadores ($N$) | Falhas Toleradas ($f$) | Quórum Mínimo Requerido | Tolerância a Falhas |
| :---: | :---: | :---: | :---: |
| 1 | 0 | 1 (100%) | Nenhuma (ponto único de falha) |
| 2 | 0 | 2 (100%) | Nenhuma (qualquer queda impede quórum) |
| 3 | 0 | 3 (100%) | Nenhuma ($2 \times 3 = 6 \not> 3 \times 2$) |
| **4** | **1** | **3 (75%)** | **Tolerância bizantina segura ($3 \times 3 = 9 > 4 \times 2 = 8$)** |
| 7 | 2 | 5 (71.4%) | Tolera 2 falhas simultâneas |

Portanto, a configuração canônica mínima e segura para a testnet é de **4 nós validadores**, permitindo que a rede continue progredindo mesmo se um nó falhar, reiniciar ou agir de forma adversária.

---

## 2. Estrutura do Esqueleto do Repositório (`testnet/`)

A pasta `testnet/` reúne todos os arquivos de configuração, chaves e orquestração:

```text
testnet/
├── docker/
│   └── Dockerfile            # Containerização do nó arkhe-chain
├── environments/             # Variáveis de ambiente por validador
│   ├── val1.env
│   ├── val2.env
│   ├── val3.env
│   ├── val4.env
│   └── observer.env
├── keys/                     # Pares de chaves gerados para a testnet
│   ├── val1.{key,pub}        # Validador 1 (Ed25519)
│   ├── val2.{key,pub}        # Validador 2 (Ed25519)
│   ├── val3.{key,pub}        # Validador 3 (Ed25519)
│   ├── val4.{key,pub}        # Validador 4 (Ed25519)
│   ├── observer.{key,pub}    # Nó Observador / RPC
│   └── faucet_mldsa.*        # Conta Faucet com ML-DSA-65 pós-quântico
├── systemd/
│   └── arkhe-node@.service   # Unit template para Linux systemd
├── docker-compose.yml        # Orquestração multicontêiner dos 4 validadores + observer
├── genesis.txt               # Definição canônica do bloco gênese
└── peers.txt                 # Lista de peers semente e fingerprint BLAKE3
```

---

## 3. Chaves Criptográficas Híbridas e Pós-Quânticas

Todo nó validador e participante da rede segue o modelo criptográfico híbrido de Arkhe:
- **Validadores:** Chaves clássicas Ed25519 (32 bytes em hexadecimal), que geram identificadores de peer libp2p canônicos (`12D3KooW...`).
- **Contas de Usuário / Faucet (`genesis-alloc`):**
  - Chave pública Ed25519 (32 bytes).
  - Chave pública pós-quântica **ML-DSA-65 (FIPS 204)** (1952 bytes em hexadecimal).
  - Qualquer transação requer assinatura Ed25519 e assinatura ML-DSA-65 (3309 bytes).

---

## 4. Guia de Operação

### 4.1. Verificação do Gênese e Pares

Para auditar o hash do gênese antes de subir qualquer nó:
```bash
cargo run --bin arkhe-chain -- --show-genesis --genesis testnet/genesis.txt
```
Saída esperada:
```text
validators 4
accounts 1
blake3 3d551f83d7bedb51c9ca365df2d9d89619386fe93306cb19419eaf9bcb619d1f
```

Para listar os Peer IDs dos validadores:
```bash
cargo run --bin arkhe-chain -- --show-peers --genesis testnet/genesis.txt
```

### 4.2. Inicialização Local Rápida

Utilize os scripts automatizados fornecidos na pasta `scripts/`:

1. **Inicializar bases de dados:**
   ```bash
   bash scripts/init_testnet.sh
   ```

2. **Iniciar os 4 nós validadores em background:**
   ```bash
   bash scripts/run_local_testnet.sh
   ```

3. **Inspecionar status da rede:**
   ```bash
   bash scripts/check_status.sh
   ```

4. **Parar a testnet local:**
   ```bash
   bash scripts/stop_testnet.sh
   ```

### 4.3. Execução via Docker Compose

Para rodar toda a testnet em ambiente isolado via Docker:
```bash
cd testnet
docker-compose up -d
docker-compose logs -f
```

### 4.4. Execução Bare-metal / Systemd

1. Copie o binário `arkhe-chain` para `/usr/local/bin/`.
2. Instale o serviço `testnet/systemd/arkhe-node@.service` em `/etc/systemd/system/`.
3. Instale os arquivos `.env` em `/etc/arkhe/testnet-val1.env`, etc.
4. Habilite e inicie as instâncias:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now arkhe-node@val1
   sudo systemctl enable --now arkhe-node@val2
   sudo systemctl enable --now arkhe-node@val3
   sudo systemctl enable --now arkhe-node@val4
   ```
