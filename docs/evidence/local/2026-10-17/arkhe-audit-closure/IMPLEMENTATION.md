# Fechamento da auditoria — 2026-10-17

Status: EXECUTED, LIMITED SCOPE — NOT FROZEN.

## OperationId: constatação e explicitação

O código já estava na formulação B: domínio AKG:OPERATION:v2 e CBOR com somente
intent_type, target e request_identity. parameters_digest já estava excluído e
comparado separadamente pelo journal. O README atual já dizia Parameters are
excluded. A frase antiga citada pela auditoria era uma versão anterior do documento.
A rodada não mudou a semântica do hash: acrescentou documentação explícita no
método e a fórmula/caminho dos testes no README.

Os testes já existentes cobrem alteração de parâmetros com a mesma identidade,
no ID, no journal local pendente/concluído e entre executores PostgreSQL. Foram
executados novamente, incluindo ParameterMismatch sem segunda escrita externa.

## MCP: duas restrições independentes

O mapa de pins já funcionava como lista de nomes aprovados: nomes fora do manifesto
eram rejeitados. Agora há adicionalmente HACKENPROOF_TOOL_ALLOWLIST, fixada em
get_report_details e triage_report. Até um pin fornecido pelo caller é recusado se
o nome estiver fora desse conjunto. Calls fora da allowlist são rejeitados antes
de qualquer tools/list/tools/call.

O novo teste adiciona export_private_data ao catálogo do servidor, mantém os pins
existentes, confirma que a ferramenta permitida continua funcional e que a nova
não pode ser chamada nem incluída num manifesto executável. O catálogo de descoberta
continua sendo dado não confiável; sua expansão não amplia a autoridade do cliente.

## Classe de bug: assets embutidos e cache

A regra foi documentada em docs/development/embedded-assets.md e integrada ao gate
de arquitetura. O scanner cobre todos os crates ativos, exige watches de diretório
para sqlx::migrate! e verifica a existência dos includes literais. Paths não literais
exigem extensão explícita da auditoria. Os cinco testes negativos/positivos do
scanner passaram.

Uma precisão importante: rustc já rastreia include!, include_str! e include_bytes!
literais, inclusive os golden vectors existentes. Não é necessário adicionar um
build.rs apenas por serem vetores ou schemas. Proc-macros que descobrem arquivos
e geradores externos têm outra classe de dependência; watchers precisam cobrir
adições/remoções, não só arquivos conhecidos. O scanner é uma checagem delimitada,
não uma prova geral de comportamento de qualquer proc-macro ou gerador.

## Dois testes PostgreSQL legados

Foram migrados de #[ignore] para um target com required-features =
postgres-integration no crate arkhe-sql. A suíte padrão não demonstra conformidade
PostgreSQL; o gate explícito ativa a feature e falha se o banco estiver ausente.
A execução com PostgreSQL real passou nos dois casos:
missing_tenant_context_fails_loudly e tenant_context_can_be_transaction_local.
O workflow local e live_runtime.py foram atualizados para ativar e executar esse target.

## Resultado e limites

30 testes do módulo passaram, além de core/kernel, dos dois casos PostgreSQL
legados e dos testes MMR SQL. Os 11 testes Python passaram, incluindo cinco do novo
gate. Arquitetura, assets, formatação e regeneração byte-idêntica dos golden vectors
passaram. A suíte padrão do workspace é registrada separadamente em RESULTS.md.

A ausência de provider LLM significa que não existe um prompt/delimitador fixo
implementado para auditar nesta integração. Nonces de delimitação, isoladamente,
não estabelecem autoridade nem removem a exigência de tratar o relatório e a saída
do modelo como dados não confiáveis. A integração de provider continua pendente.

HackenProof real/credencial acessível, codec upstream, custódia/distribuição de
chaves, freshness e resolução do estado externo continuam pendentes. Nenhuma
promessa de exactly-once externo é feita. TTL é configuração, não limpeza executada;
negativos B0 continuam sendo simulações EVM. B1–B4/C2PA não foram promovidos.
CI remoto não foi executado nesta rodada, por decisão do usuário; o checkout externo não foi
alterado. PostgreSQL local foi parado após os testes, preservando dados.
