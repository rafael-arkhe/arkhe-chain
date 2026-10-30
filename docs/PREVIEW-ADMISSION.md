# Admissão de preview Rust

Implementação inicial em 22/10/2026 do plano
[de plataformas nativas](architecture/2026-10-22-native-platform-audit-plan.md).
Entrega a admissão verificável e uma outbox transacional. A continuação com
[worker, recuperação e cockpit](PREVIEW-EXECUTION.md) está implementada e exige
qualificação externa assinada antes de iniciar código.

## O que está implementado

- `PreviewSpec` vincula tenant, baseline, proposta, artefato, imagem OCI por digest,
  perfil de runtime e módulo Rust. A imagem aceita `sha256:` seguido de 64 hex
  minúsculos; tags não passam.
- `PreviewTrust` fixa ator, revisor, chaves públicas separadas do supervisor e do
  revisor, módulo/versão do supervisor, módulos permitidos, imagem, perfil e duração
  máxima. Não há chave ou identidade autorizada por padrão.
- `PreviewTrust::digest()` cobre a configuração efetiva, excluindo o próprio
  digest e o override de emergência. Alterar chave, ator, allowlist, imagem ou
  limite invalida a política anteriormente revisada. O digest informado é conferido.
- O supervisor assina um receipt de sucesso com spec, WER, tenant e instante de
  conclusão. O host deve verificar build/testes e os bytes do artefato antes de
  emitir essa assinatura; o modelo não atua como supervisor.
- O revisor assina `HumanReviewRecord` ligado à operação, parâmetros, WER, política
  e rota de revisão. A admissão verifica ambas as assinaturas Ed25519, rejeita
  chaves fracas/iguais e aplica frescor e validade temporal em segundos Unix.
- O baseline deve existir em um `EvidenceReader` confiável do tenant e vincular
  seu digest. O CLI usa `PgWormGraph`, que rejeita credenciais administrativas ou
  com bypass de RLS. Existência no storage não substitui admissão anterior.
- Somente depois desses checks o host constrói os envelopes autenticados de WER
  e revisão e chama `ContainmentGate::authorize_routed_admitted`.
- `ReleaseSoftware` no caminho básico `authorize` passa a ser rejeitado, mesmo
  com WER e resolver permissivo. A admissão passa a ser obrigatória nesse caminho.

As projeções CBOR de WorkIntent/WER existentes não foram alteradas. Os novos
domínios são `AKG:PREVIEW:SPEC:v1`, `POLICY:v1`, `SUPERVISOR:v1`, `HUMAN:v1` e
`ADMISSION:v1`, todos prefixados por `AKG:PREVIEW:` e terminados por byte NUL.
O perfil é uma implementação versionada inicial; não declara freeze normativo
nem compatibilidade de assinaturas com o JSON da revisão local do Intra.

## Preparação do pedido pelo host confiável

Usar os tipos e métodos de
[`preview.rs`](../orchestration/arkhe-runtime/src/preview.rs):

1. Configurar `PreviewTrust` fora do alcance do modelo e calcular seu
   `policy_digest` com `trust.digest()`. As chaves privadas ficam com o supervisor
   e o revisor, nunca nos arquivos de configuração do CLI.
2. Preparar spec a partir de baseline/artefato observados. Criar `WorkIntent`
   `ReleaseSoftware` com `target = baseline_digest`, `parameters_digest = spec.digest()`
   e nonce novo por operação lógica. Reutilizar o nonce em tentativas do mesmo pedido.
3. Criar WER `Execute`: entrada = baseline; saída = spec.digest(); referência causal
   única = baseline; `execution_id = intent.operation_id().to_hex()`. O módulo e a
   versão devem coincidir com a configuração do supervisor.
4. Criar `HumanReviewRecord`: operação e parâmetros acima, `analysis_digest = worker.digest()`,
   política configurada, `routing_digest = PreviewRequest::route(policy_digest).digest()`.
   O review deve ocorrer após a conclusão do supervisor, aprovar e expirar dentro
   do limite configurado (máximo de 24 horas).
5. Preencher o contexto com `request.expected_context()`. Os quatro vínculos são
   fonte, análise, rota e revisão humana. Duplicatas e contexto adicional falham.
6. Assinar `request.supervisor_signing_bytes()` e
   `request.reviewer_signing_bytes()` com as respectivas chaves. Gravar somente
   as assinaturas hex e os dados públicos no pedido JSON.

O contrato serializado usa os tipos Rust/Serde existentes: `Digest32` e chaves
públicas são arrays de 32 bytes, não strings hex. As assinaturas são strings hex.
O CLI limita cada arquivo a 256 KiB e rejeita campos desconhecidos nos novos
tipos. Testes em `tests/support/preview_fixture.rs` mostram a montagem completa,
com chaves exclusivamente de teste que não devem ser usadas em instalação real.

