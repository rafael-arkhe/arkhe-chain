# ReplicaBundle recuperável e fencing

Hash-only export v1 não autoriza prontidão ou promoção. O manifesto de transporte
agora é `arkhe-replica-v2`, incluindo writer_epoch. Objetos: snapshot recuperável
assinado, bundle Sigstore desse snapshot e blocos de hashes em ordem de journal.

## Conteúdos e integridade

`ReplicaBundle` (`arkhe-replica-bundle-v1`) contém checkpoint nativo, writer_epoch,
entradas de journal (append_sequence, writer_epoch, EvidenceEnvelope e conteúdos)
e assinatura Ed25519 sobre a projeção CBOR no domínio `AKG:REPLICA:BUNDLE:v1\0`.
Usa a mesma chave pinada do checkpoint. A assinatura vincula metadados de envelopes
e conteúdos; o MMR sozinho só vincula os record_hash, não todo o envelope.

Conteúdos suportados: WorkIntent, WorkerExecutionRecord e MemoObservationPackage/v1,
com bytes e digests BLAKE3 nos domínios nativos. Work-authorization exige conteúdo
de intent e worker; o bundle não reexecuta sua autorização. Tipos desconhecidos,
conteúdos faltantes/corrompidos, pais ausentes/não causais, contagem/root divergentes
ou epochs inadequados são recusados. Não se inclui automaticamente o journal de
outros serviços, seus bancos, credenciais ou projeções. ReplicaReader implementa
EvidenceReader e consulta de conteúdos após verificação; não é um restore SQL.

`PgWormGraph::export_replica_snapshot` lê checkpoint armazenado, journal, envelopes,
objetos e memo packages na mesma transação REPEATABLE READ READ ONLY. A comparação
ao checkpoint e verificação de conteúdos ocorrem antes da saída. Registros legados
sem epoch não são promovidos retroativamente a registros autenticados.

## Exportar, assinar, publicar

```powershell
cargo build --locked -p arkhe-wormgraph --example export_replica --example verify_replica --example promote_writer
```

O exemplo export_replica recebe `REPLICA_TRUST_JSON CHECKPOINT_JSON
ED25519_SEED_FILE OUTPUT_JSON`; a conexão vem de ARKHE_EXPORT_DATABASE_URL. Usa seed
local de 32 bytes apenas como ferramenta local; produção deve integrar KMS pela
mesma API signing_bytes. Verifica a chave contra o trust e o checkpoint, assina o
snapshot e o publica por hard-link atômico após fsync, sem sobrescrever o destino.

Gere um bundle Sigstore moderno sobre os **bytes exatos desse snapshot**, usando
Cosign/infraestrutura aprovada (`cosign sign-blob --key <chave> --bundle <bundle>
<snapshot.json>`). Isso publica material externamente e não foi executado aqui.
Não assinar apenas o checkpoint antigo: o epoch e os conteúdos também precisam da
âncora. O bundle deve conter prova de inclusão e checkpoint assinado do log.

`export.py --checkpoint snapshot.json --bundle sigstore.json ...` cria os objetos
e o manifesto assinado de transporte. --blocks é opcional; por padrão cria um
objeto de 32 bytes por record_hash. A chave Ed25519 do manifesto de transporte é
independente da chave do snapshot. `upload.py` faz PutObject condicional no S3 e
publica o manifesto por último. A publicação desse manifesto é o commit marker;
objetos órfãos de tentativas incompletas não formam um bundle pronto.

O transporte segue JSON ASCII ordenado sem espaços, assinatura sobre
`ARKHE:REPLICA:MANIFEST:v1\0 || canonical(manifest)` e objetos endereçados por SHA-256.
Campos do manifesto: schema, tenant, stream, writer_epoch, sequence, previous e
objects ({key,size,sha256}). previous é o SHA-256 do envelope anterior. Schema v2
é parte assinada; prefixos e epochs não podem regredir. O MMR permanece BLAKE3.

## Verificar e replicar

ReplicaTrust JSON contém `checkpoint` (CheckpointTrust já existente) e
`minimum_writer_epoch` positivo. Esse mínimo é um high-water mark do operador,
derivado de histórico ancorado verificado e mantido fora da réplica. Não se infere
um "último epoch global" consultando Rekor: inclusão não oferece essa descoberta.

Configure o argv de verify.py fora da réplica, com --native-binary,
--checkpoint-trust (agora ReplicaTrust), --cosign, --signer-key e --trusted-root.
replicate.py acrescenta o diretório com objetos materializados. Ambos os gates
devem passar: assinatura/epoch/conteúdos/MMR nativos e Cosign/Sigstore/TrustedRoot.
Trust não vem da réplica; o TrustedRoot real e Cosign continuam sem execução real
nesta rodada. Não houve sequer teste de Cosign com TrustedRoot de fixture.

replicate.py usa S3 GetObject e Azure Blob/DefaultAzureCredential. Exige chave exata
de manifesto, escopo e predecessor; copia ausentes, relê e confere o destino antes
de publicar recibo imutável. Bytes existentes diferentes são colisões, sem overwrite.
Retries idênticos são idempotentes. O snapshot completo com conteúdo é retransmitido
quando muda; apenas os blocos/objetos idênticos são reaproveitados. Não se promete
delta eficiente de todos os conteúdos. Limites: objeto 64 MiB, manifesto 4 MiB,
10.000 objetos; gate nativo até 1 milhão de hashes, limitado também pelos 64 MiB
do snapshot JSON. Falta medir capacidade/custo e RPO/RTO.

## Fencing e promoção

A migração 18 é opt-in por tenant. Antes de ativar, quiesça escritores e use uma
transação administrativa para bloquear as quatro tabelas de escrita e inserir
`wormgraph_writer_fence(tenant_id,epoch,owner_login)`. O tenant inteiro é o escopo,
pois wormgraph_records não tem dimensão stream. Não copie essa tabela para criar
uma autoridade independente. Writers usam logins distintos, não administrativos,
e `connect_fenced(...,epoch)` ou ARKHE_WRITER_EPOCH. Triggers comparam epoch **e
session_user** e persistem epoch nos INSERTs. Um cliente antigo tentando declarar
o novo epoch continua recusado porque seu login não é o novo owner.

`promote.py` (wrapper promote-azure.sh) verifica os gates e chama promote_writer
com ARKHE_FENCE_ADMIN_DATABASE_URL e --new-login. O CAS incrementa epoch/troca login
na autoridade compartilhada, esperando writes antigos; exige snapshot completo e
checkpoint mais recente. Uma falha posterior ao UPDATE faz rollback do epoch.
O pool administrativo é somente do processo de promoção, nunca do runtime.

O mecanismo garante exclusão no **mesmo PostgreSQL**. Não demonstra HA desse banco,
restauração de bancos independentes, eleição entre storage providers ou failover
com a autoridade inacessível. Nessa situação, a promoção para. Read-only via
ReplicaReader pode continuar; escrita exige recuperar a autoridade comum ou
projetar e verificar uma nova solução de storage/fencing. Consulte o runbook.
