# Revisão técnica e requisitos — Arkhe GovTech, Volume 3

Data: 24/10/2026. Fonte: PDF de 23 páginas fornecido pelo usuário. Referências de página abaixo usam a posição física no PDF, incluindo capa e sumário. Comparação com D:/arkhe, por inspeção de código, documentação e testes direcionados. O PDF foi tratado como objeto de análise; suas prescrições não foram executadas como instruções. Nenhum código de produto foi alterado.

## Parecer

A separação entre proposta, política, admissão de evidência, autorização e efeito tem correspondência concreta no projeto. O documento é útil como arquitetura-alvo, mas ainda não sustenta a apresentação de uma plataforma estatal integrada ou de conformidade regulatória completa. As principais lacunas estão na identidade ICP-Brasil, conectores públicos, execução sob falhas, distribuição da PCO no WASM, persistência da prova e qualificação operacional. Há diferenças relevantes entre o runtime Rust/PostgreSQL e o portal Intra/Enterprise SQLite; a existência de uma capacidade no primeiro não qualifica o segundo.

## Achados priorizados

1. **P0 — A promessa de efeito exatamente uma vez é excessiva (p. 9, 19, 22).** OperationId e journal local não resolvem o intervalo entre efeito remoto e gravação do recibo. `kernel/arkhe-kernel/src/broker.rs` possui `Reservation::Uncertain`; o executor é chamado antes de `complete`. O comportamento conservador é bloquear repetição e reconciliar, como explica `docs/FORMAL-PREDICATES.md`. Exigir deduplicação transacional no destino e consulta por OperationId; timeout depois do efeito deve entrar em estado incerto. Substituir a promessa por execução com prevenção local de duplicatas e reconciliação de resultado incerto.

2. **P0 — PCO geral e obrigatória não corresponde à implementação (p. 4, 8–9, 18–19).** `PolicyResolver::required_budget_proof` retorna None por padrão. O checker `verification/crates/arkhe-verify-core/src/output_proof.rs` prova uma soma limitada, vinculada a intent, worker e política; não prova veracidade dos custos, validade jurídica ou adequação de resposta textual. A especificação permite até 256 itens e não é uma prova geral de raciocínio. `PgWormGraph` não implementa o transporte opcional dessa prova; a configuração que a exigir falha fechada. A API WASM inspecionada não exporta `verify_budget_proof`. Corrigir a frase “PCO em WASM” para distinguir checker Rust disponível, perfis existentes no WASM e integração ainda necessária.

3. **P0 — Invariante de não contorno depende do deployment (p. 6–8).** O gate possui negações concretas, mas uma biblioteca não impede acesso alternativo a rede, banco ou credenciais. O comentário do broker atribui isolamento de sistema operacional ao deployment. `PolicyBinding` contém ID, versão e digest; isso não implementa por si só um compilador de normas ou alçadas públicas. Demonstrar inventário de efeitos, IAM, restrições de rede e testes que tentem executar fora do broker. Não apresentar isolamento TEE e mediação universal como propriedades já demonstradas.

4. **P0 — Identidade estatal não foi demonstrada (p. 10–12, 21–22).** O gate genérico não recebe certificados ICP-Brasil/CRL/OCSP; a admissão é responsabilidade de componentes confiáveis. `arkhe-enterprise/MATURITY.md` declara pendentes representação legal, posse de e-CNPJ e mandato verificado. Uma chave Ed25519 ou declaração assinada não equivale a validar cadeia, poderes e revogação. Atribuir a validação a um componente explícito, com vínculos ao tenant, ação, limite, validade e principal.

5. **P1 — MMR não prova completude ou ausência de remoção sozinho (p. 8, 13, 21).** Inclusão prova pertencimento a uma raiz confiável. Um operador que entrega apenas uma raiz nova pode ocultar sufixos ou apresentar históricos divergentes. Há suporte a checkpoints e ancoragem em `evidence/arkhe-wormgraph/src/postgres.rs`, mas é necessário configurar quem retém/confere raiz, sequência e freshness. Exigir checkpoints assinados retidos fora do operador e testes de truncamento, fork e replay. Não confundir retenção durável com mera prova de inclusão.

