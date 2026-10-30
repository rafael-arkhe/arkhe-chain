# Segurança de IA: contrato, ameaças e operação

Data: 21/10/2026. Responsáveis abaixo são papéis propostos; nenhuma pessoa foi designada automaticamente. Donos de Engenharia e Segurança precisam atribuir nomes antes da produção.

## Contrato de privacidade

Intra é uma organização por instalação; não oferece isolamento de múltiplos tenants no SQLite. Autores leem seus próprios documentos; governança lê todos; revisores leem documentos submetidos (qualquer estado diferente de draft). Outros autores não recebem acesso automaticamente, mesmo após publicação. Dashboard, leitura, verificação e exportação usam a mesma política HTTP. IDs não são credenciais. Auditoria global é exclusiva de owner; exportações contêm eventos do documento autorizado. A governança tem acesso a rascunhos por função, portanto este não é um cofre pessoal inacessível aos administradores.

Funções de persistência e exportação sem subject são primitivas internas confiáveis, não endpoints. Não expor essas funções em nova rota sem readDocument. Mudança de compartilhamento exige revisão do contrato e testes. PostgreSQL mantém outra fronteira RLS; não pressupor que proteja SQLite.

## Threat model por fluxo

| Fluxo e fronteira | Ameaça | Controle implementado / evidência | Risco residual / responsável |
|---|---|---|---|
| Navegador → sessão | CSRF, roubo de cookie, bloqueio coletivo | Origin, HttpOnly/SameSite, expiração e throttle por identidade normalizada | Ataques distribuídos, scrypt síncrono e força bruta por várias contas exigem gateway com limites por origem; Engenharia Web |
| Sessão → documentos/auditoria | IDOR e vazamento de rascunhos | Política explícita por autor/papel/estado em leitura, dashboard e exportação | Owner e filesystem são confiáveis; Engenharia Web |
| Intra → processo Ollama | Exposição em argv e herança de segredos | chat-stdin, stdin limitado, allowlist de ambiente, timeout e limite de saída | Administrador local pode inspecionar memória; Engenharia IA |
| Ollama → resposta | Model swap, tools inesperadas, injection/jailbreak | Digest fixado, tools rejeitadas, saída UNTRUSTED_PROPOSAL, fixtures do provider | Não há prova de resistência semântica a jailbreak; Segurança IA |
| Identidade → retrieval → prompt | Vazamento entre tenants, ACL adulterada, poisoning | authorized_retrieval exige subject/tenant, filtra readers, verifica hash e orçamento; corpus em cognition/arkhe-rag/tests/adversarial.rs | Metadados devem vir de repositório confiável, nunca do modelo/cliente; ainda não há serving privado; Engenharia Dados |
| Proposta → gate → evidência | Escalada de autoridade e adulteração | ContainmentGate, contratos, assinatura e append-only existentes | Custódia e permissões operacionais precisam de execução própria; Segurança/Plataforma |
| CI → release | Dependências vulneráveis, segredos, IaC e código inseguro | Trivy bloqueia HIGH/CRITICAL; CodeQL security-extended bloqueia resultados SARIF; testes adversariais e gate de release | CodeQL depende de disponibilidade/licença no repositório; Rust SAST e DAST ainda não cobertos; DevSecOps |
| Billing → PostgreSQL | Acesso cruzado e privilégios excessivos | Migração 14 revisada: FORCE RLS, assert tenant, sem grants a runtime/read; teste SQL descartável no CI | Worker de billing não provisionado; não conceder acesso genérico; Plataforma Dados |
| Logs/backup → operação | Dados sensíveis, retenção excessiva, recuperação inválida | Telemetria sem conteúdo, ensaio SQLite sintético com integrity_check | Coletor, disco criptografado e restore de produção ainda não verificados; SRE |

## Gate para RAG privado

config/ai-security.json mantém privateRagEnabled=false. scripts/check_ai_release.py falha se isso mudar: liberação privada continua bloqueada. O helper Rust é uma fundação de autorização, não um endpoint privado pronto. O construtor legado build_response continua referência pública e grounded significa presença de citações, não confirmação de fatos.

Antes de implementar serving privado, o dono de Dados deve obter ACL e identidade de fonte confiável, filtrar candidatos antes de montagem do prompt, revalidar revogação na entrega e validar as citações retornadas contra chunks autorizados. Nenhum campo de autorização pode ser extraído de texto do modelo. Deve haver teste ponta a ponta de vazamento com dados sintéticos, injection indireta, citação inventada e tool misuse. O corpus atual prova fronteiras determinísticas; não prova comportamento de um modelo real. O job ai-security bloqueia persistent-runtime e o workflow security executa o corpus. Administrador do GitHub precisa tornar os checks obrigatórios na proteção de branch; configuração remota não foi alterada.

## Telemetria e retenção