## Verificar ou enfileirar

Aplicar migrações pelo procedimento de deployment existente. A migração aditiva
cria `arkhe_preview_enqueue` sem login nem memberships. O operador deve atribuir
essa role e as roles de leitura/append necessárias ao `PgWormGraph` a um login
restrito do host. O CLI não executa migrações nem concede permissões.

Definir `ARKHE_PREVIEW_DATABASE_URL` no ambiente do supervisor. Não fornecer esse
valor ao modelo. A configuração de confiança também é controlada pelo operador.

```powershell
cargo run --locked -p arkhe-runtime --bin arkhe-preview -- --trust trust.json --request request.json
cargo run --locked -p arkhe-runtime --bin arkhe-preview -- --trust trust.json --request request.json --enqueue
```

Sem `--enqueue`, o resultado é `VERIFIED_ONLY`. Com commit confirmado, retorna
`ADMITTED_PENDING`, operation ID, authorization ref e bundle digest. Ambos
declaram `executed: false` e `execution_authority: false`.

O API `enqueue_preview(&mut sqlx::Transaction, &AdmittedPreview)` permite ao host
gravar seu registro de negócio, admissão e outbox na mesma transação. O caller é
responsável pelo commit/rollback externo; um savepoint interno garante que erro
na segunda escrita não deixe somente a admissão se o caller capturar o erro.
O banco confere tenant e expiração com seu relógio no enqueue.

`preview_admissions` e `preview_jobs` têm FORCE RLS, triggers de imutabilidade e
permissões de SELECT/INSERT restritas. A PK inclui tenant, ator e operação; FK
também vincula o digest do bundle. Replay exato não duplica job; conteúdo ou
assinatura diferente para a mesma operação gera conflito, sem sobrescrever.
Uma nova revisão exige uma operação nova, em vez de alterar a evidência anterior.

## Limites antes de executar

Uma admissão salva não concede execução. O [journal operacional](PREVIEW-EXECUTION.md)
implementa leases, fencing, retry limitado e estados DEAD/UNKNOWN. O executor
exige qualificação assinada para o perfil exato; não promete exactly-once. Antes do efeito, ele deve
revalidar política/chaves ativas, emergência, assinatura, validade, baseline e
bytes do artefato; o bundle salvo pode já estar expirado ou revogado.

A admissão fica em tabelas próprias, não é receipt de inclusão WormGraph/MMR.
Os envelopes de análise/revisão usados pelo gate são construídos em memória após
autenticação; o bundle assinado e os CBOR de intent/WER são persistidos juntos na
admissão. Checkpoints/provas e integração de leitura continuam no marco M3.
As roles SQL não são proteção contra administrador da infraestrutura e o banco
não autentica assinaturas por conta própria. Um consumidor futuro deve tratar
linhas enfileiradas como dados a verificar, nunca como permissão autoexecutável.

## Validação local

```powershell
cargo test --locked -p arkhe-runtime -p arkhe-kernel
python scripts/check_architecture.py
cargo fmt --all --check
```

O teste vivo exige **cluster PostgreSQL descartável** e privilégio administrativo
apenas para setup. Cria banco/login de teste com UUID; não usar banco de aplicação.

```powershell
# Definir ARKHE_TEST_PREVIEW_ADMIN_DATABASE_URL para o cluster descartável.
cargo test --locked -p arkhe-runtime --test preview_postgres -- --ignored --nocapture
```

Executado localmente com PostgreSQL 16 em container efêmero: commit/rollback,
replay/conflito, oito produtores concorrentes, isolamento RLS, contexto ausente,
UPDATE/DELETE/TRUNCATE negados, FK de job órfão, falha da segunda escrita e CLI
real nos modos de verificação e enqueue. As assinaturas usam fixtures sintéticas;
isso não qualifica um supervisor de build real ou o isolamento do executor.

Estado histórico da primeira entrega, antes do worker: M0/M1 com perfil de admissão implementado; M2 com outbox
atômica implementada e consumidor operacional pendente; M5–M7 permanecem pendentes.

Resultados finais locais em 22/10/2026: `cargo test --workspace --locked` passou
com os testes vivos opt-in ignorados conforme seus atributos; os sete testes de
admissão passaram e o teste PostgreSQL/CLI foi executado separadamente com sucesso,
sem skip. Arquitetura (24 crates, 6 pacotes Node, 15 migrações), formatação global,
oito checks SQL e os 17 vetores independentes WorkIntent/WER também passaram.
O container descartável foi removido. A migração não foi aplicada ao banco da aplicação.
O workflow CI recebeu o gate PostgreSQL explícito; execução remota não foi realizada.
