# Revisão do ambiente Arkhe — AI Security Architect

Data: 21/10/2026. Referência: competências e atribuições do texto fornecido pelo usuário.

## Parecer

O ambiente demonstra uma base de engenharia de segurança: separação entre proposta cognitiva e autorização, contratos verificáveis, evidência persistente, RLS PostgreSQL e provider local com identidade de modelo fixada. A inspeção não sustenta qualificá-lo como arquitetura de IA pronta para produção. As maiores lacunas estão em autorização por recurso no Intra, segurança de retrieval, observabilidade GenAI, avaliações adversariais e gates de segurança de dependências e infraestrutura.

Escopo: revisão local de código e configuração em D:/arkhe, concentrada no workspace raiz, runtime Rust, Intra, provider Ollama, RAG, SQL e CI. Não é pentest completo; não foram consultadas credenciais privadas, realizadas chamadas de inferência real ou verificados controles cloud, KMS, discos, backups, branches protegidas ou configuração externa do GitHub. Diretórios históricos, terceiros e binários distribuídos não foram auditados integralmente. Ausência nesta inspeção significa controle não demonstrado, não prova de inexistência em toda a organização. Não foram alterados controles ou configurações operacionais.

## Achados priorizados

### A1 — Alta: leituras de documentos e auditoria sem autorização por recurso no Intra

Evidência: apps/arkhe-intra/lib/http.mjs autentica a sessão, mas GET documents/:id chama requireDocument(id), export chama exportDocument(id) e GET audit retorna events(), sem fornecer usuário às funções. apps/arkhe-intra/lib/store.mjs mantém documentos e eventos globais em SQLite, sem tenant nessas tabelas.

Impacto: o código inspecionado permite leitura compartilhada entre usuários autenticados. Se documentos/auditoria forem privados por autor, grupo ou tenant, falta uma fronteira de acesso. Isso não demonstra quebra do RLS PostgreSQL: o Intra usa outro armazenamento.

Correção: explicitar o modelo de compartilhamento; para recursos privados, aplicar autorização no serviço para leitura, exportação e auditoria, com subject e tenant derivados da sessão. Critério: testes de acesso cruzado com dois usuários/tenants e IDs conhecidos, incluindo exportação. Severidade depende da classificação e do compartilhamento pretendido.

### A2 — Alta para evolução multi-tenant: RAG sem retrieval autorizado e grounding apenas nominal

Evidência: cognition/arkhe-rag/src/lib.rs recebe query, answer e citations; grounded equivale a citations não vazias. Não recebe identidade, ACL ou tenant e não verifica se citações existem, são autorizadas ou sustentam a resposta.

Impacto: uma citação fornecida pelo chamador não prova fundamentação. Este componente de referência não estabelece proteção de uma base de conhecimento multi-tenant.

Correção: filtrar permissões antes do retrieval, revalidar acesso antes da resposta e vincular chunks a origem, versão e integridade. Critério: testes de documento proibido, citação fabricada, fonte revogada e prompt injection indireta. Não apresentar grounded como validação semântica.

### A3 — Média: gate de arquitetura bloqueado por migração nova não registrada

Evidência: python scripts/check_architecture.py retorna FAIL published migration files differ from locked source identities. Comparação independente identificou somente storage/sql/migrations/20261021000014_stripe_billing.sql como nova e ausente em config/migrations.lock.json. Nenhuma das 13 migrações registradas mudou; nenhuma está ausente.

Correção: revisar a migração de billing e seus controles antes de registrar seu hash. Não atualizar o manifesto indiscriminadamente para fazer o gate passar. Critério: arquitetura passa e a migração nova tem validação de permissões, isolamento e aplicação em banco descartável.

### A4 — Média: telemetria operacional não demonstra observabilidade de IA