6. **P1 — Emergency Stop local não demonstra parada global imediata (p. 8, 14).** `ContainmentGate` mantém um booleano por instância, alterado via `&mut self`. Definir propagação autenticada, versão, atraso máximo, cache e comportamento dos workers já enfileirados. Revalidar a parada antes do efeito. A promessa deve distinguir novas autorizações, efeitos em curso e mensagens já aceitas pelo destino.

7. **P1 — Multi-tenant é específico da superfície (p. 13).** Migrações PostgreSQL usam FORCE RLS e o PgWormGraph recusa papéis administrativos/RLS bypass; isso é evidência concreta. Porém `arkhe-enterprise/MATURITY.md` declara portal single-org e multi-tenant pendente. RLS não limita superusuário do PostgreSQL nem administrador do host. Declarar ameaça, papéis de migração/runtime, origem autenticada do tenant e exceções operacionais.

8. **P1 — Referência IND incorreta (p. 5, 11–12, 23).** Decreto 11.529 é de 16/05/2023 e trata do Sistema de Integridade, Transparência e Acesso à Informação. A referência pertinente à instituição da IND é o Decreto 12.198, de 24/09/2024. Corrigir também a marca τ-CONFIRMADO dessa linha.

9. **P1 — Matriz LGPD atribui obrigações imprecisas (p. 13–16).** O texto vigente do art. 20 assegura solicitar revisão; não contém exigência literal de revisão por pessoa natural. HITL pode ser escolha de projeto. O §2º prevê possibilidade de auditoria pela ANPD em circunstância específica, não obrigação geral de auditoria WASM. O art. 20 também não impõe residência nacional absoluta: transferências internacionais são tratadas nos arts. 33 e seguintes. Digest de política não substitui informação compreensível ao titular. Acrescentar base legal, finalidade, minimização, retenção, direitos, incidentes e responsáveis; título sugerido: “Controles técnicos que apoiam obrigações selecionadas”.

10. **P1 — Matriz EU AI Act é incompleta (p. 15–16).** Separar aplicabilidade territorial, classificação de risco, papel de provider/deployer e versão normativa consolidada na data de adoção. No texto de 2024, art. 26(6) prevê prazo apropriado de logs com mínimo de seis meses, sujeito às exceções legais; append-only não define esse prazo. Art. 50 não torna C2PA ou OVERT obrigação nominal. Proveniência assinada não demonstra cumprimento integral das obrigações de transparência. Prazos e alterações posteriores exigem checagem específica antes do contrato.

11. **P1 — Referência CPSI com artigo errado (p. 16, 23).** O valor de R$ 1,6 milhão aparece no art. 14, §2º da LC 182/2021, não no art. 13, §2º. Validar o limite aplicável ao ente e ao edital, inclusive hipóteses próprias de empresas estatais, antes de usá-lo em proposta comercial.

12. **P1 — Criptografia híbrida ainda é arquitetura (p. 17–18).** A existência de FIPS 204/205 não comprova implementação SLH-DSA/ML-DSA no produto. Exigir suite e parâmetros fixos, bytes assinados canônicos, separação de domínio, política AND, resistência a downgrade e vetores independentes. Assinatura híbrida ajuda contra falsificação; não impede replay de mandato nem resolve revogação. O argumento “colher agora, decifrar depois” é de confidencialidade e deve ser separado da preservação de autenticidade. Compatibilidade de Ed25519 com perfil ICP não dispensa certificados, validação e assinatura documental exigidos.

