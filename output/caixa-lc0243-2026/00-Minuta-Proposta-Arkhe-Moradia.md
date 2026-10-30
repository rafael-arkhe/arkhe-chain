# Arkhe Moradia

## Minuta de proposta para a LC 0243/7081-2026 — Hub de Moradia B2G

Versão 0.1, de 19/10/2026. Documento para revisão do proponente. Não enviado,
assinado ou aprovado pela CAIXA. Valores, composição da equipe e recorte do
piloto são estimativas propostas, ainda dependentes de confirmação.

### 1. Proponente

**Nome informado:** Arkhe Inova Simples. **CNPJ:** 69.338.321/0001-05.
**Endereço informado:** Rua Mario Mota, 70, Fundos, Bento Ribeiro, CEP
21555-070, Rio de Janeiro/RJ. **Responsável informado:** Rafael Henrique do
Nascimento Oliveira.

Os dados foram fornecidos pelo proponente. A conferência dos dígitos do CNPJ
não substitui comprovante cadastral, situação fiscal ou prova de representação.
Razão social conforme Receita, natureza jurídica, fundação, contatos, equipe,
faturamento e documentação habilitatória ainda precisam ser confirmados.

### 2. Problema e solução

O Arkhe Moradia será uma plataforma SaaS modular para reunir fluxos, documentos,
responsáveis, exigências e prazos da jornada habitacional em um dossiê rastreável.
O objetivo é reduzir o retrabalho documental e tornar o andamento compreensível
para proponentes, responsáveis técnicos, municípios e CAIXA.

Cada documento terá versão, finalidade, responsável, validade quando aplicável e
vínculo com a etapa correspondente. Regras e checklists terão origem, vigência e
responsável pela configuração. A plataforma distinguirá documento apresentado,
documento conferido, exigência registrada, decisão oficial observada e aprovação
interna do fluxo. Uma etapa não será encerrada pela mera sugestão de um modelo.

O diferencial proposto é ligar a governança do processo à evidência verificável
das suas mudanças, sem transferir à IA ou à plataforma a competência de emitir
licenças. Integridade criptográfica permite detectar alterações; não demonstra
veracidade do documento, conformidade urbanística ou validade jurídica por si só.

### 3. Recorte municipal e jornada proposta

Propõe-se **Rio de Janeiro/RJ**, começando por **preparação documental e
acompanhamento de pedidos de licença de edificação unifamiliar ou bifamiliar**.
É um recorte inicial de baixa abrangência para testar o fluxo comum. A CAIXA
deverá confirmar em M1 se essa tipologia atende à amostra de empreendimentos do
Hub; a expansão a multifamiliares exige levantamento específico e replanejamento.

O serviço público municipal consultado descreve requerimento online, envio de
documentos, comunicação de exigências, pagamento de taxa e disponibilização de
licença/projeto aprovado. Essa descrição fundamenta o desenho preliminar, não
constitui autorização de integração nem levantamento completo das regras locais.
Não se presume parceria com a Prefeitura, acesso à sua API ou permissão de robôs.

Fluxo experimental a validar com especialistas:

1. Cadastrar empreendimento, interessados, responsável técnico e tipologia.
2. Selecionar checklist versionado e reunir projeto e documentos exigidos.
3. Conferir presença, legibilidade, versão e validade, com revisão humana.
4. Preparar o pacote para o canal oficial e registrar o protocolo efetivamente obtido.
5. Registrar exigências e prazos observados, distribuir tarefas e tratar pendências.
6. Preservar versões anteriores, reapresentações e justificativas de alteração.
7. Registrar a decisão emitida pelo órgão competente e o documento recebido.
8. Consolidar indicadores e exportar o dossiê com histórico de responsabilidades.

O RequerimentOnline permanece como canal oficial. Na falta de API autorizada,
o piloto usará entrada manual rastreável e intercâmbio controlado de arquivos,
identificando quando o status depende de confirmação externa. Não se oferece
sincronização em tempo real sem interface e autorização comprovadas.

### 4. Escopo do MVP

