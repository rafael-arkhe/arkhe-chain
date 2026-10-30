# Arkhe — piloto de conciliação verificável de custódia

Versão: 0.1 — proposta para implementação
Data: 29 de outubro de 2026

## Objetivo

Permitir que um terceiro reproduza, offline, a conciliação de dados de custódia de um perímetro declarado, confira sua integridade e identifique divergências e limitações. O piloto usa dados sintéticos, uma rede EVM local e um token de teste. Não movimenta fundos reais nem estabelece conclusão de solvência, titularidade jurídica ou conformidade regulatória.

O módulo é uma aplicação do núcleo de evidências Arkhe. O núcleo permanece independente do domínio de custódia e do ativo utilizado. OUSD não é dependência do piloto.

## Fronteira de confiança

Uma assinatura autentica uma declaração de uma fonte sob uma chave confiável; não demonstra a veracidade ou completude dessa declaração. Merkle/MMR protege propriedades dos dados comprometidos; não descobre operações ausentes de todas as fontes.

As fontes sintéticas são controladas pelo executor do teste. Elas simulam papéis distintos, mas não demonstram independência operacional de instituições reais. As chaves de confiança do verificador são fornecidas externamente ao pacote; nunca aceitas apenas porque estão incluídas nele.

A ancoragem EVM local demonstra integração com o contrato experimental. Não representa implantação ou homologação na RBB. O verificador não presume que um recibo exportado, sozinho, prova consenso da rede. A modalidade de confiança na âncora deve ser declarada e verificada separadamente.

## Entradas obrigatórias

1. Manifesto de perímetro: organização, rede e gênese, contrato do ativo, escala decimal, contas conhecidas, classificação própria/clientes, período e bloco inicial/final com hashes.
2. Manifesto de fontes: identificador, responsável, origem, método de coleta, autenticação, dependências compartilhadas, cobertura esperada e observada e lacunas declaradas.
3. Observador EVM: saldos nos limites do período, eventos canônicos do token, identificadores de transação e logs, blocos e estado das transações.
4. Sistema de custódia simulado: movimentações, contas, classificação e vínculo com transações.
5. Razão de clientes sintético: saldos iniciais/finais e lançamentos com identificadores estáveis e referências às movimentações pertinentes.
6. Autorizações e políticas versionadas: ator, operação, destinatário, ativo, valor máximo, vigência, aprovação e vínculo inequívoco com a execução.

Valores são inteiros na menor unidade do ativo, serializados como strings decimais canônicas. Não usar ponto flutuante. Comparar quantidades por ativo; valoração monetária e câmbio ficam fora do piloto.

Taxas de gás denominadas no ativo nativo devem ser registradas separadamente das quantidades do token. Eventuais taxas de negócio precisam de lançamentos explícitos.

## Normalização e identificação

Eventos on-chain são identificados por rede, hash de transação e índice do log, preservando também bloco e hash de bloco para detectar reorganização. Lançamentos off-chain usam identificador da fonte e identificador nativo. Duplicatas idênticas não somam duas vezes; mesmo identificador com conteúdo diferente produz conflito.

A serialização do pacote deve ser determinística, versionada e definida antes da implementação. Arquivos, registros, ordenação, representação de ausências e limites de tamanho devem ter regras explícitas. O verificador rejeita versões desconhecidas e dados ambíguos.

## Regras mínimas

- Recalcular saldo inicial + entradas − saídas = saldo final, por conta e ativo, considerando lançamentos explícitos aplicáveis.
- Confrontar movimentações observadas na rede com registros de custódia e seus vínculos com o razão de clientes. Transferências internas podem exigir correspondência entre vários lançamentos; não presumir relação universal de um para um.
- Comparar saldos atribuídos a clientes e ativos classificados no mesmo perímetro, sem concluir solvência a partir da comparação.
- Detectar duplicidade, colisão de identificadores, classificação conflitante e referências ausentes.
- Verificar autorização vinculada à operação, vigência e limite conforme semântica temporal definida para o cenário.
- Detectar lacunas de cobertura conhecidas e dependências compartilhadas declaradas.
- Ordenar e identificar exceções de forma determinística.

As regras devem possuir versão e digest, e ser reexecutáveis por um verificador com conjunto de regras permitido externamente. Não executar código arbitrário fornecido no pacote. Um digest identifica regras; não demonstra que elas são corretas.

## Resultados independentes

