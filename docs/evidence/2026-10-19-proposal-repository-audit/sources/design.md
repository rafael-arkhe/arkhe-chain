# Arkhe — Design Consolidado (DESIGN.md)

**Status**: ARCHITECTURE CANDIDATE — NOT FROZEN  
**Versão**: 0.3 (Consolidação de Pareceres, Invariantes e Calibrações)  
**Princípio Dominante**: $\text{PerformanceMechanism} \nRightarrow \text{SafetyAuthority}$

---

## 1. Visão Geral e Princípios Fundacionais

O **Arkhe** não é uma plataforma que substitui as ferramentas existentes; é a camada de verificação (*Computational Fiduciary Layer*) que torna o trabalho realizado nelas auditável e verificável.

$$\text{Arkhe doesn't replace the tools. Arkhe makes the work done in them verifiable.}$$

### Invariantes Centrais de Execução
1. **Invariância do Kernel**: O kernel de contenção (*native core*) é a única autoridade de aplicação de políticas e execução de transições protegidas.
2. **Orquestração Substituível**: Mecanismos de performance, roteamento, filas, retries e caches não pertencem à TCB (*Trusted Computing Base*) de segurança.
3. **Exigência de Evidência**:
   $$\text{ProtectedTransitionAllowed} \implies \text{RequiredVerificationCompleted}$$
   $$\text{FailureToVerify} \implies \text{RejectProtectedTransition}$$

---

## 2. Axiomas Criptográficos e Mapeamento de Identidade

A identidade de qualquer artefato no Arkhe é definida por representação canônica e separação estrita de domínios:

* **CanonicalBytes**:
  $$\text{CanonicalBytes}(x) = \text{AKG-CBOR-v1}(\text{WireProjection}_{v1}(x))$$
* **ObjectDigest**:
  $$\text{ObjectDigest}(x) = H(\text{DomainObject} \parallel \text{CanonicalBytes}(\text{UnsignedProjection}(x)))$$
* **Separacao de Autoridades**:
  $$\text{StateTransitionEnforcementAuthority} \subseteq \text{NativeCore}$$
  $$\text{SigningAuthority, RootAuthority} \nsubseteq \text{NativeCore}$$
  $$\text{PortableVerifier} \nRightarrow \text{EnforcementAuthority}$$

---

## 3. Arquitetura do Monorepo e Separação de Camadas

A estrutura do monorepo reflete a divisão rígida entre a TCB invariante, o substrato de evidência e as camadas substituíveis:

```text
arkhe/
├── kernel/                    # ═══ GENOMA DA VERIFICABILIDADE (TCB / Fail-Closed) ═══
│   ├── arkhe-core/            # Primitivas canônicas (Hash BLAKE3/SHA256, CBOR, MMR, Tipos)
│   ├── arkhe-verify-core/     # Lógica pura de verificação (C2PA, GGUF, ZK - sem I/O)
│   ├── arkhe-verify-cli/      # CLI nativa sobre o verify-core
│   ├── arkhe-verify-wasm/     # Módulo WebAssembly para verificação portátil
│   └── arkhe-kernel/          # Microkernel de contenção (ContainmentGate / PDP & PEP)
├── evidence/                  # ═══ BLASTEMA CONSTITUCIONAL (Grafo Causal) ═══
│   ├── arkhe-wormgraph/       # Grafo causal append-only com ancoragem no Rekor/Besu
│   ├── arkhe-memory/          # Episodic store com Trajectory e InclusionProof
│   └── arkhe-sql/             # Persistência PostgreSQL append-only (RLS + Triggers)
├── governance/                # ═══ AUTORIDADE CONSTITUCIONAL ═══
│   ├── arkhe-governance/      # ConstitutionStore e avaliação de Quórum (ADR-011)
│   └── arkhe-sql-migrate/     # CLI de migrações imutáveis SQLx
├── cognition/                 # ═══ GENOMA DA COGNIÇÃO (Substituível / Sem Chaves) ═══
│   ├── arkhe-learning/        # Loop Dream-RSI de aprendizado contínuo
│   ├── arkhe-world-model/     # Simulador de reexecução ("dreaming")
│   ├── arkhe-metacognition/   # Auto-modelo e calibração
│   ├── arkhe-perception/      # Encoders de entrada
│   └── arkhe-rag/             # RAG com proveniência de chunks
├── orchestration/             # ═══ ORQUESTRAÇÃO SUBSTITUÍVEL ═══
│   ├── arkhe-containers/      # Sandboxes de isolamento (gVisor, runwasi, WaSC)
│   ├── arkhe-workers/         # Filas de jobs assíncronas (Awa default / BullMQ)
│   └── arkhe-intra/           # Integração e resiliência distribuída
└── integration/               # ═══ VEÍCULOS DE INTEGRAÇÃO ═══
    ├── mcp-server/            # Servidor MCP para IDEs (VS Code, Cursor, Claude)
    ├── vscode-extension/      # Extensão para verificação inline
    └── cosign-integration/    # Scripts e pontes de atestação OCI
```

---

## 4. Camadas de Persistência e Proteção do Grafo (`arkhe-sql`)

A persistência de evidências utiliza três camadas de defesa em profundidade:

1. **Privilégios Estritos**: A role de runtime (`arkhe_append`) possui permissões exclusivas de `INSERT` e `SELECT`. Operações de `UPDATE` e `DELETE` são revogadas.
2. **Triggers de Imutabilidade**: Triggers `BEFORE UPDATE OR DELETE` emitem exceções para bloquear tentativas de mutação por contas com privilégios elevados.
3. **Row-Level Security (RLS)**: Aplicação de `ENABLE` e `FORCE ROW LEVEL SECURITY` com roles `NOSUPERUSER NOBYPASSRLS` vinculadas à função `arkhe_assert_tenant()`.

---

## 5. Invariantes de Resiliência Distribuída (`INV-ARKHE-22..27`)

* **INV-ARKHE-22 (Bounded Verification Admission)**: Orçamentos de verificação ($\text{Budget}_V$) e mutação ($\text{Budget}_M$) são finitos e disjuntos. Falha de verificação por estresse bloqueia a transição (*fail-closed*).
* **INV-ARKHE-23 (Verification Cache Binding)**:
  $$\text{CacheKey} = H(\text{DomainVerificationCache} \parallel \text{CanonicalBytes}(\text{VerifierInputsProjection}))$$
* **INV-ARKHE-24 (Safety/Liveness Separation)**: Circuit breakers mantêm a segurança bloqueando transições inválidas. A liveness exige redundância de backends, não relaxamento de regras.
* **INV-ARKHE-25 (IntegrationAssessment Determinism)**: A avaliação é uma função puramente determinística de inputs congelados, executando sem I/O ou chamadas de rede no momento da decisão.
* **INV-ARKHE-26 (Durable Outbox Relay)**: Garantia de entrega idempotente ao `WormGraph` via chave $\text{OperationId} = H(\text{Domain} \parallel \text{Type} \parallel \text{Target} \parallel \text{RequestIdentity})$.
* **INV-ARKHE-27 (PEP/PDP Separation)**: O `ContainmentGate` atua como PEP (Policy Enforcement Point), consultando tabelas declarativas de políticas (PDP) sem hard-coding de lógica.

---

## 6. Roteiro Faseado de Integração

| Fase | Superfície / Veículo | Mecanismo de Integração |
| :--- | :--- | :--- |
| **F1** | IDEs (VS Code / Cursor) | Servidor MCP executando `arkhe-verify-wasm` localmente |
| **F1** | CI/CD (GitHub) | GitHub Action com assinaturas Cosign e SLSA Provenance |
| **F2** | Containers (Docker/OCI) | Assinatura de imagens com Cosign e atestação de modelos GGUF |
| **F2** | Kubernetes | Admission control via Sigstore Policy Controller (`ClusterImagePolicy`) |
| **F3** | Ambientes Corporativos | Replicação do MCP server em GitLab e IDEs JetBrains |

---

## 7. Tabela de Honestidade de Atribuição ($\tau$)

| Item | Classificação $\tau$ | Nota de Auditoria |
| :--- | :--- | :--- |
| **MMRProfile v1** | `LEMMA` | Estrutura de bagging right-to-left e prefixos congelados. |
| **C2PA claim-map-v2** | `LEMMA` | Campos de instância, assinatura e assertions validados. |
| **AKG-CBOR-v1** | `LEMMA` | Padrão determinístico conforme RFC 8949 §4.2.1. |
| **RLS + Triggers Backstop** | `LEMMA` | Mecanismo comprovado no PostgreSQL com role `NOSUPERUSER`. |
| **Outbox Relay Idempotente** | `LEMMA` | Padrão de deduplicação por `OperationId`. |
| **Análise de Requisitos INV-22..27** | `CONJECTURE` | Exige testes de carga e simulação adversarial contínua. |

$$\boxed{\text{ARKHE MULTI-FORMAT ARCHITECTURE v1.0 = FROZEN}}$$
