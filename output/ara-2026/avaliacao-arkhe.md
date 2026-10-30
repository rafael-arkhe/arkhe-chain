# Arkhe — avaliação corrigida para AWS Cryptography Fall 2026

Data: 22/10/2026. Substitui o parecer anterior, que tomou o anexo errado como projeto principal. O objeto correto é o ambiente Arkhe em D:\arkhe; o deck do jogo não fundamenta este parecer.

## Conclusão

**Arkhe apresenta aderência temática forte a partes específicas do edital e uma base implementada verificável.** O enquadramento recomendado é a composição de proveniência, evidência autenticada, certificados de propriedades delimitadas e autorização de ações de IA. Isso é muito mais relevante ao edital do que indicava a primeira avaliação. A existência de engenharia e testes não basta, porém, para demonstrar novidade científica ou assegurar competitividade.

**A elegibilidade pessoal de Rafael como PI permanece não comprovada.** O currículo informa fundador/arquiteto e pesquisador voluntário, sem demonstrar vínculo como docente em tempo integral de instituição acadêmica acreditada ou pesquisador permanente de ONG juridicamente elegível. A ausência de doutorado não é o impedimento identificado. Confirmar eventual vínculo elegível omitido; caso não exista, propor Rafael como colaborador técnico sob liderança científica e administrativa efetiva de PI elegível. Co-PI também precisa cumprir as regras. O recurso vai à instituição. [Regras](https://www.amazon.science/research-awards/program-rules), [FAQ](https://www.amazon.science/research-awards/frequently-asked-questions).

## Escopo e método

Levantamento transversal da arquitetura ativa, manifests, inventário e documentação, com inspeção direcionada do código e testes dos mecanismos relevantes para a candidatura. Incluídos kernel, cognição, governança/work, evidência, SQL, orquestração, verificador, adapters, Intra, integrações e o workspace separado agi-coder. Não é auditoria linha a linha de todos os arquivos. Dependências, builds, snapshots e cópias em ops/local não foram contados como funcionalidades adicionais.

Distingo execução reproduzida nesta revisão, implementação inspecionada, resultados históricos documentados e hipóteses/planos. A raiz não contém metadados Git reconhecidos: `git rev-parse --show-toplevel` falha. Não pude verificar atividade nos últimos três meses, contribuidores por histórico nem atribuir os resultados a um commit. Datas de arquivos e documentos não substituem essa evidência.

## Projeto inteiro: capacidades e limites

| Subsistema | Evidência e estado | Relevância e limites |
|---|---|---|
| Identidade canônica | WorkIntent/WER, CBOR determinístico, digests com domínios; testes independentes Python/Rust | Base concreta para vincular pedido/saída/evidência; falta prova da composição. |
| Kernel/governança | ContainmentGate, admissão, política e revisão humana; rejeições reproduzidas | Núcleo da pesquisa de autorização. Não prova cobertura de todos os efeitos externos. |
| Certificado de orçamento | Produtor e checker separados, soma u64 exata até 256 parcelas, vínculos a pedido/WER/política/spec | Estudo de caso implementado. Não é prova mecânica do Rust nem prova de inferência neural. |
| WormGraph/SQL | Código e documentação de transações, RLS, append-only, persistência, replay e recibos | Base relevante; PostgreSQL real não reexecutado agora. Transporte durável do novo BudgetProof é lacuna explícita. |
| Verificador portátil | Core puro, CLI/WASM/MCP, MMR e vetores estáticos | Testes nativos reproduzidos; WASM não reexecutado nesta revisão. |
| GGUF | Parser binário e quatro gates de integridade, assinatura e inclusão | PoC concreta; perfil sintético de até 16 MiB/F32 não cobre modelos comerciais grandes em geral. |
| Sigstore/Fulcio | Identidade/OIDC exatos, raiz externa, X.509, SCT, tempo autenticado e Rekor offline | 12 testes reproduzidos. Positivo real é texto público; GGUF real assinado por Fulcio não demonstrado. Não prova SLSA L3. |
| C2PA | Envelope e assinatura Ed25519 restritos; testes passam | Não equivale a compatibilidade universal C2PA ou autoria de qualquer mídia. |
| Preview e execução | Spec por digest OCI, supervisor/revisor, outbox, worker e qualificação externa documentados | Aplicação natural para composição verificação/admissão/efeito. Contenção e produção não reproduzidas agora. |
| Cognição | SDK sem assinatura/escrita, módulos de percepção/RAG/metacognição/world/learning/agent | Fronteira de autoridade relevante; implementações delimitadas/de referência. Não demonstra AGI ou grounding geral. |
| Intra/interfaces | Sessões, papéis, auditoria, assinaturas, avaliação e ferramentas locais descritas | Demonstração e UX de auditoria. Testes do core não qualificam todos os fluxos do aplicativo. |
| E01/Solana | Documentação relata 90/90 finalizações em devnet observadas por dois RPCs; journal preserva falhas anteriores | Resultado histórico, não reproduzido agora; não implica mainnet, consenso independente ou autorização on-chain. |
| DePIN | GensynAdapter/CompositeProof; README declara assinatura fake e hardware opaco | Inclusão de bytes implementada; Verde autenticado, TEE real e slashing não demonstrados. |
| Bug bounty/governo/auth-md/Orkut | Integrações e políticas de domínio no inventário | Casos de aplicação; não significam conformidade universal ou validação de todos os serviços externos. |
| agi-coder | Workspace independente com journal, MMR, verificação e ciclos bounded | Suplemento de pesquisa; não está automaticamente integrado ao kernel principal. README declara limites em memória e simulações. |
| Custódia/Paybox/archive | Custódia contém análise de escopo; Paybox tem contrato isolado; archive guarda versões históricas | Não contar documentação ou snapshots como plataforma operacional consolidada. |

O inventário executado agora reconhece **26 crates Rust, 7 pacotes Node e 16 migrações imutáveis**. Documentos antigos ainda mencionam 19/4/8; preservar suas datas e preferir a configuração executável atual. A referência a Nitro Enclaves no currículo não foi convertida em alegação de implantação TEE integralmente demonstrada no workspace.

## Correspondência com o edital

| Linha | Aderência | Contribuição ainda necessária |
|---|---|---|
| Formalização e definições de segurança de IA | Forte | Modelo adversarial, propriedades e prova/contraexemplos da composição. |
| Colaboração entre organizações em nuvem | Forte como direção; validação multi-organizacional pendente | Papéis separados, corrupção, distribuição de política, rotação e frescor. |
| Verificação formal/estática de software criptográfico aberto | Parcial e relevante | Há código/testes, mas não prova mecânica de kernel/checker inteiro. Delimitar núcleo formal. |
| Proveniência relacionada a IA | Relevante, com delimitação | Artefato/modelo/evidência não equivale automaticamente a proveniência de conteúdo gerado. |
| FHE/MPC, DP, novas primitivas e pós-quântica | Não sustentada nesta revisão | Não inventar esses eixos para adequar a proposta. |
| Ausência de side channels | Não demonstrada | Testes funcionais e bibliotecas de assinatura não estabelecem essa garantia. |

O edital explicitamente acolhe formalização de segurança de IA e protocolos de colaboração em nuvem. A conclusão correta é **boa base de sistemas para candidatura de pesquisa, condicionada a PI elegível e novidade demonstrável**, sem probabilidade numérica de aprovação. [Edital](https://www.amazon.science/research-awards/call-for-proposals/aws-cryptography-call-for-proposals-fall-2026).

## Recorte recomendado

**Arkhe: Compositional Security for Evidence-Gated AI Actions.** A avaliação do sistema inteiro permite escolher uma contribuição financiável: especificar quando identidade canônica, evidência autenticada, predicado verificável, aprovação e commit durável autorizam somente a ação/contexto aprovado. Dois estudos de caso aproveitam implementação existente: admissão de artefatos GGUF/software e ação com certificado de orçamento.

Pergunta central: quais garantias sobrevivem à composição diante de replay, troca de política, substituição de artefato e falha entre admissão e despacho? Resultados podem incluir provas limitadas, ataques reproduzíveis e limites do modo offline. Não propor financiar todos os módulos indiscriminadamente ou demonstrar AGI.

Sigstore, SLSA e protocolos de transparência já fornecem mecanismos de identidade/proveniência/auditoria. É obrigatório comparar com baselines corretamente configurados. A novidade candidata está na composição com predicado de saída e transição autorizada, e ainda exige revisão de literatura especializada. [Sigstore](https://docs.sigstore.dev/about/overview/), [SLSA 1.2](https://slsa.dev/spec/v1.2/provenance), [RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html).

## Verificação reproduzida nesta revisão

| Comando | Resultado |
|---|---|
| `cargo test --locked -p arkhe-verify-core -p arkhe-core -p arkhe-kernel --lib --tests` | 46 passaram, zero falhas/ignorados; inclui 9 PCO, 10 GGUF, 9 envelope C2PA e demais contratos/rejeições. |
| Node do runtime com `--import ./integrations/cosign/test/deny-network.mjs --test integrations/cosign/test/*.test.mjs` | 12 passaram, zero falhas/ignorados; rede bloqueada pelo harness. |
| `python scripts/check_architecture.py` | PASS: 26 crates, 7 pacotes, 16 migrações. |
| `python verification/scripts/verify-vectors.py` | PASS: contrato estático, 10 vetores e perfil MMR. |

Total: **58 casos de teste**, sem contar vetores novamente. Não houve assinatura/publicação nova, interação blockchain ou ação externa. Não reexecutei workspace inteiro, PostgreSQL, Podman, navegador/Intra, inferência, WASM ou provadores externos. Estes resultados não certificam produção.

## Pendências de candidatura

1. Confirmar PI/instituição elegíveis, participação de Rafael, maioridade, restrições Amazon/governo/sanções/compras, submissões concorrentes e aprovações internas.
2. Fornecer histórico Git público, URL, commit congelado, atividade nos últimos 90 dias e número de contribuidores humanos. O workspace Rust declara **Apache-2.0 OR MIT**; confirmar titularidade, textos LICENSE, notices e licenças de adapters/terceiros antes de declarar todo o projeto sob os mesmos termos.
3. Consolidar revisão de literatura, propriedades a provar e protocolo de avaliação com PI de criptografia/métodos formais. Produzir manifest de fontes e logs do snapshot usado.
4. Validar orçamento de USD 72.000 + USD 20.000 em créditos. São estimativas, não cotações AWS ou pagamentos prometidos.
5. Informar apoio Amazon direto/indireto de qualquer integrante nos últimos três anos. Remover dados confidenciais e confirmar direitos.
6. Finalizar proposta PDF, CV do PI e orçamento em uploads separados. Template de 1/10/2026: fonte 11, margens de uma polegada, até quatro páginas de corpo, até duas de referências. As minutas Markdown ainda precisam de paginação e revisão final.

Prazo: **4/11/2026, 23h59 Pacific Time**, ou **5/11/2026, 04h59 em São Paulo**. Tetos: USD 80.000 em dinheiro e USD 40.000 em créditos; decisões previstas para fevereiro de 2027. [Template oficial](https://www.amazon.science/_attachment/ara-proposal-template?id=000001a0-f857-d623-a5b5-fc57a5260001).

## Evidências locais prioritárias

- D:\arkhe\README.md; config\architecture.json; Cargo.toml.
- docs\ARCHITECTURE.md; STATUS.md; SECURITY-MODEL.md; PROOF-CARRYING-BUDGET.md; STAGE10-GGUF.md; PREVIEW-ADMISSION.md; PREVIEW-EXECUTION.md; COGNITION-SDK.md.
- kernel\arkhe-kernel\src\lib.rs e tests; kernel\arkhe-core\tests; verification\crates\arkhe-verify-core\src\output_proof.rs e tests.
- integrations\cosign\README.md e test; verification\README.md; integration\arkhe-depin\README.md.
- docs\E01-JOURNAL-V3.md; agi-coder\README.md; custodia\README.md.
- docs\audits\2026-10-22-five-layer-external-and-code-audit.md: evidência auxiliar, cujos resultados/fontes não foram todos reproduzidos agora.

O currículo fornecido sustenta apenas o diagnóstico de vínculo declarado e experiência pessoal; código não comprova contratação ou elegibilidade institucional.
