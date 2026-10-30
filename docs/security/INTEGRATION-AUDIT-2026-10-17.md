# Auditoria das integrações do anexo — 2026-10-17

## Escopo e resultado

Inspeção do workspace local contra a especificação fornecida: HackenProof,
classificação/CVSS, idempotência, confiança em ferramentas, auth.md e propostas de
comunidades Orkut. Resultado: implementação candidata local; produção não atestada.
O diretório entregue não contém `.git`; não há diff/commit ou execução remota a alegar.
Os 250 tópicos são um catálogo de engenharia, não 250 vulnerabilidades confirmadas
nem evidência de auditoria exaustiva de cada controle na aplicação inteira.

## Achados e alterações

| Item | Estado encontrado | Resultado desta implementação |
|---|---|---|
| OperationId | Já excluía parâmetros e timestamp; journal compara parâmetros | Preservado; testes de conflito/retry mantidos |
| Classificação | Tabela por domínio + CVSS 3.1 Base, bindings tipados e perfil assinado existentes | Preservado; nenhum CVSS 4.0 aceito silenciosamente |
| ScopeCheck | Executor analisava diretamente após leitura | Consulta get_program_info antes da análise; rejeita ausência, snapshot divergente, assets ausentes/excluídos/fora do programa |
| Scope wire | Não implementado | Port de normalização explícito; sem codec/pin confiável, falha fechada |
| Tool poisoning | Pins completos e allowlist de duas ferramentas existentes | Allowlist explícita das quatro ferramentas do anexo; pins continuam obrigatórios; codec não pode trocar a ferramenta de leitura/triagem/programa |
| Taxonomia | Não havia catálogo dos 250 tópicos | topics.json completo, CWE seletivo e referências de tabela somente para correspondências diretas; XSS tem duas possibilidades |
| auth.md | Ausente | Crate local com descoberta conservadora, JWT Ed25519, replay/revogação, claim e troca assertion → token |
| Identidade | RequestIdentity já existente | Preservado; JWT aceita apenas raízes provisionadas; nenhum DID se autoconcede confiança |
| Contexto | Sem token/humanidade/proveniência/escopo tipados | Novos ContextKind e intents AgentRegistration/CommunityJoin/CommunityPost |
| Gate | Apenas triagem obrigava lookup de evidência no método síncrono | Novos intents também exigem lookup admitido; política dev continua negando operações protegidas |
| Registro | Sem WER específico de registro | Helper candidato vincula request e digest do access token, sem bearer no WER |
| Orkut | Ausente | Proposta selada + executor com journal, gate, admissão, revalidação e reconciliação |
| Humanidade/C2PA | Nenhuma integração Orkut real | Ports e referências tipadas; nenhum score, prova ZK ou badge é declarado verificado por mera presença |
| WASM | Verificava outros artefatos | Export verify_auth_assertion para checagem offline de assinatura e claims; não comprova revogação/replay online |

O ScopeCheck implementado é **escopo de assets**. Impacto prático, exploração,
exceções textuais e elegibilidade do relatório continuam dependentes da política
do programa e de revisão. A severidade típica de uma tabela não prova esses fatos.
O digest de escopo é contexto da proposta; não é, isoladamente, um recibo de
proveniência assinado do servidor HackenProof.

## Dependências que impedem declarar produção pronta

1. Auth: estado atual de replay, claims, delegações e revogação é em memória.
   Faltam persistência/transações e coordenação entre processos, endpoints HTTP
   OAuth/claim, sessão autenticada, CSRF, rate limits, JWKS/rotação, gestão de chaves
   e receiver SET com verificação de assinatura. Não há migração auth fictícia
   anunciada como armazenamento durável. DID resolver/issuer interoperável também
   permanece pendente; uma chave Ed25519 sozinha não implementa o protocolo inteiro.
2. HackenProof: schema autenticado real, pins revisados de get_program_info,
   normalização de programa/assets e operador de reconciliação. Adaptadores antigos
   sem scope agora param antes da análise intencionalmente. A classificação assinada
   continua opt-in e exige perfil de governança aprovado; não se ativa por catálogo.
