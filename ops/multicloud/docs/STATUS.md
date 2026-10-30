# Resultado executado — 26/10/2026

**Registro histórico da primeira rodada.** Os 125 testes abaixo descrevem aquela
execução. O estado atual, com fencing no storage e exportação de conteúdos, está
em [REVIEW-CORRECTIONS.md](REVIEW-CORRECTIONS.md). As pendências de correção abaixo
não devem ser interpretadas como simples tarefas de deployment.

Workspace: `D:/arkhe`, Windows, Rust 1.96.0, Python 3.14, Terraform 1.10.5,
Helm 3.17.3. O workspace raiz não possui `.git`; não houve commit, push ou PR.

## Implementado

* Chart HTTP compartilhado com valores AWS/Azure, imagem por digest obrigatório,
  probes, recursos, PDB, spread, contexto de segurança, Secret externo e ingress.
* ApplicationSet hub-and-spoke com cluster generator, Go templates e erro em
  campos ausentes; projeto restrito de exemplo e overlay Kustomize de contrato.
* Módulos Terraform EKS/AKS, storage com retenção e Cloudflare LB/Monitor/pools;
  roots dev/routing e lockfiles gerados pelos providers.
* Exportador de pacotes assinados, upload condicional S3, replicador incremental
  S3 → Blob com readback, detecção de fork e recibo após verificação.
* Gate Rust reutilizando SignedCheckpoint/MMR nativos; gate Cosign/bundle com
  TrustedRoot externo. Nenhuma chave de confiança é aceita da própria réplica.
* Runner de chaos para staging, com timeout, cleanup e gates de fencing/promoção;
  comandos específicos são configurados pelo operador.
* Workflow CI de validação local; não aplica infraestrutura nem injeta faults.
* Resolver existente preservado; nova regressão com backend que entra em panic
  se houver comparação/scoring em cold start ou conflito anterior ao treino.

## Resultados locais

| Verificação | Resultado |
|---|---|
| Python unittest discover -s ops/multicloud/tests -v | 21 PASS |
| cargo test -p arkhe-governance -p arkhe-wormgraph --all-targets --locked | Governance: 54 PASS; WormGraph: 45 PASS; 2 testes PostgreSQL ignorados por exigirem banco isolado |
| cargo test --locked -p arkhe-governance --doc | 2 PASS, encapsulamento compile_fail |
| cargo test --locked -p arkhe-wormgraph --example verify_replica | 3 PASS, após adicionar testes do gate nativo |
| cargo build --locked -p arkhe-wormgraph --example verify_replica | PASS |
| Terraform init -backend=false/validate, roots dev e routing | PASS; sem credenciais ou provisionamento |
| Terraform fmt -recursive | PASS |
| Helm lint | PASS; apenas recomendação opcional de icon |
| Helm template AWS (com ingress) e Azure + parsing YAML | PASS |
| kubectl kustomize gitops/control-plane | PASS |
| ApplicationSet parsing YAML | PASS; não é validação pelo controller Argo CD |
| rustfmt nos arquivos Rust alterados | PASS |
| Clippy do exemplo nativo com -D warnings | Bloqueado por unnecessary_map_or preexistente em src/roster.rs:53 |
| Clippy com exceção explícita -A clippy::unnecessary_map_or | PASS, após corrigir manual_is_multiple_of no exemplo novo |

Total de testes sem sobreposição: **125 aprovados** (56 governance, 48 WormGraph,
21 Python), mais 2 PostgreSQL ignorados. A execução all-targets ocorreu antes da
adição dos três testes do exemplo; estes foram executados separadamente.

As cópias/falhas do protocolo e a ordem de failover usam FileStore e doubles de
verificação/comandos. O gate Rust executa assinatura e MMR reais em fixtures.
Não foram executadas chamadas boto3/Azure contra serviços reais nem Cosign com
bundle Rekor real. O workflow foi escrito e inspecionado, mas não rodou no GitHub.

## Pendente para deploy e DR verificável

* Redes/conectividade do hub, conta/região/subscription, ingress e TLS, imagem
  publicada, domínios, login federado e IAM/RBAC dos workloads.
* Terraform plan com as variáveis reais; backend remoto; revisão/aplicação e
  bloqueio operacional da política Azure de retenção, inicialmente unlocked.
* Registro dos clusters/Secrets, políticas assinadas reais e sync pelo Argo CD.
* IdP externo disponível e bancos/filas dos serviços com seus próprios planos de DR.
* Exportador transacional de hashes **e conteúdos** do journal/envelopes, scheduler
  de checkpoints e emissão de bundles Sigstore com as chaves reais.
* Integração do writer lock/epoch e fencing; restauração de conteúdo; ensaio real
  de partição, promoção e ressincronização. Medir RPO/RTO; nenhum SLA foi comprovado.

Portanto: componentes locais implementados/validados; multi-cloud operacional e
failover de produção permanecem **não demonstrados**. A fase de consenso está adiada.
