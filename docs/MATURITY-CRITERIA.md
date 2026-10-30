# Critérios de maturidade

Data: 22/10/2026. Aplicação: backlog reconciliado e novos relatórios. Rótulos históricos mantêm seu escopo e sua data.

| Rótulo | Evidência mínima | O que não implica |
|---|---|---|
| INSPECTED | Caminho/revisão de fonte examinada e contrato descrito | Compilação, teste ou validade factual |
| LEMMA | Implementação identificada e testes locais relevantes executados com exit code zero | CI remoto, segurança completa ou produção |
| THEOREM | Mesma implementação e perfil vinculados a execução remota de CI identificada por commit, run e resultados | Prova matemática, conformidade legal ou certificação |
| CONJECTURE | Hipótese, requisito ou integração sem validação suficiente | Feature implementada |

PENDING é estado de entrega, não grau de verdade. PARCIAL identifica uma parte implementada com critério restante explícito; ALTERNATIVA identifica requisito atendido por outro contrato; NÃO ADOTADO exige decisão de produto/arquitetura; ADIADO não bloqueia o núcleo. Ausência de um símbolo com o nome proposto não prova ausência da capacidade.

Cada item deve registrar: ID original, prioridade original e revisada, workspace/perfil, fonte, teste, dependências e próximo critério de aceite. Prioridade é contextual: P0 bloqueia a capacidade indicada, não todas as capacidades do monorepo.

Resultados precisam separar compilação, testes funcionais, testes ignorados/feature-gated, mocks, serviços reais, hardware e operação. Sem execução de CI remoto nesta reconciliação, nenhum item recebe THEOREM por herança. Uma configuração de workflow não é um resultado.

CBOR/MMR do Arkhe principal, perfil AGI e provas RFC 6962 têm contratos distintos. Não trocar domínios, codificações, empty-root ou vetores congelados para satisfazer um nome antigo do backlog.

Uma assinatura autentica bytes e signatário sob uma raiz de confiança; inclusão MMR autentica pertencimento sob um checkpoint. Nenhuma delas, sozinha, prova execução, ordem temporal absoluta, privacidade ou autorização.
