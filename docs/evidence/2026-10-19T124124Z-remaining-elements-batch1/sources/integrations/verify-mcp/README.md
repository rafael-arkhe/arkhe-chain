# Arkhe verification MCP — 0.2

Servidor stdio sobre o WASM local. Ferramentas não concedem autoridade de execução.

## Operações e escopo

| Ferramenta | Resultado | Limite |
| --- | --- | --- |
| `verify_artifact`, kind `blake3` | `DIGEST_COMPUTED`, `digestHex` | Calcula digest; não autentica o conteúdo |
| `verify_artifact`, kind `gguf` | `CANONICALIZED`, `canonicalCborHex` | Metadata JSON; não valida um arquivo de modelo completo |
| `verify_artifact`, kind `c2pa` | `CANONICALIZED`, `canonicalCborHex` | Claim JSON; não verifica assinatura, certificado ou proveniência |
| `verify_mmr` | `PROOF_VALID` / `PROOF_INVALID`, `inclusionVerified` | Inclusão relativa à raiz fornecida pelo chamador; não autentica o checkpoint |

Versão 0.2 remove o campo genérico `valid` de `verify_artifact`. Consumidores devem
ler `status` e `operation`; os campos `verification`, `signatureVerification`,
`provenanceVerification` e `policyAuthorization` são `NOT_PERFORMED`.
Uma assinatura fictícia dentro de um claim estruturalmente aceito pode ser
canonicalizada: isso não é aceitação criptográfica dessa assinatura.

`verify_mmr` recebe `leafHex`, `leafCount` (1..2^32-1), `expectedRootHex` (32 bytes)
e `proof` (até 64 passos `{kind: node|bag, direction: left|right, hashHex}`).
A raiz deve ser obtida/autenticada por um canal independente definido pelo perfil
do consumidor. Uma prova válida contra uma raiz escolhida pelo atacante não
estabelece proveniência, confiança ou permissão. `authority` é sempre `false`.

Dados binários/JSON são limitados a 64 KiB por entrada. Erros de schema ou de
parsing são erros da ferramenta; prova bem formada que não corresponde à raiz
retorna `PROOF_INVALID`.

## Build e testes

Na raiz: `pnpm --filter @arkhe/mcp-server build` e
`pnpm --filter @arkhe/mcp-server test`. Os testes usam o WASM real e vetores
versionados. A disponibilidade dos exports do WASM é pré-condição; reconstrua-o
com `pnpm verify:wasm` quando houver mudança no verificador Rust.
