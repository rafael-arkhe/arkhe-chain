# Worker, recuperação e cockpit do preview

Continuação do [perfil de admissão](PREVIEW-ADMISSION.md), implementada em
22/10/2026. Há um consumidor PostgreSQL e um executor restrito que **exige uma
qualificação externa assinada**. A implementação não qualifica automaticamente
um runtime nem cria chaves de aprovação.

## Journal operacional e recuperação

A migração aditiva `20261022000016_preview_dispatch.sql` preserva as tabelas
append-only anteriores e acrescenta:

- `preview_dispatches`: estado operacional com tenant, ator, operação, tentativas,
  fencing crescente, owner token, deadline de lease e próximo instante elegível.
- `preview_execution_events`: eventos append-only vinculados à operação e fence.
- Role `arkhe_preview_execute`, sem login/membership automático; FORCE RLS em
  ambas as tabelas, trigger de transições e ausência de DELETE/TRUNCATE no worker.

O claim usa transação e `FOR UPDATE SKIP LOCKED`. O CLI consome somente o ator de
seu perfil de confiança. Antes de iniciar, verifica novamente o pedido, política,
assinaturas, validade e baseline admitido. O worker usa lease de 30 segundos com
heartbeat a cada cinco segundos. A API aceita leases de 10 a 300 segundos.
Renovação, start e conclusão conferem owner token, fence e deadline no banco.

| Estado observado | Comportamento |
|---|---|
| `READY` / `PENDING` | Nenhuma execução foi iniciada |
| `LEASED` | Worker possui lease; ainda não despachou código |
| Falha antes do despacho | `RETRY`, backoff de 2 e 4 segundos; terceira falha vira `DEAD` |
| `LEASED` vencido | Outro worker pode retomar com fence maior, até três tentativas |
| `RUNNING` | Despacho registrado antes de criar/iniciar o container |
| `RUNNING` vencido | `UNKNOWN`; não é retomado automaticamente |
| Execução observada e cleanup confirmado | `SUCCEEDED`, com receipt operacional |
| Falha após despacho ou cleanup incerto | `UNKNOWN`, sem retry automático |
| Assinatura/pedido recusado | `FAILED`, sem executar código |

`DEAD` é a fila de falhas definitivas no próprio journal. Não há requeue automático
de estados terminais. Investigar um `UNKNOWN` e propor uma nova operação exige
revisão humana; trocar o nonce não prova que o efeito anterior não aconteceu.
Os eventos e resultados são observações operacionais do supervisor, não assinaturas
TEE nem receipts de inclusão MMR. Não há promessa de exactly-once externo.

## Executor fixo e qualificação

O executor aceita exclusivamente `cargo test --locked --offline -p MODULO`, sem
comandos provenientes do modelo. Usa Podman rootless, imagem por ID sha256,
rede desabilitada, rootfs somente leitura, UID/GID 10001, capabilities removidas,
no-new-privileges, limites de memória/swap de 1536 MiB, dois CPUs e 128 PIDs.
O input selado é somente leitura; target e temporários ficam em tmpfs. O comando
tem deadline de 120 segundos e captura limitada a 1 MiB por stream.

Antes de iniciar, inspeciona imagem, usuário, comando, capacidades, rede, limites,
tmpfs e mounts efetivos, incluindo a origem do input selado. Recusa divergências.
Perda de heartbeat ou revogação observada solicita cancelamento e remoção pelo
ID exato. Sucesso só é registrado após observar o término, saída zero, remoção e
ausência do container. Incerteza na criação preserva o nome único para reconciliação.
Quando cleanup não é confirmado, o staging é preservado para investigação.

O worker exige `Qualification`, cujo payload Ed25519 é produzido por
`Qualification::signing_bytes()`. A assinatura deve vir de uma chave pública de
qualificação independente das chaves de supervisor/revisor. O documento vincula:

- imagem, digest do perfil efetivo e digest BLAKE3 do executável worker;
- identidade do engine, incluindo conexão, kernel, hostname, arquitetura, versão
  e boot ID observado no host da VM;
