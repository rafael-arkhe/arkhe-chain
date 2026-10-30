# Tipos de confiança: inclusão assinada, tempo vinculado e operadores governados

Atualização posterior: [witness e payout PostgreSQL candidatos](DURABLE-PAYOUT-WITNESS-2026-10-18.md) acrescentam os gates duráveis; os estados PENDING desta página registram a rodada original.


Estado: TESTED em fixtures criptográficas locais, IMPLEMENTATION CANDIDATE. A auditoria recebida descreve em vários pontos o snippet anterior, não os perfis atualmente integrados. Esta alteração acrescenta verificações concretas offline; não constitui freeze, implantação de log público, registry institucional ratificado ou pagamento.

## Prova de inclusão e âncora fechada

Novo módulo `integration/arkhe-bugbounty/src/bounty_evidence/trust.rs`. ProofVerifiedAnchor tem campos privados, não possui Deserialize nem construtor permissivo. Seu único construtor verifica:

- correspondência de log_id, limites de tempo e leaf_count da política externa, metadados obrigatórios e limites de tamanho;
- assinatura Ed25519 strict do checkpoint por chave pública fixada independentemente;
- inclusão dos bytes canônicos exatos de AnchorLeaf usando arkhe_verify_core::mmr::verify_proof contra a raiz assinada.

O checkpoint usa o perfil candidato `AKG:BOUNTY:MMR-CHECKPOINT:v1`, que declara arkhe-mmr/v1, log_id, raiz, leaf_count e issued_at. A folha tem perfil `AKG:BOUNTY:ANCHOR-LEAF:v1` e inclui os metadados da claim e subject_digest. Os tempos deste perfil são Unix milliseconds. BLAKE3 e encode_value do arkhe-core são usados nas projeções/digests; a inclusão reutiliza o MMR existente, não um algoritmo criptográfico manual novo.

CheckpointTrust é configuração de confiança do host: log/chave esperados, mínimo de folhas e janela aceitável do checkpoint. Não pode ser preenchido com a própria chave fornecida por um remetente não confiável. A verificação comprova inclusão sob essa raiz/chave e esses limites; não comprova que o checkpoint é o mais recente, consistência entre checkpoints, ausência de equivocation ou estado independente de uma blockchain. A posição armazenada é metadado da folha autenticada; a API MMR reutilizada verifica inclusão, não reconstrói uma posição global a partir do caminho. Um provedor real deve definir essas garantias adicionais e política de atualização/rollback.

O codec não é Rekor RFC6962 nem valida um recibo Rekor. Não há alegação de compatibilidade wire, raiz pública ou timestamp público executado. A altura da chain presente na folha é uma declaração do log aprovado; ainda precisa de validação independente da chain no adaptador real, se exigida pela política.

ProofVerifiedAnchor implementa AnchorSource imutável para o relatório exato, permitindo usá-la no fluxo v2 existente. Rejeita verified_priority_snapshot: uma única inclusão não demonstra lista elegível completa para payout. O antigo VerifiedAnchor::resolve mantém a fronteira de adaptador do perfil anterior; o tipo concreto novo é o caminho que impõe criptografia local, sem callback de aceitação de prova.

## AnchoredTime: objeto exato, não timestamp livre

AnchoredTime também tem campos privados e só nasce de ProofVerifiedAnchor. Carrega tempo e subject_digest; for_subject exige correspondência exata. Não se confia em um timestamp encapsulado sem saber a que objeto ele pertence.

SignedPocMeasurement v2 recebeu receipt_digest e verify_at_anchored_receipt. O subject da folha deve ser o digest do recibo assinado exato (bytes de assinatura normalizados, mais payload assinado), não apenas o compromisso do relatório. Assim, ancorar um relatório antes da revogação não serve como prova de que uma assinatura produzida depois já existia. O perfil continua rejeitando chave atualmente revogada mesmo diante de recibo antigo: não foi habilitada aceitação histórica de chaves comprometidas.

Os perfis legados que recebem at:u64 continuam APIs de baixo nível com configuração confiável, para compatibilidade. O novo perfil tipado não aceita horário livre para autenticação de seu snapshot. Nenhum tipo impede o host de escolher raízes erradas ou uma política de freshness permissiva; essas são responsabilidades explícitas da configuração aprovada.

## Operadores aprovados por quórum

