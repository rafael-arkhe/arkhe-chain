# Arquitetura — reuso de backend

> **Regra absoluta:** `security-app/` é **somente frontend**. Nenhum módulo Python novo. Nenhum schema novo. Nenhuma migração nova.

## O que entra no repo

```
security-app/                ← único diretório novo
├── app/                     rotas (Início, Buscar, Ficha, Explorador,
│                            Rede, Geo, Câmeras, Alertas, Briefings, Relatórios, Administração)
├── components/              UI exclusiva deste painel (chrome, banner de classificação)
├── lib/                     clientes HTTP (que falam com endpoints existentes)
├── public/                  ícones e assets do branding próprio
├── styles/                  tokens do design system
├── content/                 templates de ficha, relatório, briefing (markdown / JSON)
├── docs/                    espelho local do que está em docs/security-app/
├── tests/                   unit + e2e Playwright
├── installer/security.sh    instalador single-tenant (analogous a politicians-app)
├── compose/compose.full.yaml compose por cliente (mesmo padrão do politicians-app)
└── .env.example             tenant URLs
```

## O que NÃO entra no repo

- `security-app/backend/` ❌ — todo backend continua em `ontology-module`
- Schemas Postgres novos ❌ — modelos existentes do `ontology-module` cobrem
- Containers Python novos ❌ — só os já existentes (`ontology-module`, `intel-module`, `social-module`, `ncii-module`)
- Workers novos ❌ — workers do `ontology-module` e `social-module` já cobrem
- Forks de qualquer módulo Python ❌

## Endpoints consumidos (todos já existentes)

| Rota da UI | Endpoint backend (já existente) |
|---|---|
| `/` (Início) | `ontology-module: /api/v1/dashboard/overview`, `intel-module: /api/v1/positions` |
| `/buscar` | `ontology-module: /api/v1/search` |
| `/ficha/[id]` | `ontology-module: /api/v1/objects/{id}`, `/api/v1/objects/{id}/links`, `/api/v1/objects/{id}/history` |
| `/explorador` | `ontology-module: /api/v1/object-sets`, `/api/v1/aggregations` |
| `/rede` | `ontology-module: /api/v1/graphs`, `/api/v1/links` |
| `/geo` | `ontology-module: /api/v1/objects?geo=...`, `intel-module: /api/v1/positions` |
| `/cameras` | `intel-module: /api/v1/cctv/streams`, `social-module` (face/LPR), AI overlay via openclaw-gateway |
| `/alertas` | `ontology-module: /api/v1/alerts/feeds`, `ontology-module: /api/v1/alerts/inbox` |
| `/briefings` | `ontology-module: /api/v1/briefings` (templates + slides) |
| `/relatorios` | `ontology-module: /api/v1/dossiers` |
| `/admin` | `ontology-module: /api/v1/admin/*` (acessos, audit, federação, automações) |

> Se algum endpoint não existir ainda, ele é adicionado **dentro do `ontology-module`**, com sua migração lá, seguindo a regra [[politicians-backend-reuse]]. Nunca em `security-app/backend/`.

## Multi-tenancy

Mesma estratégia comercial do politicians-app: **um stack por cliente**.

```
cliente "PC-SP"            cliente "PMERJ"            cliente "MP-MG"
├── security-app/.env      ├── security-app/.env      ├── security-app/.env
├── ontology-module        ├── ontology-module        ├── ontology-module
├── intel-module           ├── intel-module           ├── intel-module
├── social-module          ├── social-module          ├── social-module
├── ncii-module            ├── ncii-module            ├── ncii-module
└── openclaw-gateway       └── openclaw-gateway       └── openclaw-gateway
```

Dados não atravessam clientes — isolamento físico por container.

## .env esperado (security-app)

```bash
NEXT_PUBLIC_ONTOLOGY_API_URL=http://localhost:8002
NEXT_PUBLIC_INTEL_API_URL=http://localhost:8002         # ou intel-module:8002 conforme perfil de deploy
NEXT_PUBLIC_SOCIAL_API_URL=http://localhost:8010
NEXT_PUBLIC_COGNITIVE_API_URL=http://localhost:8001/api/v1
NEXT_PUBLIC_AGENT_GATEWAY_URL=http://localhost:9100      # openclaw-gateway
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXT_PUBLIC_CESIUM_ION_TOKEN=...                          # se /geo usar 3D
NEXT_PUBLIC_TENANT_ID=pc-sp                               # exibido no rodapé
NEXT_PUBLIC_TENANT_LABEL=PC-SP / 13ª DP                   # exibido no rodapé
```

## Agentes via openclaw-gateway

Os agentes de IA (LLM para sumarização de BO, classificação automática de objetos, sugestão de vínculos, sumário de câmeras, análise de relatórios) chamam o **mesmo** `openclaw-gateway` que o `politicians-app` já usa, com:
- Header `X-Tenant-Id` identificando o cliente
- Header `X-Use-Case` identificando o domínio (`security`)
- ACL aplicada no gateway: cada agente só vê dados do tenant que o invocou

Sem novo container. Sem novo modelo. Sem novo workflow. Apenas configuração por env.

## Cadeia de custódia

Toda escrita continua passando por:
`DataSource → DataAsset (com SHA-256 signed_hash + version) → LineageEvent`

Toda inferência de LLM é auditada em `InferenceLog`. Execuções em sandbox (se a operação envolver) ficam em `ExecutionSession`. Esses são **invariantes do `ontology-module`** — o `security-app/` os respeita por consumir os endpoints corretos.

## SDK / OSDK

Toda capacidade nova exposta na UI **deve** ser refletida no `aegis-python-sdk` + permissões do `OSDK`, conforme [[sdk-osdk-sync-per-feature]]. Mesmo para o `security-app/`. Endpoints novos sem entrada no SDK/OSDK é regressão.

## Documentação

Toda mudança nesta pasta (`docs/security-app/`) reflete também na rota `/docs` do `security-app/` (mesma regra [[sync-docs-to-ui]] que vale para AEGIS).
