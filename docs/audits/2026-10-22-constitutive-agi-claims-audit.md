# Auditoria das alegações de lacunas de AGI constitutiva

Data: 22 de outubro de 2026. Escopo: checkout local em `D:\arkhe`.

Seguimento: a [auditoria das cinco camadas e fontes externas](2026-10-22-five-layer-external-and-code-audit.md)
registra a implementação posterior de um certificado aritmético limitado no gate.
O diagnóstico abaixo preserva o estado anterior a essa implementação.

## Conclusão

O texto identifica lacunas reais de geração e validação de provas formais, mas o diagnóstico de que todos os onze componentes estão inteiramente ausentes não se sustenta. Ele mistura nomes de arquitetura com código executável e subestima revisão humana, roteamento por risco, verificação composta e autorização anterior à execução.

Não foi encontrada uma implementação completa de qualquer um dos onze componentes com todo o escopo proposto. Isso não significa ausência de suas capacidades constituintes. Cinco itens têm capacidades parciais relevantes: selagem temporal (4), verificação cruzada (5), degradação controlada (7), ação acompanhada de autorização (9) e governança de especificações (11). Os demais seis permanecem lacunas no sentido específico proposto, alguns com infraestrutura adjacente.

Esta é uma auditoria de implementação, não uma validação dos papers, de prioridade científica ou de uma definição de AGI. Ausência significa não localizada no código ativo examinado; não demonstra inexistência em outros repositórios ou branches. Snapshots em `archive/`, cópias em `ops/`, builds, dependências e fixtures externas não foram tratados como implementação ativa.

## Matriz de evidências

| # | Alegação | Veredito contra o código | Evidência e limite |
|---|---|---|---|
| 1 | Falta `PcoInferenceEngine` | Lacuna confirmada no escopo proposto | `integration/arkhe-ollama/src/lib.rs` executa inferência com modelo fixado por digest e retorna `Completion`; não produz certificado formal. `cognition/arkhe-agent/src/lib.rs` produz plano e WER, explicitamente uma proposta. Não foi localizado acoplamento a provador formal. A conclusão de que o sistema só audita e não participa da cognição é excessiva: há inferência e análise executáveis. |
| 2 | Falta `SpecCompiler`; gate só verifica hashes | Compilador formal não localizado; caracterização do gate incorreta | `governance/arkhe-governance/src/lib.rs` define `PolicyResolver`, `PolicyVerdict` e `PolicyBinding`. `kernel/arkhe-kernel/src/lib.rs` consulta política, módulos e operações permitidos, classificação e revisão humana. `integration/arkhe-bugbounty/src/classification.rs` implementa regras de domínio. Não há tradução de políticas para Rocq/Coq/LTL/STL, mas já existem predicados executáveis de conformidade. |
| 3 | Falta `FormalProofValidator` | Lacuna confirmada para certificados formais | `verification/crates/arkhe-verify-wasm/src/lib.rs` exporta verificações criptográficas, MMR, credenciais e artefatos. Não foi localizado checker de certificados Rocq/Coq ou lógica temporal. As verificações existentes não equivalem a prova semântica da resposta do modelo. |
| 4 | WormGraph só ancora hashes e não há cadeia humana/temporal | Parcial; ausência total refutada | `kernel/arkhe-core/src/review.rs` contém `HumanReviewRecord`: revisor, decisão, operação, análise, política, `reviewed_at` e `expires_at`. O gate vincula e verifica esses campos. `orchestration/arkhe-runtime/src/preview.rs` verifica assinaturas separadas do supervisor e revisor, sequência temporal e escopo; a fila persiste o bundle. `evidence/arkhe-wormgraph/src/anchor.rs` inclui checkpoints assinados com `issued_at`. Não foi localizado protocolo HTS nem modelo geral de responsabilidade por papel e contexto de preservação. Timestamp assinado não demonstra, sozinho, hora certificada por autoridade externa. |
| 5 | Só existe `CompositeProof` de DePIN; evidências são isoladas | Parcial; generalização incorreta | `CompositeProof` combina commitment e inclusão MMR, mas declara que assinaturas de provider e alegações TEE permanecem sem validação (`integration/arkhe-depin/src/proof/mod.rs`). Além disso, `integration/arkhe-bugbounty/src/review/votes.rs` combina votos de verificadores, detecta conflitos e exige confirmações independentes; é experimental e não concede autoridade. A admissão de preview combina baseline, supervisor, revisor e política. Falta um motor geral DePIN + TEE autenticado + prova formal com política por domínio. |
| 6 | Falta agente autônomo de verificação e slashing | Lacuna confirmada no escopo proposto; premissa do texto não confirmada | `evidence/arkhe-wormgraph/src/detection.rs` implementa observações assinadas e uma regra causal reproduzível em laboratório; não um monitor autônomo geral. Não foram localizados `EquivocationDetector` ou `SlashingEngine` ativos. `integration/arkhe-depin/README.md` declara slashing não implementado. O texto pressupõe componentes existentes que este checkout não contém. |
| 7 | Não há degradação quando faltam provas ou orçamento | Parcial; ausência total refutada | `ReviewRouter` em `integration/arkhe-bugbounty/src/review.rs` encaminha risco, ambiguidade, baixa confiança e política não aprovada para revisão humana. `review/votes.rs:139` encaminha orçamento de fontes esgotado para `ReviewRequired`; esse roteador é explicitamente experimental. O gate bloqueia falta de evidência e revisão inválida. Falta uma política geral de orçamento/custo de verificação e redução controlada de escopo. Bloquear a ação já é um comportamento existente. |
| 8 | Falta registro de SLMs regulatórios | Lacuna confirmada no escopo regulatório | A configuração Ollama fixa identidade e digest do modelo; `verification/crates/arkhe-verify-core/src/gguf/supply_chain.rs` oferece perfil laboratorial de proveniência de artefato. Não foi localizado registro de autoridades/modelos acoplados a especificação formal e compromisso de treinamento. Pin de modelo não certifica treinamento nem conformidade regulatória. |
| 9 | Falta PCA e `arkhe-agent` já tem `AuthorizationProof` | Parcial; premissa de `AuthorizationProof` incorreta | `ContainmentGate` gera `authorization_ref` vinculando intenção, política e WER. A admissão de preview verifica o bundle antes de enfileirar; `orchestration/arkhe-runtime/src/bin/arkhe-preview-worker.rs` revalida antes do dispatch. Isso fornece autorização prévia em fluxo delimitado, sem constituir certificado formal portável para smart contract. `cognition/arkhe-agent/src/lib.rs` contém plano/WER, não `AuthorizationProof`. Não foi localizada execução on-chain condicionada a prova formal do WER. |
| 10 | Falta `LiabilityMarket`, complemento de slashing existente | Mercado não localizado; slashing existente não confirmado | Não foram localizados apólices, subscrição de risco, staking de validade ou liquidação de seguro no código ativo. O README DePIN declara slashing não implementado. Payout/journal e propostas de transação Paybox não implementam seguro de validade. |
| 11 | Não há governança verificável de especificações | Parcial | `integration/arkhe-bugbounty/src/governance.rs` possui perfil versionado, digest canônico, registro de chaves independente, quórum, escopo e prazo de validade. `VerifiedTriagePolicy` compara ID, versão e digest. Isso é governança verificável de política de domínio. Não foi localizado ciclo geral de especificações formais com histórico imutável de versões, ativação e verificação retroativa sob a versão vigente na emissão. |

