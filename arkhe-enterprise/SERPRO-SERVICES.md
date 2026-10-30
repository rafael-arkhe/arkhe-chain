# Serviços Serpro — aplicabilidade no Arkhe

Consulta às fontes oficiais: 2026-10-23. Revisão documental e comparação com o código local. Nenhuma conta privada, contratação, chamada autenticada/paga, biometria ou contato comercial foi utilizado. Contratação/habilitação do Arkhe: **não confirmadas**.

## Responsabilidades distintas

| Serviço | Aplicação possível | Estado no Arkhe |
| --- | --- | --- |
| Consulta CNPJ | Conferir cadastro da empresa antes do commit | Cliente implementado, teste real pendente; não comprova poderes |
| Datavalid | Validação complementar de identidade da pessoa | Não integrado; identidade não comprova delegação ou escopo do ato |
| Serprobots | Atendimento e orientação por canal conversacional | Não integrado; opcional para o piloto, sem substituir RBAC ou provas |

## Consulta CNPJ

O [guia de autenticação](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/quick_start/#como-autenticar-na-api-consulta-cnpj) documenta OAuth2: POST /token, Basic com credenciais do contrato, formulário grant_type=client_credentials e utilização do access_token como Bearer. O fluxo corresponde a [enterprise-cnpj.mjs](../apps/arkhe-intra/lib/enterprise-cnpj.mjs).

O guia recomenda reutilização e renovação do token; o cliente atual solicita um por operação. Cache por validade, rotação e recuperação de 401 seriam evolução separada, ainda não implementada. Não se deve fixar a validade ignorando expires_in.

O quick start inclui exemplos trial, snake_case e curl com -k. O Arkhe preserva produção em /consulta-cnpj-df/v2/basica/{cnpj}, TLS verificado e o schema camelCase da [tabela V2](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/descricao_campos_v2/): nomeEmpresarial, situacaoCadastral e cnaePrincipal. Conferir o schema efetivamente habilitado no aceite; divergências de exemplos não autorizam bypass ou fallback trial.

A [contratação oficial](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/como_contratar/) descreve fluxo online com e-CNPJ e exceção manual para empresas sem certificado. Logo, não afirmar que e-CNPJ é a única via. Preços, contrato e habilitação específicos do Arkhe continuam não confirmados. Credenciais de aplicação não constituem assinatura do usuário; nenhuma credencial de exemplo foi incorporada ao projeto.

## Datavalid

A [introdução oficial](https://apicenter.estaleiro.serpro.gov.br/documentacao/datavalid/) descreve comparação cadastral e biométrica com bases oficiais. A biometria é probabilística; interpretação do resultado e regra de negócio cabem ao contratante. O serviço publica limitações de detecção de manipulações de imagem e não entrega os dados originais das bases. Não tratá-lo como prova absoluta de identidade ou poderes empresariais.

A [página de contratação](https://apicenter.estaleiro.serpro.gov.br/documentacao/datavalid/como_contratar/) identifica V5 como vigente. O [guia de consumo atual](https://apicenter.estaleiro.serpro.gov.br/documentacao/datavalid/quick_start/) lista credenciamento SENATRAN, GCC, HASH/token de autorização e template de tratamento RFB além de OAuth2, relacionando os requisitos à Portaria SENATRAN 139/2025. Confirmar com o fornecedor o enquadramento do fluxo escolhido; isso é descrição do serviço, não parecer jurídico sobre o Arkhe.

Uma eventual integração exige decisão sobre versão, finalidade, pré-requisitos, resultados, retenção e vínculo da pessoa à conta, além de implementação e testes. Nenhuma captura de CPF/foto, biometria ou nova dependência foi adicionada. Mesmo após identidade validada, permanece a verificação de poderes da [política de representação](REPRESENTATION-POLICY.md).

## Serprobots

A [página oficial](https://serprobots.ia.serpro.gov.br/) e a [documentação](https://serprobots.ia.serpro.gov.br/docs/) apresentam chatbots, motores de conversação, integrações, canais e sessões autenticadas. É possível avaliá-lo como canal de atendimento se houver requisito; sua existência não demonstra integração ou contrato do Arkhe.

Se adotado, o backend Arkhe continua autorizando cada ação pela sessão e papel reais. Uma resposta de chatbot não autoriza consulta paga, assinatura ou commit. Nenhum bot, canal WhatsApp, login externo ou transmissão documental foi criado.

## Correções à revisão recebida

- Serpro está **não confirmado**, em vez de “não contratado”; páginas públicas não revelam o contrato privado.
- Snapshot/restore foi testado e a sintaxe shell do job foi conferida. O job diário completo, timer, linger e cópia off-host não foram ativados nem demonstrados.
- Contratar Serpro sozinho não libera o piloto. Verificadores externos de procuração/e-CNPJ/QSA ainda exigem implementação e validação; portanto, ainda há trabalho de código nesse escopo.
- SLOs podem ser propostos antes de tráfego; baseline, conformidade medida e RPO garantido são questões diferentes.
- Apenas generic/internal admite SelfDeclared no fluxo atual; essa restrição técnica não é classificação jurídica universal dos setores.

## Próximo aceite

Prioridade atual: confirmar privadamente produto/contrato/habilitação e orçamento da Consulta CNPJ, configurar credenciais pelo responsável e realizar consulta autorizada. Fechar poderes externos e ativação operacional em paralelo. Datavalid é avaliação separada de identidade; Serprobots é opcional. [PROCUREMENT.md](PROCUREMENT.md) e [RUNBOOK.md](RUNBOOK.md) detalham aceite e operação. Speedrun permanece após os requisitos do piloto. Nenhum gate ou serviço foi ativado nesta revisão.