3. Orkut: contrato autorizado real de API/backend, Passport/ZK verificáveis,
   governança aprovada, signer de worker e revalidador de estado corrente. O executor
   tem ports obrigatórios; somente fixtures de teste aceitam evidência sintética.
4. Auth/Orkut usam as abstrações existentes de admissão/journal; não há afirmação de
   teste PostgreSQL de auth, restart de auth, serviço público ou integração comercial.
5. Catálogo CWE é orientação seletiva e não transforma tópicos como índices ou
   ACID em falhas. Referências de tabela são informação, não política ativada.

## Validação

Comandos executados e evidência da rodada final ficam em
`docs/evidence/local/2026-10-17/auth-md-orkut/`.
Os testes abrangem assinatura/chave/tipo, identidade/audiência, expiração, escopos,
replay, as duas camadas de revogação, confirmação/expiração/lockout de claim,
escopo antes de análise, proposta/humanidade, journal e admissão/gate.
Golden vectors anteriores permanecem verificáveis. Fixtures externas são sintéticas.
Compilar o target wasm verifica o build; não equivale a executar no navegador.

## Fontes primárias conferidas nesta rodada

- [auth.md — visão geral](https://workos.com/auth-md/docs),
  [contrato para apps](https://workos.com/auth-md/docs/apps) e
  [descoberta](https://workos.com/auth-md/docs/auth-md): PRM é fonte de verdade;
  registro produz assertion, com troca posterior por access token. Portanto, o
  fluxo simplificado DID → access token no anexo não é interoperabilidade comprovada.
- [HackenProof Web & Mobile](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/web-and-mobile):
  exemplos típicos e uso de CVSS. A combinação tabela + CVSS é escolha do perfil Arkhe.
- [Smart contracts](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/smart-contracts) e
  [Blockchain protocols](https://docs.hackenproof.com/bug-bounty/vulnerability-classification/blockchain-protocols):
  fallback CVSS explícito para casos não cobertos. Nenhuma penalização de reputação
  foi inferida dessas páginas.

## Revalidação das afirmações contestadas

As páginas completas de Smart contracts e Blockchain protocols foram reabertas
nesta rodada, inclusive o parágrafo após cada tabela. Ambas declaram fallback
CVSS quando o problema não corresponde aos exemplos listados. Portanto, esta
afirmação específica tem evidência primária direta; não foi rebaixada a PENDING
por uma pesquisa anterior ter recuperado somente trechos da página.
A combinação tabela + CVSS em WebMobile continua sendo escolha de perfil Arkhe.

O teste `operation_id_excludes_parameters_and_timestamp_but_binds_request` em
`integration/arkhe-bugbounty/tests/triage.rs` demonstra identidade estável ao mudar
parâmetros/timestamp e identidade diferente com outro request. O teste
`same_request_different_parameters_conflicts_without_second_write` executa uma
triagem, reutiliza a mesma RequestIdentity com severidade diferente, exige
`Err(Error::ParameterMismatch)` e verifica que houve somente uma escrita no mock.
São verificações executáveis locais, não uma prova formal nem atestado do
comportamento transacional do servidor HackenProof. Comandos e saídas desta
revalidação: `docs/evidence/local/2026-10-17/audit-claim-verification/`.

Penalização por reputação permanece **PENDING / não verificada**. Não inferir
inexistência a partir da ausência de menção nessas páginas. Persistência de auth
continua pendente como implementação; o uso atual de memória é observável no código.

Há também uma distinção de emissor: o ID-JAG de entrada é verificado contra a
chave confiável do provider. A identity_assertion emitida pelo serviço é verificada
contra a chave do próprio Authorization Server na troca por token. Não se deve
descrever ambas as verificações como feitas contra o JWKS do provider original.

O pacote `triage-evaluation/run-01/review-package` foi preparado para o revisor
`admin`, com formato DID não conforme e independência assumida conservadoramente
como false. Seu estado é PREPARED_NOT_REVIEWED. Preparar arquivos não equivale a
concluir revisão humana, assinar ou promover o perfil de governança. Conhecimento
prévio dos resultados impede alegar revisão cega; nenhuma métrica histórica foi
recalculada e a revisão independente continua pendente.