## Correções centrais ao texto

1. **`ConstitutionStore` não é uma implementação comprovada.** O nome aparece em `design.md:61`, enquanto o crate ativo de governança expõe um contrato de resolução de política. O quórum implementado está no perfil específico de bug bounty.
2. **`AuthorizationProof`, `EquivocationDetector` e `SlashingEngine` não foram localizados como tipos ativos.** `AuthorizationProof` aparece como variante de domínio de hash em snapshots P0 arquivados, por exemplo `archive/p0/arkhe-p0-foundation-v1.2.2/arkhe-p0-foundation-v1.2.2/src/digest.rs:30`; isso não demonstra o mecanismo alegado em `arkhe-agent`. Menções em propostas ou documentos não comprovam implementação.
3. **O gate verifica mais que hashes.** Ele aplica predicados sobre política, operação, módulo, evidência admitida, classificação e revisão humana. A lacuna específica é a prova formal da propriedade desejada, não ausência de toda semântica de política.
4. **Há verificação anterior à ação.** Preview possui admissão, revisão assinada, validade temporal, fila e revalidação antes do executor. Não se deve generalizar esse suporte para pagamentos ou execução on-chain.
5. **DePIN tem limites mais fortes do que o texto admite.** Inclusão MMR não autentica provider, árbitro Gensyn ou TEE. O próprio código e README explicitam isso.
6. **WER e referência de autorização não são certificados de correção de inferência.** Vinculação criptográfica identifica e preserva evidência; a verdade factual e a suficiência da política exigem outras garantias.

## Limites epistemológicos

As afirmações sobre o gargalo da AGI, a posição do PCO como padrão emergente, precedência científica e os papers MIT/IACR/HTS/LICITRA não são decididas por inspeção deste repositório e não foram verificadas externamente nesta auditoria. Não devem ser elevadas a `LEMMA` com base neste trabalho.

A necessidade dos onze módulos para AGI, a identidade entre cognição e verificação e o título de "primeira AGI constitutiva" continuam hipóteses. Acrescentar um provador demonstra propriedades especificadas sob certas premissas; este código não fornece evidência de que isso baste para AGI.

## Prioridade técnica derivada da auditoria

O próximo passo verificável é delimitar um predicado concreto, entradas autenticadas, formato de certificado e checker independente; integrar esse certificado ao caminho de admissão existente; e testar rejeição de certificado inválido, política trocada, replay e execução que tente contornar o gate. A decisão de implementar compilador, registro regulatório ou mercado de responsabilidade depende desse contrato e dos domínios pretendidos. Não há evidência no código que torne os onze módulos requisitos universais.

## Validação desta auditoria

Foram examinados fontes, manifests, documentação de limites e testes dos módulos relevantes. A busca cobriu nomes exatos e capacidades equivalentes nos diretórios ativos, com exclusão de dependências e builds. Nenhuma implementação de produto foi modificada.

Execuções locais concluídas nesta auditoria:

| Comando | Resultado |
|---|---|
| `cargo test -p arkhe-kernel -p arkhe-depin -p arkhe-wormgraph --lib --tests` | 32 passaram; 0 falharam; 1 integração PostgreSQL ignorada por exigir `ARKHE_TEST_RUNTIME_DATABASE_URL` e roles migradas. |
| `cargo test --locked -p arkhe-bugbounty --lib --test governance --test review --test trust_profiles` | 48 passaram; 0 falharam. Inclui quórum, registro de confiança, orçamento esgotado, conflito de votos e revisão. |
| `cargo test --locked -p arkhe-runtime --test preview_admission` | 8 passaram; 0 falharam. Inclui assinaturas, tempo, escopo, evidência indisponível e tentativa de contornar o gate. |

Total: **88 testes passaram, 0 falharam, 1 ignorado**. Não foram executados toda a suíte do workspace, validação PostgreSQL real, executor Podman, inferência Ollama real ou interação blockchain. Esses resultados sustentam os caminhos testados, não certificam operação de produção, conformidade regulatória ou AGI.