GovernedRegistryArtifact contém identidade/versão do perfil, validade, lista de DIDs autorizados e entradas de verificador. Seu digest BLAKE3 canônico e o domínio de aprovação são explícitos. GovernedVerifierRegistry só é construído após:

- tempo de inclusão vinculado ao digest exato do artefato;
- pelo menos dois signatários Ed25519 distintos entre raízes externas fixadas, sem duplicação, chaves fracas ou assinaturas inválidas;
- validade do artefato no tempo comprovado;
- cada operator_id correspondendo ao digest do DID na lista assinada;
- todas as regras existentes do registro: IDs/intervalos válidos, sem sobrescrita e sem reutilização de chave.

O wrapper não possui insert, update ou rotação livre. Sua autenticação usa verified_at, derivado do tempo ancorado, sem argumento de tempo do caller. route_with_governed_registry usa esse snapshot verificado e a contagem por operador do router candidato. Não altera a exigência humana do fluxo ativo High/Critical.

O suporte de DID é deliberadamente restrito à sintaxe ASCII aceita pelo perfil, sem resolução de método, consulta DNS ou comprovação de controle. A governança aprova a associação DID↔operator_id↔verificador. DIDs distintos não demonstram independência física/legal, ausência de controle comum ou custódia independente. Essas alegações exigem evidência de onboarding. O registry é uma visão autenticada e imutável daquele snapshot, não um log persistente de registros/revogações nem prova de que não existe versão posterior. O deployment deve fixar política de atualização/rollback e freshness de checkpoints.

## Interoperabilidade e itens ainda abertos

| Item da auditoria | Estado atual |
|---|---|
| Âncora com verificação imposta pelo tipo | Novo ProofVerifiedAnchor verifica Ed25519 + inclusão MMR offline; perfil anterior de adaptador preservado |
| Tempo tipado | Novo AnchoredTime vinculado ao subject; perfil de recibo e registry sem timestamp livre |
| Identidade de operador governada | Snapshot com DIDs autorizados e quórum Ed25519, ainda sem raízes institucionais reais |
| Payout PostgreSQL | PENDING; journal continua simulação em memória, sem pagamento e sem exactly-once remoto |
| BLAKE3 e AKG-CBOR-v1 | Já usados por medições v2, identidade e novos artefatos; SHA-256 do compromisso legado é um perfil separado e versionado |
| TRACE completo | PENDING; enum local de nível não é validação de cadeia silicon/platform/workload/record |
| SHA-256 manual | Já substituído por sha2, não reintroduzido |

Não foi trocado dh para BLAKE3 silenciosamente: isso invalidaria compromissos, aberturas e IDs antigos. O perfil SHA-256 explícito pode ser encapsulado como conteúdo em um WER/BLAKE3; não é confundido com o digest canônico do WER. Mudança de função de hash exige versão e migração. Adicionar variantes de enum também não implementaria cadeia de atestação: seriam necessários vínculos criptográficos e validação das raízes/TCB correspondentes.

A recomendação SKIP LOCKED, isoladamente, não estabelece atomicidade, unicidade ou exactly-once; um ledger de payout futuro precisa de contrato transacional, autorização e reconciliação próprios. Nenhuma migração ou transferência foi feita nesta rodada.

## Testes

`tests/trust_profiles.rs` verifica checkpoint e inclusão válidos com MMR local; rejeita alteração de folha/horário/caminho, chave de log errada e uso do tempo para subject diferente. Verifica quórum insuficiente/duplicado, operador não autorizado, sintaxe DID fora do perfil e registry governado no router candidato. Verifica que âncora de outro objeto não valida horário de recibo e que revogação atual continua bloqueando.

Doctests compile_fail impedem construir AnchoredTime/ProofVerifiedAnchor com campos privados e inserir diretamente em GovernedVerifierRegistry. São controles de API Rust, não uma prova formal contra unsafe, host malicioso ou raízes comprometidas.

Os testes usam Ed25519 real, mas chaves determinísticas TEST, MMR local e governança sintética. Não foi contatado Rekor, publicada âncora, executado TEE, transferido valor ou ratificada governança institucional. Evidências em `docs/evidence/local/2026-10-18/type-enforced-trust/RESULTS.md`. Produção não autorizada.

Resultado local: 138 testes do workspace passaram; formatação e arquitetura passaram. Os três comandos registrados preservaram o hash de fonte antes/depois; os hashes dos logs foram conferidos.
