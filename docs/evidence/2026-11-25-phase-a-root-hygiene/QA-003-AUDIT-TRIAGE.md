# QA-003 — Triagem de Advisories de Dependências (`cargo audit`)

Data: 25/11/2026  
Ferramenta: `cargo-audit-audit 0.22.1` (execução offline `--no-fetch`, base local com 1.509 advisories).  
Escopo: análise por artefato distribuído e alcançabilidade (`cargo tree --locked -i`) nos dois lockfiles ativos:
1. **Produto Alpha (`packaging/core/Cargo.lock`)** — workspace independente (`arkhe-provenance-mcp`, `arkhe-flow`, `arkhe-storage`, `arkhe-platform`, `arkhe-anonymize`).
2. **Monorepo Laboratório (`Cargo.lock` na raiz)** — 40 crates Rust (760 entradas no lockfile).

---

## 1. Produto Alpha (`packaging/core/Cargo.lock`) — **0 vulnerabilidades alcançáveis**

Comando executado: `cargo audit --file packaging/core/Cargo.lock --no-fetch --json`.  
Resultado bruto: 2 vulnerabilidades listadas no lockfile, 0 avisos.

| Advisory | Crate / Versão | Correção | Alcançável (`cargo tree --locked -i`) | Veredito |
|---|---|---|---|---|
| `RUSTSEC-2026-0459` (CVE-2026-119375) | `libsqlite3-sys 0.30.1` | `>=0.39.0` | **Não** (`nothing to print`) — presente no lockfile apenas como dependência opcional desabilitada de `sqlx` (driver SQLite) | **Não alcançável** nos binários do produto (`packaging/core` habilita apenas `postgres`) |
| `RUSTSEC-2023-0071` (Marvin Attack) | `rsa 0.9.10` | `>=0.10.0` | **Não** (`nothing to print`) — presente apenas por feature opcional não habilitada de `sqlx` (MySQL) | **Não alcançável** nos binários do produto |

**Pilha TLS ativa em `packaging/core`**: `rustls 0.23.46`, `rustls-webpki 0.103.17`, `webpki-roots 1.0.12` — **já atualizada e limpa** (0 advisories TLS).  
**Decisão para a versão Alpha (`Arkhe Verify`)**: os binários distribuídos de `packaging/core` não possuem nenhum advisory alcançável nesta data.

---

## 2. Monorepo Laboratório (`Cargo.lock` na raiz) — 28 vulnerabilidades + 8 avisos

Comando executado: `cargo audit --file Cargo.lock --no-fetch --json`.  
Resultado bruto: 28 vulnerabilidades e 8 avisos informativos (4 `unmaintained`, 4 `unsound`).

### Grupo A — Não alcançáveis no grafo ativo do workspace (`cargo tree --locked -i` sem retorno ou fora da plataforma alvo)

| Advisory | Crate / Versão | Motivo / Observação |
|---|---|---|
| `RUSTSEC-2023-0071` | `rsa 0.9.10` | Feature opcional inativa (`nothing to print`) |
| `RUSTSEC-2026-0525` | `libp2p-quic 0.11.1` | Feature/alvo não resolvido no grafo padrão (`nothing to print`) |
| `RUSTSEC-2026-0258` | `h2 0.3.27` | Não alcançável no grafo padrão (`nothing to print`) |
| `RUSTSEC-2025-0009`, `RUSTSEC-2025-0010` | `ring 0.16.20` | Não alcançável no grafo padrão (`nothing to print`) |
| `RUSTSEC-2026-0098`, `0099`, `0104`, `0382` | `rustls-webpki 0.101.7` | Não alcançável no grafo padrão (`nothing to print`); pilha ativa usa `0.103.15` |
| `RUSTSEC-2026-0383` | `webpki-root-certs 1.0.9` | Condicional de plataforma (`nothing to print` no grafo padrão) |
| `RUSTSEC-2026-0442` (`unsound`) | `arrow-data 60.0.0` | Ausente do grafo ativo (`did not match any packages`) |
| `RUSTSEC-2026-0486` (`unsound`) | `rustix 1.1.5` | `xattr` específico de Linux; não alcançável no alvo Windows |

