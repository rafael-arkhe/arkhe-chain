# Revisão implementada — 26/10/2026

Writer fencing e conteúdo recuperável são **pré-requisitos de correção**, não
simples configuração de deploy. O registro anterior de 125 testes foi preservado
como histórico; não demonstrava esses requisitos. Esta rodada os implementa e
testa localmente sob o modelo explícito abaixo.

## Modelo de segurança implementado

Uma autoridade **PostgreSQL comum**, transacional, é o destino de escrita dos dois
writers. A migração 20261026000018 adiciona um fence por tenant, com epoch e login
owner. INSERTs em wormgraph_records, work_objects, mmr_checkpoints e memo packages
validam session_user + epoch, persistindo epoch nos registros. Sem row de fence,
o tenant permanece legado: não declarar que esse tenant tem single-writer cercado.
Snapshots recuperáveis recusam registros legados sem epoch autenticado.

Um lock compartilhado no fence é mantido até commit/rollback de cada write.
Promover toma o lock exclusivo por UPDATE/CAS, espera os writes já admitidos e
incrementa epoch/troca owner atomicamente. O login antigo não pode se fazer passar
pelo novo declarando seu epoch. Runtime não recebe UPDATE na tabela de fence.
Snapshot incompleto, checkpoint não atual ou CAS perdido causam rollback da
promoção. O teste usa logins PostgreSQL distintos, não dois nomes de cloud em mock.

**Limite essencial:** esse mecanismo não cerca dois bancos independentes. Se a
autoridade comum está inacessível, a escrita/promoção para. Sua HA, recuperação e
continuidade entre providers precisam de projeto próprio. Copiar a tabela de fence
para cada cloud recriaria o split-brain. Object Lock é retenção, não eleição de
escritor; leases independentes tampouco fornecem um fence comum. Este código não
declara DR de provider demonstrado com uma autoridade central indisponível.

## Snapshot recuperável

O exportador PostgreSQL lê checkpoint, prefixo do journal WormGraph, envelopes e
conteúdos em uma transação repeatable-read/read-only. ReplicaBundle assina epoch,
checkpoint e registros/conteúdos. O gate verifica assinatura nativa do checkpoint,
assinatura do snapshot, digests dos conteúdos, correspondência ao journal, pais,
ordem, contagem e MMR. ReplicaReader disponibiliza envelopes e bytes recuperados.

O manifesto v2 inclui epoch. O formato hash-only v1 deixa de ser aceito como
prontidão operacional. Exportação pública usa commit de manifesto; a ferramenta
de snapshot local usa arquivo temporário/fsync/publicação atômica sem overwrite.
O gate Cosign deve ancorar o **snapshot completo**, não somente o checkpoint v1.
Epoch/conteúdo também precisam dessa âncora externa. minimum_writer_epoch vem de
um high-water mark independente do operador; Rekor não fornece uma API confiável
que descubra o "último epoch global" automaticamente.

Cobertura de conteúdo: WorkIntent, WorkerExecutionRecord e MemoObservationPackage/v1.
Work-authorization inclui intent e worker, mas a réplica não reexecuta autorização
ou valida todas as dependências de serviços externos. Tipos desconhecidos falham.
Não há restore automático de outros bancos/projeções/OperationJournals do produto.
O snapshot inteiro muda/retransmite quando há novos registros; a otimização delta
de conteúdos permanece aberta. Isso não é ocultado como replicação delta completa.

## Procedimento de ativação

1. Aplicar a migração com papel administrativo. Antes de ativar um tenant, quiescer
   todos os escritores e garantir um histórico cuja origem/epoch seja conhecida.
   Não preencher retroativamente epochs em registros legados sem auditoria.
2. Na mesma transação administrativa, bloquear as quatro tabelas de INSERT em
   SHARE ROW EXCLUSIVE MODE e inserir o fence inicial (epoch 1, login AWS real).
   O bloqueio impede que writes iniciados antes da ativação passem despercebidos.