Evidência: ops/prometheus/prometheus.yml contém somente target mcp:8787. apps/arkhe-intra/lib/ollama.mjs retorna resposta e UNTRUSTED_PROPOSAL sem trace de decisão vinculado ao usuário. Registros WER oferecem integridade em caminhos específicos, mas isso não equivale a spans de inferência e detecção de abuso.

Correção: instrumentar request/trace ID, versão/digest do modelo, latência, contagem de tokens quando disponível, rejeições, orçamento e resultado de políticas. Registrar metadados minimizados; conteúdo de prompts exige política explícita de redação, acesso e retenção. Critério: uma requisição rastreável ponta a ponta e alertas exercitados para falha, abuso e degradação.

### A5 — Alta antes de produção: CI sem suíte explícita de segurança de IA e scanners convencionais

Evidência: .github/workflows/ci.yml possui build, contratos, testes, persistência e atestação. Não foram identificados nesse workflow gates explícitos de SAST, DAST, SCA, secret scanning ou IaC scanning. Os testes do provider cobrem protocolo e limites; não demonstram resistência semântica a jailbreak ou injection. Configurações de scanners fora do repositório não foram verificadas.

Correção: acrescentar scanners com política de severidade/exceções e corpus adversarial versionado. Cobrir injection direta/indireta, vazamento de dados sintéticos, abuso de ferramentas e isolamento. Critério: regressão inserida deliberadamente falha no CI e gera evidência revisável; testes não dependem de segredos reais. Padronizar actions por SHA: parte do workflow já faz isso, parte usa tags.

### A6 — Média: limitação de login permite bloqueio global

Evidência: apps/arkhe-intra/lib/auth.mjs usa subject='all'; dez falhas dentro da janela podem impedir logins de todos os usuários por até 15 minutos.

Impacto: uma origem capaz de atingir o endpoint com a origem aceita pode provocar indisponibilidade compartilhada. Não foi realizado ataque no serviço.

Correção: limites combinados por conta, origem confiável e limite global mais amplo, preservando proteção contra enumeração. Critério: falhas para uma identidade não bloqueiam outra e tentativas distribuídas continuam limitadas.

### A7 — Média: prompt passado em argumento e ambiente completo herdado

Evidência: apps/arkhe-intra/lib/ollama.mjs executa o provider por execFile com ['chat', prompt] e env com spread de process.env. Não há shell nesse caminho, mas argumentos podem ser observáveis por ferramentas de inspeção de processos com permissões suficientes; o subprocesso recebe variáveis que podem não precisar.

Correção: transmitir prompt por stdin ou IPC privado e construir allowlist de ambiente. Critério: prompt não aparece nos argumentos e um segredo sintético desnecessário não chega ao filho.

## Matriz das competências solicitadas

| Competência do texto | Evidência local | Avaliação e próximo passo |
|---|---|---|
| Guardrails e tool-calling | Ollama loopback, digest, limites, rejeição de tools e saída não confiável | Parcial; acrescentar política de dados e avaliações semânticas |
| Human-in-the-loop e menor privilégio | ContainmentGate, governança, aprovações assinadas | Base relevante; provar cobertura de todas as ações e delegação por usuário |
| Observabilidade de IA | WER, eventos e Prometheus MCP | Parcial; falta demonstração de tracing GenAI e alertas |
| Segurança no CI/CD | Contratos, SQL, testes e atestação | Parcial; scanners e regressão adversarial explícitos não demonstrados |
| IAM/RBAC/ABAC | Papéis no Intra, token/actor fixos no runtime | Parcial; runtime usa identidade operacional compartilhada, não delegação individual |
| RAG e dados multi-tenant | RLS no PostgreSQL; RAG de referência | Parcial; RLS não se transfere automaticamente ao SQLite/retrieval |
| Criptografia e segredos | Ed25519, tokens de sessão com hash, senhas com scrypt | Parcial; TLS/KMS, criptografia de discos/backup e rotação não verificados |
| MLOps e drift | Digest fixado no provider, gates de avaliação | Parcial; drift de identidade não mede qualidade ou desvio comportamental |
| Threat modeling e red team | Rejeições e fixtures do provider | Não demonstrada cobertura sistemática de ameaças de IA |
| Governança e proteção de dados | Artefatos de política e evidência | Não demonstra aderência a NIST AI RMF, ISO 42001, ATLAS ou requisitos legais; exige mapeamento e revisão próprios |
| Stack e integração | Rust, Next.js, PostgreSQL, SQLite, Podman | Stack corporativo equivalente presente; .NET não é requisito técnico obrigatório do texto |
| Comunicação e experiência profissional | Não inferíveis do repositório | Exigem evidências pessoais e organizacionais |