### Grupo B — Alcançáveis na raiz e corrigíveis por atualização semver (backlog imediato do monorepo)

| Advisories | Crate / Versão | Versão corrigida | Crates do workspace que alcançam | Ação planejada |
|---|---|---|---|---|
| `RUSTSEC-2026-0346`, `0347`, `0348`, `0349` | `rustls 0.23.45` | `>=0.23.46` | `arkhe-ask`, `arkhe-bugbounty`, `arkhe-license-issuer`, `arkhe-ollama`, `arkhe-p2p`, `arkhe-runtime`, `arkhe-sql`, `arkhe-wormgraph`, `arkhe-verify-cli`, `arkhe-chain` (via `reqwest`, `sqlx`, `tokio-rustls`, `tough`, `ureq`) | Atualizar via `cargo update -p rustls -p rustls-webpki -p webpki-roots -p webpki-root-certs` assim que as alterações pendentes em `Cargo.lock`/`Cargo.toml` da working tree forem reconciliadas |
| `RUSTSEC-2026-0382` | `rustls-webpki 0.103.15` | `>=0.103.16` | Idem via `rustls 0.23.45` | Idem |
| `RUSTSEC-2026-0381` | `webpki-roots 1.0.9` | `>=1.0.10` | Idem via `hyper-rustls`, `reqwest`, `webpki-roots 0.26.11` | Idem |

> **Nota operacional**: o `Cargo.lock` da raiz não foi modificado nesta rodada porque a working tree contém adições locais ainda não commitadas do piloto `eth-sig-mcp` vinculadas a alterações locais em `Cargo.toml` de `arkhe-runtime` e `arkhe-verify-cli`. Atualizar o lockfile isoladamente quebraria builds `--locked` do HEAD.

### Grupo C — Alcançáveis apenas em módulos de laboratório / exigem upgrade major upstream

| Advisories | Crate / Versão | Correção upstream | Crates que alcançam | Mitigação e escopo |
|---|---|---|---|---|
| `RUSTSEC-2026-0119`, `0487`, `0489`, `0490`, `0491`, `0505`, `0511`, `0512`, `0514`, `0530`, `0531` | `hickory-proto 0.24.4`, `hickory-resolver 0.24.4` | `>=0.26.1` / `>=0.26.2` | `kernel/arkhe-chain` via `libp2p 0.54.1` -> `libp2p-dns 0.42.0` | Apenas laboratório de consenso `arkhe-chain`; não integra `packaging/core`. Upgrade exige atualização major de `libp2p` |
| `RUSTSEC-2026-0002`, `RUSTSEC-2026-0253` (`unsound`) | `lru 0.12.5` | Upstream `libp2p-swarm` | `kernel/arkhe-chain` via `libp2p-swarm 0.45.1` | Idem — restrito a `arkhe-chain` |
| `RUSTSEC-2026-0459` (CVE-2026-119375) | `libsqlite3-sys 0.30.1` | `>=0.39.0` (`rusqlite 0.41`) | `arkhe-crm-bridge`, `arkhe-kernel` (via `rusqlite 0.32.1`) | Conforme o advisory, exige abrir arquivo `.db`/`.wal` escrito por parte menos confiável; mitigado pela fronteira L1 de UID/permissões em `arkhe-native-control-lab`. Upgrade exige migração para `rusqlite 0.41` |
| `RUSTSEC-2026-0387` | `crypto-bigint 0.5.5` | `>=0.7.6` | `arkhe-runtime`, `arkhe-verify-cli`, `arkhe-wormgraph` via `k256 0.13.4` (`elliptic-curve 0.13.8`) | Usado na verificação de assinaturas públicas externas (Nostr/EIP-191), não em assinatura com chave privada de produção. Upgrade aguarda `k256`/`elliptic-curve 0.14` |
| `RUSTSEC-2024-0384`, `2025-0119`, `2024-0436` (`unmaintained`) | `instant 0.1.13`, `number_prefix 0.4.0`, `paste 1.0.15` | Transientes upstream | Monorepo raiz | Sem vulnerabilidade de segurança explorável associada; monitorar em upgrades de dependências diretas |