askOllama emite JSON ai.inference com requestId aleatório, provider fixo, outcome, durationMs e modelDigest validado (ou null); requestId retorna ao cliente. Prompts, respostas, usuário, email, tokens de autenticação e mensagens de exceção não entram nesse evento. Rejeições antes da inferência não geram esse evento. Isso instrumenta o caminho de inferência local; ainda não constitui tracing distribuído ou integração com Prometheus.

Política proposta: não persistir conteúdo conversacional no serviço; manter eventos operacionais minimizados por até 30 dias; alertar sobre taxa de erro, latência e saturação. SRE deve configurar coleta, retenção efetiva e testes de alerta. Até isso ocorrer, a retenção de stdout depende do launcher e não foi comprovada. Não ativar logging de conteúdo em produção para depurar.

Documentos/auditoria: retenção deve ser definida pelo controlador conforme finalidade, obrigações e classificação. Append-only não autoriza retenção indefinida. Não apagar eventos isolados da cadeia; definir expurgo de instalações/partições e tratamento de backups com governança antes de receber dados pessoais reais. Sessões expiram em oito horas e são limpas no login; tentativas expiradas são limpas no login. Backups propostos: criptografados, acesso separado, até 30 dias, salvo retenção legal documentada. RPO de 24 horas e RTO de quatro horas são metas propostas, ainda não medidas.

## Rotação, backup e recuperação

Ensaio executável: python scripts/security_recovery_drill.py. Usa somente SQLite e credencial sintéticos em diretório temporário; faz backup consistente via SQLite backup API, restaura em banco novo, compara linhas e executa integrity_check. O teste de substituição de hash sintético não demonstra revogação de token em serviço real. Evidência em docs/evidence/security/2026-10-21/recovery-drill.json.

Runbook de produção (SRE e Segurança): inventariar dono e finalidade de cada segredo; substituir credenciais de API/DB em ambiente isolado; reiniciar consumidores; verificar que a nova funciona e a antiga falha; registrar somente identificadores/hashes públicos e horários; revogar sessões após comprometimento. Chaves Ed25519 exigem versão, janela de confiança e preservação de verificação de evidência histórica, nunca substituição cega dos arquivos existentes.

Backup Intra deve usar API SQLite, não cópia isolada do .sqlite com WAL ativo. Incluir documentos, contas e trust conforme recuperação definida, guardando chaves privadas em custódia separada. PostgreSQL exige backup transacional e recuperação compatíveis com seu volume. Restaurar primeiro em destino isolado e validar conteúdo, assinaturas, cadeia de auditoria, RLS e sessões revogadas. Não executar restore sobre banco em uso. Rotação e restauração operacionais de produção permanecem pendentes; nenhum segredo ativo foi trocado por este trabalho.

## Matriz de controle e aceite

| Controle | Dono proposto | Evidência / aceite |
|---|---|---|
| Privacidade e sessões | Engenharia Web | security-boundaries e fullstack; dois autores distintos e export negado por HTTP |
| Modelo e processo | Engenharia IA | testes client Ollama; stdin sem argv e ambiente mínimo |
| RAG privado | Dados + Segurança IA | gate permanece fechado até serving autorizado e red team de modelo |
| Scanners / supply chain | DevSecOps | workflow security verde, SARIF sem resultados, triagem de achados sem ignores genéricos |
| Migração e RLS | Plataforma Dados | billing-migration em PostgreSQL descartável; lock validado |
| Logs / alertas / retenção | SRE + Privacidade | coletor e exclusão comprovados, alerta provocado, conteúdo sensível ausente |
| Recuperação e rotação | SRE + Segurança | ensaio sintético disponível; anexar exercício operacional posterior |
| Aplicabilidade regulatória | Jurídico/DPO + dono do produto | finalidade, regiões, dados, papéis e decisões de risco aprovadas |

## Revisão regulatória por uso

Para o assistente local sem acesso à base privada, classificar os dados que usuários podem digitar, estabelecer finalidade e proibir ingestão automática de segredos. Para documentos e registros de acesso com dados pessoais, definir controlador/operador, fundamento jurídico, direitos, retenção e resposta a incidentes com o DPO. As definições de agentes devem seguir a [orientação da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_agentes_de_tratamento_e_encarregado___defeso_eleitoral.pdf).

Se houver oferta ou uso na UE, Jurídico deve verificar território, papel de provider/deployer, finalidade e classificação de risco no [AI Act oficial](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), incluindo alterações e cronograma aplicáveis na data da liberação. Esta revisão não conclui que o Arkhe seja sistema de alto risco nem certifica conformidade. Casos de RH, crédito, saúde ou decisões sobre pessoas exigem análise própria antes de habilitação; NIST AI RMF e ISO 42001 não se tornam atendidos apenas por nomear controles.

Scanners seguem a configuração documentada pelo [Trivy](https://github.com/aquasecurity/trivy-action). Execução remota, proteção de branch e resultados dos scanners ainda não foram demonstrados localmente.