3. Configurar logins distintos e não administrativos. PgWormGraph usa
   connect_fenced(...,epoch) ou ARKHE_WRITER_EPOCH. O fence é por tenant, pois a
   tabela de registros ainda não tem dimensão stream.
4. Exportar via exemplo export_replica; assinar o snapshot com chave pinada;
   gerar/verificar o bundle Sigstore; publicar e replicar o manifesto v2.
5. promote.py/promote-azure.sh verificam o snapshot e a âncora antes de invocar
   promote_writer. O DSN administrativo vai em ARKHE_FENCE_ADMIN_DATABASE_URL,
   exclusivamente no processo de promoção. O novo writer usa o epoch retornado.
6. Sem a autoridade comum ou sem os gates, recusar promoção. O failback não é
   automático. Para restore/escrita em banco independente, projetar outro mecanismo
   de autoridade antes de avançar para ensaio de desastre de provider.

## Evidência executada nesta rodada

PostgreSQL 16 real, container isolado `arkhe-multicloud-correction-pg`, host local
127.0.0.1:55438, roles aws_writer/azure_writer sem privilégios administrativos.
Migrations aplicadas nesse banco descartável; nenhum banco de produção alterado.
O container foi parado após os testes; o banco local foi preservado para inspeção.

| Comando/caminho | Resultado |
|---|---|
| cargo test --locked -p arkhe-wormgraph -p arkhe-governance --all-targets | 54 governance + 50 WormGraph PASS; três integrações PG marcadas ignored nessa execução padrão |
| cargo test --locked -p arkhe-governance --doc | 2 PASS |
| fencing_postgres -- --ignored, com DSNs do banco isolado | 1 PASS: lock de transação antiga observado em pg_stat_activity; uma promoção concorrente vence; login antigo/epoch forjado recusados; snapshot recuperável; rollback de promoção com prefixo incompleto; export com conteúdo ausente recusado |
| postgres_regenerate -- --ignored, mesmo banco isolado | 1 PASS: compatibilidade do caminho legado sem fence ativado |
| replica_contents | 5 PASS incluídos nos 50: conteúdo legível após verificação; assinatura, epoch, payload, ordem/pais e journal inválidos recusados |
| Python unittest discover -s ops/multicloud/tests | 25 PASS, incluindo fixação de bytes entre os gates de promoção |
| cargo clippy --locked -p arkhe-wormgraph --all-targets --no-deps -- -D warnings | PASS, sem suppressions |

Total sem sobreposição: **133 PASS** = 56 governance + 52 WormGraph + 25 Python.
O teste memo_postgres permanece não executado. Os três testes do example antigo
foram substituídos pelos cinco testes de conteúdo; não são contados novamente.
As ferramentas CLI compilam; a exportação transacional foi exercida pela API no
teste PostgreSQL, não por uma execução completa dos CLIs com Rekor.

O lint unnecessary_map_or em roster.rs foi corrigido. O Clippy all-targets revelou
também single_match preexistente em um teste de identity.rs; foi corrigido, sem
alterar a lógica. Agora esse crate passa Clippy completo, em vez de apenas "sem
novos lints com uma exceção no crate". Não se afirma limpeza do workspace inteiro.

## O que continua sem evidência real

Cosign com TrustedRoot/bundle Rekor real **não foi executado**, nem foi executado
com TrustedRoot de fixture. O teste Rust usa criptografia real e chaves de fixture;
isso não equivale a autenticar uma âncora de produção. ApplicationSet continua
validado como YAML, sem controller/reconciliação real. CI atualizado, mas ainda
não executado no GitHub. Nenhum ensaio real AWS/Azure ou RPO/RTO medido.

Conclusão de escopo: fencing no storage compartilhado e snapshot recuperável têm
evidência local real. O failover de produção permanece **não demonstrado**; isso
não é uma prova de impossibilidade/refutação. O próximo ensaio exige **fencing
ativo**, não um "failover sem fencing provado". Consenso segue adiado.
