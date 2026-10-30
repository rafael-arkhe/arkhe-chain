# Serpro e aceite do piloto — pendências de decisão

Referências oficiais conferidas em 2026-10-23: [Consulta CNPJ, Datavalid e Serprobots](SERPRO-SERVICES.md). Consulta CNPJ é o gate implementado; Datavalid seria identidade complementar e Serprobots um canal opcional. Nenhum dos dois últimos foi integrado. O guia Datavalid lista pré-requisitos adicionais a OAuth2, a confirmar conforme o fluxo contratado. A contratação Consulta CNPJ também prevê via manual excepcional sem e-CNPJ.

O contrato Arkhe permanece não confirmado. Mesmo com cadastro aceito, verificadores externos de representação ainda exigem implementação e testes; a contratação sozinha não libera piloto externo.

Data: 2026-10-23. O usuário informou que não consegue confirmar o contrato por fontes públicas. Estado registrado: **contratação/habilitação não confirmadas**, e não “não contratado”. Nenhum contrato, compra, formulário de contratação ou credencial foi enviado por esta tarefa.

## Antes de qualquer consumo real

1. O responsável pela conta verifica contrato e habilitação na Área do Cliente Serpro.
2. Confirma a tabela vigente da consulta básica v2, eventual mínimo/franquia, excedentes, tributos, ambientes e orçamento autorizado. A tabela de preços vigente não pôde ser confirmada pela consulta pública nesta tarefa; não foi inventado preço por consulta.
3. Configura `ARKHE_SERPRO_CONSUMER_KEY` e `ARKHE_SERPRO_CONSUMER_SECRET` no processo ou gerenciador de segredos, nunca no navegador, repositório ou chat.
4. Define um CNPJ autorizado e confere razão social e CNAE para uma chamada de aceite de produção. Registra resposta minimizada, origem e horário sem expor token ou dados além do necessário.
5. Reconfirma representação e escopo do ato para piloto externo; o gate cadastral não substitui essa validação.

A [documentação oficial do Serpro](https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cnpj/pt/quick_start/) distingue credenciais de contrato, token de acesso e trial. [Serviço oficial](https://www.gov.br/pt-br/servicos/obter-solucao-de-consulta-de-dados-do-cadastro-nacional-de-pessoas-juridicas-cnpj?id=10208&origem=servico). Credenciais da conta não podem ser inferidas de páginas públicas.

## Critérios de liberação

| Item | Situação desta tarefa |
| --- | --- |
| Declaração e hashes no WormGraph local | Implementados e testados para generic interno; poderes permanecem não verificados |
| CNPJ alfanumérico | Implementado conforme algoritmo oficial e testado |
| Gate Serpro | Fail-closed; consulta real não realizada |
| Procuração/e-CNPJ e poderes | Verificadores pendentes; piloto externo bloqueado |
| Imagem standalone | Ver relatório de validação do contêiner |
| Contrato, orçamento e habilitação Serpro | Não confirmados |
| Speedrun | Rascunho; preparar versão para submissão depois dos requisitos do piloto |
| ACIEG agro/EUDR | Não contatada; piloto externo não liberado |
