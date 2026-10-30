# Resultados — retrieval híbrido, 26/10/2026

Implementação no workspace `D:\arkhe`, sem commit identificável na raiz (não é checkout Git).

| Verificação | Resultado | Evidência |
|---|---|---|
| `cargo test --locked --offline -p arkhe-rag -p arkhe-ask` | 50 passaram, 16 ignorados, zero falhas | [tests.log](tests.log) |
| Teste híbrido com pgvector real, habilitado separadamente com `--ignored` | 1 passou; quatro outros casos filtrados | [pgvector.log](pgvector.log) |
| Clippy dos dois pacotes e todos os targets, com três categorias preexistentes explicitamente permitidas | Passou | [clippy-scoped.log](clippy-scoped.log) |
| `cargo fmt -p arkhe-rag -p arkhe-ask --check` | Passou, sem saída | [fmt.log](fmt.log) |

Contagem sem duplicação: 51 testes distintos executados com sucesso. O teste pgvector aparece como ignorado na suíte padrão e foi executado na segunda linha. Os outros 15 ignorados da suíte padrão não foram habilitados. As execuções intermediárias não são somadas a esse total.

O Clippy estrito `-D warnings` não passou: `large_enum_variant` em `cognition/arkhe-rag/src/decoder.rs`; a checagem prosseguida encontrou `too_many_arguments` em `governance/arkhe-governance/src/policy_bundle.rs` e `unnecessary_map_or` em `evidence/arkhe-wormgraph/src/roster.rs`. Esses arquivos não foram modificados. Um `unnecessary_sort_by` no novo reranker foi corrigido. Comando de escopo executado:

```text
cargo clippy --locked --offline -p arkhe-rag -p arkhe-ask --all-targets -- -D warnings -A clippy::large_enum_variant -A clippy::too_many_arguments -A clippy::unnecessary_map_or
```

O teste pgvector utilizou imagem local `docker.io/pgvector/pgvector:pg16`, container descartável `arkhe-hybrid-test-20261026`, porta loopback 55439 e schema temporário criado/removido pelo harness. A máquina Podman `arkhe-runtime` estava parada e foi iniciada para esse teste. Embeddings foram gerados por uma fixture 1536D, deliberadamente com ranking denso incorreto; geração por `EchoProvider`. Não foram usados Azure, inferência aprendida ou serviços de produção.

Limpeza concluída: container removido, nenhum outro container ativo na conexão e máquina `arkhe-runtime` novamente parada. Os hashes SHA-256 das fontes e logs finais estão em [source-manifest.json](source-manifest.json).

Métricas sintéticas: recall@1 = 1.0 em três queries; MRR = 0.5 antes e 1.0 depois do reranking em três pares; NDCG melhorou nesses pares. Essas fixtures são evidência de comportamento controlado dos algoritmos, não avaliação independente de relevância em corpus real.

O HTTP e2e com fronteiras simuladas verifica citações e inclusão; o caso pgvector verifica o mesmo pipeline com persistência e busca vetorial reais. Adulterações de conteúdo, tenant, ID, root, siblings e posição/quantidade são rejeitadas. Nenhum desses resultados autentica o root do corpus externo ou demonstra AGI.