| Componente | Entrega proposta |
| --- | --- |
| Configuração municipal | Um município, um fluxo priorizado, etapas, papéis, prazos e regras versionados. |
| Dossiê documental | Upload, versões, requisitos, validade, pendências e associação ao empreendimento. |
| Gestão do trabalho | Responsável por tarefa, alertas, registro de exigência e estado consolidado. |
| Visão da CAIXA | Carteira do piloto, indicadores por etapa, filtros de pendência e exportações. |
| IA assistiva | Classificação e extração de campos com referência ao documento e revisão humana. |
| Auditoria | Autor, instante, origem, ação, política e versão; consulta e exportação verificáveis. |
| Interoperabilidade | APIs documentadas, eventos versionados e uma integração priorizada, se autorizada. |
| Operação SaaS | Ambientes segregados, acesso corporativo, monitoramento e recuperação ensaiada. |

Hipóteses de dimensionamento: até **50 usuários nomeados** e meta de **30 dossiês**
no piloto, sujeitos a amostra e autorização da CAIXA. Os 50 usuários são capacidade
planejada, não quantidade já contratada ou mobilizada. Documentos e logs serão
dimensionados após o inventário de M1, com limites e custos de retenção explícitos.

BIM não será condição de entrada. O modelo de dados reservará referências para
CDE/IFC e extensões; não se promete validação geométrica ou integração BIM completa
no primeiro MVP. Fora do escopo inicial: emissão automática de licença, aprovação
de crédito, integração com todos os municípios, certificação de TEE e liquidação
financeira ou ancoragem pública de documentos pessoais.

### 5. Estado atual e maturidade

O repositório Arkhe contém componentes de autorização, evidências, verificação,
persistência SQL, interface web e integração local com Ollama. Esses componentes
podem apoiar o produto, mas ainda exigem adaptação ao domínio, testes de integração
e implantação SaaS apropriada à CAIXA.

O produto habitacional específico está em **Ideia/Conceito**, com **TRL estimado 2**
para revisão técnica. Não foi demonstrado MVP habitacional em ambiente municipal.
Ensaios existentes, inclusive E01 com compromissos sintéticos em devnet, não serão
apresentados como cases comerciais ou comprovação de redução de prazos públicos.

Evidências técnicas de base incluem os caminhos `kernel/arkhe-kernel`,
`evidence/arkhe-wormgraph`, `storage/sql`, `verification/crates`,
`apps/arkhe-intra` e `integration/arkhe-ollama`. Presença de código não equivale
a certificação de segurança ou operação do produto proposto.

### 6. Arquitetura, dados e segurança

Arquitetura prevista: frontend web responsivo, serviços Rust/TypeScript,
PostgreSQL com segregação de acesso, armazenamento de objetos cifrado e APIs REST
versionadas. A cognição terá acesso mínimo aos dados necessários e produzirá
sugestões sem chaves nem poder autônomo de alterar o estado oficial.

Ollama é uma opção de inferência sob controle da operação; o modelo e sua capacidade
de extração documental precisam ser avaliados em amostra separada. Inferência local
não elimina custo de hardware nem comprova privacidade, qualidade ou ausência de
tráfego externo. Não haverá envio de dados CAIXA a provedores de modelos sem
autorização formal. O domínio e os testes do E01/C01 permanecem separados.

**Aderência integral ao Anexo VI ainda não comprovada.** Antes da contratação,
devem ser avaliadas as evidências exigidas pelo item 11.2 e obtidos os documentos
do provedor aplicável. Antes de operar dados reais, devem estar implementados e
homologados os controles pertinentes. O cronograma não prorroga obrigação que o
edital ou a minuta exijam em etapa anterior.

