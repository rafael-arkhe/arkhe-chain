# Gates duráveis de payout candidato e witness de checkpoints

Estado: TESTED localmente com PostgreSQL real e provedores de pagamento simulados; IMPLEMENTATION CANDIDATE. Não é liquidação financeira ou autorização de produção. As alegações bibliográficas do anexo não foram revalidadas e os testes não são classificados como THEOREM.

## Migração aditiva e isolamento

Adicionada `storage/sql/migrations/20261018000013_payout_witness.sql`, sem alterar as doze migrações existentes. O manifesto de hashes recebeu apenas a entrada nova. A migração foi aplicada no PostgreSQL local pelo migrador existente com credencial administrativa; acesso de runtime continua recusando superuser/BYPASSRLS.

`payout_jobs` e `checkpoint_witness` usam tenant obrigatório, RLS ENABLE/FORCE, papel operacional restrito e proibição de DELETE/TRUNCATE para esse papel. O payload/identidade do payout não pode ser atualizado. Triggers permitem apenas as transições previstas e rejeitam rollback/troca de raiz no witness. O papel operacional e o tenant da sessão ainda são fronteiras confiáveis do host, não evidência normativa.

## PgPayoutJournal

Novo `bounty_evidence::durable`. enqueue_candidate recebe request e ClosedPriority, valida a prioridade/destinatário/chain e reserva vulnerability_id junto com o job em uma única transação/linha. Há PK (tenant_id,idempotency_key), UNIQUE(tenant_id,vulnerability_id) e parameters_digest separado. Os parâmetros vinculam vulnerabilidade, destinatário, valor decimal canônico u128, ativo, chain e digest do snapshot de prioridade.

Mesmo idempotency_key com valor/ativo/chain/prioridade diferentes retorna ParameterMismatch; outra operação da mesma vulnerabilidade retorna DuplicateVulnerability. Repetição conhecida após COMPLETED retorna o recibo persistido. Valor zero ou representação decimal não canônica é rejeitado. Não há float monetário ou normalização implícita de unidade.

claim usa SELECT FOR UPDATE SKIP LOCKED e grava DISPATCHED com owner_token UUID antes de retornar. Não existe lease que expire e reenvie automaticamente uma operação incerta. complete exige o owner_token exato e transição DISPATCHED→COMPLETED; receipt deve estar presente e ter tamanho limitado. O token não pode ser trocado nessa transição. Uma conclusão perdida após efeito externo deixa DISPATCHED/Uncertain e exige reconciliação; não volta para PENDING. Também um crash antes de efetuar a chamada, mas depois do claim, exige investigação, sacrificando liveness para evitar reenvio cego.

O journal não chama provedor financeiro, não verifica settlement on-chain, não valida criptograficamente o recibo e não emite AuthorizationProof. enqueue_candidate é deliberadamente um ledger operacional candidato. Um executor futuro precisa verificar autorização do kernel, payload, política, escopo, evidência e recibo antes de mover dinheiro. Não há API de pagamento real habilitada, KYC/regulação ou configuração de conta. Unicidade do ID não detecta equivalência semântica de bugs. A unidade/ativo e o tenant devem vir de configuração autorizada, não de entrada livre do pesquisador.

## PgCheckpointWitness e consistência

O witness persiste um checkpoint assinado por tenant/log. Cada observe verifica a assinatura da entrada e os limites de CheckpointTrust; recarrega e verifica a assinatura do head persistido, depois usa lock transacional para serializar atualizações. Rejeita:

- tamanho ou issued_at menores que o head aprendido;
- outra raiz no mesmo leaf_count;
- crescimento sem prova de consistência;
- crescimento que reescreve o prefixo aprendido.

A primeira observação é bootstrap sob o log/chave/janela/minimum_leaf_count fixados pelo host; não demonstra história anterior. Rotação de chave não possui fallback automático: um head antigo que não verifica sob a configuração corrente bloqueia até um processo explícito de rotação.

FullPrefixConsistency é uma prova simples e explícita que fornece todas as folhas da árvore nova. Reconstrói, com o MMR existente, a raiz do prefixo antigo e a raiz inteira nova, exigindo correspondência com ambos os checkpoints assinados. Aceita no máximo 65536 folhas e 16 MiB de conteúdo. Não é uma prova compacta RFC6962/COSE nem um codec Rekor; expõe o conteúdo das folhas fornecidas e não deve receber segredos que não possam ser compartilhados com o verificador. Uma implementação escalável exigirá perfil compacto próprio e qualificação separada.

A assinatura/consistência demonstra extensão do prefixo observado sob as raízes escolhidas. Não demonstra que o checkpoint seja o mais recente globalmente, que outro observador não recebeu fork, completude da lista de claims, ausência de omissões ou independência da infraestrutura. O witness detecta apenas conflitos apresentados a ele e depende de integridade/disponibilidade do banco; restauração por administrador ou comprometimento das raízes está fora da proteção de RLS/trigger. Gossip, witness externo independente, monitoramento e backup/rollback policy continuam necessários para requisitos mais fortes.

## Estado dos demais pontos do anexo

- TEE real: indisponível conforme orientação do usuário; harness opt-in permanece preparado, sem fallback mock e sem promoção de nível.
- Raízes institucionais: não provisionadas ou ratificadas. Os testes usam chaves TEST e governança sintética.
- Chain: a altura na folha continua declaração autenticada do log; leitura/prova independente de chain não foi executada.
- Hash: os perfis SHA-256 legado e BLAKE3/CBOR novos permanecem distintos e versionados. Não houve migração silenciosa. A allowlist/deadline de aceitação institucional dos perfis ainda depende de política aprovada; esta rodada não inventa um prazo de retirada ou habilitação de produção.
- Ed25519/MMR: usar dalek verify_strict não é por si prova de conformidade com todo padrão citado no anexo; o perfil testado e seus formatos permanecem explícitos. Inclusão e consistência não são garantia de latestness.

## Execução local

`tests/durable_gates.rs` contém um teste unitário de prefixo (válido, histórico reescrito, comprimento inválido) e testes opt-in postgres-integration com banco real:

1. Reserva e claim concorrentes: um único dispatch; parâmetro divergente e duplicidade de vulnerabilidade rejeitados; owner incorreto não conclui; conclusão persiste e replay após reconexão não faz outra escrita simulada.
2. Efeito externo simulado com conclusão perdida: reconexão retorna Uncertain e não reclama novamente o job.
3. Witness após reconexão rejeita equivocation do mesmo tamanho, rollback, crescimento sem prova e prefixo adulterado.
4. Duas extensões conflitantes concorrentes: somente uma vira head.
5. RLS e privilégios são conferidos; PENDING→COMPLETED e DISPATCHED→PENDING são rejeitados pelo banco.

Reconexão/abandono do cliente foi exercitado; não houve reboot, power loss ou restart do PostgreSQL nesta rodada. Os contadores de escrita são do provedor simulado, não de um sistema de pagamento real. A conclusão suportada é que estes cenários não redispatcham o job, não um exactly-once financeiro universal.

Comandos, outputs e hashes: `docs/evidence/local/2026-10-18/durable-payout-witness/RESULTS.md`. A migração adicionou estado operacional, não evidência de exploração, autorização ou liquidação. Produção continua não autorizada.

Resultado final: 139 testes do workspace passaram. O gate direcionado passou em 6 testes, sendo um de consistência sem banco e 5 casos de integração com PostgreSQL real. Migração, checksums das 13 migrações, formato, arquitetura e assets passaram. Todas as oito execuções registradas mantiveram o hash de fonte antes/depois; logs conferidos por SHA-256.
