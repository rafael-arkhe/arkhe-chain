# Cópias usadas para compilar

Estes quatro diretórios são cópias de `arkhe-core`, `arkhe-verify-core`, `arkhe-governance` e `arkhe-kernel` para que `cargo test -p arkhe-chain` rode nesta raiz, sem o monorepo.

Não são uma segunda implementação da cadeia. O teste do pacote `arkhe-kernel` não entra neste gate: a dependência de desenvolvimento que apontava para `arkhe-agent` foi omitida desta cópia.
