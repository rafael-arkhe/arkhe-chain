# Validação Enterprise — estado atual e histórico

Data: 2026-10-23. Escopo: execução local, organização única, dados sintéticos isolados. Nenhum CI remoto, deploy ou consulta Serpro real foi executado.

## Resultados da primeira revisão (histórico)

| Verificação | Resultado observado |
| --- | --- |
| `python scripts/check_architecture.py` | PASS: 27 crates, 8 pacotes Node, 17 migrações imutáveis |
| `python -m unittest discover -s scripts/tests -p test_architecture_vendor.py -v` | PASS: exclusão vendor exata, sem esconder crates vizinhos ou membros ativos |
| `python -m unittest discover -s scripts/tests -v` | PASS: 234 testes Python, incluindo o gate vendor |
| `pnpm install --lockfile-only --offline --ignore-scripts --frozen-lockfile` | PASS: manifesto e lockfile reconciliados |
| `node --test tests/*.test.mjs` em apps/arkhe-intra | 61 testes, zero falhas |
| `node --test integrations/solana-proof/test/*.test.mjs` | 32 testes, zero falhas |
| `node node_modules/typescript/bin/tsc --noEmit` em apps/arkhe-intra | PASS |
| `node scripts/build.mjs` em apps/arkhe-intra | PASS: compilação, tipos, páginas e traces; três rotas Enterprise |
| Chromium headless, build de produção | PASS: 12 screenshots, 7 verificações, nenhum pageerror |

O gate antes falhava por pacote Node não registrado e checkout externo descoberto como crates ativos. Ambos foram corrigidos explicitamente. O lockfile antes também estava desatualizado para as sete dependências Solana: o gerador pnpm adicionou o importer e os snapshots transitivos. Nenhuma versão ou integrity de pacote existente foi substituída; o pnpm recalculou alguns contextos de peers em outros importers. A checagem frozen passou. Nenhuma dependência de browser foi adicionada ao produto.

## Fluxo exercitado

Login pela UI → sessão existente → rota Enterprise → API → SQLite isolado → dashboard. Cadastro por formulário → preview do servidor → confirmação → 503 por Serpro ausente → erro visível e perfil continua ausente. A configuração real da instalação não foi confirmada nem alterada.

Também foram exercitados documento criado pela API isolada, inspeção com resultado inconclusivo, fechamento por Escape, persistência de personas, troca para Executivo, fallback generic no formulário e erro de API simulado no browser com recuperação pelo botão de retry.

O [relatório JSON](validation/2026-10-23/browser-report.json) registra Chromium/Node, dimensões, resultados e falhas esperadas. A página não apresentou overflow horizontal em 1440×1000 e 390×844. A navegação interna tem rolagem horizontal intencional no mobile. Acessibilidade recebeu inspeção e verificações pontuais; não é certificação WCAG.

## Screenshots

| Rota / estado | Desktop | Mobile |
| --- | --- | --- |
| `/enterprise` | [Dashboard](validation/2026-10-23/enterprise-desktop.png) | [Dashboard](validation/2026-10-23/enterprise-mobile.png) |
| `/enterprise/perfis` | [Perfis](validation/2026-10-23/enterprise-perfis-desktop.png) | [Perfis](validation/2026-10-23/enterprise-perfis-mobile.png) |
| `/enterprise/onboarding` | [Formulário](validation/2026-10-23/enterprise-onboarding-desktop.png) | [Formulário](validation/2026-10-23/enterprise-onboarding-mobile.png) |
| Estados adicionais | [Vazio](validation/2026-10-23/enterprise-empty-desktop.png), [Executivo](validation/2026-10-23/enterprise-executive-desktop.png), [Inspeção](validation/2026-10-23/enterprise-evidence-dialog.png) | [API indisponível](validation/2026-10-23/enterprise-api-error-mobile.png) |
| Preview e gate cadastral | [Preview](validation/2026-10-23/enterprise-onboarding-preview-desktop.png), [Commit bloqueado](validation/2026-10-23/enterprise-onboarding-blocked-commit.png) | — |

