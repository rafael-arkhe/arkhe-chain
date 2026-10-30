# Registro de reprodução

Data local: 22/10/2026. Ambiente: Windows/PowerShell, checkout `D:/arkhe`.
Toolchain declarada pelo projeto: Rust 1.96.0. Esta revisão não recebeu um commit
Git de release; o manifest de arquivos preserva hashes dos insumos editoriais.

## Execuções realizadas

```powershell
cargo run --locked -p arkhe-kernel --example budget_pco
```

Exit code 0. Resultado:

```json
{
  "authorization_ref": "cc77556f3cf18ad7a21d77522565f281d9e3ed27600201b099fd7968f747553b",
  "external_action_executed": false,
  "mode": "offline-budget-pco-demo",
  "proof": "e59a0e8dce0afd848ef6165e6818a2eaee0c4987cc07aa2b512edeac2adb2258",
  "total": 100
}
```

```powershell
cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates
```

Exit code 0. PCO: 9 passaram, 0 falharam, 0 ignorados. Rejection gates:
5 passaram, 0 falharam, 0 ignorados. Total: 14 testes direcionados.

PCO exercitou domínio finito, troca da especificação durante lookup, tentativa
de bypass das entradas do gate, aritmética falsa/overflow, teto excedido,
revisão humana, roundtrip/admissão, ausência/proveniência de prova, transferência
entre pedidos, certificados maliciosos, negação de política e parada.

## O que não foi executado

Não houve requalificação do workspace inteiro, CI remoto, PostgreSQL real,
WASM no navegador, rede DePIN, GPU/TEE, compra, pagamento, merge, deployment ou
upload KDP. Documentos de status do repositório registram execuções anteriores
com escopos próprios. Elas não foram apresentadas como reprodução desta revisão.

## Artefatos editoriais

`build.py` gera HTML autônomo e EPUB 3 da amostra por Pandoc. Confere existência
dos caminhos de implementação usados na amostra, estrutura ZIP/XML básica do
EPUB, destinos internos do spine e presença dos artefatos esperados. Preserva
hashes SHA-256 dos insumos técnicos em `evidence/source-manifest.json` e resultado
do build em `evidence/build-report.json`.

Essas verificações estruturais não substituem EPUBCheck nem Kindle Previewer.
A aprovação visual final e o teste nos leitores/dispositivos permanecem na
checklist de publicação. O HTML usa fontes locais de sistema e não depende de
assets externos. O EPUB não contém capa comercial ou autor inventado.