| Frente | Plano e evidência necessária |
| --- | --- |
| Identidade | SSO corporativo, MFA, identidades individuais, revisões e segregação de funções. |
| Privilégios | Menor privilégio, ciclo de concessão/revogação e monitoramento independente dos acessos privilegiados ao banco. |
| Criptografia | TLS/mTLS, proteção em repouso, ciclo de chaves e comprovação dos requisitos aplicáveis ao serviço e provedor. BLAKE3 de evidência não substitui esses controles. |
| Hospedagem | Planejamento em território brasileiro; topologia, localização de dados/metadados, backups e documentação a verificar com o provedor. Não presumir exceção para exterior. |
| Continuidade | Múltiplas zonas, replicação, failover e restauração testados; RTO/RPO a acordar conforme criticidade e custo. |
| Auditoria | Cobertura de acesso, consulta e alteração com autor, hora e origem; retenção e exportação conforme Anexo VI, inclusive o horizonte exigido para registros do provedor. |
| Incidentes | Processo 24x7, classificação, comunicação ao gestor e SOC e uso do modelo ISCF. Planejar os limites de 2 h/4 h por severidade e a comunicação imediata prevista no TR, sem tratar um como autorização para atrasar o outro. |
| Segurança independente | Pentest com escopo aprovado e tratamento das falhas; laudos/certificações ou evidências substitutivas apenas quando admitidas pelo documento aplicável. |
| LGPD e encerramento | Inventário e finalidade, instruções da controladora, mínimo acesso, exportação, retenção de transição e eliminação comprovada. |

A vedação de subcontratação do TR deve ser compatibilizada formalmente com as
exigências de provedor e testes independentes. A estimativa inclui provisões para
esses itens, mas não declara que sua contratação é permitida sem esclarecimento.
O objeto será planejado para equipe própria ou consórcio formalmente habilitado.

### 7. Plano de trabalho e orçamento

Prazo proposto: **12 meses**, a partir do marco contratual aplicável. A cada mês
haverá relatório de entregas, testes, riscos, custos e decisões. O plano prevê
revisões de continuidade em M3 e M6 e ajuste formal ou encerramento quando a
viabilidade não for demonstrada.

| Marco | Período | Aceite proposto | Distribuição financeira |
| --- | --- | --- | --- |
| Descoberta | M1 | Recorte, baseline, amostra, regras e critérios pactuados. | 10% |
| Protótipo | M2–M3 | Jornada testável, arquitetura e plano de controles. | 15% |
| MVP | M4–M6 | Workflow, dossiê, perfis, histórico e APIs demonstrados. | 25% |
| Homologação | M7–M8 | Integração autorizada, testes de segurança/carga e recuperação. | 20% |
| Piloto | M9–M11 | Operação assistida, acompanhamento dos dossiês e indicadores. | 20% |
| Avaliação e transição | M12 | Resultados, código, documentação, dados e exportação conferidos. | 10% |

**Estimativa preliminar: R$ 1.302.044,54.** Memória detalhada no orçamento de apoio:

| Grupo | Valor |
| --- | ---: |
| Equipe — 6.880 horas | R$ 1.013.596,80 |
| Nuvem, observabilidade e backup — 12 meses | R$ 132.000,00 |
| Avaliações independentes e evidências | R$ 60.000,00 |
| Subtotal | R$ 1.205.596,80 |
| Reserva de risco — 8% | R$ 96.447,74 |
| Total estimado | R$ 1.302.044,54 |

As referências de salário e fator-k do mapa público SGD/MGI foram usadas como
parâmetro de estimativa, com 160 horas/mês e custo-hora arredondado a centavos.
Não são salários comprovados da equipe nem regra obrigatória para esse CPSI.
O fator-k já contempla composição empresarial; não há nova margem geral sobre
essa parcela. Custos de nuvem e avaliação são provisões de planejamento, sem
cotação vinculante, e exigem revisão de tributos, fornecedores e escopo.

Um aumento uniforme de 20% nos custos antes da reserva levaria a aproximadamente
R$ 1,56 milhão, próximo do teto de R$ 1,6 milhão. É uma sensibilidade aritmética,
não cotação nem garantia de exequibilidade. Expansão municipal/nacional, taxas de
licenciamento e um programa completo de certificação da própria empresa não
estão automaticamente cobertos pelo valor reservado para evidências.

Pagamento será proposto por entregas homologadas. Os percentuais são uma alocação
de planejamento; não há faturamento automático de reserva, horas não executadas,
marcos recusados ou consumo obrigatório do teto. O detalhamento negocial será
ajustado ao instrumento convocatório e às condições efetivamente pactuadas.

### 8. Medição e critérios experimentais