## Concorrência, CNAE e cadastro

- Previews independentes de owners A+B; dois commits concorrentes têm um único vencedor (201), um conflito (409), um evento e zero previews restantes.
- Alteração de preview durante a consulta cadastral impede commit do conteúdo anterior.
- Ordem de prefixos pinada, três matches artificiais para fixar first-match, `6499-9/99` financeiro, `65` seguros, `66` financeiro e fallback generic.
- Gate Serpro usa respostas sintéticas somente nos testes: CNPJ/razão/CNAE divergentes, inativo, credenciais ausentes, 404, 401, 429, 503 e erro de transporte não confirmam perfil.
- Sucesso sintético verifica persistência de origem, horário, hash da resposta e vínculo ao preview, mantendo representação legal como não verificada.

## Reprodução do browser

Após o build, defina `ARKHE_BROWSER_NODE_MODULES` para o diretório de pacotes com Playwright já instalado e execute `node scripts/enterprise_browser_review.mjs`. O script cria contas/banco temporários, serve apenas em 127.0.0.1:3011, executa Chromium e encerra browser/servidor. Usa o build de produção via servidor Next programático. O Next registra um aviso sobre sua distribuição standalone; as rotas, assets e chamadas de API foram efetivamente exercitados neste perfil local. Não equivale a validar o empacotamento standalone ou um deploy.

## Pendências da primeira revisão (histórico)

Consulta real Serpro (credenciais não fornecidas), representação legal, e-CNPJ/ICP-Brasil, admissão de declaração WormGraph, RBB/HSM/TSA, enforcement setorial, multi-tenancy, CI remoto e deploy. O [MATURITY.md](MATURITY.md) delimita LEMMA local e PENDING operacional. A [nota Speedrun](SPEEDRUN-SCOPE-NOTE.md) é somente um rascunho local; nenhuma candidatura foi modificada.

O bloqueio de inicialização relatado na entrega anterior foi superado nesta revisão pelo mecanismo headless solicitado. As afirmações anteriores sobre ausência de screenshots e divergências de arquitetura ficam substituídas pelos resultados acima.


## Atualização — representação, alfanumérico e standalone

- Suíte da aplicação: **65 testes passaram**; a suíte Enterprise foi repetida depois para conferir também cada prova/raiz WormGraph Rust no WASM.
- Binário Rust: dois testes de assinatura/domínio e checkpoint determinístico passaram; cargo clippy do binário com `-D warnings` e cargo fmt do workspace passaram.
- Arquitetura e frozen-lockfile continuam PASS. O novo binário usa o crate WormGraph existente, sem alterar o número de crates/pacotes/migrações.
- Teste novo do contexto de build confirma exclusão de chaves, contas, .env, banco e node_modules.
- Suíte Python completa atual: **235 testes passaram**.
- Browser do piloto: **13 screenshots e 8 verificações**, sem pageerrors ou overflow horizontal, incluindo CNPJ alfanumérico, anexos sintéticos, assinatura Ed25519 e registro real no motor Rust local. [Relatório](validation/2026-10-23/pilot/browser-report.json), [declaração registrada](validation/2026-10-23/pilot/enterprise-representation-recorded.png).
- Standalone: imagem Linux em formato Docker construída e executada no **Podman rootless**, com cinco grupos de verificações e três screenshots. User node, root filesystem read-only, SQLite/WASM/Rust, três rotas no Chromium e persistência após restart. [Relatório](validation/2026-10-23/standalone/container-report.json), [log](validation/2026-10-23/standalone/server.log), [instruções](STANDALONE.md). Docker Engine não foi usado.

A ausência de validação standalone registrada anteriormente foi superada para esse perfil local. Isso não comprova deploy público, TLS, CI remoto ou operação real do Serpro. Os artefatos anteriores são mantidos como histórico; seus hashes vinculam as fontes da respectiva revisão, não automaticamente as fontes atuais.

A [política de representação](REPRESENTATION-POLICY.md) libera apenas autodeclaração para generic interno explicitamente habilitado. A base documental contém hashes, não os originais; poderes permanecem não verificados. Procuração/e-CNPJ/QSA são variantes futuras sem bypass de cliente. A confirmação do perfil ainda exige Serpro.

