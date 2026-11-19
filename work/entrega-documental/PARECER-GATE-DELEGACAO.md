# Parecer sobre o gate de segunda ordem e o `DelegationContract`

Conferência de 14 de novembro de 2026 sobre o documento recebido ("upgrade para
worldwide orchestrator", N0–N4, `DelegationContract`, falsificadores D1–D3).

O documento não traz código, então o que havia para conferir era a bibliografia —
seis linhas marcadas `LEMMA`, sobre as quais toda a arquitetura repousa — e a
coerência do desenho. Depois disso, construí a parte que já é implementável, que é
maior do que o documento supõe.

## 1. A bibliografia, conferida

| Alegado | τ do documento | Conferido |
| --- | --- | --- |
| **DAWN** — "Designing Distributed Agents in a Worldwide Network" (IEEE) | `LEMMA` | **Confere.** Aminiranjbar, Tang, Wang, Pant e Viswanathan; preprint arXiv 2410.22339, out/2024; versão em IEEE Access vol. 13, 2025 |
| **Leah Maestro** — "super orchestrator" empresarial | `LEMMA` | **Confere.** Lançado em 7/5/2026 pela Leah (ex-ContractPodAi). Ressalva: as fontes são comunicados da própria empresa, sem verificação independente |
| **Agentic Redux** — cálculo lambda tipado, ledger append-only | `LEMMA` | **Confere.** arXiv 2606.04903, "Provably Auditable and Safe LLM Agents from Human-Authored Ontologies", Aaron Sterling. As garantias de correção são dos autores |
| **Lean-Agent Protocol** — kernel de governança em Lean 4 | `LEMMA` | **Confere.** Repositório `arkanemystic/lean-agent-protocol` e arXiv 2604.01483, "Type-Checked Compliance" |
| **D4-kernel** | `LEMMA` | **Não encontrado.** Nenhum resultado para o nome. O que existe de aparentado é `abenenson/legitimacy`, com legitimacy kernels em Lean 4 e Rust, sem relação verificada com "D4" |
| **SC-A2A Gateway / MAMA-V** — trust root para multi-agente | `LEMMA` | **Não encontrados.** Nenhum resultado para nenhum dos dois nomes. O *tema* é real e ativo: A2A discussion #1734 (envelope de atestação composável), IETF `draft-tonyai-a2a-trust-01`, BlockA2A (arXiv 2508.01332) |
| **MCP quorum commits** — "já é padrão em orquestração MCP" | `LEMMA` | **Errado.** A especificação MCP de 2026-07-28 não traz quórum nem aprovação multiparte. O que existe é proposta de terceiro (issue em `developerz-ai/ultimate`) e um Internet-Draft independente, `draft-schrock-ep-quorum-00`, sem vínculo com MCP |

Quatro de sete se sustentam. Dois nomes não existem em lugar nenhum que eu tenha
alcançado. Um está afirmado como padrão existente e é proposta de terceiro — e é o
que mais importa, porque é usado para dizer que "falta apenas a integração" do
consenso epistémico. Não falta a integração: falta o padrão.

Um achado melhor do que o proposto apareceu no caminho. O A2A tem um pull request
(#2099) cuja regra é: **o verificador não pode deixar que a URL do próprio assinante
escolha a raiz de confiança; use uma allowlist do lado do verificador.** Isso é a
resposta certa para o D3, e é mais forte do que subordiná-lo a uma âncora que o
próprio documento admite ser stub.

## 2. O desenho: o que se sustenta e o que não

**O regresso é deslocado, não fechado.** Acrescentar N0 e N1 move a caixa não
verificada um nível acima. O documento admite isso ("sem ancoragem, o N1 é
auto-avaliável") e depois conclui que o upgrade "transforma worldwide orchestrator de
narrativa em arquitetura". As duas coisas não cabem juntas. O que o upgrade entrega é
real mas menor: converte uma lacuna anônima numa lacuna **nomeada**, um nível acima.
Nomear vale; fechar seria outra coisa, e depende de uma âncora que não existe.

**`proof_hash` não é prova.** O `orchestrator_proof` carrega `kind`, `proof_hash` e
`contract_ref`. Não se verifica uma prova Lean 4 a partir do hash dela. Como está, o
D2 só consegue conferir que um hash corresponde a uma referência — associação, não
validade. É a mesma classe de erro do `permission_digest` do contrato v3: um campo que
o emissor preenche com o que quiser, apresentado como prova.

**`signed_policy` dissolve o D2 no D3.** Para esse `kind`, "a prova verifica" é "a
assinatura verifica", que é o teste de identidade do D3. E é o único `kind`
implementável hoje. Logo o N1 de hoje é D1 mais D3, e o D2 é decorativo justamente no
caso praticável.

**`max_actions` não tem contador.** Está declarado no escopo e nada o conta. Sem um
contador ligado ao `delegation_id`, é inexequível.

**`expires_at` não tem contraparte.** A saída do gate é "Allow + delegation_id, ou
Reject + razão": sem momento da decisão. Não há como saber se o gate decidiu antes ou
depois de expirar.

**O elo que falta é o que daria valor ao resto.** Nada no desenho exige que os passos
executados caiam dentro de `scope.resources`, nem que os efeitos caibam em
`max_actions`. O recibo do N3 carrega `delegation_id`, mas nenhuma verificação liga a
delegação à execução. Sem esse elo, o contrato de delegação é um documento **ao lado**
da execução, não uma restrição **sobre** ela.

## 3. O que foi construído

`delegacao.py` implementa o gate com nove verificações nomeadas, e o primeiro
falsificador correu: **19/19**.

| | Verificação | Origem |
| --- | --- | --- |
| D0 | Contrato completo | acrescentado |
| D1 | A política cobre a ação, a classe de agente, cada recurso e o limite | da proposta |
| D2 | A prova referencia este contrato | da proposta, **reduzido**: confere associação, e a decisão declara que não confere validade |
| D3 | Orquestrador na allowlist **do verificador** | da proposta, corrigido conforme A2A #2099 |
| D4 | O contrato não expirou no momento da decisão | acrescentado |
| D5 | A decisão diz quando foi tomada e por quanto vale | acrescentado |
| D6 | Escopo com recurso e limite positivo | acrescentado |
| D7 | A política existe na versão declarada | acrescentado |
| D8 | Ancoragem ausente é declarada como limite, nunca satisfeita por omissão | acrescentado |

O gate roda a montante: `executar.py --delegacao <decisao.json>` **não executa nada**
se o veredicto for recusa, e recusa também quando o plano pede recurso fora do escopo.
A decisão é gravada na captura como recebida.

`X12` fecha o elo que faltava, sobre a execução já gravada: todo passo com recurso
dentro de `escopo.recursos`, efeitos executados dentro de `max_acoes`, `delegacao_id`
da meta igual ao da decisão, decisão dentro da própria janela e antes de expirar,
digest da decisão recalculado, e limites declarados presentes — apagá-los derruba a
verificação. Sete mutantes cobrem isso, todos detectados.

`X12b` é uma linha permanente de **não se aplica**: nenhum registro externo é
consultado. A identidade do orquestrador vale pela allowlist local, que é confiança
local e não raiz de confiança.

Uma separação apareceu ao implementar: a decisão é assinada pela chave do gate, e dar
essa chave ao runner destruiria a separação entre quem autoriza e quem executa. Então
o verificador recalcula o **digest** da decisão e declara que a **assinatura** não é
conferível ali, nomeando a chave que um auditor teria de pedir. Integridade sim,
origem não.

## 4. A pergunta da seção 8, respondida

> DAWN ou Leah emitem um `DelegationContract` que o N1 possa verificar?

**Não, pelo que encontrei.** DAWN é um artigo com arquitetura de Principal Agent e
Gateway Agents; Leah Maestro é um produto cujas descrições são comunicados da própria
empresa. Nenhum dos dois publica um contrato de delegação assinado com escopo,
política e prova, e nenhuma fonte que eu alcancei descreve tal emissão.

O documento diz que, nesse caso, "o upgrade tem de declarar que o N1 é uma `PROPOSAL`
que nenhum orquestrador real alimenta". Concordo com a declaração e discordo da
conclusão de que nada mais resta: o gate continua útil como **gate local com escopo
declarado**, e foi assim que o construí. Ele verifica a delegação que *nós* emitimos
sobre a execução que *nós* gravamos. Isso não é um orquestrador mundial; é o elo entre
autorização e execução, que é a parte que faltava e que não depende de terceiro.

## 5. Honestidade desta rodada

A pesquisa foi feita por busca na web, em novembro de 2026, e não abri os artigos:
os dados vêm de metadados de resultado e resumos de terceiros. "Não encontrado" quer
dizer que não encontrei, não que não exista.

A assinatura é HMAC com chave local: prova que quem assinou detinha a chave, e nada
além. Nenhum verificador de prova formal está registrado no gate —
`VERIFICADORES_DE_PROVA` está vazio de propósito, e um teste confere que está. Nenhum
orquestrador real emitiu o contrato que o gate confere. As fixtures e a política são
minhas, escritas no mesmo processo que redigiu este parecer, sem revisão independente.

## Fontes

- [DAWN: Designing Distributed Agents in a Worldwide Network (Semantic Scholar)](https://www.semanticscholar.org/paper/DAWN:-Designing-Distributed-Agents-in-a-Worldwide-Aminiranjbar-Tang/e91dc06be39092892fe40b5f468b9af9ba501b51)
- [DAWN (TechRxiv PDF)](https://www.techrxiv.org/users/846168/articles/1234443/master/file/data/Agent_WorldWide%20Viswanathan%2020241011/Agent_WorldWide%20Viswanathan%2020241011.pdf)
- [Leah Launches Maestro, the First Super Orchestrator](https://leahai.com/press-releases/leah-maestro-super-orchestrator)
- [Leah's Super Orchestrator (SDCExec)](https://www.sdcexec.com/software-technology/ai-ar/news/22966157/leah-formerly-known-as-contractpodai-leahs-super-orchestrator-to-connect-disconnected-tools-in-unified-view)
- [Provably Auditable and Safe LLM Agents from Human-Authored Ontologies (arXiv 2606.04903)](https://arxiv.org/abs/2606.04903)
- [λA: A Typed Lambda Calculus for LLM Agent Composition (arXiv 2604.11767)](https://arxiv.org/pdf/2604.11767)
- [lean-agent-protocol (GitHub)](https://github.com/arkanemystic/lean-agent-protocol)
- [Type-Checked Compliance (arXiv 2604.01483)](https://arxiv.org/html/2604.01483v1)
- [legitimacy: machine-checked governance for AI agents (GitHub)](https://github.com/abenenson/legitimacy)
- [RFC: Composable Trust Evidence Format for Multi-Provider Agent Attestations (A2A #1734)](https://github.com/a2aproject/A2A/discussions/1734)
- [Agent-to-Agent Trust, Identity, and Verifiable Provenance (IETF draft-tonyai-a2a-trust)](https://datatracker.ietf.org/doc/draft-tonyai-a2a-trust/)
- [Require verifier-side trust root for Agent Card signature verification (A2A #2099)](https://github.com/a2aproject/A2A/pull/2099)
- [BlockA2A: Towards Secure and Verifiable Agent-to-Agent Interoperability (arXiv 2508.01332)](https://arxiv.org/pdf/2508.01332)
- [The 2026-07-28 MCP Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [MCP Specification 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)
- [mcp: confirmations with approver quorum and signed decisions (issue)](https://github.com/developerz-ai/ultimate/issues/994)
- [Multi-Party Quorum Authorization for High-Risk Agent Actions (IETF draft-schrock-ep-quorum-00)](https://datatracker.ietf.org/doc/html/draft-schrock-ep-quorum-00)