13. **P2 — IETF: drafts reais, interoperabilidade futura não garantida (p. 17).** Os dois identificadores citados foram localizados no Datatracker/IETF. São Internet-Drafts individuais; não apresentar como RFC ou perfil adotado pelo grupo sem evidência. “Migra sem quebra” precisa de schema versionado, mapeamento campo a campo, fixtures e testes cruzados. A existência dos drafts não prova contribuição do projeto nem aderência da implementação.

14. **P2 — PoE/PC2 precisa de semântica verificável (p. 17).** Árvore de raciocínio fornecida pelo agente não atesta trajetória interna efetiva. Definir linguagem de prova, statement, checker e modelo de ameaça. TEE/assinatura de trace pode atestar origem de um registro sob hipóteses; não prova automaticamente correção ou fidelidade do raciocínio.

15. **P2 — Roadmap ainda não é critério de aceite contratual (p. 20–22).** N casos e M órgãos estão indefinidos; faltam SLO, RTO/RPO, orçamento, responsáveis e dependências externas. A descrição diz fases de risco decrescente, mas a escala amplia exposição. Sobreposições de F0/F1 e F1/F2 precisam de marcos explícitos; operações autorizadas offline não devem despachar com mandato expirado, saldo alterado ou política revogada. Revalidar condições voláteis na entrega.

## Matriz de requisitos extraídos

Estados: existente = implementação localizada, sem implicar produção; parcial = parte implementada ou limitada a perfil; pendente = não demonstrado no fluxo estatal revisado. Prioridades indicam o que é necessário antes de piloto com efeitos reais. Critérios são propostas de aceite, não promessas do PDF.

