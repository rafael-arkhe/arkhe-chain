# Deck

Molde de dez slides usado em pitch para investidor. Cada slide leva a frase que pode ser dita e a evidência que a autoriza. Célula vazia não se preenche com estimativa.

Duração de reunião: 10 a 15 minutos, com espaço para pergunta. Versão de palco: a frase de trinta segundos em [oferta.md](oferta.md) e o passo 5 da demo. Elevator: a mesma frase de trinta segundos, sem número.

| # | Slide | Frase que pode ser dita | Evidência | Estado |
|---|---|---|---|---|
| 1 | Capa | Arkhe liga ação protegida, evidência assinada e política explícita, com verificação portátil. | [Registro de claims](../planning/2026-10-21-consolidated/CLAIMS-AND-DECISIONS.md), seção 2 | Pode ser dita |
| 2 | Problema | — | Nenhuma conversa datada em que alguém descreva a última vez, o que fez e quanto custou | Vazio |
| 3 | Solução | A demo separa quem propõe, quem assina e quem confere. | Fluxo do Intra em [apps/arkhe-intra/README.md](../../apps/arkhe-intra/README.md) | Pode ser dita junto com a demo |
| 4 | Mercado | — | Percentuais e previsões estão excluídos do registro de claims | Vazio |
| 5 | Produto | Intra local: três assinaturas, bloqueio de publicação sem Rekor, exportação para verificação offline. | README do Intra; suíte Node local de 24/10/2026, 101 testes, sem teste de navegador de todas as telas | Pode ser mostrada. Não é produção |
| 6 | Receita | — | Preço, margem e royalty não foram adotados | Vazio |
| 7 | Tração | — | Sem cliente, logo, receita ou piloto concluído por um terceiro | Vazio |
| 8 | Time | Um founder em produto técnico e pesquisa, no Rio de Janeiro, desde 2025. | Histórico declarado pelo founder. O repositório não certifica carreira | Pode ser dita nesse limite |
| 9 | Concorrência | A alternativa visível na demo é seguir sem pacote conferível: o texto do modelo, um atestado genérico, ou uma revisão que não exporta verificação. | A demo, mais a leitura de 17/11/2026 abaixo. Preço de tabela alheio não é preço do Arkhe | Parcial. Nomes lidos na fonte. Mapa de quem compra o Arkhe continua vazio |
| 10 | Capital | — | Sem rodada, sem uso de recursos, sem valuation | Vazio |

## O que o ouvinte deve conseguir fazer

Sair da reunião tendo visto uma minuta ir de autoria a aprovação, a publicação parar quando o Rekor não está configurado, e um pacote ser conferido fora da sessão. Se o ouvinte pede certificação, AGI ou receita, a resposta é o slide vazio correspondente, não um número novo.

## Quando um slide deixa de estar vazio

Problema: uma linha no [funil](piloto.md) com data, cargo e o episódio passado, sem opinião sobre o Arkhe.

Mercado: conta de baixo para cima a partir dessas conversas. Quantas equipes com esse cargo, quanto aceitariam pagar no piloto. Sem porcentagem de um relatório.

Receita: preço escrito pelo comprador do piloto, ou recusa de preço. Os dois contam. Os dois entram no registro.

Tração: um terceiro completa o fluxo do Intra sem o founder operar o teclado e diz o que faria com o pacote.

Capital: só depois de tração e preço. O slide continua vazio enquanto a empresa cabe no trabalho do founder.

## Leitura de 17/11/2026

Frase que não entra no deck: “24 contratos no piso da IBM e CAD 812,02 na Air Canada são o intervalo real; o primeiro é o que uma empresa grande já paga.” A página da IBM publica um piso, não uma fatura. A sentença é de um caso. Os dois não fecham um intervalo de preço do Arkhe. Os slides 2, 4, 6, 7 e 10 continuam vazios. O número que o deck aceita continua sendo o preço dito por quem terminou a exportação.

O que a fonte publica, e a conta aritmética em cima do piso, antes de imposto e de custo. Moeda de cada página. Sem câmbio.

