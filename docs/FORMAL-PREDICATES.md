# Predicados opt-in: SPDX e AP2 v0.2

Data: 22/10/2026. Escolhas do usuário: base SPDX de licenciamento/Lite e AP2 v0.2, Payment Mandate leg. A implementação é uma biblioteca com testes locais; não há canal de pagamentos reais ou verificador AP2 externo ativado.

## SPDX: compatibilidade de obrigações

O primeiro perfil é `arkhe/spdx23-obligations/v1`, um subconjunto limitado de documentos SPDX-2.3 JSON adequado a informações de licenciamento. Não é um validador completo de conformidade SPDX Lite/3.x. O parser aceita pacotes com `filesAnalyzed=false`, inspeciona também os arquivos listados, e rejeita snippets e referências externas que não consegue verificar. A raiz em `documentDescribes` deve ter um checksum SHA256 que corresponda aos bytes do artefato fornecidos. O WER inclui o compromisso dos bytes exatos do SBOM em `evidence_refs`.

A biblioteca `spdx` 0.13.5 está fixada no lockfile e interpreta AND, OR, WITH e identificadores. A governança fornece uma tabela explícita `LicenseReq -> conjunto de obrigações` e o conjunto de obrigações permitidas. Cada expressão é avaliada com essa tabela; não se compara a expressão inteira a uma string de allowlist. AND exige ambos os ramos, OR admite um ramo permitido; uma exceção só passa se sua combinação estiver explicitamente mapeada. Termos desconhecidos, NONE, NOASSERTION e combinações sem regra aplicável falham. As tabelas dos testes são sintéticas e não são uma interpretação jurídica adotada para licenças reais.

SPDX identifica e descreve licenças; não entrega uma tabela universal e executável de suas obrigações. Essa semântica é parte da política revisada, versionada e fornecida pelo host. O resultado demonstra compatibilidade com essa tabela sobre o SBOM fornecido. Não comprova que o SBOM é completo, que o autor tem direitos sobre o conteúdo, nem que cópias de licença/source/atribuição foram realmente entregues.

O produtor `license_pco::prove_license` apenas empacota uma proposta. `verify_core::license::verify` verifica bindings e reexecuta o predicado no gate. A política e o SBOM não são escolhidos como autoridade pelo produtor. O certificado transparente revela o SBOM e os bytes do artefato. `require_zk=true` é recusado: não existe backend ZK qualificado, e fornecer apenas um hash não substitui a prova do predicado.

## AP2: ponte autenticada com o role externo

O perfil `arkhe-ap2-payment-role@1` consome um resultado assinado de um role AP2 confiável. Não reimplementa assinatura SD-JWT, credenciais, disclosures ou constraint evaluation. Essas verificações devem ser feitas pelo Shopping Agent/Credential Provider/MPP apropriado, com a atestação emitida apenas depois do sucesso. A atestação Arkhe não é um Payment Receipt AP2 nem uma credencial AP2 padrão.

O host fixa role ID, chave, política, relógio, freshness e checkpoint de log. A atestação vincula versão 0.2, modo, principal, OperationId, hash do closed SD-JWT, hash do open quando necessário, checkout JWT e a execução concreta: network, payee, currency, amount_minor e instrument_digest. O `parameters_digest` é derivado dessa estrutura, não aceito de um texto descritivo livre. O executor deve usar exatamente esses parâmetros ao construir o efeito real.

A atestação também inclui `closed_mandate_id`, uma identidade estável da credencial autenticada pelo role, preservada entre apresentações/disclosures/key-bindings diferentes. O journal consome essa identidade, não o hash dos bytes de uma apresentação SD-JWT. O host deve qualificar como o role deriva essa identidade e seu namespace; um ID novo por apresentação violaria o contrato da ponte. Uma regressão verifica apresentações diferentes do mesmo closed.