## Controles já identificados que devem ser preservados

- Provider Ollama restringe endpoint a loopback, desativa redirects/proxy/retry e verifica identidade do modelo, inclusive mudança durante chamada.
- Intra limita pergunta a 32 KiB, resposta do subprocesso a 1 MiB e concorrência local a uma inferência. Essa trava é por processo, não quota distribuída por usuário.
- Sessões usam token aleatório, armazenamento de hash, expiração, HttpOnly/SameSite e validação de Origin em mutações.
- SQL inclui FORCE RLS, checagem de tenant e gatilhos append-only; verificar o conjunto completo das tabelas e fluxos exige testes de banco.
- Cognição propõe; gate e governança autorizam. Confiança do modelo não deve conferir autoridade.

## Verificações executadas

| Verificação | Resultado desta revisão |
|---|---|
| python scripts/check_architecture.py | FAIL: migração 14 ausente no lock |
| Comparação SHA-256 de migrations/contra migrations.lock.json | 13 hashes iguais; uma migração adicional; zero removidas |
| python verification/scripts/verify-vectors.py | PASS: 10 vetores e perfil MMR |
| python storage/sql/scripts/static_audit.py | PASS: oito verificações estáticas; não substituem testes em banco |

O diretório raiz não contém metadados Git reconhecidos por git status; não foi possível atribuir a revisão a um commit nem obter diff da árvore. Node, Python, Cargo, pnpm e Podman estão disponíveis no PATH; Docker não foi localizado. Isso não verifica versões nem execução dos serviços.

## Sequência recomendada

1. Resolver A3 com revisão da migração e definir o contrato de privacidade de documentos/auditoria para corrigir A1.
2. Corrigir bloqueio global de login e transporte do prompt/ambiente do provider.
3. Tornar autorização no retrieval e corpus adversarial gates obrigatórios antes de disponibilizar RAG com dados privados.
4. Instrumentar telemetria de IA com minimização de dados e adicionar scanners ao CI.
5. Produzir threat model por fluxo, matriz de controles com responsáveis, política de retenção e evidência de rotação/backup/recuperação; revisar requisitos regulatórios conforme o caso de uso.

Os nomes de produtos no texto são exemplos de capacidades. Não é necessário instalar todos; a prioridade é demonstrar o controle e sua eficácia no fluxo real.

Verificação adicional: cargo test -p arkhe-ollama --test client --locked — PASS, seis testes, zero falhas. Executados com servidor HTTP de teste; não houve inferência real.

## Implementação posterior — 21/10/2026

Os achados foram tratados em código e configuração conforme [contratos e controles](AI-SECURITY-CONTROLS.md). A3 foi resolvido com registro da migração 14 após revisão de FORCE RLS e ausência de grants; o teste dinâmico PostgreSQL está no CI, ainda não executado localmente. A1 recebeu política de leitura por autor/papel/estado, auditoria global restrita e testes HTTP negativos. Login passa a limitar por identidade, e provider recebe stdin com ambiente mínimo. RAG privado continua desabilitado até integração segura; helper autorizado e corpus determinístico foram adicionados. Telemetria minimizada e scanners no CI foram instrumentados. Resultados e pendências estão em [evidência local](evidence/security/2026-10-21/implementation-validation.json). A avaliação inicial acima representa o estado antes dessas mudanças.
