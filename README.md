# Arkhe Environment

Monorepo do ambiente Arkhe: kernel, cognição, governança, evidência persistente,
verificação, aplicações e adapters seguem uma arquitetura comum na raiz.

| Pasta | Responsabilidade |
|---|---|
| `kernel/` | Identidade canônica, contratos e ContainmentGate |
| `cognition/` | Módulos substituíveis que produzem WER, sem autoridade de escrita |
| `governance/`, `work/` | Resolução de política, pedidos e dados privados |
| `evidence/`, `orchestration/` | WormGraph, memória e runtime HTTP |
| `storage/sql/` | Única sequência de migrações PostgreSQL, RLS e append-only |
| `verification/` | Verificador puro, CLI, WASM e golden vectors de artefatos |
| `integrations/` | MCP de verificação, health scaffold e ponte Cosign |
| `integration/` | Providers Rust (Ollama) e integração de bug bounty |
| `apps/` | Interfaces preflight e laboratório melódico |
| `plugins/paybox/` | Pacote isolado, com contrato e lockfile próprios preservados |
| `specs/`, `docs/`, `design/` | Especificações, decisões e referências visuais |
| `archive/` | Snapshots P0/Phase A e manifests antigos, fora do build ativo |

[Arquitetura e limites](docs/ARCHITECTURE.md) · [Estado verificado](docs/STATUS.md) ·
[Registro de componentes](config/architecture.json) · [Mapa da reorganização](docs/architecture/moves.json)

O primeiro [fluxo de saída com certificado aritmético](docs/PROOF-CARRYING-BUDGET.md)
tem produtor e checker separados, integração opt-in ao gate e exemplo offline.
A [auditoria das cinco camadas](docs/audits/2026-10-22-five-layer-external-and-code-audit.md)
separa fontes externas verificadas, capacidades locais e hipóteses sobre AGI.

A [reconciliação de 118 features e lacunas P0](docs/backlog/README.md) mapeia
fontes, testes, prioridades e dependências dos dois workspaces. Inclui os novos
[predicados SPDX/AP2 e broker opcional](docs/FORMAL-PREDICATES.md), com limites de
qualificação explícitos e [resultados locais](docs/evidence/2026-10-22-feature-backlog/RESULTS.md).

## Comandos a partir da raiz

```powershell
python scripts/check_architecture.py
cargo check --workspace --locked
cargo test --workspace --locked
pnpm install --frozen-lockfile
pnpm build:apps
pnpm verify:wasm
pnpm build:adapters
pnpm test:adapters
python scripts/live_runtime.py up
```

O runtime usa a VM Podman `arkhe-runtime`. Para Docker, acrescente `--engine docker`.
O provisionamento executa os gates antes de publicar a API local e conserva o
volume PostgreSQL existente. [Operação e autenticação](docs/LIVE-RUNTIME.md).

Há um Cargo.lock e um pnpm-lock.yaml para o código ativo. O Paybox preserva o
seu pacote congelado e toolchain própria; não é absorvido pelo workspace Node.
Aplicações são superfícies independentes e adapters não recebem autoridade do
kernel. A política de desenvolvimento do runtime rejeita ações protegidas.

O perfil explícito de [admissão de preview Rust](docs/PREVIEW-ADMISSION.md) verifica
receipts do supervisor e revisão humana com chaves separadas, passa pelo gate e
grava admissão/outbox PostgreSQL atomicamente. O CLI `arkhe-preview` verifica ou
enfileira. O [worker e o cockpit](docs/PREVIEW-EXECUTION.md) incluem leases, fencing
e recuperação; iniciar código exige qualificação externa assinada do perfil exato.

## Ollama local

O provider usa o Ollama instalado nesta máquina e o modelo já disponível,
`north-mini-code-1.0:latest`. A configuração e o digest aprovado ficam em
[config/ollama.json](config/ollama.json).