O campo `execution` deve ser uma projeção autorizada dos termos do closed produzida pelo role, não um eco sem validação dos parâmetros pedidos pelo agente. O Arkhe deriva o digest dessa projeção e exige igualdade com os parâmetros da operação. O host precisa qualificar a projeção para sua capability, incluindo unidades, moeda, rede, destinatário e instrumento; um nome de merchant não pode ser convertido em destino arbitrário por conteúdo do agente.

Direct exige validação do mandato fechado pelo role e inclusão desse mandato em um checkpoint retido anterior ao dispatch. Autonomous exige validação da cadeia open/closed, da delegação e de `closed ⊆ open` pelo role; o Arkhe verifica os hashes, a assinatura do resultado, a inclusão do open e `open_issued_at <= checkpoint_time < closed_issued_at <= validated_at <= now`. A cronologia depende do log/relógio e do role confiáveis; MMR isolado não prova tempo absoluto.

`CapabilityBroker::execute_payment` só opera com o predicado PaymentMandate obrigatório no gate. O journal reserva e consome o mandato fechado atomicamente antes do efeito. Outra operação ou principal não pode consumir o mesmo closed; o open pode gerar outros closed sob as regras de recorrência do role. O caminho genérico do broker recusa predicados PaymentMandate, para não contornar o consumo único. O adapter SQLite opcional implementa essa transação; journals antigos recusam a operação por default.

A especificação AP2 já exige histórico para recorrência e orçamento. O Arkhe não parte da afirmação universal de que AP2 é stateless: complementa o role com o registro local da execução concreta. O Merchant Checkout Mandate leg fica fora desta integração.

## Integração ao gate e persistência

`PolicyResolver::required_formal_predicate` seleciona o predicado; `EvidenceReader::formal_proof` é transporte não confiável e retorna None por default. O gate verifica a prova novamente, exige envelope admitido do tipo FormalProof com política/worker/parents exatos e reconfirma o digest da especificação antes de autorizar. Política de revisão, EmergencyStop e negação continuam valendo. A autorização com esses predicados usa domínio novo `AKG:AUTHZ:FORMAL:v1\0`; identidades e domínios preexistentes não mudam. A codificação de booleanos CBOR foi acrescentada para estes novos tipos, preservando os vetores existentes.

O journal opcional `sqlite-broker` usa WAL, synchronous FULL, transação IMMEDIATE, owner token por reserva e consumo fechado com unicidade. Reopen conserva sucesso e estado incerto; handles concorrentes não podem assumir ou completar reserva alheia. Ele não substitui o journal PostgreSQL principal. Falha/cancelamento/queda antes da gravação de resposta exige reconciliação; não há retry automático ou promessa de exactly-once upstream.

Testes: `cargo test --locked -p arkhe-kernel --features sqlite-broker --test formal_predicates --test broker_durable --test action_broker --test budget_pco`.

## Fontes e qualificação restante

- [SPDX License Expressions](https://spdx.dev/learn/handling-license-info/), [SPDX Lite](https://spdx.dev/learn/areas-of-interest/lite/) e [schema SPDX-2.3](https://github.com/spdx/spdx-spec/blob/v2.3/schemas/spdx-schema.json).
- [Parser spdx 0.13.5](https://docs.rs/spdx/0.13.5/spdx/).
- [AP2 v0.2](https://github.com/google-agentic-commerce/AP2/blob/e1ea56db72a6385bce3e5c1112b3a56ce60acb43/docs/ap2/specification.md), [Payment Mandate](https://github.com/google-agentic-commerce/AP2/blob/e1ea56db72a6385bce3e5c1112b3a56ce60acb43/docs/ap2/payment_mandate.md) e [Agent Authorization](https://github.com/google-agentic-commerce/AP2/blob/e1ea56db72a6385bce3e5c1112b3a56ce60acb43/docs/ap2/agent_authorization.md).

Os testes AP2 usam tokens opacos sintéticos e um role de teste. Ainda é necessário configurar e qualificar um role externo real, sua identidade e política de emissão/revogação de atestações, a origem autenticada de SBOM, o executor e a fronteira de credenciais. Nenhum resultado local é alegado como interoperabilidade AP2 end-to-end, certificação SPDX ou prova jurídica.
