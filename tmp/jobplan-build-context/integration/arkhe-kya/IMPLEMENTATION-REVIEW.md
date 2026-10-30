# Proposta de repositório: implementação consolidada — 2026-10-23

Evolução posterior: [MATURITY](docs/MATURITY.md), [ADR-006](docs/adr/ADR-006-verified-path.md)
e [MIGRATION](docs/MIGRATION.md) são o estado atual. Acrescentaram apresentação
e estado persistente na CLI e removeram os cinco testes repetidos. Os números
de execução abaixo descrevem a consolidação anterior, preservada como histórico.

O anexo é um desenho com código não executado, não um repositório completo
validado. Aproveitou-se a fronteira de módulos e o gate de status preservando
o código testado. Não se materializaram stubs apenas para reproduzir a árvore.

## Workspace executável

```text
arkhe-kya/
  Cargo.toml, Cargo.lock
  crates/arkhe-kya-primitives/  # JCS, did:key, Ed25519 estrito compartilhados
  crates/arkhe-kya-status/      # núcleo independente e tests/revocation.rs
  src/status.rs               # reexport de compatibilidade, sem cópia do núcleo
  src/status_composition.rs   # adaptador de recibo KYA + estado
  src/policy.rs               # política sobre verificações recalculadas
  src/bin/arkhe-kya.rs         # CLI verify, com leitura limitada
  scripts/gen_fixtures.mjs    # chama produtor Rust, não assina com JSON.stringify
  anchor/                    # adaptador Sigstore + witness existente
```

O workspace ainda reutiliza `arkhe-verify-core` e `arkhe-core` por caminhos no
workspace original. Não é um arquivo autossuficiente que se possa copiar sozinho
para outro repositório. Status/primitives não dependem dessas crates de MMR,
nem de Passport, modelos, rede ou TEE. Não foi criado/publicado um repositório Git.

## Gate pedido, executado

Dentro de `D:/arkhe/integration/arkhe-kya`:

```powershell
cargo test -p arkhe-kya-status --locked
```

Resultado: **5 passed** — os quatro gates, mais vínculo ao digest e propósito
externos. O núcleo anterior foi movido, não substituído pela versão menos
restrita do anexo. A API antiga permanece reexportada.

## Política calculada, não autodeclarada

`VerifierPolicy` requer explicitamente:

```json
{
  "require_tee": false,
  "require_icp_brasil": false,
  "require_revocation_check": true,
  "require_anchor": false,
  "max_status_age_seconds": 300,
  "minimum_status_sequence": 0
}
```

Zero no piso de sequência significa bootstrap sem histórico local; o consumidor
deve elevar e persistir o piso por issuer/lista/propósito quando já conhece
estado mais recente. Nunca derivá-lo apenas do bundle a verificar.

O pipeline executa verificação criptográfica real, status quando fornecido e
aplica a policy. Não aceita `ProofDeclaration` do ficheiro como prova. Como
esta API não valida TEE, ICP-Brasil ou ancoragem externa, requerer qualquer um
desses eixos rejeita. O adaptador JS de ancoragem permanece uma API separada;
o seu sucesso não é importado aqui como uma string confiável.

O melhor resultado é `ACCEPT_WITH_LIMITATIONS`, sempre com perfil, label,
eixos não verificados e `authorization_granted = false`. Rejeição é `REJECT`.
Isso é aceitação do teste criptográfico pela policy, não aprovação de pagamentos,
identidade civil ou verificação global. Sem status e com check obrigatório,
rejeita. Evidência revogada fornecida é rejeitada mesmo se status for opcional.

Novo export WASM:

```javascript
JSON.parse(wasm.verify_passport_json(receiptJson, contextJson, statusJson, policyJson))
```

São quatro entradas: recibo, contexto independente, status (vazio se não fornecido)
e policy. A assinatura de duas entradas do anexo seria insuficiente para
fornecer explicitamente pins, relógio, desafio e estado sem os aprender do recibo.

## CLI e fixtures

Na raiz `D:/arkhe`:

```powershell
node integration/arkhe-kya/scripts/gen_fixtures.mjs
cargo build --manifest-path integration/arkhe-kya/Cargo.toml --locked --bin arkhe-kya
integration/arkhe-kya/target/debug/arkhe-kya.exe verify integration/arkhe-kya/fixtures/generated/receipt.json integration/arkhe-kya/fixtures/generated/context.json integration/arkhe-kya/fixtures/generated/policy-demo.json integration/arkhe-kya/fixtures/generated/status-clear.json
```

O gerador usa Rust para JCS e assinaturas, produz oito ficheiros e recusa
sobrescrever ficheiros existentes. Pode receber outro diretório de saída como
argumento. São seeds públicas de teste, bytes sintéticos de modelo, tempo e
desafio fixos; a fixture não é credencial real ou configuração operacional.
Linux/macOS usam o binário sem `.exe`.

CLI implementada: **verify**. `issue`, `revoke`, `status` operacionais não foram
adicionados como comandos vazios. O export Rust de fixture não é emissão de
credencial legal. Verificação válida retorna exit 0; rejeição/erro, exit 1.
Testou-se clear/demo, clear/require_tee e revoked/demo com ficheiros gerados.

## Problemas da proposta que não foram incorporados

- Descompressão sem teto e conversão de índice sem limites portáveis.
- Omissão do multibase `u` e do framing/limites GZIP já implementados.
- Assinatura própria JCS rotulada `Ed25519Signature2020`, que não implementa
  aquela suite; `did:key` em hex também não é o método usado no código validado.
- `checked_at`, índice e TTL sem vínculo assinado independente suficiente;
  o consumidor mantém a política de idade, separada dos tempos do emissor.
- Promover um certificado/JSON assinado a cadastro ATIVA ou identidade legal
  sem validar emissor, sujeito, agente, mandato e a fonte cadastral pertinente.
- Promover `Observed` a runtime atestado só porque um digest aparece na policy.
  Um pin identifica confiança; não verifica uma quote ou a sua ligação ao modelo.
- Parser SafeTensors que só aceita um JSON qualquer não valida offsets, shapes,
  dtypes, sobreposição ou proveniência do modelo; esse gate não foi alegado.
- Verificador ou UI que aceita os estados do próprio ficheiro. Os badges de
  uma futura UI devem consumir o resultado recalculado, nunca `passport.declaration`.
- Erros JSON montados por interpolação sem escaping e fixtures Node com
  canonicalização diferente do verificador Rust.

## Evidência e pendências

Workspace: **34 execuções de testes Rust**, incluindo cinco repetidas pela
entrada de compatibilidade antiga; **29 casos distintos**. Incluem 5 de policy,
1 da CLI e os gates existentes. Mais **8 casos nativo/WASM** e **13 testes Node
de ancoragem** aprovados. Clippy, rustfmt e build WASM release passaram.
Audit Rust: 77 dependências, zero vulnerabilidades/avisos na base consultada
(1351 advisories; commit `84d943a6deeb8cc6c6f632531aaf4f1c62275239`).
O freeze E02 mantém os 101 ficheiros, sem publicação ou transações novas.

Não foram implementados dashboard KYA, E2E de browser, validação de identidade
real, parser/assinatura SafeTensors, quote TEE, emissão/revogação operacional,
publicação Rekor KYA, arquivo autossuficiente ou release pública. O relatório
não chama a proposta completa de implementada. A arquitetura de contêiner ou
referência por digest continua separada do recibo criptográfico de teste.
