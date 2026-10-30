# Maturidade — Arkhe Enterprise

Data: 2026-10-23. Critérios: `docs/MATURITY-CRITERIA.md`. LEMMA significa implementação com validação local relevante; não significa produção ou CI remoto.

| Capacidade | Estado | Evidência / limite |
| --- | --- | --- |
| Portal autenticado single-org dentro do arkhe-intra | LEMMA | Build, suíte atual com 72 testes, Chromium em banco isolado; sessão e RBAC existentes |
| Oito personas, doze setores + genérico | LEMMA | Preferências persistentes, vocabulário, perspectivas e resolução CNAE com testes |
| Preview por usuário; commit único por instalação | LEMMA | Teste A+B concorrente, expiração, alteração durante I/O, replay e evento transacional |
| Gate cadastral: contrato e bloqueio por falha | LEMMA local | Testes sintéticos de Serpro; navegador confirma bloqueio sem credenciais |
| Consulta real Serpro | PENDING | Requer contratação/habilitação e credenciais; nenhuma consulta externa feita nesta tarefa |
| Declaração assinada e hashes em WormGraph local | LEMMA local | Motor Rust real, persistência SQLite, verificação cruzada WASM e browser; generic interno; poderes não verificados |
| CNPJ alfanumérico e compatibilidade numérica | LEMMA local | Vetor oficial RFB, normalização, erros e formulário no browser |
| Standalone em contêiner Linux | LEMMA no perfil testado | Imagem formato Docker construída e executada com Podman; três rotas no Chromium; SQLite, WASM, Rust e restart; Docker Engine não testado |
| Representação legal / posse de e-CNPJ | PENDING | Consulta cadastral não comprova poderes; não há cadeia ICP-Brasil ou mandato verificado |
| Responsividade e estados vazio/erro | LEMMA no perfil testado | 13 screenshots atualizadas; Chromium, 1440×1000 e 390×844; sem overflow horizontal da página |
| Acessibilidade | INSPECTED + verificações pontuais | Rótulos, foco, diálogo e Escape; não é auditoria WCAG nem teste completo com leitor de tela |
| Gate local de arquitetura e lockfile | LEMMA | 27 crates, 8 pacotes Node, 17 migrações; vendor explícito testado; 234 testes Python passaram; frozen-lockfile aceita |
| RBB, HSM, TSA/ICP-Brasil e enforcement setorial | PENDING | Presets são intenção, sem provisionamento ou controles de retenção/quota ativos |
| Multi-tenant, isolamento por empresa e SaaS compartilhado | PENDING | Uma organização por instalação; nenhuma fronteira de tenant implementada |
| Tiers Growth/Enterprise do desenho comercial | CONJECTURE | Não se deduz isolamento ou capacidade operacional de nomes comerciais |
| CI remoto e deploy de produção | PENDING | Nenhum run remoto ou deploy foi disparado nesta tarefa |

O escopo comercial correto é **portal single-org integrado**. Não afirmar plataforma SaaS multi-tenant, identidade empresarial certificada ou RBB operacional. O usuário definiu preparar a versão Speedrun após os requisitos do piloto. A [nota](SPEEDRUN-SCOPE-NOTE.md) continua rascunho: Serpro real e procuração/e-CNPJ não estão liberados. [Política faseada](REPRESENTATION-POLICY.md), [standalone](STANDALONE.md) e [procurement](PROCUREMENT.md).

## Resiliência local — 2026-10-23

A revisão adiciona retry de aquisição SQLite, índices direcionados, testes de FK/UNIQUE/planos, GET Serpro com backoff e circuito, readiness, supervisão com drain e idempotência do preview. Evidência: 72 testes Node, 235 Python, TypeScript, arquitetura e build Linux passaram; 8 verificações standalone/3 screenshots passaram no Podman, inclusive requisição em curso durante SIGTERM e persistência após reinício. Classificação: LEMMA local com dados sintéticos; consumo real Serpro, limites de capacidade, poderes externos e exposição pública continuam PENDING. Consulte [limites e matriz dos 50 tópicos](RESILIENCE-REVIEW.md).


## Infraestrutura — 2026-10-23

| Capacidade | Estado | Evidência / limite |
| --- | --- | --- |
| Métricas Prometheus e logs HTTP JSON | LEMMA local | /api/metrics com owner/token interno, bloqueada no Caddy público; labels limitados e sem payloads; métricas por processo, sem tracing/SLO operacional |
| Snapshot e restauração isolada | LEMMA local | WAL, SHA-256, integrity_check, FK e cadeia BLAKE3; restore em diretório novo, sessões limpas e banco ativo preservado |
| Verificação de integridade ao abrir SQLite | LEMMA local | Arquivo inválido rejeitado no startup; não é reparação automática |
| Reverse proxy e TLS local | LEMMA no perfil testado | Caddy, CA descartável verificada pelo Node e portal no Chromium; cinco verificações de infraestrutura/uma captura |
| TLS público e DNS | PENDING | Template público validado, sem domínio/emissão/renovação pública exercitados |
| Backup diário/off-host | PENDING operacional | Script/service/timer preparados, sem ativação; armazenamento, acesso, criptografia e retenção exigem operação |
| Runbook | Documento entregue | Procedimentos e limites disponíveis; responsáveis/plantão/exercícios ainda não definidos |
| Limites CPU/memória/PIDs | PENDING | Host sem controllers cgroup delegados; tentativa falhou, não houve alteração na VM |

Evidência consolidada: 72 testes app, 235 Python, TypeScript, arquitetura e build Linux passaram. [Revisão](INFRASTRUCTURE-REVIEW.md), [relatório](validation/2026-10-23/infrastructure/report.json), [runbook](RUNBOOK.md). Serpro real e poderes externos continuam pendentes; não se declara piloto externo ou produção liberados.