```powershell
python scripts/ollama.py status
python scripts/ollama.py chat "Explique o fluxo de evidência do Arkhe."
python scripts/ollama.py triage report.json High Triaged
```

O launcher reutiliza o servidor local ou inicia o executável instalado em segundo
plano. O provider também implementa `LlmAnalyzer` no módulo de bug bounty. Respostas
continuam sendo propostas: assinatura, admissão e política permanecem separadas.
[Uso e limites](integration/arkhe-ollama/README.md).

## Arkhe-Intra fullstack

As telas de `design/stitch` estão implementadas em `apps/arkhe-intra`, com API,
SQLite local, sessões, papéis, assinaturas Ed25519, auditoria, adaptador Rekor,
verificador offline WASM e assistente Ollama.

```powershell
pnpm intra:prepare
pnpm dev:intra
```

Abra `http://127.0.0.1:3003`. Credenciais locais são geradas em
`ops/local/intra/credentials.json`. Publicação exige Rekor e chave confiável
configurados. [Guia, testes e limites](apps/arkhe-intra/README.md).

## Distribuição Windows do Intra

Launcher gráfico, CLI, ZIP portátil e instalador MSI por usuário são gerados em
`dist/`. A distribuição inclui os runtimes necessários e mantém dados privados
fora da instalação. [Artefatos e validação](docs/WINDOWS-DISTRIBUTION.md) ·
[Uso e reprodução do build](packaging/windows/README.md).

A revisão de todas as telas do Intra, com prévias e validação no navegador, está
em [UI-REFRESH](docs/UI-REFRESH.md). O pacote `ui-refresh` é gerado separadamente
para preservar instalações e sessões já em uso.

O [registro de credenciais](docs/CREDENTIAL-REGISTRATION.md) acrescenta convites,
prova de posse e ativação assinada pela governança. A [bancada de desenvolvimento](docs/INTRA-DEVELOPMENT.md)
permite gerar e testar propostas Rust em sandbox local, com exportação aprovada
por assinatura. O pacote `development` reúne essas telas. Os módulos cognitivos
continuam sendo implementações de referência; capacidade AGI não foi demonstrada.

A tela `/avaliacoes` implementa [baseline congelado e comparação independente](docs/CAPABILITY-EVALUATION.md),
com tarefas reservadas, retenção, generalização, ciclos sucessivos e decisões de
promoção/rollback assinadas. A suíte inicial mede capacidades sintéticas do adaptador
de avaliação; não constitui demonstração de AGI.

## Evidência governamental sintética

A [PoC arkhe-gov](integration/arkhe-gov/README.md) verifica quatro payloads sintéticos e suas provas MMR em Rust/WASM, com testes negativos e checkpoint de laboratório. Não é um verificador CIN/VIO nem certificação de conformidade.

## Detecção causal sintética

A [PoC Stage 8](docs/STAGE8-DETECTION.md) admite eventos assinados no WormGraph,
gera um alerta causal de falhas de login seguidas de sucesso e exporta uma trilha
verificável offline contra chave e checkpoint retidos pelo auditor.

## Verificação GGUF sintética

A [PoC Stage 10](docs/STAGE10-GGUF.md) verifica um GGUF binário restrito por
estrutura, digests SHA-256/BLAKE3, proveniência assinada e inclusão RFC 6962 em
log local. O [adapter Sigstore/Fulcio](integrations/cosign/README.md) verifica
bundles padrão offline com cadeia X.509, identidade/OIDC exatos, SCT e prova
Rekor assinada, usando a mesma inspeção binária Rust para GGUF.

## Arkhe GovTech

Aplicação local em `/govtech`: processos, revisão assinada, políticas por órgão, parada de emergência, journal do simulador e verificação offline. Inicie com `pnpm dev:govtech` em `http://127.0.0.1:3012/govtech`, usando banco próprio em `ops/local/govtech`. [Fluxo, contas e limites](docs/GOVTECH-APP.md).
