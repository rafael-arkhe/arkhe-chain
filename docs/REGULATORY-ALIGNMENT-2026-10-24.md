# Alinhamento regulatório — artefactos, F0/F1 e limites

Data de verificação: 24/10/2026. Este mapa descreve controles técnicos e sua evidência; não atribui conformidade a uma instituição ou produto. O `arkhe-fintech-backend` do texto é um blueprint, não um membro do workspace Cargo ativo.

## Correções nas premissas

- **Pix:** o [Informe SPI 007/2026](https://bcb.gov.br/content/estabilidadefinanceira/informesspi/InformeSPI-007-2026.pdf) exige segregação de finalidade e exclusividade no ambiente Pix. Foi emitido em 08/06/2026, com adequação de certificados já em uso até 08/07 na homologação e 06/09 na produção. Não basta aceitar uma string `CERTPIC` enviada por um cliente.
- **Retenção:** o [requisito 10.5.1 do PCI SSC](https://www.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-C.pdf) combina histórico de pelo menos doze meses com disponibilidade imediata dos três meses recentes. Um campo de configuração, por si só, não prova esse histórico. A fonte citada é o SAQ C v4.0; ela suporta esse requisito específico, não uma avaliação completa v4.0.1.
- **Swift:** o prazo de novembro de 2026 citado no anexo foi alterado. A [comunicação oficial de 27/08, atualizada em 21/09/2026](https://www.swift.com/ja/node/310752) adia as mudanças de pagamentos do SR2026, incluindo endereços estruturados, com nova definição de cronograma anunciada para atualização até dezembro. Não se deve usar páginas anteriores como prova de um prazo universal ainda vigente.
- **Linhagem:** [BCBS 239](https://www.bis.org/publ/bcbs239.pdf) e a [publicação do BIS sobre sua implementação](https://www.bis.org/publications/implementation-principles-effective-risk-data-aggregation-and-risk-reporting-bcbs-239-principles) são referências diretas para agregação/qualidade de dados de risco. Inclusão MMR não prova a correção de RWA ou a completude de uma linhagem causal.
- **Proteção de dados:** o [art. 19 da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) distingue resposta simplificada imediata e declaração completa em até quinze dias. Um filtro por tenant não executa esse processo. Não se generalizou esse prazo para todos os direitos nem se adotou consentimento como base de todo tratamento.

Não foram confirmados nesta ronda percentuais de rollout Basel, afirmações sobre a arquitetura futura do Drex ou uma equivalência entre PCI, SOC 2, ISO 27001 e DORA. Esses itens não são usados como premissas de implementação.

## F0 — segregação na seleção de credenciais Pix

Implementado em `integration/arkhe-pix/crates/arkhe-pix-bcb/src/certificates.rs`, no workspace Pix independente. O registro associa fingerprints do certificado e da chave à finalidade, ambiente, validade e estado de confiança recebido de um processo confiável de cadastro.

O controle rejeita CERTPIC para assinatura, CERTPIA para canal, uso fora de Pix, fingerprint desconhecido, reutilização entre finalidades, certificado revogado/fora da validade e ausência/expiração do estado de revogação. A seleção de assinatura em `BcbClient::prepare_message_signing` passa por esse gate. Mesmo uma seleção válida retorna `NotImplemented`: não foi habilitada assinatura ou comunicação PSP.

**F0 é parcial:** os testes usam registros sintéticos. Não há parser X.509, validação de cadeia ICP-Brasil, consulta CRL/OCSP, HSM, cadastro BCB ou prova de finalidade extraída e autenticada de um certificado real. `chain_checked` e o prazo de revogação são assertivas de um serviço de confiança ainda não integrado; não podem vir do corpo de uma requisição não confiável. O teste de seleção é evidência de uma política local, não de validação criptográfica de certificados.

O recibo Ed25519 sintético existente não se tornou um certificado ICP-Brasil nem um recibo de liquidação. `create_cob` continua sem efetuar operações externas.

## F1 — API versionada e política mínima de retenção

O runtime Rust passa a expor `/v1/health`, `/v1/work`, `/v1/evidence/{digest}` e `/v1/objects/{kind}/{digest}`. Os aliases anteriores continuam usando os mesmos handlers, autenticação e limite de corpo. Isso é versionamento da API Arkhe, **não** geração ou validação de mensagens ISO 20022.

`GET /v1/retention`, autenticado, apresenta a política de `arkhe-wormgraph::retention::RetentionPolicy`:

- `ARKHE_EVIDENCE_RETENTION_DAYS`: padrão e piso de 366 dias.
- `ARKHE_EVIDENCE_IMMEDIATE_DAYS`: padrão e piso de 92 dias, não superior ao período total.
- Valores malformados ou menores fazem o servidor recusar a inicialização. Os pisos em dias são limites locais conservadores para doze e três meses de calendário, respectivamente.

O armazenamento continua append-only, sem rotina de purge, inclusive após o prazo mínimo. Nenhuma migração antiga ou contrato criptográfico foi alterado. A função de cálculo de um mínimo de guarda recebe um timestamp e exige que o chamador use a data confiável de admissão do store; ela não lê autonomamente essa data do PostgreSQL nem está ligada a uma rotina de purge. Atingir a data calculada não concede autorização de exclusão.

O endpoint declara `automatic_deletion=false`, `external_archive_configured=false` e `operational_retention_evidence=NOT_MEASURED`. Não há alegação de que doze meses já transcorreram, de proteção contra um administrador/host comprometido ou de capacidade operacional. A política não se aplica automaticamente a todos os dados pessoais ou a todas as instalações; escopo, base de tratamento, minimização e procedimentos de disposição precisam ser definidos separadamente.

## Matriz de requisitos e evidências

| Referência/tema | Artefacto real e suporte técnico | Critério ainda aberto |
|---|---|---|
| Pix — segregação/exclusividade | Registro local e gate CERTPIC/CERTPIA; quatro testes de política | Cadastro confiável e validação de certificados reais; operação PSP/HSM e aceite institucional |
| PCI 10.5.1, se aplicável | Piso de política, API de inspeção, privilégios append-only; testes de configuração | Histórico real, disponibilidade, backups/arquivo, capacidade e avaliação do ambiente em escopo |
| BCBS 239 — qualidade/linhagem | WER, bytes canônicos, Digest32, MMR e exportação/verificação | Binding a dados e motor de risco, completude, governança e evidência de cálculos corretos |
| ISO 20022 / CBPR+ | Recibo Pix sintético canônico é um artefacto de integridade | Conversor XML, schemas, regras de uso, campos de partes/endereços e validação por canal; não implementados |
| SOC 2 / ISO 27001 / DORA | RLS, autenticação, backup, health e logs podem compor evidências | Escopo, controles organizacionais, período operacional, risco, testes de resiliência e avaliação específica de cada referencial |
| LGPD / GDPR | Fronteiras de acesso e logs ajudam rastreabilidade | Inventário de tratamentos, bases, atendimento de direitos, minimização e retenção por categoria; hashes não são automaticamente anônimos |

RLS não é MFA; `TenantKind` não é RBAC; `rustls` como dependência não prova TLS do servidor; outbox não é automaticamente arquivo imutável; `pgcrypto` não prova criptografia completa em repouso. A versão atual usa AKG-CBOR em partes do kernel e JCS no perfil Pix: não se atribui um único formato a todos os artefactos.

## Validação e reprodução

Execute `python scripts/regulatory_f0_f1_checks.py`. O harness HTTP requer a conexão Podman local `arkhe-runtime` e a imagem PostgreSQL 16 já disponível; não instala serviços cloud, não consulta BCB/PSP e não usa bancos existentes.

[Resultados e hashes](evidence/2026-10-24-regulatory-f0-f1/results.json), [testes raiz](evidence/2026-10-24-regulatory-f0-f1/root-tests.log), [testes Pix](evidence/2026-10-24-regulatory-f0-f1/pix-tests.log), [HTTP/DB real](evidence/2026-10-24-regulatory-f0-f1/live-result.json). O teste HTTP com handlers de teste é separado do exercício com o servidor real.

A migração e o boot HTTP reais ocorrem em PostgreSQL descartável, com role de runtime não administrativa. Conferem autenticação, aliases, política, recusa de configuração fraca e privilégios que vedam UPDATE/DELETE/TRUNCATE. O contêiner criado pelo harness é removido ao terminar. Isso não equivale a teste prolongado de retenção, às três campanhas PostgreSQL ignoradas na suíte padrão ou a certificação de produção. Não houve CI remoto deste patch.