Metas a pactuar, sem alegação de resultado já obtido:

| Indicador | Meta inicial proposta | Forma de aferição |
| --- | --- | --- |
| Tempo de preparação/conferência | Redução de 20% na mediana | Mesma definição de início/fim em baseline e piloto; separar espera externa e trabalho ativo. |
| Devoluções por incompletude | Redução relativa de 20% | Dossiês devolvidos por falta documental / dossiês avaliados; publicar valores e denominadores. |
| Rastreabilidade | 100% dos eventos obrigatórios amostrados com vínculo completo | Verificar autor, data, documento/versão, ação e origem. |
| Integridade | Alterações de fixtures detectadas nos casos negativos definidos | Preservar os casos recusados, logs e limites do verificador. |
| Conclusão da jornada | Pelo menos 80% de êxito sem ajuda nas tarefas homologadas | Jornada definida antes da sessão; amostra e intervenções divulgadas. |
| Segurança operacional | Sem falha crítica aberta no escopo homologado para entrada em operação | Revisão independente, remediação e reteste; não inferir ausência absoluta de falhas. |
| Uso e impacto | 30 dossiês como meta de recrutamento | Informar planejados, iniciados, concluídos, desistentes e indisponíveis. |

Os percentuais de melhoria são hipóteses. Se o baseline de devoluções for zero,
a redução relativa será não calculável. Sem casos comparáveis, registrar resultado
inconclusivo. Não atribuir à plataforma redução do prazo de decisão do órgão por
mera melhora de preparação documental. Relatar tamanho de amostra, diferenças de
tipologia, maturidade dos usuários e limitações de causalidade.

### 9. Equipe, riscos e governança

Rafael Henrique do Nascimento Oliveira foi informado como responsável. Não foram
fornecidos currículo, vínculo de representação ou dedicação. As funções abaixo
são necessidades estimadas, não profissionais já mobilizados:

- Arquitetura/liderança: 640 h; desenvolvimento: 3.200 h; QA: 960 h.
- UX/UI: 480 h; negócios/requisitos: 640 h; IA: 320 h; DevSecOps/segurança: 640 h.

O esforço representa cerca de 3,58 equivalentes de tempo integral médios ao longo
de 12 meses, sob a convenção de 160 h/mês. Planejar concorrência nos períodos de
construção e operação, comprovar os profissionais e incluir competência de
licenciamento habitacional antes de fechar o compromisso comercial.

| Risco | Probabilidade / impacto preliminares | Tratamento e responsável proposto |
| --- | --- | --- |
| Sem adesão municipal ou API | Alta / alto | Gestão do projeto pactua acesso e usa integração manual declarada; reavalia recorte em M1. |
| Regras locais incompletas | Alta / alto | Negócios e especialista do domínio validam checklist e vigência; impedir inferência normativa automática. |
| Segurança/certificações inviáveis | Média / alto | Liderança apresenta diligência e cotações antes de comprometer dados; revisar viabilidade contratual. |
| Equipe insuficiente | Alta / alto | Proponente comprova capacidade, disponibilidade e vínculo; não assumir apoio CAIXA como mão de obra própria. |
| Extração de IA incorreta | Alta / alto | QA mede em amostra separada; revisão humana obrigatória e fallback manual. |
| Orçamento ou operação 24x7 insuficientes | Média / alto | Cotar serviço e plantão, testar alertas e revisar escala; não prometer SLA não custeado. |
| Prazo municipal extrapola o piloto | Média / alto | Medir entregas sob controle do projeto e registrar espera externa, sem contar processo aberto como concluído. |

Reuniões quinzenais de produto e revisão mensal de marcos serão propostas à CAIXA.
Mudanças terão registro de escopo, impacto de prazo/custo, responsável e aprovação.

### 10. Modelo comercial, propriedade intelectual e saída

Durante o CPSI, oferta SaaS com desenvolvimento, operação experimental e suporte
dentro do escopo acordado. Contratação futura é possibilidade sujeita a procedimento
próprio; não é receita garantida. Não se presume exclusividade ou aprovação da CAIXA.

