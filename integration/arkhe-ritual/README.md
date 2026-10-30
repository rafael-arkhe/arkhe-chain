# arkhe-ritual

Implementação experimental executável do protocolo discutido nos anexos. Crate
isolado em um workspace próprio: não modifica o WER nem os gates existentes.

**Caminho B implementado localmente:** adaptador Stripe test-mode e runner em
[docs/STRIPE-TEST.md](docs/STRIPE-TEST.md). A validação local usa transporte
simulado; execução na conta Stripe permanece pendente de credencial de teste.

## O que está implementado

- Emissão persistente de desafios com nonce CSPRNG de 32 bytes e TTL de até 300 s.
- Atestação **mock**, explicitamente habilitada, com chave do fornecedor e medições
  aprovadas; assinatura da análise por chave de aplicação vinculada ao relatório.
- Declaração de análise e autorização do gate assinadas separadamente. O tipo
  `VerifiedAnalysis` tem campos privados e só é criado pelo verificador.
- Adaptador `ArkheGate` para `ContainmentGate::authorize_admitted`, usando
  `WorkIntent`, `WorkerExecutionRecord` e `PolicyBinding` reais. O host deve resolver
  a capacidade externa para `EffectBinding`; não derive esse binding de alegações
  não verificadas do chamador.
- Aceitação com consumo do desafio, autorização, efeito, taxa simulada e outbox na
  mesma transação. A biblioteca controla o commit/rollback, evitando commits de
  alterações parciais após erros de validação.
- Aquisição com epoch e lease, bloqueios em ordem consistente, política ativa e
  emergency stop. A aquisição lineariza o despacho no commit. Um stop posterior
  não cancela uma chamada externa já autorizada para envio.
- Destino PostgreSQL de teste com deduplicação durável por `effect_id`, conteúdo
  fixo e resultado assinado. O INSERT é o próprio efeito simulado; adaptadores
  reais precisam comprometer seu efeito e deduplicação atomicamente.
- Confirmação por tentativa/epoch, recuperação para `unknown` e reconciliação sem
  reenvio. Retry requer autorização nova e é restrito ao destino durável desta
  implementação. Não há retry automático para destinos arbitrários.
- Recibo de auditoria assinado pelo serviço. Não é apresentado como um recibo TEE
  real do efeito externo. Efeito corrigido/compensação é um novo pedido/efeito.
- MMR pelo perfil existente de `arkhe-verify-core`, `SignedCheckpoint` e
  `CheckpointTrust` de `arkhe-wormgraph`, prova offline de posição e autorização.
- Cobrança **simulada em unidades locais**, por efeito aceito; replay e retry não
  debitam novamente. Rejeição/erro reverte o débito. Sem transferência de tokens.

## Executar

Requisitos: toolchain do repositório, PostgreSQL 16+ e banco **de teste** cujo
usuário possa criar bancos descartáveis (`#[sqlx::test]`).

```powershell
cd D:\arkhe\integration\arkhe-ritual
docker compose up -d --wait
$env:DATABASE_URL = 'postgres://ritual_test:local_test_only@127.0.0.1:55439/ritual_test'
.\scripts\test.ps1
```

Se já existe PostgreSQL de teste, configure `DATABASE_URL` e dispense o container.
Não use um cluster de produção: SQLx cria e remove bancos isolados nos testes.
Sem `DATABASE_URL`, os testes SQL falham explicitamente; não são omitidos.

```powershell
cargo run --example vector
python -m venv .venv
.\.venv\Scripts\python -m pip install cbor2 blake3 cryptography
.\.venv\Scripts\python scripts/verify_vector.py
```

`vectors/authorization-v1.json` fixa CBOR, digest, chave e assinatura. A chave
privada `[7;32]` é exclusivamente um fixture público. A verificação Python usa
encoder CBOR e biblioteca Ed25519 independentes dos usados em Rust.

## Evidência de execução capturada

Em 26/10/2026, `scripts/test.ps1` terminou com código 0: **23 testes passaram**,
sem falhas ou testes ignorados, incluindo migrações em PostgreSQL 16.14,
`cargo fmt -- --check` e Clippy com `-D warnings`.

Trechos de [artifacts/test-20261026.log](artifacts/test-20261026.log):

```text
test actual_containment_gate_evaluates_policy_and_effect_mapping ... ok
test result: ok. 1 passed; 0 failed; 0 ignored
test pinned_authorization_vector_matches_rust_encoder_and_signature ... ok
test result: ok. 22 passed; 0 failed; 0 ignored
```

