# Currículo de IA: 13 módulos com entregáveis verificáveis

Plano proposto a partir dos 40 subtópicos fornecidos. Este documento organiza
aprendizagem e critérios de aceitação; não afirma que os projetos já foram construídos.
O fio condutor é um assistente de documentos: receber, recuperar, responder,
propor publicação e executar somente após autorização independente.

## Como usar SDE neste percurso

Cada projeto declara objetivo, restrições, avaliador, ponto de aplicação,
evidência e procedimento de alteração. Nem todo conteúdo teórico é um stencil.
Não classificamos módulos inteiros como M0–M3: na convenção MOF, M3 é
meta-metamodelo, não motor de verificação. Um modelo de ML não é automaticamente
uma política; seu resultado pode alimentar uma proposta ou uma avaliação probabilística.
Autorizar ferramentas exige controles próprios sobre identidade, recurso e ação.

Os gates abaixo são exercícios propostos. Limiares numéricos são escolhas
didáticas, versionadas antes da execução; não são padrões de segurança industrial.

## Os 13 módulos

| Módulo e conteúdos | Entregável | Restrição e gate proposto | Relação com a demo |
|---|---|---|---|
| **01 Python & Fundamentals** — Python, Git, Linux, APIs; estruturas e algoritmos; OOP e engenharia | CLI Python para ler documentos e chamar uma API local; histórico Git e instruções reproduzíveis | Entrada inválida retorna erro sem alteração; executar em ambiente limpo; explicar custo temporal da busca usada | Implementar uma operação, normalizar pedido e separar leitura de escrita |
| **02 Mathematics for AI** — álgebra linear, cálculo; probabilidade, estatística; otimização e gradientes | Notebook com similaridade vetorial, regressão e descida de gradiente | Em pontos suaves, comparar gradiente analítico com diferenças finitas: erro absoluto <= 1e-5 em 10 casos fixos; tratar vetor nulo explicitamente | Fundamentar métricas e reconhecer hipóteses; não equivale a autorização |
| **03 Data Engineering** — NumPy, Pandas, SQL; limpeza; features e pipelines | Pipeline de ingestão com schema, origem, tenant e divisão de dados | Rejeitar campos obrigatórios ausentes; nenhuma identidade de documento cruza treino/teste; repetir ingestão não duplica IDs | Contrato de entrada e snapshot do documento |
| **04 Machine Learning** — regressão, classificação; clustering, árvores; avaliação | Classificador de documentos comparado com baseline; exercício separado de clustering | Congelar split e métrica antes de avaliar; relatório apresenta baseline, resultado, matriz de confusão e limitações; ausência de ganho impede promover o modelo | Avaliação com evidência, sem tratar predição como permissão |
| **05 Deep Learning** — redes, backpropagation; PyTorch ou TensorFlow; transformers e atenção | Rede pequena e exercício de atenção com máscaras | Verificar dimensões, gradientes finitos e pesos de atenção; teste causal não recebe informação de posições futuras; registrar variação entre execuções | Testar invariantes locais da implementação |
| **06 LLM Fundamentals** — tokens, embeddings; arquitetura, contexto; pretraining e fine-tuning | Experimento de tokenização e manifesto de modelo/tokenizer/configuração | Exercitar limite de contexto e tratamento de excesso; registrar versões e tokens; comparar conceitualmente pretraining e ajuste | Identificar configuração avaliada e limites de capacidade |
| **07 Prompt Engineering & APIs** — prompts, saída estruturada; funções e ferramentas; custo | Chatbot que produz resposta estruturada ou proposta de ferramenta | Saída malformada não executa ferramenta; impor teto de tokens e chamadas; registrar custo medido ou estimativa identificada | Modelo propõe pedido; aplicação independente valida e executa |
| **08 RAG & Vector Databases** — chunks, embeddings; busca vetorial/híbrida; avaliação | Recuperador com corpus sintético, ACL por tenant e referências | Em 20 consultas rotuladas, recall@5 >= 0,80 como alvo didático; zero documentos de outro tenant nos testes; medir recuperação e resposta separadamente | Snapshot de documentos e versões do índice; revalidar ACL antes do acesso/efeito |
| **09 Fine-Tuning & Optimization** — SFT, LoRA, QLoRA; quantização, GPU; comparação com RAG | Experimento controlado base vs RAG; ajuste/quantização opcional com orçamento declarado | Comparar qualidade, latência e memória no mesmo conjunto retido; promover somente se cumprir limites pré-definidos; não chamar planejamento de treino executado | Troca de modelo segue seu contrato; mudança de modelo não é automaticamente mudança de política |
| **10 AI Agents** — ferramentas e workflows; memória e estado; MCP e aprovação humana | Agente que propõe publicação com máquina de estados e adaptador de ferramenta | Sem aprovação não publica; aprovação vincula ação, recurso e revisão; testar revogação, replay, colisão e estado desatualizado | Correspondência direta com evaluate/apply, proveniência e OperationId |
| **11 AI Security & Evaluation** — alucinações e benchmarks; injeção e vazamento; guardrails e testes | Conjunto versionado de ataques, respostas esperadas e regressões | Testar instrução maliciosa em documento, tentativa de ferramenta não autorizada e acesso cruzado; zero efeitos proibidos nos casos executados; informar cobertura | Casos negativos e inspeção do estado, além do log BLOCKED |
| **12 MLOps & Deployment** — FastAPI, Docker, CI/CD; cloud; monitoramento e versões | API empacotada, pipeline de testes, manifesto e ensaio de rollback; deploy cloud em ambiente autorizado | CI barra regressões; ensaio comprova retorno à versão anterior; falha de avaliador impede efeito; verificar durabilidade antes de alegar prontidão operacional | Evoluir além da memória local: transações, evidência durável e recuperação |
| **13 Real-World Projects** — chatbot, RAG, agente e sistema operacional | Quatro incrementos do mesmo assistente, com relatório por versão | Cada incremento satisfaz os contratos abaixo; relatório inclui comando, ambiente, artefatos, métricas e falhas; só chamar produção após qualificação explícita | Reunir restrição, avaliação, aplicação e evidência ponta a ponta |

