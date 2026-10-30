# Medições assinadas e identidade canônica de vulnerabilidade

Estado: TESTED nos cenários locais, IMPLEMENTATION CANDIDATE. Implementados os itens 1 e 4 que o anexo identifica como independentes de infraestrutura externa; os demais continuam explicitamente pendentes. Nenhuma fonte bibliográfica foi consultada ou adotada como premissa.

## SignedPocMeasurement

Novo módulo `integration/arkhe-bugbounty/src/bounty_evidence/signed_poc.rs`. A assinatura Ed25519 separada cobre versão, chain, fork, submission block, target, asset, ganho u128, contexto (relatório, digest do artefato de política, operação, parâmetros), verifier_id, chave pública e signed_at. Usa domínio `AKG:POC:SIGNED-MEASUREMENT:v1` e projeção canônica com ganho u128 em texto decimal.

O key_id é fingerprint SHA-256 com domínio `ARKHE/POC-SIGNING-KEY/v1` dos bytes exatos da chave pública. O registry deve conter esse fingerprint. A verificação rejeita versão/contexto divergentes, chave desconhecida ou revogada, nível insuficiente, chave fraca, codificação/tamanho/assinatura inválida, data futura, excesso de idade e assinatura fora do intervalo da chave. O horário de observação e a idade máxima são fornecidos pela política/host confiável, não copiados de signed_at.

`PocSignatureTrust` agrupa registry, tempo externo, idade máxima e nível mínimo. O novo `ResolvedPocPolicy::evaluate_signed_admitted` monta o contexto esperado a partir da política resolvida e do intent, verifica a assinatura e então exige os mesmos controles de política pai, contexto único, WER admitido e submission_block externo do perfil existente. Não há fallback de falha de assinatura. Os perfis são explícitos: evaluate_admitted continua exigindo WER admitido; evaluate_signed_admitted acrescenta assinatura direta das medições.

Assinatura demonstra posse da chave registrada e integridade da declaração sob as raízes fornecidas; não prova reprodução correta, segurança econômica ou hardware. O registry usado em produção deve ter origem aprovada. Nos testes, os pares Ed25519 e entradas Workload são fixtures de teste, sem TEE real.

## Identidade canônica versionada

Novo módulo `integration/arkhe-bugbounty/src/bounty_evidence/identity.rs`. VulnerabilityIdentity versão 1 inclui chain_id, deployment, code_revision, function_selector, BugClass e adjudicated_root_cause. O digest BLAKE3 usa domínio `AKG:BOUNTY:VULNERABILITY:v1` e encode_value (perfil canônico existente do arkhe-core). Não usa JSON textual como identidade. Campos obrigatórios nulos e versão desconhecida são rejeitados.

BugClass é enum fechado: Reentrancy, AccessControl, Arithmetic e OracleManipulation. O parser contém aliases explícitos, incluindo reentrancy/reentrant call; rótulos desconhecidos retornam erro para adjudicação. Texto livre do trigger não participa da identidade estrutural. A causa raiz precisa de um identificador atribuído por adjudicação aprovada e reutilizado para relatos equivalentes.

Isso resolve estabilidade de representação dentro deste perfil, não equivalência semântica universal. Relatos com causas raiz adjudicadas diferentes continuam com IDs diferentes. O mesmo defeito afetando funções/revisões diferentes exige decisão de agrupamento explícita; não há garantia automática contra pagamentos duplicados semânticos. A função anterior vulnerability_id baseada em partes textuais permanece como perfil legado; não há conversão silenciosa de IDs ou migração de payouts antigos.

Uso com a simulação de prioridade: obter `identity.digest()?.0`, fornecer esse ID ao AnchorSource para um snapshot elegível fechado e usar a mesma identidade na chamada pay. A fonte precisa conferir que adjudicação e lista elegível correspondem a esse ID, sem aceitar um hash arbitrário escolhido pelo pesquisador como classificação autorizada.

## Revogação e histórico

Não foi trocado revoked:bool por confiança retroativa em signed_at. Uma chave comprometida pode assinar hoje alegando t=40; isso não demonstra que a assinatura existia antes de uma revogação em t=50. O perfil atual sempre rejeita chave atualmente revogada, inclusive para assinaturas que declaram data antiga.

Verificação histórica exigirá política própria, snapshot de registry autenticado, timestamp/inclusão verificável da assinatura e semântica de compromisso versus revogação administrativa. Esses requisitos não estão disponíveis neste teste local. Um timestamp revogado isolado não resolve essa prova e não foi usado para relaxar o comportamento fechado existente.

## O que permanece pendente

- Prova de pré-existência: pre_existence_holds segue um predicado de comparação. Não é verificador de InclusionProof, assinatura de checkpoint, timestamp ou inclusão desse compromisso no Rekor. AnchorSource é o contrato externo preparado, sem provedor real executado.
- Registry persistente e governança: a estrutura local é BTreeMap (não HashMap) e não um log append-only de registros assinados por quórum. Medições assinadas não autenticam por si a distribuição do registry.
- Pagamento: o journal é em memória, com prioridade de ancoragem; não paga, não fornece exactly-once remoto e não aceita esse candidato como AuthorizationProof do kernel. Não foi criado um falso token de autorização ou novo intent de payout.
- TEE: indisponível, conforme informado pelo usuário. Harness opt-in para evidência real futura permanece preparado e sem fallback mock.

Observações sobre a validação recebida: testes de hash exercitam exemplos; não provam resistência criptográfica. Correspondência de key_id não é assinatura, embora este novo perfil agora verifique Ed25519 explicitamente. IDs de operadores distintos não provam ausência de controle comum. Serialização canônica não identifica por si sinônimos/variantes do mesmo bug. Registros e journal são máquinas de estado em memória, não funções puras sem mutação.

## Testes

`tests/signed_poc_identity.rs` usa assinaturas Ed25519 reais com chave TEST determinística; altera cada campo de medição/contexto, chave, verificador, versão, horário e assinatura. Confere validade, idade, futuro, nível e revogação. Testa aliases explícitos, estabilidade após serialização, separação por cadeia/deployment/revisão/função/classe/causa raiz e rejeição de identidade inválida.

`tests/poc_policy.rs` inclui perfil integrado: assinatura válida + WER admitido + ancoragem sintética passa; WER ausente ou medição alterada falham. Sem inferência, PoC, hardware, log externo, transferência ou aprovação humana reais nesta rodada. Resultados: `docs/evidence/local/2026-10-18/signed-poc-canonical-identity/RESULTS.md`. Produção não autorizada.

Resultado local: 127 testes do workspace passaram; formatação e arquitetura passaram. Os três comandos registrados preservaram o hash de fonte antes/depois; os hashes dos logs foram conferidos.
