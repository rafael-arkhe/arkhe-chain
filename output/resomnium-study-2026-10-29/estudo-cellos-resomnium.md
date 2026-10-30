# CellOS, Resomnium e proposta de colaboração com Arkhe

Data de consulta: 29/10/2026. Documento de preparação interna para contato com Filip Blagojević.

## Conclusão

Há alinhamento substantivo entre o modelo organizacional da Resomnium e a separação entre proposta, autorização e evidência do Arkhe. A colaboração mais defensável é um adaptador opcional para uma ação concreta, com política versionada, aprovação humana vinculada aos parâmetros e evidência verificável por outra parte. O resultado deve ser uma demonstração reproduzível de laboratório, com limites explícitos, antes de uma oferta comercial conjunta.

A oportunidade não é inédita: a issue pública #1 do CellOS já propõe ações tipadas, negação por padrão e decisões recomputáveis. A contribuição do Arkhe precisará demonstrar implementação, interoperabilidade ou capacidade de verificação que complemente essa discussão. Não presumir que a Resomnium precisa de um novo kernel ou que seu sistema privado apresenta os mesmos limites da biblioteca pública.

## Escopo e método

Leitura estática do código público, metadados do repositório, README, testes, exemplos, páginas institucionais e ensaios. Referência fixada do CellOS: `ff7caf407945f2a88258ce5d48811e3d8b2be78b`. A árvore foi obtida pelo conector GitHub. Não foram executados o código ou os testes do CellOS, nem testados sistemas operacionais da empresa. Não houve contato externo, envio de mensagens, acesso autenticado a parceiros ou contratação de serviços.

O LinkedIn de Filip não pôde ser lido pela ferramenta. Informações sobre sua trajetória foram limitadas às páginas públicas da Resomnium e HAL8. O anexo do usuário contém propostas, exemplos de código, avaliações e revisões com conclusões divergentes; não equivale a um inventário de funcionalidades entregues.

## 1. Resomnium e o interlocutor

