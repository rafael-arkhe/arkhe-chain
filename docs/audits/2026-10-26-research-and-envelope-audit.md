# Pesquisa de 2026: fontes, inferências e envelope de evidência

Consulta em 26/10/2026, com corte de conhecimento nessa data. Escopo de código:
workspace raiz `D:\arkhe`, especialmente retrieval B, broker, WER e WormGraph.
O texto recebido foi tratado como alegações a conferir, não como evidência.
CONFIRMADO significa que a fonte contém a afirmação; REPORTADO não significa
reproduzido; NÃO LOCALIZADO não significa inexistente; INFERÊNCIA não é teorema.

## Verificação das afirmações externas

| Afirmação | Resultado e correção | Fonte primária |
|---|---|---|
| Definição econômica de AGI da OpenAI | CONFIRMADO como definição institucional; não é consenso científico nem teste operacional. | [Charter](https://openai.com/charter/) |
| DeepMind, março de 2026, dez dimensões | CONFIRMADO: percepção, geração, atenção, aprendizagem, memória, raciocínio, metacognição, função executiva, resolução de problemas e cognição social. É uma proposta de avaliação. | [Framework cognitivo](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/measuring-agi-cognitive-framework/) |
| Revisão Elsevier com 393 estudos e campo fragmentado | CONFIRMADO no resumo indexado da editora: 927 registros triados, 393 incluídos. O corpo do artigo retornou HTTP 403; não foi auditada a metodologia completa. | [Artigo S1574013726001772](https://www.sciencedirect.com/science/article/pii/S1574013726001772) |
| WIRED, setembro, sem teste ou data consensual | Referência localizada: Malak Saleh, 30/09/2026. O diagnóstico é compatível com a diversidade de critérios das fontes primárias; jornalismo não prova impossibilidade de consenso futuro. | [Texto jornalístico original](https://www.wired.me/story/what-is-artificial-general-intelligence-or-agi-and-how-close-are-we), [framework DeepMind](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/measuring-agi-cognitive-framework/) |
| Todos os benchmarks de conhecimento/matemática saturaram | GENERALIZAÇÃO NÃO SUSTENTADA. Exigir benchmark, versão, split, custo e harness; progresso em alguns testes não demonstra saturação de toda a classe. | [ARC 2026](https://arcprize.org/competitions/2026) |
| ARC-AGI-2 foi fechado porque houve verificação intermediária | NÃO DEMONSTRADO: faltam sistema, split e ablação causal. A competição 2026 ainda recebe submissões até 02/11 e anuncia resultados em 04/12; isso também não exclui resultados externos fortes. Não confundir score público com solução privada reproduzível. | [ARC-AGI-2 2026](https://arcprize.org/competitions/2026/arc-agi-2) |
| Scores dependem do harness | CONFIRMADO em exemplo concreto: ARC Prize reporta 62,7% e 99,9% para Astra em ARC-AGI-3 Semi-Private, com harnesses distintos e custos diferentes. Não atribuir esse resultado ao ARC-AGI-2. | [ARC Prize, 03/09/2026](https://arcprize.org/blog/astra) |
| PCO, IACR, maio de 2026 | CONFIRMADO: preprint 2026/994, recebido em 19/05. Predicados decidíveis, prova verificável e compromisso anterior ao uso. O escopo exclui autenticidade das entradas e correção da especificação; as propriedades criptográficas têm hipóteses. | [PCO](https://eprint.iacr.org/2026/994) |
| PCO formaliza o componente do Arkhe | ANALOGIA ARQUITETURAL. O paper não certifica este checkout nem estabelece prioridade. O Arkhe já possui certificado aritmético limitado; assinatura de WER não o transforma em prova formal universal. | [PCO](https://eprint.iacr.org/2026/994), [auditoria local anterior](2026-10-22-five-layer-external-and-code-audit.md) |
| PC2 e Airlock verificam antes de cada operação | CONFIRMADO: Ciliberto, Rudi e Tassi, arXiv:2610.28484, 20/10/2026. As garantias dependem do modelo e das hipóteses de ligação ao mundo. | [PC2](https://arxiv.org/abs/2610.28484) |
| WER é a prova PC2; SignedPolicyBundle é seu contrato | EQUIVALÊNCIA NÃO DEMONSTRADA. Registro de execução e política assinada não substituem uma derivação formal verificável de preservação de invariantes. | [PC2](https://arxiv.org/abs/2610.28484) |
| x401 foi lançado em junho e trabalha com x402 | CONFIRMADO no anúncio de 25/06; documentação Proof descreve credenciais verificáveis e autorização de transação. Não é prova de integração com Arkhe. | [Anúncio Proof](https://www.proof.com/blog/identity-infrastructure-agentic-internet-x401), [documentação](https://dev.proof.com/docs/x401) |
| Todo x401 exige X.509, hardware e biometria; Visa/Circle/Okta são contribuidores | PARCIAL: anúncio confirma Circle, IAL2/CA e opção biométrica na implementação Proof; o protocolo é neutro quanto ao emissor. A lista completa em x401.id não abriu. Não confirmar Visa/Okta nem universalizar detalhes do wallet com essa evidência. | [Anúncio Proof](https://www.proof.com/blog/identity-infrastructure-agentic-internet-x401) |
| FinCEN reconheceu certificados privados para KYC | CONFIRMADO COM CONDIÇÕES: FAQ de setembro permite credenciais eletrônicas privadas como método não documental, conforme o CIP da instituição e autenticação equivalente. Não é aprovação geral de fornecedor, certificado ou transação. | [FAQ oficial, p. 2](https://www.fincen.gov/system/files/2026-09/MDL-VDC-FAQs.pdf) |
| KYA trata de agente, principal e permissões | CONFIRMADO como família de propostas e implementações. A afirmação de que o mercado não possui prova portátil não foi demonstrada; já há propostas com evidência verificável e recibos. | [AgentFacts](https://arxiv.org/abs/2506.13794), [implementação KYA](https://knowyouragent.ch/en) |
| Mastercard: um em dez compradores até 2030 | CONFIRMADO como previsão de futuristas publicada em 08/09, não taxa observada. Os 31% nessa publicação referem-se a adolescentes que preferem recomendações de IA às de amigos; não sustentam o percentual de rejeição a gasto autônomo. A origem deste último não foi localizada. | [Mastercard](https://www.mastercard.com/news/europe/en/newsroom/press-releases/en/2026/mastercard-report-predicts-that-one-in-10-people-will-routinely-use-ai-agents-to-shop-and-pay-by-2030/) |
| Dream-RSI usa história como replay e reduz chamadas 162× | REPORTADO no paper 2609.14858: ganho de até 162× sobre SimpleTES no Lasso path solver; 1,7× sobre exploração fixa. Não é ganho universal nem resultado medido no Arkhe. | [Paper, introdução](https://arxiv.org/html/2609.14858v1) |
| Dream-RSI implementa INV-DISCOVERY-01 do Arkhe | INFERÊNCIA: o paper não prova conformidade ao invariante local nem exatidão de replay fora do espaço histórico realizado. O learning local continua proposta/revisão. | [Dream-RSI](https://arxiv.org/abs/2609.14858), [learning local](../../cognition/arkhe-learning/src/lib.rs) |
| Roadmap Arkhe F0–F6, Zenodo, setembro | NÃO LOCALIZADO com DOI/autoria inequívocos nas buscas realizadas ou nos documentos ativos consultados. Um homônimo localizado é um repositório científico de outro autor. A sequência é tratada abaixo como proposta do texto recebido, sem atribuição bibliográfica confirmada. | [Roadmap local C0–C8](../ROADMAP.md) |
| JunoClaw possui CVE ilustrando limites de integridade | CONFIRMADO: CVE-2026-43993 descreve SSRF por URLs fornecidas ao bridge. É exemplo de falha de aplicação, não experimento que prove insegurança universal de TEE. | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-43993) |
| Verificação prova apenas integridade, nunca correção | CORRIGIR: hashes/assinaturas apoiam integridade/autenticidade; provas formais podem estabelecer correção funcional relativa à especificação e às hipóteses. Não estabelecem automaticamente adequação da especificação ou verdade factual. | [PCO](https://eprint.iacr.org/2026/994), [PC2](https://arxiv.org/abs/2610.28484) |
| Capacidade verificada é AGI; Arkhe é AGI refutada | CONCLUSÕES EXCESSIVAS. O estado local é AGI NÃO DEMONSTRADA; pre-product não é uma refutação lógica. Auditoria não fornece definição universal de AGI nem prova de suficiência de um envelope verificável. | [Status local](../STATUS.md), [framework cognitivo](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/measuring-agi-cognitive-framework/) |

## Reconciliação com o código

O crate `integration/arkhe-ritual` é um workspace experimental separado, com
atestado mock e testes de efeitos simulados. Não representar sua existência como
F0–F2 completos, execução TEE real, pagamentos reais ou qualificação de produção.
O workspace raiz já contém crates de cognição, memória, aprendizagem, políticas,
MMR e verificações limitadas: F4/F5 não podem ser rotuladas como ausência total.
A existência dos componentes também não demonstra cognição geral.

O broker já implementava `reserve_tokens` e `settle_tokens` com falha por overrun.
`grant=0` é o identificador da primeira reserva, não uma reserva de zero tokens.
A lacuna era a integração com um runtime que conhece o custo de entrada antes
de inferir e limita a saída. O Ollama continua sem essa garantia neste perfil.

O pacote externo de 75 casos e o grader já existiam. Nenhuma terceira organização
foi contatada ou validada. Não promover `citation_report_trust` apenas porque uma
implementação adicional concorda. Independência, correção semântica e conformance
lexical são propriedades diferentes.

## Entrega de implementação

Veja [contrato e execução do envelope](../EVIDENCE-ENVELOPE.md) e
[roadmap revisado](../RESEARCH-ROADMAP-2026-10-26.md). A entrega acrescenta um
adaptador GGUF local estrito, assinatura Ed25519 do WER canônico, journal local
com checkpoints assinados no perfil WormGraph/MMR e verificação offline sob
trust roots externos. Não altera o formato canônico do WER existente nem promove
o gate de desenvolvimento, a confiança lexical ou a alegação de AGI.

O smoke CLI sela retrospectivamente um fixture existente com chaves descartáveis.
Isso valida o novo caminho criptográfico; não autentica retroativamente a
execução original. Resultado: `output/evidence-envelope-smoke-20261026/result.json`.
O backend llama-cpp-python 0.3.36 foi instalado em ambiente Python isolado sob
`tmp/evidence-envelope-venv/`. O ensaio com os pesos já presentes confirmou
tokenização e reserva de 31 tokens, mas atingiu 180 s sem uso final mensurado.
O worker foi encerrado, o resultado é FAILED e a reserva foi conservada.
Não se alega inferência concluída nesse modelo. Artefatos em
`output/bounded-gguf-smoke-20261026/`; testes de contrato cobrem a conclusão sob
runtime controlado. O aceite operacional de uma geração real permanece separado.