| Fonte | O que está escrito | Conta | O que a conta não é |
|---|---|---|---|
| [IBM watsonx.governance](https://www.ibm.com/products/watsonx-governance/pricing) | Risk & Compliance Basic a partir de US$ 3.500 por mês: 1 instância, 1 módulo, 1 usuário simultâneo | 24 assinaturas nesse piso por doze meses passam de US$ 1 milhão | Fatura observada. Cliente do Arkhe |
| A mesma página | A partir de US$ 42.000: instância na AWS, 5 casos de uso, 12.000 avaliações, 25 usuários | A página não diz o período | Anualização |
| A mesma página | Model management a partir de US$ 0,64. A [documentação](https://www.ibm.com/docs/en/watsonx/saas?topic=cloud-watsonxgovernance-plans) cobra o Essential a US$ 0,60 por resource unit | Uso | Assinatura |
| [Arthur](https://www.arthur.ai/pricing) | Premium US$ 60 por mês, monitoramento de até 100 casos de uso. Enterprise é custom | 1.389 contas Premium o ano inteiro chegam a US$ 1 milhão | O pacote conferível do Intra |
| [n8n](https://n8n.io/pricing/) | Business € 667 por mês, cobrado no ano, empresas com menos de 100 pessoas. A página inclui “human approval for tool calls” nos planos de € 20 e € 50 | 125 contratos Business o ano inteiro passam de € 1 milhão | Licença para revender o n8n. A tratativa não inclui isso |
| [Bedrock Guardrails](https://aws.amazon.com/bedrock/pricing/) | US$ 0,15 por 1.000 text units para filtro de conteúdo ou tema proibido. O exemplo da AWS, 1.000 consultas por hora com os dois filtros, dá US$ 0,90 por hora | Cerca de US$ 7.900 por ano nesse exemplo; US$ 1 milhão é a conta de cerca de 127 chatbots nesse volume | Pacote assinado que um terceiro confere |
| [Credo AI na AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-x67krdatcdday) | Enterprise Plan a US$ 1,00 por 12 meses, oferta privada por caso de uso | Nenhuma | Preço de vitrine |

O que um tribunal ordenou quando um texto automático virou efeito:

- [Moffatt v. Air Canada, 2024 BCCRT 149](https://decisions.civilresolutionbc.ca/crt/crtd/en/525448/1/document.do), 14/02/2024: CAD 812,02 no total (CAD 650,88 de dano, CAD 36,14 de juros, CAD 125 de custas). O chatbot descreveu um prazo de 90 dias para tarifa de luto depois da viagem; a página oficial negava o pedido retroativo; a empresa escreveu que o chatbot tinha usado “misleading words”.
- [Mata v. Avianca](https://www.ctd.uscourts.gov/sites/default/files/Mata-v.-Avianca.pdf), ordem de 22/06/2023: US$ 5.000, solidários, aos dois advogados e ao escritório, por seis citações inexistentes geradas no ChatGPT. Registro da [Reuters](https://www.reuters.com/legal/new-york-lawyers-sanctioned-using-fake-chatgpt-cases-legal-brief-2023-06-22/).
- [EEOC, iTutorGroup](https://www.eeoc.gov/newsroom/itutorgroup-pay-365000-settle-eeoc-discriminatory-hiring-suit), 11/09/2023, e o [consent decree](https://storage.courtlistener.com/recap/gov.uscourts.nyed.479565/gov.uscourts.nyed.479565.24.1.pdf): US$ 365.000. O software foi programado para recusar mulheres com 55 anos ou mais e homens com 60 ou mais. Regra automática de contratação, não saída de modelo colada num documento.

Tetos, que são teto:

- LGPD, art. 52, II, [Lei 13.709](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm): até 2% do faturamento no Brasil, excluídos os tributos, no máximo R$ 50 milhões por infração.
- AI Act, art. 99, texto consolidado no [service desk](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-99) em 27/07/2026, já com o Digital Omnibus: até € 15 milhões ou 3% para obrigações de operadores, o que for maior; para PME, o que for menor. Alto risco do Anexo III aplica-se em 2 de dezembro de 2027 ([art. 113](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-113)). Certificação regulatória continua fora da oferta.