## Sequência por dependências

- Base: 01; 02 e 03 podem avançar em paralelo após fundamentos suficientes de Python.
- Aprendizagem: 04 após 02/03; 05 após fundamentos de 02/04; 06 após introdução a 05.
- Aplicações: 07 após 01/06; 08 após 03/06/07; 10 após 07 e introdução ao 11.
- Experimentos de ajuste: 09 após 03/05/06 e uma baseline avaliada; não bloqueia um primeiro RAG.
- Segurança/testes do 11 começam no 01 e acompanham 07/08/10; não esperar terminar o currículo.
- Operação do 12 cresce com os projetos do 13. Os projetos começam pequenos no 07.

Essa ordem é um grafo de pré-requisitos, não uma sequência global imutável.

## Contratos do projeto integrado

| Contrato | Conteúdo versionado | Quem aplica | Evidência mínima |
|---|---|---|---|
| Dados | Schema, origem, retenção, tenant, split e regras de tratamento | Ingestão e armazenamento | IDs aceitos/rejeitados, versão e resumo do conjunto |
| Modelo | Modelo/tokenizer, contexto, configuração e capacidades avaliadas | Adaptador de inferência | Identificadores, configuração, consumo e falhas |
| Recuperação | Corpus, índice, chunking, ACL e critérios de relevância | Serviço de busca e acesso aos documentos | Referências autorizadas e métricas em consultas rotuladas |
| Ação | Identidade, recurso, ação, aprovação, snapshot e idempotência | Serviço proprietário da operação | Pedido, regra, decisão, efeito e estados comparáveis |
| Avaliação | Dataset, métricas, limiares e casos adversariais | Harness e gate de promoção | Resultados por caso, versão, regressões e limitações |
| Operação | Orçamento, prazo, disponibilidade, recuperação e rollback | Runtime e pipeline | Trace, versões, falhas e ensaios de recuperação |

Esses contratos podem referenciar-se; não precisam caber num JSON único. Sua
consistência precisa ser verificada, e não presumida pela metáfora de stencil.

## Quatro projetos e suas saídas

1. **Chatbot:** saída estruturada, erros e orçamento controlados. Evidência: pedidos
   de teste, validação da resposta e consumo. Não adicionar ferramentas de escrita ainda.
2. **RAG:** ingestão, busca e citações com isolamento de tenant. Evidência: consultas,
   documentos recuperados, métricas de recuperação e avaliação das respostas.
3. **Agente:** proposta de publicação integrada a uma autoridade independente.
   Evidência: autorização válida, negativa, indisponibilidade, revisão alterada,
   revogação de permissão e replay. MCP é uma interface, não a autorização.
4. **Sistema candidato a produção:** empacotamento, autenticação, evidência durável,
   concorrência, recuperação, monitoramento e rollback. Evidência: testes no ambiente
   alvo e resultados dos ensaios; aprovação de todos os gates definidos para o contexto.

## Ponto de partida executado

A demo `examples/sde-publication` já exercita a parte de publicação no mesmo
processo. Não inclui LLM, RAG, autenticação real ou armazenamento durável.

```powershell
node --test examples/sde-publication/publication.test.mjs
node examples/sde-publication/demo.mjs
```

Sua validade não demonstra automaticamente a validade de um RAG: o RAG acrescenta
qualidade de recuperação, correção de resposta, isolamento e dados externos.
A demo serve como referência local para o contrato de ação e seu registro.