O primeiro teste usa `ContainmentGate::authorize_admitted` real com resolvers de
teste que permitem e negam a operação, além de rejeitar destino divergente.
`policy_denies_attested_operation` também confirma que atestação válida não
substitui autorização. Esses testes não validam uma política de produção.

Verificação Python independente, em
[artifacts/vector-20261026.log](artifacts/vector-20261026.log):

```text
OK: independent CBOR (363 bytes), BLAKE3 and Ed25519
```

O [log RPC](artifacts/rpc-20261026.log) registra chain ID 784, assinatura válida
aceita, mensagem adulterada rejeitada e `transactions_sent: 0`.
Contexto e limites do ambiente em [docs/VALIDATION.md](docs/VALIDATION.md).

Após acrescentar o adaptador Stripe, a suíte passou a **32 testes**, todos verdes.
O [log ampliado](artifacts/stripe-local-tests-20261026.log) inclui nove cenários
Stripe com transporte simulado e PostgreSQL real; isso ainda não demonstra
execução contra o fornecedor. O runner está autorizado para modo de teste quando
a chave local estiver configurada; o resultado externo permanece pendente.

## Uso e fronteiras de confiança

O host configura `MockPlatformVerifier`, `GateIssuer`, `Store`, chaves do destino
e chaves de checkpoint. São APIs internas, **não endpoints HTTP autenticados**.
O parâmetro `tenant` dos métodos de aceitação deve vir de autenticação do host,
nunca de um campo do request sem verificação. As APIs administrativas de política,
saldo, registro de chave e emergency stop não devem ser expostas ao público.

Fluxo: `Store::issue_challenge` → `MockPlatformVerifier::verify` →
`GateIssuer::issue(ArkheGate, ...)` → `Store::accept` → `Store::acquire` →
destino → `Store::confirm` → `anchor::append_receipt`.

Após resposta perdida: `Store::recover_stale` faz commit de `unknown` e invalida
epoch antigo. Consulte o destino por `effect_id`; use `Store::reconcile` com sua
evidência assinada. Somente `retry_unknown` com destino durável conhecido e nova
autorização permite outra aquisição. Nunca transforme um timeout em falha final.

`anchor::verify` verifica a assinatura do serviço de auditoria no recibo e a
inclusão/posição contra um checkpoint autenticado por `CheckpointTrust` externo.
`anchor::verify_authorization` verifica, adicionalmente, a assinatura independente
do gate em `Authorization`, exige `allow` e confere efeito, análise, política,
tenant e janela no instante de despacho registrado pelo serviço. O compromisso
dessa autorização está no recibo cuja inclusão é verificada. `PolicyBinding`
identifica a política; sua mera presença não demonstra vigência ou autorização.

Portanto, o pacote atesta a decisão assinada do gate e a declaração assinada do
serviço, não execução em TEE real, correção funcional do modelo ou tempo absoluto.
A revogação no despacho é consultada no registro local confiável, não provada pelo
MMR. Se o DB/controle não puder ser lido, `acquire` propaga erro e não devolve uma
aquisição; não existe fallback para decisão em cache. Uma aquisição já commitada
pode ter sido enviada quando ocorrer uma partição e exige reconciliação posterior.
Propagação de revogações entre regiões/fontes externas não está implementada.

## Limites explícitos

Não há integração NRAS/TDX/SGX real, contrato EVM implantado, SDK Ritual, wallet,
AVS ou slashing. Não há deploy nem dinheiro real movimentado.

A fonte oficial fornecida posteriormente é https://docs.ritualfoundation.org/.
O smoke test somente de leitura está em `scripts/probe_ritual.py`; sua observação
está em `vectors/ritual-rpc-observation.json`. Ele verificou assinatura válida e
mensagem adulterada via `eth_call`, sem transação. Não valida atestação TEE.

```powershell
python scripts/probe_ritual.py
```

O log SQL exige permissões de escrita restritas. Um administrador malicioso pode
alterar a base; checkpoints assinados e compartilhados permitem detectar conflitos,
mas não substituem testemunhas externas ou políticas operacionais de retenção.
Exportação de prova está limitada a 100 mil folhas por tenant nesta versão.

Os testes passando fornecem evidência para os cenários exercitados; não
transformam toda a especificação em garantia comprovada.

## Arquivos

`src/crypto.rs`: bytes autoritativos e assinaturas; `protocol.rs`: tipos e análise;
`store.rs`: transações; `destination.rs`: destino durável; `arkhe.rs`: gate real;
`anchor.rs`: checkpoint e prova; `migrations/001_ritual.sql`: schema completo;
`tests/`: cenários de segurança; `docs/`: protocolo, fontes e validação.
