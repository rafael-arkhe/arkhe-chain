# Auditoria das cinco camadas: fontes externas e implementação

Data de consulta: 22/10/2026. Escopo local: `D:\arkhe`, workspace Rust principal,
aplicação Intra e inspeção suplementar do workspace separado `agi-coder/`.
Complementa a [auditoria dos onze componentes](2026-10-22-constitutive-agi-claims-audit.md).

## Resultado

Há fontes reais para PCO, DeepProve, NSV, GIM e limites de verificabilidade, mas
elas não estabelecem uma definição consensual de AGI nem demonstram que cognição
e prova formal precisem ser a mesma operação. A fórmula das cinco camadas é uma
proposta de arquitetura. A necessidade universal dos componentes continua hipótese.

Nesta auditoria, **confirmado** significa que a fonte primária contém o resultado
ou artefato descrito; **reportado** distingue resultado declarado de reprodução
independente; **não demonstrado** indica que a conclusão excede a evidência; e
**não localizado** não significa inexistência. Um pacote público não é um teorema;
um resultado experimental deve preservar tarefa, split, modelo e condições.
`PENDING` de implementação também não mede a força científica de uma hipótese.

## Fontes externas, alegação por alegação

| Alegação | Verificação e correção | Fonte primária |
|---|---|---|
| A literatura exige arquitetura neuro-simbólica para AGI | O NSV existe como decomposição analítica em uma revisão sobre caminhos neuro-simbólicos. Não é prova de impossibilidade de AGI por outras arquiteturas. | [Revisão NSV, Springer](https://link.springer.com/article/10.1007/s13748-026-00463-7) |
| NSV certifica >95% em <100 ms; 13,8% vs 100% | A revisão reporta 96,82%/91 ms em contexto ROAD-R com perturbação delimitada; os números SCAN são de tarefas/splits específicos. Não medem certificação geral do NSV ou de AGI. Não reproduzidos aqui. | [Revisão NSV](https://link.springer.com/article/10.1007/s13748-026-00463-7) |
| Origem do resultado de robustez citado pela revisão | A referência 12 é Manginas et al., NeSy 2025: verificação aproximada por relaxação para sistemas probabilísticos e aplicação em direção autônoma. Registro primário confirmado; os números exatos não foram reconferidos no PDF original, que não abriu pela ferramenta. A alegação não deve ser promovida a garantia de um loop geral. | [PMLR 284](https://proceedings.mlr.press/v284/manginas25a.html) |
| Grounding cresce exponencialmente com entidades | A revisão discute escalabilidade e explosão combinatória. Isso não justifica uma lei universal para qualquer algoritmo de grounding em função apenas de entidades. | [Revisão NSV](https://link.springer.com/article/10.1007/s13748-026-00463-7) |
| Memória explícita é requisito demonstrado | A fonte identificada é um position paper, aceito na trilha de posições ICML 2026. Defende memória explícita para planejamento/metacognição; não prova necessidade universal nem suficiência para AGI. | [Park, arXiv:2606.11245](https://arxiv.org/abs/2606.11245) |
| Codette demonstra evolução metacognitiva | Há publicação do autor e resultados em 17 problemas. Na tabela v5, o incremento do sistema completo sobre memória não é estatisticamente significativo (p=0,2082). Evidência exploratória; não valida metacognição geral nem AGI. | [Publicação do autor](https://huggingface.co/Raiff1982/codette-paper/blob/main/README.md) |
| PCO IACR 2026/994, três domínios Rocq/STL | Confirmado no registro primário: predicado decidível, par resposta/prova, três estudos de caso e accountability antes do uso. É preprint. As implementações são reportadas; não foram executadas aqui. | [PCO, IACR](https://eprint.iacr.org/2026/994) |
| PCO = prova durante cada operação neural | A propriedade relevante é certificado verificável antes do uso da saída, sob especificação publicada. Isso não implica identidade física entre geração neural e prova, nem provar toda prosa. | [PCO, IACR](https://eprint.iacr.org/2026/994) |
| Binding, hiding, ordenação e correção de auditoria | São propriedades descritas para a camada criptográfica proposta, sob suas hipóteses. Não são consequências automáticas de guardar hashes em um ledger. Autenticidade das entradas e correção da especificação ficam fora do escopo de compliance. | [PCO, IACR](https://eprint.iacr.org/2026/994) |
| DeepProve, CCS 2026 e GGUF | Registro IACR confirma trabalho e publicação CCS 2026. Código primário documenta GGUF e inferência quantizada com argmax; não é prova de qualquer amostragem/modelo arbitrário. Prova de execução não prova verdade factual ou legalidade da saída. | [IACR 2026/1112](https://eprint.iacr.org/2026/1112), [documentação do código](https://github.com/Lagrange-Labs/deep-prove/blob/master/zkml/README.md) |
| Kernel Idris: cinco axiomas, tudo provado por compilar | Projeto existe. `WORM_Audit.idr` declara hash como Nat e assinatura Ed25519 placeholder. `Reasoning_IDL.idr` contém verificações em runtime. Tipos locais não demonstram integração criptográfica ou kernel inteiro de produção formalmente verificado. Não compilado nesta auditoria. | [WORM_Audit.idr](https://github.com/SNAPKITTYWEST/sovereign-agi-kernel/blob/master/idris/WORM_Audit.idr), [Reasoning_IDL.idr](https://github.com/SNAPKITTYWEST/sovereign-agi-kernel/blob/master/idris/Reasoning_IDL.idr) |
| Falta de construtor Remove torna deleção impossível | O construtor limita formas de construir valores; não prova persistência física ou impede toda função de leitura/reconstrução. O fonte expõe `latest`/`toList`, e modela links com hash simplificado. A alegação global é excessiva. | [WORM_Audit.idr](https://github.com/SNAPKITTYWEST/sovereign-agi-kernel/blob/master/idris/WORM_Audit.idr) |
| AGI Gauntlet é teorema de zero contaminação | Pacote PyPI e repositório existem, com alegações de obfuscação e plasticidade. Não foi localizada demonstração de ausência de exposição a todos os modelos. Instâncias dinâmicas/obfuscadas não bastam para garantir isso. `THEOREM` deve ser removido. A expressão exata Nightmare Gates não foi localizada na página consultada. | [PyPI](https://pypi.org/project/agi-gauntlet/), [README do autor](https://github.com/AI-Sovereign/agi-gauntlet/blob/main/README.md) |
| GIM Meta, 820 questões e público/privado | Confirmado: 820 problemas declarados, 615 públicos e 205 privados; diagnóstico de contaminação e integração de operações cognitivas. É um instrumento de avaliação, não certificado de AGI nem garantia absoluta de não contaminação. | [Artigo GIM](https://arxiv.org/abs/2605.18663), [dataset Meta](https://huggingface.co/datasets/facebook/gim) |
| SCAN/COGS/CLEVR demonstram colapso de todos os neurais puros | SCAN e COGS documentam falhas de modelos e splits estudados. COGS reporta 16–35% na generalização dos modelos avaliados. Não é um teorema sobre todas as redes. O número 13,8% não deve ser transferido para COGS/CLEVR. | [SCAN original](https://arxiv.org/abs/1711.00350), [COGS original](https://aclanthology.org/2020.emnlp-main.731/) |
| ARC-AGI-2 usa privado e discute contaminação | Confirmado no relatório ARC Prize 2025: há avaliação privada e discussão de sobreajuste dependente de conhecimento. Não significa que todas as instâncias ou toda pontuação estejam contaminadas. | [Relatório dos autores](https://arxiv.org/abs/2601.10904) |
| Indecidibilidade de segurança após automodificação | Fonte existe e apresenta reduções sob classes/hipóteses explícitas. A versão v4 distingue preservação de um passo e trajetória, domínio fixo finito e quantificação universal. Não implica que um checker de um predicado aritmético limitado seja impossível. | [Artigo v4, PDF](https://arxiv.org/pdf/2606.28639) |
| Trilema vale para qualquer verificador | A generalização é incorreta: resultados de indecidibilidade/complexidade exigem classes expressivas e hipóteses correspondentes. Predicados restritos podem ter checkers corretos, completos e baratos. | [Artigo v4](https://arxiv.org/pdf/2606.28639) |
| Supervisor adequado necessariamente é outra AGI | Contrariado pela própria v4, seção 7: o teorema não exige supervisores Turing-completos e rejeita depender da implicação não provada de adequação para completude de Turing. A obstrução vem da classe indecidível, não do rótulo AGI do supervisor. | [Seção 7, artigo v4](https://arxiv.org/pdf/2606.28639) |
| Verification bandwidth é o gargalo comprovado da AGI | O trabalho econômico realmente propõe esse gargalo e liability underwriting como tese/modelo econômico. Isso não demonstra que capacidade cognitiva deixou de ser problema técnico nem estabelece uma definição de AGI. | [Catalini, Hui e Wu](https://arxiv.org/abs/2602.20946) |

A conferência das fontes confirma sua existência e permite corrigir escopos;
não equivale a revisão formal de todas as demonstrações, reprodução de benchmarks,
auditoria criptográfica dos projetos externos ou validação independente de AGI.
O PDF PCO retornou 403 pela ferramenta; foram usados registro IACR e anúncio
institucional primário. Fontes de código em branches são mutáveis.
O site primário CLEVR/CoGenT também retornou timeout; o resultado comparativo
específico nesse benchmark não foi confirmado independentemente da revisão.

Referências herdadas do texto anterior: o repositório primário
[LICITRA-MMR Evidence](https://github.com/narendrakumarnutalapati/licitra-mmr-evidence)
existe; isso não comprova derivação histórica direta do WormGraph.
As referências HTS e Multi-Layer Cross Verification ficaram sem verificação
primária suficiente: o segundo título foi encontrado em índice secundário, mas
o registro Zenodo indicado não ficou acessível; HTS não foi identificado de forma
inequívoca. Permanecem pendentes, sem inferir falsidade ou validá-las pelo índice.

## Auditoria local das cinco camadas

O workspace `agi-coder/` é executável, mas declara-se separado do Arkhe principal.
Suas capacidades foram inspecionadas como suplemento; não são automaticamente
capacidade integrada ao ContainmentGate principal. `archive/`, builds, fixtures e
dependências não foram contados como implementação de produto.

| Camada / elemento | Evidência no repositório | Conclusão |
|---|---|---|
| 1 — NSV geral | Provider Ollama, módulos cognitivos e gate existem separadamente. `agi-coder/.../agi-coder-cognition/src/agent_loop.rs` tem ciclo bounded perceive/act/verify. | Não há demonstração de um ciclo neuro-simbólico geral com grounding e prova formal de inferência. |
| 1 — Percepção/grounding | `cognition/arkhe-perception/src/lib.rs`: representação é outro hash da entrada e atestação opcional. | Identidade de representação não demonstra grounding semântico do mundo. |
| 1 — Memórias | `evidence/arkhe-memory/src/lib.rs`: memória episódica em mapa com referência legível. `agi-coder/.../agi-coder-memory/src/` contém working/episodic/semantic e checkpoints. | Implementações limitadas; não comprovam continuidade cognitiva geral ou integração das três no Arkhe principal. |
| 1 — Metacognição | `cognition/arkhe-metacognition/src/self_model.rs`: Brier/ECE de previsões resolvidas e autenticadas pelo host. `assess` explicita falta de calibração. | Medição descritiva existe; não equivale a introspecção geral ou ajuste autônomo confiável. |
| 1 — 51 agentes | Não localizado substrato de 51 agentes no código examinado. Votos de verificação e subagentes de coding são conceitos distintos. | Alegação de quantidade/topologia não confirmada. |
| 2 — PCO/produtor | Novo `cognition/arkhe-agent/src/budget_pco.rs`. | Primeiro fluxo determinístico de resultado + derivação aritmética; não é prova de geração neural. |
| 2 — Checker independente | Novo `verification/crates/arkhe-verify-core/src/output_proof.rs`; sem dependência do produtor. | Verifica uma propriedade decidível limitada; Rust/checker não formalmente provados em Rocq. |
| 2 — Accountability | WER, revisão humana, checkpoints assinados e admissão preview já existem. Novo gate exige envelope admitido da prova e compromete seu digest na autorização. | Sem garantia de hiding, timestamp externo ou persistência de prova implementada no PgWormGraph. |
| 2 — ZK de inferência | Não localizada integração DeepProve ou outro verificador end-to-end de tokens. | Proveniência GGUF e hash de modelo não substituem ZK de inferência. |
| 2 — Kernel formal | `kernel/arkhe-kernel/src/lib.rs` aplica verificações Rust e política. | Não há prova mecânica dos invariantes do kernel inteiro ou tipos dependentes que eliminem todas as falhas. |
| 3 — Instâncias reservadas/plasticidade | `apps/arkhe-intra/lib/evaluation-core.mjs` usa HMAC, retenção/fresh/generalization e famílias sintéticas. | Há geração reservada. Não demonstra mudança de regras durante inferência nem zero contaminação universal. |
| 3 — Integração cognitiva | `docs/CAPABILITY-EVALUATION.md`: quatro capacidades sintéticas e limites explícitos. | Não localizado GIM integrado; suíte não mede generalidade inteira. |
| 3 — Generalização composicional | Aritmética mais profunda, DAGs maiores e funções de grau maior nos splits de generalização; `cognition/arkhe-agent/src/eval_learning.rs`. | Testes limitados existem; não localizadas suítes SCAN/COGS/CLEVR completas integradas. |
| 3 — Contaminação | Congelamento de candidato, sementes privadas e avaliador separado estão implementados no Intra. | Reduz exposição direta às instâncias; não é auditoria do corpus de treinamento de um modelo externo. |
| 4 — SpecGovernance | `integration/arkhe-bugbounty/src/governance.rs`: versão, quórum, digest, validade e chaves. | Parcial de domínio; falta ciclo geral de especificações formais e validade histórica. |
| 4 — SLMs regulatórios | Pin de modelo e verificação de artefatos GGUF. | Não localizado registro de autoridades/treino/especificação regulatória. |
| 4 — VerificationAgent | `evidence/arkhe-wormgraph/src/detection.rs` é laboratório de observações e alerta causal. `agi-coder` tem verificação em ciclos delimitados. | Não há detecção de equivocação geral comprovada nem daemon geral de disputas/slashing. Corrige a atribuição do texto recebido. |
| 4 — LiabilityMarket | Não localizado mercado de seguro por validade. README DePIN declara slashing não implementado. | Lacuna permanece. |
| 4 — Degradação | `integration/arkhe-bugbounty/src/review.rs` e `review/votes.rs`: risco, conflito e orçamento esgotado exigem revisão. | Parcial e, no caso dos votos, experimental; falta orçamento geral com redução controlada de escopo. |
| 5 — Escopo da prova | READMEs/STATUS explicitam limites; novo `docs/PROOF-CARRYING-BUDGET.md` delimita predicado, confiança e transporte. | Escopo documentado; não é validador universal de primeira ordem. |
| 5 — Automodificação | `cognition/arkhe-learning/src/lib.rs` propõe mudanças; avaliação Intra exige critérios, assinatura e rollback. | Controles limitados existem; nenhuma prova universal de preservação de alinhamento. |
| 5 — Trilema | Não é um módulo implementável; obriga documentar fronteiras de domínio e custo. | Primeiro checker evita pretensão universal e limita a 256 parcelas. |
| 5 — Regressão supervisória | Verificador e governança são pressupostos explícitos de confiança. | Não se afirma que revisão humana ou outro agente elimina os limites universais. |

## Implementação produzida e efeito no diagnóstico

O novo fluxo verifica `sum(costs) = output.total <= trusted_limit` com derivação
finita, limites de tamanho, aritmética sem wraparound e vínculos de conteúdo.
O gate o exige somente quando o perfil confiável opta em `required_budget_proof`.
Ausência, adulteração ou troca de política/pedido/WER bloqueiam autorização;
revisão humana, negação da política e parada de emergência continuam obrigatórias.

O checker está separado do produtor, mas compartilha tipos e biblioteca de
identidade. "Independente" significa independência do cálculo do produtor, não
uma segunda organização auditora nem implementação formalmente verificada.
O caminho síncrono não pode pular prova exigida; leitores sem transporte de prova,
incluindo o PgWormGraph atual, negam o novo perfil. Nenhuma política de produção,
pagamento, deployment ou ação blockchain foi habilitada.

Este resultado muda a camada 2 de ausência de qualquer certificado semântico para
um **primeiro certificado aritmético limitado integrado à admissão**. Não fecha
as lacunas de Rocq/STL, compilador geral, ZK de LLM, selagem temporal externa,
governança universal ou AGI. Contrato e comandos:
[Proof-carrying budget v1](../PROOF-CARRYING-BUDGET.md).

## Validação local

Execuções concluídas após implementação:

| Verificação | Resultado |
|---|---|
| `cargo test --locked -p arkhe-core -p arkhe-kernel -p arkhe-agent -p arkhe-verify-core -p arkhe-cognition-sdk --lib --tests` | 49 testes passaram, incluindo 9 novos casos PCO. |
| `cargo test --locked -p arkhe-cognition-sdk --doc` | 10 passaram, incluindo negação de acesso a capacidades de assinatura/escrita. |
| `cargo test --locked -p arkhe-bugbounty --lib --test governance --test review --test trust_profiles` | 48 passaram. |
| `cargo test --locked -p arkhe-runtime --test preview_admission --test cognition_conformance` | 9 passaram. |
| `node --test apps/arkhe-intra/tests/evaluation.test.mjs` | 6 passaram. |
| `cargo run --locked -p arkhe-kernel --example budget_pco` | Total 100, certificado e autorização determinísticos, sem efeito externo. |
| `cargo check --locked --workspace` | PASS, 26 crates. |
| `cargo check --locked -p arkhe-verify-wasm --target wasm32-unknown-unknown` | PASS. |
| `cargo clippy --locked -p arkhe-kernel -p arkhe-agent -p arkhe-verify-core --all-targets -- -D warnings` | PASS, sem supressões de lint. |
| `python scripts/check_boundaries.py` | PASS: fechamento de dependências aprovado e ausência de assinatura/escrita na cognição. |
| `python scripts/check_architecture.py` | PASS após reconciliar a entrada DePIN já presente no Cargo.toml com o inventário. |
| `rustfmt --check` nos fontes alterados | PASS. |

Total sem contar reexecuções: **122 testes passaram, nenhuma falha ou teste
ignorado nessas suítes selecionadas**. Foi reexecutado também `gov_offline` após
uma alteração equivalente de lint em `gov.rs` (`is_multiple_of`): 2 passaram,
já contados acima. O registro de arquitetura omitia `integration/arkhe-depin`
antes deste trabalho; o membro foi adicionado ao inventário sem alterar seu código.

Não foram executados toda a suíte do workspace, integração PostgreSQL real,
executor Podman, inferência Ollama/DeepInfer real, provadores/benchmarks externos
ou interação blockchain. Não há claim de prova formal do Rust/checker, segurança
universal, zero contaminação ou qualificação de produção.