| ID | Origem PDF | Requisito verificável | Estado e evidência local | Critério de aceite / lacuna | Prioridade |
|---|---|---|---|---|---|
| R01 | 4, 8 | Negar ação protegida sem evidência admitida | Existente: kernel/arkhe-kernel/src/lib.rs | Rejeitar ausência, troca de sujeito, parâmetros, política e módulo | P0 |
| R02 | 6, 8 | Isolar cognição de chaves e efeitos | Parcial: contrato do broker e fronteira de admissão | Teste de acesso negado a segredo, rede e credencial do executor | P0 |
| R03 | 8 | Resolver política e alçada do órgão | Parcial: governance/arkhe-governance/src/lib.rs | Perfil real versionado com testes de vigência, valor e tenant | P0 |
| R04 | 4, 8 | Conferir mandato e identidade do principal | Pendente no fluxo estatal; MATURITY Enterprise | Cadeia ICP válida, poderes, escopo, expiração e status por operação | P0 |
| R05 | 8 | Exigir revisão humana conforme política | Parcial: authorize_routed_admitted | Chancela autenticada, separação de papéis e assinatura e-CPF qualificada | P0 |
| R06 | 8, 14 | Emergency Stop em todas as réplicas | Parcial: flag por instância | Propagação com latência definida e teste antes do dispatch | P0 |
| R07 | 8 | Registrar intent, WER e decisão duravelmente | Parcial: PgWormGraph; não confundir com HashMap em memória | Commit atômico e falha fechada em queda de armazenamento | P0 |
| R08 | 8, 13 | MMR por tenant e prova offline | Existente em perfis: postgres.rs e verify-core/src/mmr | Checkpoint externo, tenant/stream e testes de fork/truncamento | P0 |
| R09 | 9, 19 | Certificar soma menor ou igual ao limite | Existente como biblioteca opt-in: output_proof.rs | Custo autêntico, unidade definida, limite e saldo confiáveis | P0 |
| R10 | 9 | Persistir certificado completo antes do efeito | Pendente para transporte PCO no PgWormGraph | Bytes e envelope atômicos, limites de tamanho e recuperação | P0 |
| R11 | 9, 13 | Verificar PCO aritmética no browser offline | Parcial: checker Rust, sem export budget na API WASM inspecionada | Export WASM, fixtures iguais, política/checkpoint retidos pelo auditor | P1 |
| R12 | 9, 19 | Impedir duplicatas e tratar resultado incerto | Parcial: broker.rs e broker_sqlite.rs | Falha depois do efeito, replay concorrente e reconciliação no destino | P0 |
| R13 | 11 | Conector mTLS do órgão e mapeamento WorkIntent | Pendente para X-Via/SIAFE/SEI/e-GP | Sandbox oficial, contrato de API e recibo vinculado ao efeito | P0 |
| R14 | 10 | Integrar login gov.br e identidade autorizadora | Pendente no fluxo estatal | OIDC com issuer/audience/nonce/estado e associação a principal/tenant | P1 |
| R15 | 11 | Consultar bases oficiais com escopo mínimo | Pendente para IND/Conecta | Autorização de acesso, origem e snapshot/digest por consulta | P1 |
| R16 | 11 | Kernel em TEE com atestação verificável | Pendente no deployment revisado | Medida aprovada, quote validada, TCB e revogação | P1 |
| R17 | 11 | Chaves em HSM nacional | Pendente declarado Enterprise | Perfil contratado, assinatura real, rotação, backup e indisponibilidade | P1 |
| R18 | 13 | RLS obrigatório por tenant | Parcial por superfície: Postgres implementa; portal single-org | Negativos entre tenants e papéis, contexto autenticado e pools reutilizados | P0 |
| R19 | 13 | Ciclo sem egresso não autorizado | Parcial como desenho | Allowlist, DNS/telemetria/backups e traço de rede; OCSP/CRL explicitados | P1 |
| R20 | 15 | Solicitação de revisão e informação ao titular | Parcial: revisão técnica não equivale a canal de direitos | Recibo compreensível, protocolo, prazo e vínculo à decisão original | P1 |
| R21 | 15–16 | Logs, supervisão e transparência regulatória | Parcial: mecanismos locais | Matriz de aplicabilidade, retenção, responsáveis e evidências de processo | P1 |
| R22 | 17 | Perfil SCITT/WIMSE versionado | Pendente de conformidade demonstrada | Mapeamento e verificador externo com fixtures positivas/negativas | P2 |
| R23 | 17 | PoE/PC2 de trajetória | Pendente de qualificação | Statement e checker definidos; não aceitar narrativa como prova | P2 |
| R24 | 17–18 | Envelope híbrido Ed25519 + SLH-DSA | Pendente no kernel revisado | Rejeitar assinatura ausente/inválida e downgrade; vetores independentes | P1 |
| R25 | 18–19 | Pilotos compras, despesas e atendimento | Pendente como fluxo estatal real | Começar por um processo, dataset e destino acordados; aferir erro e tempo | P1 |
| R26 | 21 | Pacote de auditoria dos oito itens | Parcial: verificadores e checkpoints | Auditor externo reproduz sem rede, com raízes próprias e amostra definida | P1 |
| R27 | 22 | Fila offline e atualização de política seguras | Parcial: journal conservador | Revalidar mandato, saldo, política e parada antes de efeito tardio | P0 |
| R28 | 21–22 | Operação, recuperação e escala comprovadas | Parcial: runbooks Enterprise; operação externa pendente | RTO/RPO, restore, carga, plantão, número de casos/órgãos definidos | P1 |

## Comparação entre superfícies

- **Kernel Rust:** valida bindings e evidência admitida, revisão e predicados selecionados pelo resolver. A política de desenvolvimento não autoriza transições protegidas. Não atribuir ao kernel genérico semântica jurídica implementada por perfis ainda não fornecidos.
- **Evidência PostgreSQL:** persistência, tenant e checkpoints são concretos. `WormGraph::new()` é uma implementação em memória distinta de `PgWormGraph`; um exemplo com a primeira não prova durabilidade da segunda.
- **Verifier Rust/WASM:** MMR e verificadores de perfis existem. A exportação WASM inspecionada inclui funções de governo sintético, lifecycle e MMR; governo sintético é explicitamente diferente de identidade oficial. Soma aritmética Rust não deve ser anunciada como exportação WASM já disponível.
- **Broker:** journal com estado incerto é um controle útil; falta qualificar cada integração remota. Journal SQLite opcional não é automaticamente o journal do runtime PostgreSQL.
- **Intra/Enterprise:** portal autenticado local com persistência e verificação; documentação de maturidade limita a uma organização por instalação e declara ICP/HSM/Serpro real pendentes. Não herda RLS do runtime Rust por compartilhar repositório.