- validade de até 24 horas, digest do relatório de evidência e os 22 vetores do
  catálogo, todos com estado `PASS`.

O primeiro check de assinatura ocorre antes de invocar o engine. Depois são
conferidos os bindings com a identidade observada. Em Windows/WSL, o boot ID é
lido do arquivo fixo na distribuição `podman-<conexão>`, sem alterar permissões
de chaves SSH. O relatório é revalidado imediatamente antes do despacho e sua
validade/assinatura é observada pelo heartbeat.

Há também admissão da autoridade via `authority` em `ExecutorConfig`. Ela exige
`AuthorityPolicy` com raiz pública externa, identidade esperada e arquivo de
`AuthorityAdmission`. Esse veredito Ed25519 vincula origem, issuer, subject,
medição quando TEE, chave pública do qualificador, digest da evidência e validade.
Autoassinatura do qualificador e raiz coincidente com os signers do preview são
recusadas. Depois de autenticar o veredito, o host usa um caminho privado de
`ContainmentGate::authorize_admitted` antes de preparar a execução. Ausência ou
revogação do veredito bloqueia o worker.

Esse é um perfil de **verificação delegada**: a raiz externa certifica o veredito
do bridge que efetivamente validou o provider. Não é um parser nativo de cadeia
Nitro, Fulcio/Rekor ou resposta KMS. O bridge precisa validar a cadeia nativa,
vínculo da chave e política do provider antes de assinar; metadados declarados
pelo solicitante não bastam. O perfil implementado usa Ed25519; um provider com
outro formato/algoritmo exige adapter auditado, sem conversão implícita de autoridade.
Para Sigstore, o issuer configurado deve ser `https://token.actions.githubusercontent.com`
e o subject exato do workflow deve ser fixado pelo operador. Para TEE, a medição
deve estar explicitamente vinculada; o módulo Nitro existente exige PCR0/PCR1/PCR2,
e citar somente PCR0 não implementa nem substitui essa validação.

**Não existe uma qualificação real válida demonstrada nesta entrega.** O contrato
unificado anterior continua `DRAFT_NOT_SEALED_NOT_EXECUTED`; seus ensaios de
128 MiB não qualificam este perfil de 1536 MiB. Testes com documentos assinados por
chaves de fixture validam o enforcement, não a semântica dos 22 vetores. O operador
deve obter os ensaios reais e a revisão da autoridade de qualificação antes de
habilitar o worker. Nenhum estado de runtime existente foi promovido.

## Artefato de fonte

O store do supervisor, fora do alcance do modelo, contém:

```text
artifact_store/<artifact_digest>/bundle.json
artifact_store/<artifact_digest>/source/<arquivos do candidato>
```

`SourceBundle` contém `baseline` (mapa caminho → BLAKE3 dos bytes originais) e
`proposal` (mapa caminho → texto Rust substituto). Seus métodos calculam os
digests de baseline, proposta e manifest do candidato, com domínios próprios.
Esses valores devem coincidir com `PreviewSpec`. A proposta altera até oito
arquivos/64 KiB, somente `src`/`tests` da crate selecionada. O candidato tem
limites de 5000 arquivos/50 MiB. Links, caminhos ambíguos e inventário diferente
do manifest são recusados. O worker copia e verifica os bytes para staging
privado antes de montar o container; não monta o checkout de desenvolvimento.

O host continua responsável por criar e admitir o baseline e por preparar/assinar
o receipt do supervisor a partir de observações reais. O worker não inventa esses
dados a partir de uma resposta do modelo.

## Configuração e execução

Construir `arkhe-preview` e `arkhe-preview-worker` pelo workspace Rust. O arquivo
de `ExecutorConfig`, controlado pelo operador, contém caminhos absolutos para
`podman`, `artifact_store`, `qualification` e `trust_file`; contém ainda `connection`
e `qualification_key` (array público de 32 bytes). Não contém chave privada.
O login do worker precisa das roles de evidência e `arkhe_preview_execute`;
credenciais administrativas/bypass de RLS são rejeitadas.