Inventariar componentes preexistentes e licenças de terceiros. A minuta contratual
prevê direitos de uso dos componentes incorporados, entrega das versões de código
desenvolvidas no contrato e exclusividade CAIXA sobre conteúdo e informações nela
descritos. A titularidade e os direitos finais serão tratados conforme o Anexo IV
e a negociação, sem prometer cláusula incompatível com a minuta. Prever exportação
dos dados, documentação de APIs, transição e sanitização conforme instruções.

Validade proposta: 90 dias a partir da data limite de recebimento, para confirmação
pelo representante. Esta minuta não é aceite das declarações ou termos do edital.

### 11. Roteiro de pitch — até 5 minutos

**0:00–0:45 — Problema.** O licenciamento habitacional envolve documentos e atores
com prazos e responsabilidades diferentes. Quando uma versão se perde ou uma
exigência não chega à pessoa certa, o processo acumula retrabalho. O Arkhe Moradia
propõe organizar esse percurso e dar à CAIXA visibilidade sobre o dossiê.

**0:45–1:45 — Jornada.** Mostrar um empreendimento de exemplo, a lista de documentos,
uma pendência atribuída ao responsável técnico e uma reapresentação que preserva
a versão anterior. Mostrar a fonte do status oficial e distinguir sugestão de IA,
conferência humana e decisão do órgão competente. Usar dados sintéticos.

**1:45–2:45 — Diferencial.** Explicar a ligação entre etapa, autor, versão e evidência.
Mostrar configuração municipal e a possibilidade de integrar outras GovTechs por
APIs. A IA é assistiva, com revisão humana. Não afirmar que valida a legalidade ou
emite licenças. BIM será uma evolução possível, sem ser requisito universal.

**2:45–3:45 — Piloto.** Propor o Rio de Janeiro e um fluxo documental inicial, sujeito
à seleção conjunta. Planejar 30 dossiês e até 50 usuários. Comparar tempo de
preparação e devoluções por incompletude com baseline; as metas de 20% são hipóteses
a verificar. A integração oficial depende de autorização, não está contratada.

**3:45–4:30 — Execução e custo.** Apresentar os 12 meses, os seis marcos e a estimativa
de R$ 1,302 milhão. Separar equipe, infraestrutura, avaliações e risco. Mostrar que
o pagamento será vinculado a entregas aceitas. Indicar honestamente as lacunas de
segurança, comprovação de equipe e validação em campo.

**4:30–5:00 — Encerramento.** Explicar o resultado esperado: dossiês mais rastreáveis,
menos retrabalho e evidências para a CAIXA decidir a continuidade. Gravar somente
após revisar afirmações, marca e autorização do representante. Publicar como vídeo
não listado e colocar o link no campo próprio; o vídeo ainda não foi produzido.

### Fontes e limites da pesquisa

- Anexo I, itens 1, 2 e 3–5: desafio, escopo, limites e contrapartidas.
- Anexo I-A: critérios de avaliação e pesos.
- Edital LC 0243/7081-2026, itens 6–8 e avisos iniciais: modelos, pitch, campos,
  validade, formatos, publicação e etapa de negociação.
- Anexo IV, cláusulas 17 e 18; Anexo VI, especialmente itens 1, 2, 6–12;
  Anexo VII: estrutura da negociação. Documentos locais fornecidos pelo usuário.
- [Serviço municipal consultado](https://carioca.rio/servicos/licenca-de-edificacao-unifamiliar-ou-bifamiliar-on-line/): referência do recorte inicial, não manual completo do domínio.
- [Mapa salarial SGD/MGI](https://www.gov.br/governodigital/pt-br/contratacoes-de-tic/legislacao/modelo-de-contratacao-de-servicos-de-desenvolvimento-manutencao-e-sustentacao-de-software/portaria-sgd-mgi-no-750-de-20-de-marco-de-2023), Anexo II: referência de composição de equipe, não obrigação automaticamente aplicável ao CPSI.

Pesquisa em 19/10/2026. O portal oficial de licitações não pôde ser consultado
com sucesso nesta sessão; retificações e respostas do certame continuam pendentes.
Não foi feita validação documental da empresa, cotação vinculante ou contato externo.