## Sequência recomendada

1. Corrigir referências, escopo das provas, estado τ e promessas de exactly-once, TEE e identidade. Distinguir padrão existente, implementação local e integração qualificada em colunas separadas.
2. Fechar um único fluxo sintético de despesas: fontes autenticadas, perfil obrigatório de soma, persistência da prova, export WASM e auditoria com checkpoint retido.
3. Exercitar destino simulado com timeout após commit, concorrência, queda do worker e reconciliação; depois qualificar um destino oficial.
4. Integrar mandato ICP e revisão do servidor; exercitar revogação, expiração e parada no momento do efeito.
5. Só então ampliar tenants, infraestrutura TEE/HSM e piloto público. Tratar pós-quântica e perfis IETF como entregáveis separados, com testes próprios.

## Fontes externas verificadas

- LGPD, texto compilado, art. 20 e arts. 33 e seguintes: https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Decreto 11.529/2023: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/decreto/d11529.htm
- Decreto 12.198/2024, descrição oficial: https://www.gov.br/conarq/pt-br/legislacao-arquivistica/decretos-federais/decreto-no-12-198-de-24-de-setembro-de-2024
- LC 182/2021, art. 14, §2º: https://planalto.gov.br/ccivil_03/leis/lcp/lcp182.htm
- AI Act, texto de 2024 e acesso à consolidação: https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32024R1689 e https://eur-lex.europa.eu/eli/reg/2024/1689
- SCITT individual draft: https://datatracker.ietf.org/doc/draft-thaha-scitt-agent-execution-evidence/
- WIMSE individual draft: https://www.ietf.org/ietf-ftp/internet-drafts/draft-thaha-wimse-agent-evidence-binding-00.html
- OWASP LLM06:2025: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- ITI, parâmetros ICP: https://repositorio.iti.gov.br/instrucoes-normativas/IN2022_22_DOC-ICP-01.01.htm

Verificação normativa pontual para a revisão técnica; não houve auditoria jurídica integral, validação das datas do programa GovTech, das cifras de investimentos nem dos números de conjuntos/consultas. Esses itens precisam de fonte primária datada antes de publicação.

## Validação e limites da revisão

Leitura textual das 23 páginas e inspeção visual da Figura 1 (p. 7); inspeção de fontes de gate, policy resolver, checker aritmético, broker/journal, PgWormGraph, RLS e API WASM, mais documentação de maturidade. Não houve deployment, despacho a sistema público, acesso a credenciais, validação de HSM/TEE ou execução de integração PostgreSQL nesta revisão. Evidências antigas em STATUS/MATURITY são declarações históricas e não foram contadas como testes executados hoje.

Testes executados nesta revisão: **35 passaram, zero falhas**.

- `cargo test --locked -p arkhe-kernel --features sqlite-broker --test budget_pco --test rejection_gates --test action_broker --test broker_durable --test formal_predicates`: 27 testes passaram (9 + 5 + 3 + 2 + 8).
- `cargo test --locked -p arkhe-verify-core --test mmr --test gov_offline --test gov_lifecycle`: 8 testes passaram (2 + 2 + 4).

Cobertura observada: negação e parada, vínculos e adulteração de certificados, PCO aritmética, troca de especificação durante leitura, replay, persistência SQLite/reabertura, reservas concorrentes, mandato AP2 e checkpoints/MMR/governo sintético. Esses resultados sustentam os perfis testados; não demonstram conectores públicos, ICP-Brasil, isolamento de deployment, PostgreSQL em execução ou produção.