O usuário não confirmou o contrato Serpro; não se infere seu status de fontes públicas. Nenhuma contratação, chamada paga, submissão Speedrun ou contato com a ACIEG foi realizado. [Procurement e critérios de aceite](PROCUREMENT.md). A versão Speedrun para submissão fica posterior aos requisitos do piloto, conforme decisão do usuário.

## Atualização — resiliência

A [matriz dos 50 tópicos](RESILIENCE-REVIEW.md) distingue o que já existia das mudanças desta revisão. Passaram **70 testes da aplicação**, **235 testes Python**, TypeScript e o gate de arquitetura (27 crates, 8 pacotes, 17 migrações imutáveis). Os testes incluem dois escritores SQLite reais, rollback, FK, UNIQUE, EXPLAIN QUERY PLAN, backoff/Retry-After/circuit breaker e idempotência vinculada ao usuário.

O build de produção Linux passou. A imagem `localhost/arkhe-enterprise:resilience` foi executada no Podman rootless: **8 verificações e 3 screenshots**, incluindo preview idempotente por HTTP, readiness, três rotas no Chromium, assinatura Rust/WASM, Serpro ausente bloqueando commit, requisição em curso concluída com HTTP 200 durante SIGTERM, encerramento com código 0 e persistência após reinício. [Relatório](validation/2026-10-23/resilience-standalone/container-report.json), [log](validation/2026-10-23/resilience-standalone/server.log).

Contêiner e volume sintéticos foram removidos. A imagem local foi preservada. Não foi usado Docker Engine; nenhuma API paga, contratação ou implantação pública foi executada. Retry SQLite é limitado à aquisição da transação, sem repetir callbacks; o dashboard continua linear e a contenção pode esgotar seu orçamento. Serpro real, quota financeira, TLS público e poderes verificados permanecem pendentes.


## Atualização — infraestrutura local

Passaram **72 testes da aplicação**, **235 Python**, TypeScript e arquitetura; o build Linux da imagem infrastructure passou. O teste de backup foi ampliado depois para rejeitar cadeia de auditoria alterada e inicialização com arquivo SQLite inválido, e passou novamente. Nenhuma API paga foi chamada.

O [relatório de infraestrutura](validation/2026-10-23/infrastructure/report.json) registra **cinco verificações e uma captura**: template Caddy público válido, HTTPS localhost com CA explícita verificada pelo Node, login/cookie Secure, fluxo autenticado, métricas públicas bloqueadas e internas autorizadas, snapshot online com WAL e restauração isolada com auditoria BLAKE3 real, Chromium sem pageerrors e logs HTTP JSON sem payloads. [Captura HTTPS](validation/2026-10-23/infrastructure/https-enterprise.png), [log do app](validation/2026-10-23/infrastructure/server.log).

A restauração recuperou um documento, limpou sessões e preservou o banco ativo com dois documentos posteriores. O snapshot de teste era sintético e foi removido com seus containers/volumes/rede. Isso não demonstra backup off-host, reparação de corrupção ou execução diária. Templates de timer/job foram preparados, com sintaxe shell conferida no Linux; systemd não foi instalado/ativado.

A tentativa com limites de memória/CPU/PIDs falhou por ausência de controllers cgroup delegados no host (memory.max ausente). Nenhuma configuração da VM foi alterada; [registro da limitação](validation/2026-10-23/infrastructure/resource-limits.json). A execução bem-sucedida não usou esses limites.

Caddy v2.11.7 foi executado em Podman rootless; imagem exata consta no relatório. A CA foi descartável, sem alterar confiança do host. Chromium ignorou o certificado local no contexto de teste; a validação independente do TLS ocorreu no Node. Certificado público, domínio, DNS, renovação, retenção/logs, scanner/patching e operação externa continuam pendentes. Ver [revisão dos 19 tópicos](INFRASTRUCTURE-REVIEW.md) e [runbook](RUNBOOK.md).