Cada relatório deve apresentar dimensões separadas:

| Dimensão | Estados mínimos |
|---|---|
| Integridade e autenticidade | válida / inválida / não verificável |
| Cobertura | suficiente para as regras declaradas / insuficiente / desconhecida |
| Conciliação | consistente no perímetro / divergente / não avaliável |
| Autorização | válida nas operações avaliadas / violação / não avaliável |
| Âncora | verificada sob o modelo declarado / inválida / não verificada |

Uma lacuna não apaga divergências já demonstradas. Ausência de divergências com cobertura insuficiente não produz aprovação. Dados não autenticados podem ser diagnosticados, mas não sustentam conclusão autenticada.

## Pacote offline

- Manifesto de versão, perímetro e fontes.
- Entradas normalizadas e evidências de origem, com hashes e assinaturas quando aplicáveis.
- Política, autorizações e identificação das regras suportadas.
- Relatório e exceções esperadas, para comparação com o resultado recalculado.
- Compromissos, provas MMR e envelope híbrido compatíveis com o perfil do núcleo Arkhe.
- Evidência de ancoragem e declaração do modelo de confiança.
- Lista de limitações, lacunas e dependências.

O manifesto deve vincular todas as entradas, regras e saídas ao compromisso publicado. O verificador confere essa vinculação, reexecuta as regras e compara os resultados. A verificação do checkpoint e a verificação das provas MMR são etapas explícitas e distintas.

## Critérios de aceitação

| Cenário | Resultado obrigatório |
|---|---|
| Base consistente e coberta | Mesmos resultados em geração e reexecução offline |
| Transferência omitida na custódia, presente no observador | Divergência com referência ao evento sem correspondência |
| Evento idêntico duplicado | Duplicidade relatada; totais não inflados |
| Identificador repetido com conteúdo diferente | Conflito explícito |
| Classificação própria/clientes conflitante | Exceção; sem classificação automática silenciosa |
| Operação acima do limite | Violação da política vinculada |
| Fonte indisponível | Cobertura insuficiente e regras afetadas não avaliáveis |
| Divergência e fonte indisponível simultâneas | Preservar a divergência e declarar a lacuna |
| Arquivo alterado após compromisso | Falha de integridade, sem conclusão autenticada |
| Chave desconhecida ou assinatura inválida | Rejeição de autenticidade |
| Relatório adulterado | Reexecução ou compromisso detecta incompatibilidade |
| Política/regras trocadas | Falha na vinculação ou rejeição de perfil |
| Carteira ausente de todas as fontes | Limitação expressa; nenhuma alegação de descoberta |
| Bloco de referência substituído | Conflito de referência; cobertura/âncora reavaliadas |

O executor dos testes conhece o cenário oculto da carteira omitida; esse conhecimento não é atribuído ao verificador. O teste demonstra uma limitação e não uma capacidade de detecção.

## Entregáveis e sequência

1. Schemas, vetores sintéticos e manifesto de ameaças.
2. Normalização, regras determinísticas e gerador de exceções.
3. Empacotamento autenticado e verificador offline sem acesso à rede.
4. Integração com MMR, assinaturas e âncora EVM experimental.
5. Execução automatizada dos cenários, com comandos, versões e resultados publicados.

Conclusão do piloto exige reprodução em ambiente limpo, incluindo todos os cenários negativos. Desempenho deve ser medido com conjunto e hardware declarados; metas comerciais de escala dependem dessas medições.

## Posicionamento e referências

Formulação: “Arkhe fornece evidências verificáveis para conciliação de custódia e avaliação de segregação patrimonial, vinculando políticas, autorizações, movimentações observadas e exceções em um histórico resistente a alterações posteriores.”

Suporte à avaliação não equivale a certificação ou aceitação pelo supervisor. Alegações sobre concorrentes e demanda comercial permanecem hipóteses até pesquisa e validação específicas.

Referência regulatória contextual: Resolução BCB 589/2026, que altera a Resolução 520/2025. Os dispositivos sobre informações de saldos, custódia, provas de reservas por ativo e staking têm efeitos previstos para 1º de janeiro de 2027, observados os destinatários e a regulamentação específica. A resolução, isoladamente, não fundamenta promessa de periodicidade diária nem obriga uso do Arkhe ou da RBB.

Fonte oficial consultada em 29/10/2026: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=589&tipo=Resolu%C3%A7%C3%A3o+BCB