A Resomnium se apresenta como um estúdio de desenho organizacional e construção de sistemas de agentes. Seu modelo combina julgamento humano, execução por agentes e responsabilidade atribuída. Oferece parceria organizacional, desenvolvimento conjunto e pesquisa aberta. O site cita Apex Fusion, HAL8 e Thespian como parceiros; isso não comprova disponibilidade comercial dessas organizações para uma parceria com Arkhe. [Fonte institucional](https://resomnium.com/).

Filip é identificado como fundador pela própria Resomnium. A página HAL8 o inclui na equipe fundadora e de engenharia. Sua ligação com infraestrutura e protocolos torna apropriado apresentar uma proposta técnica curta, acompanhada de limites e critérios de aceite. A descrição mais específica de seus cargos no documento institucional é autodeclarada e não foi validada contratualmente. [Resomnium](https://resomnium.com/llms.txt), [HAL8](https://hal8.ai/).

O ensaio The Cell distribui cinco funções entre responsáveis humanos: Clarity, Execution, Narrative, Access e Integrity. O texto permite que menos pessoas acumulem funções. Assim, não é correto afirmar que qualquer implantação exige cinco pessoas distintas. A estrutura de pares diz respeito aos stewards; um coordenador de tarefas técnicas pode existir sem se tornar superior hierárquico deles. [The Cell](https://resomnium.com/writing/company-the-cell).

**Implicação para a abordagem:** demonstrar compreensão da responsabilidade humana e perguntar onde a integração ajuda o trabalho real. Evitar abrir o contato com uma lista de falhas ou uma arquitetura ampla demais.

## 2. CellOS: o que existe no código público

O projeto combina modelos Pydantic, definições YAML/JSON, runtime Python, diagnóstico e exemplos. O metadado do pacote declara versão 0.3.0 e estágio Alpha, enquanto a página institucional ainda informa 0.2.0. Congelar o commit resolve a ambiguidade para o estudo; não implica release publicada ou pacote instalado validado. [Metadados](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/pyproject.toml).

### Modelagem e diagnóstico

`Cell`, `Role`, `Participant`, `ScopeDefinition`, `EscalationRule` e `HandoffProtocol` permitem descrever composição, papéis, direitos de decisão, escopo e transferências. O modelo inclui limites de recursos e gatilhos de orçamento/confiança/tempo. A presença de um campo no schema não demonstra aplicação automática desse limite durante execução. [Modelos](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/cellos/schema/models.py).

Há validação de completude e um analisador de cobertura de stewards, responsabilidade, escopo, supervisão humana, handoffs, escalonamentos, clareza e pontos únicos de falha. Isso é uma contribuição útil para tornar estruturas organizacionais inspecionáveis. O score de diagnóstico não deve ser interpretado como certificação de segurança ou probabilidade calibrada de bom funcionamento. [Analisador](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/cellos/diagnostic/analyzer.py).

### Runtime: limites observados

| Aspecto | Observação estática | Implicação para integração |
|---|---|---|
| Escopo | `check_scope` compara substrings de uma descrição livre, sem diferenciar recursos e parâmetros estruturados | Usar operação tipada e parâmetros autenticados para ações protegidas |
| Padrão permissivo | Sem allowlist e sem coincidência em proibições/aprovações, retorna permitido | Definir um perfil estrito opt-in, com regra explícita para omissões |
| Aprovação | A checagem pode retornar `allowed=True` e `requires_approval=True` | O adaptador deve tratar o resultado como pendente e exigir aprovação válida antes do efeito |
| Conclusão | `complete_task` marca a tarefa concluída sem validar autorização/aprovação | Separar status de coordenação, autorização e confirmação do executor |
| Validação da célula | O construtor do runtime não chama `validate_completeness` | Executar validação explícita na admissão do perfil integrado |
| Direitos e recursos | Direitos influenciam o roteamento; limites de recursos não são avaliados em `check_scope` | Não converter direitos declarativos em capacidade de execução sem política adicional |

Essas observações são restritas ao arquivo inspecionado. Não são demonstrações de exploração de um serviço externo. [Runtime fixado](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/cellos/engine/cell_runtime.py).

### Auditoria e coordenação entre células

`AuditLog` usa uma lista em memória; o próprio comentário prevê persistência futura. No módulo inspecionado não há assinatura, checkpoint criptográfico, durabilidade transacional ou prova de inclusão. Portanto, o log da biblioteca não deve ser equiparado aos recibos assinados anunciados para outras operações da Resomnium. [AuditLog](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/cellos/engine/audit.py).

`Coordinator.handoff_task` cria e roteia uma nova tarefa na célula de destino, registrando referências. O método inspecionado não aplica os protocolos declarados de handoff nem comprova aprovação entre organizações. Existe uma oportunidade de registrar um vínculo estável entre tarefa de origem, destino, política, aceite e resultado. [Coordinator](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/cellos/engine/coordinator.py).

### A2A: separar exemplo e serviço

O exemplo A2A modela um participante externo e demonstra operações locais. Não faz chamadas de rede nem comprova interoperabilidade ponta a ponta. O endpoint público de descoberta foi lido por HTTP e descreve Zach como uma caixa de entrada que entrega mensagens a Filip. Não foi enviada nenhuma mensagem. Uma declaração na Agent Card não prova por si só o comportamento operacional do serviço. [Exemplo](https://github.com/Resomnium/cellos/blob/ff7caf407945f2a88258ce5d48811e3d8b2be78b/examples/a2a_integration.py), [Agent Card](https://resomnium.com/.well-known/agent-card.json).

### Discussão existente que muda a proposta

A issue #1, aberta por um terceiro em 25/09/2026 e ainda aberta na consulta, discute precisamente as comparações textuais, o padrão permissivo e a necessidade de recomputar decisões. O conteúdo foi confrontado com o código. Não representa um compromisso dos mantenedores, mas impede apresentar esse diagnóstico como novidade do Arkhe. [Issue #1](https://github.com/Resomnium/cellos/issues/1).

**Diferenciação possível:** implementar um caminho verificável que vincule a definição da célula, o pedido concreto, a política adotada, o humano aprovador, a decisão e o resultado reportado pelo executor. Uma assinatura autentica uma declaração; sua correção depende dos predicados e das fontes de evidência. Uma prova de inclusão autentica pertencimento ao log, sem garantir que todos os efeitos foram registrados.

## 3. Aprendizados dos relatos operacionais

Nos artigos sobre seis semanas de operação, a Resomnium relata ambiguidade de escopo, divergência de pesquisas e mandatos desatualizados. Outro texto descreve coordenação explícita, propriedade de memória, transmissão de incerteza e revisão humana. São relatos da própria operação, sem artefatos suficientes nesta consulta para reproduzir resultados. Servem como hipóteses para selecionar um piloto e não como métricas comprovadas. [Relato de seis semanas](https://resomnium.com/insights/six-weeks-five-agent-swarm-lessons), [Arquitetura de swarm](https://resomnium.com/insights/agent-swarm-architecture-pattern).

Um vínculo criptográfico com a versão da política pode ajudar a detectar mandato desatualizado. Ele não elimina divergência semântica entre equipes. O papel do Arkhe seria tornar certas condições objetivas verificáveis, preservando julgamento e resolução de conflitos com os responsáveis humanos.

## 4. Arkhe: capacidades apresentáveis e limites

A documentação local descreve contratos WorkIntent/WER, separação entre cognição e autoridade, gate, persistência de evidências e verificação CLI/WASM. O verificador não concede autorização; o runtime principal não executa efeitos externos. Componentes cognitivos permanecem implementações de referência e não há demonstração de AGI. [Arquitetura local](../../docs/ARCHITECTURE.md), [Estado documentado](../../docs/STATUS.md).

O fluxo de orçamento com certificado é um subconjunto aritmético finito, com produtor e verificador separados. É um candidato a predicado simples para uma fase posterior; não é prova geral da correção de um agente. A ponte AP2 possui testes locais e depende de role externo qualificado, executor e fronteira de credenciais. Nenhuma delas deve ser apresentada como pagamento real integrado. [Orçamento](../../docs/PROOF-CARRYING-BUDGET.md), [Predicados/AP2](../../docs/FORMAL-PREDICATES.md).

### Como incorporar o anexo

| Frente do material | Uso legítimo na proposta | Afirmação a evitar |
|---|---|---|
| Nix e empacotamento | Plano de ambiente fixado e reprodução do piloto | Builds Arkhe 100% reprodutíveis já comprovados |
| Arkhe Linux | Horizonte de implantação com evidência e isolamento | Sistema operacional qualificado ou cobertura integral de efeitos |
| Taxonomia de competências | Possível apoio futuro a papéis, capacidades e avaliação | Competência humana provada por uma assinatura |
| Snapshot normativo | Trabalho de especificação com revisões e bloqueadores registrados | Padrão congelado, formalmente verificado ou amplamente adotado |
| Ancoragem e assinatura híbrida | Possibilidades separadas por perfil e maturidade | Integração institucional, PQC operacional ou certificação geral |

O README local de `nixpkgs-arkhe` informa builds e reprodutibilidade não verificados, ausência de lock e diversos daemons propostos inexistentes como crates. O README remoto na branch padrão retornou o texto geral de Nixpkgs, em vez do README local específico do Arkhe. Por isso, o link não foi escolhido como cartão de visita no primeiro e-mail. Essa diferença de documentação não demonstra ausência de todos os arquivos Arkhe no repositório remoto. [README local](../../nixpkgs-arkhe/README.md), [README remoto](https://github.com/rafael-arkhe/nixpkgs-arkhe/blob/HEAD/README.md).

## 5. Proposta de piloto

**Pergunta:** uma ação autorizada por uma célula pode ser verificada posteriormente por outra parte, com vínculo aos mesmos parâmetros e à política adotada?

**Caso inicial:** um agente prepara um artefato, um steward aprova seu digest e um executor controlado libera exatamente esse artefato em um diretório de teste. Não usar pagamentos ou produção na primeira iteração.

1. Fixar commit CellOS, definição da célula, identidade dos participantes e política do piloto.
2. Converter uma ação tipada em intenção Arkhe. Campos mínimos propostos: célula, papel, agente, operação, recurso, digest do artefato, política, identificador único e validade.
3. Exigir aprovação do steward autenticado sobre a mesma intenção. Definir revogação, expiração e proibição de reutilização.
4. Avaliar no gate e persistir evidência antes do dispatch. Controlar credenciais para que o executor do piloto passe por essa fronteira.
5. Executar o efeito limitado, preservar o resultado observado e reconciliar estado após falhas. Não prometer atomicidade entre banco e efeito externo apenas com um log.
6. Exportar um pacote e verificá-lo em processo separado, com política/chave/checkpoint confiáveis obtidos fora do próprio pacote.

**Matriz de aceite proposta:** caso autorizado; operação desconhecida; escopo ausente; aprovação ausente/expirada; troca do artefato após aprovação; política trocada; replay; responsável revogado; falha de persistência; resultado não confirmado; adulteração de evidência. O conjunto exato depende da integração adotada.

**Entregáveis:** especificação curta do contrato, adaptador opcional, fixture pública sem dados sensíveis, testes positivos/negativos, comando de reprodução, relatório de limites e demo de verificação independente.

**Distribuição sugerida:** Resomnium mantém a semântica organizacional, valida a utilidade e escolhe um fluxo real; Arkhe oferece o contrato de intenção, gate e evidência de laboratório; ambas as partes revisam identidade, credenciais, semântica da política e resultado do executor.

O tamanho deve ser estimado após uma conversa técnica. Nenhum prazo, financiamento, participação societária, dedicação de equipe ou acesso a clientes é tratado como acordado.

## 6. Viabilidade comercial e perguntas para Filip

O primeiro público plausível são equipes que já operam agentes, têm aprovações humanas e precisam explicar decisões a terceiros. Valor a medir: tempo de revisão, ações recusadas corretamente, esforço de integração e facilidade de auditoria. Governos, pagamentos e infraestrutura on-chain podem ser extensões, condicionadas a requisitos próprios.

Perguntas prioritárias:

- A biblioteca pública representa o runtime atual ou é um framework de referência separado dos sistemas em produção?
- A issue #1 está alinhada ao roadmap? Existe trabalho privado sobre ações tipadas, aprovação ou recibos que devamos complementar?
- O que seus recibos atuais atestam: recebimento, autorização, execução declarada ou resultado reconciliado?
- Qual fluxo hoje gera maior custo de coordenação ou dificuldade de auditoria?
- Um adaptador opcional, preservando CellOS e seus responsáveis humanos, seria preferível a mudanças no core?
- Quais identidades, chaves e fontes de política já são confiáveis no ambiente deles?
- Que componentes poderiam ser públicos e quem manteria a integração?

**Critério para seguir:** um problema real escolhido em conjunto, interfaces compatíveis e dedicação mínima de ambas as partes. Pausar a expansão comercial se não houver benefício claro além de funcionalidades já em desenvolvimento.

## 7. Orientação para o e-mail

Usar a rápida ligação pelo Google Meet como gancho, sem inventar temas ou compromissos discutidos. Escrever em inglês como hipótese de idioma para um interlocutor internacional. Começar pela responsabilidade humana, apresentar Arkhe com maturidade de protótipo e propor um experimento pequeno. Reconhecer a issue existente em uma frase, sem transformar o primeiro contato em auditoria.

O pedido final é uma conversa técnica de 30 minutos para escolher o fluxo e comparar prioridades. Deixar detalhes de equity, tokens, governança de consórcio e implantação Nix para depois. Arquivo de e-mail: `email-filip-en.md`. Este estudo é material interno; não é necessário enviá-lo integralmente no contato inicial.