```powershell
# ARKHE_PREVIEW_DATABASE_URL aponta para o login restrito do host.
cargo run --locked -p arkhe-runtime --bin arkhe-preview-worker -- --executor executor.json
```

Cada invocação trata no máximo um job. Um supervisor de serviço pode repetir a
invocação; concorrência de consumidores é coordenada pelo banco. Não executar o
consumer em loop antes de configurar o perfil: preflight ausente consome tentativas.

## Cockpit

`/desenvolvimento` mostra estado remoto, tentativas, fencing e razão de falha.
O revisor abre o pedido nativo, confere módulo/imagem/artefato/validade e assina
os bytes CBOR no navegador. A aprovação de exportação antiga permanece separada.
O servidor nunca recebe a chave privada e invoca o CLI sem shell, com ambiente
reduzido e deadline. O CLI autentica supervisor e baseline antes de emitir o desafio,
e exige a assinatura humana antes do commit.

Configurar `<data-dir Intra>/preview.json` com `binary` (caminho absoluto do CLI),
`trust` (perfil público do operador) e `requestsRoot`. O supervisor prepara o
pedido em `<requestsRoot>/<run-id>.json`, com:

- `trust.reviewer` e chave pública iguais à conta de governança autenticada;
- `trust.requested_by` igual ao ator da execução;
- `spec.cockpit_binding = cockpitBinding(run)` e módulo/imagem da execução;
- `intent.request_identity = RequestIdentity::new(run.id.as_bytes())`.

`cockpitBinding` usa BLAKE3 com domínio `AKG:PREVIEW:COCKPIT:v1\0` sobre o JSON
ordenado emitido pelo helper da aplicação, incluindo run ID, ator, módulo, hashes
SHA256 de baseline/proposta/evidência e imagem. O campo é opcional na API Rust
para preservar o perfil sem cockpit; a ponte Intra o exige. O supervisor deve
verificar a relação entre o snapshot e esses hashes antes de assinar o spec.
Pedido ausente, conta divergente ou assinatura inválida bloqueiam o enqueue.
O vínculo SQLite é apenas um índice para consulta do estado PostgreSQL; replay
da admissão continua idempotente se houver falha entre o commit remoto e esse índice.

## Validação e limites

Testes Rust cobrem documentos de qualificação adulterados/expirados, bindings de
fonte, expansão de privilégios/mounts e assinatura de revisão ausente. O teste
PostgreSQL vivo cobre recuperação antes do start, fencing, heartbeat, `UNKNOWN`,
backoff, `DEAD`, sucesso terminal, ator diferente e negativa do worker real sem
qualificação. O cockpit tem testes da ponte, assinatura, identidade e adulteração;
o typecheck TypeScript passou. A política efetiva foi inspecionada em container
local **sem iniciar código**. Não houve execução real qualificada, deploy ou
prova de isolamento completo. As migrações foram testadas em PostgreSQL descartável.

## Pré-selamento separado de 1536 MiB

O novo [contrato nominal](../config/runtime-preview1536-contract.json) fixa
1536 MiB / 2 CPUs / 128 PIDs e os 22 vetores. Não altera o candidato de 128 MiB
nem habilita seu adapter para outro perfil. `scripts/prepare_preview_qualification.py`
congela inputs e lista bindings/bloqueios, sem iniciar probes ou promover estado.
O código de saída não zero é intencional: preparação não equivale a gate aprovado.
O [relatório inicial](evidence/2026-10-22-preview1536-preseal-final/REPORT.md) registra
`SEAL_BLOCKED`, `sealed=false`, `runtime_verified=false` e nenhum efeito iniciado.
Antes do ensaio real ainda faltam runner/oráculos específicos, manifesto final
de mounts, política/cadeia seccomp efetiva, headroom e budgets validados e assinatura
externa. Os budgets nominais de memória/CPU/PIDs do novo contrato são propostas
de teste, não resultados empíricos nem autorização para estressar a VM.

Resultados e hashes dos logs: [validação local](evidence/2026-10-22-preview-dispatch-validation/REPORT.md).
