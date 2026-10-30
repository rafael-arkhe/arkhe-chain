# Retrieval híbrido de invariantes

26/10/2026 — implementação local opt-in sobre snapshot imutável de textos de invariantes.

## Algoritmos

`cognition/arkhe-rag/src/retrieval.rs` contém:

- `Bm25Index`: índice invertido em memória. Tokenização Unicode alfanumérica em minúsculas, preservando acentos, sem stemming/stopwords. IDs vazios/duplicados são erro; query terms repetidos contam uma vez. Documentos sem correspondência são omitidos.
- BM25: `idf = ln(1 + (N-df+0.5)/(df+0.5))`; contribuição `idf*tf*(k1+1)/(tf+k1*(1-b+b*dl/avgdl))`. `k1 > 0` e `b ∈ [0,1]` finitos, parametrizáveis na biblioteca, defaults 1.2/0.75. Usa IDF com saturação e normalização BM25, não TF-IDF puro. [Referência BM25](https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-a-non-binary-model-1.html).
- `HybridRetriever`: BM25 + ranks densos com RRF `sum(1/(60+rank))`, ranks iniciando em 1, uma contribuição por ID por ranker. Empates: melhor rank, depois ID. Falha de um ranker preserva a ordem do outro na fusão; falha de ambos retorna erro. [Artigo original RRF](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf).
- `Reranker` e `OverlapReranker`: reordenação por quantidade de termos distintos da query presentes no documento; empates preservam ordem RRF. Heurística lexical, não cross-encoder ou verificador semântico. Os scores de `Hit` continuam sendo scores RRF.

## Provider Ask

`apps/arkhe-ask/src/providers/invariant.rs` implementa `InvariantRetriever<S: ChunkStore>`; aceita `PgVectorStore`/`LazyPgVectorStore` como ranker denso. O corpus é separado por tenant. Todo hit denso deve corresponder exatamente ao ID/texto/tenant do snapshot. Divergência é erro, não fallback. Falha/timeout de cinco segundos do denso emite aviso e permite fallback lexical. Não há atualização incremental/CDC.

O modo operacional busca 32 candidatos por ranker, funde e trunca a 32, reranqueia e devolve os quatro pedidos pelo pipeline Ask. Biblioteca aceita limite 1..=1024. Não garante que o relevante entre no conjunto de candidatos.

Limites: JSON de startup até 32 MiB; 10 mil chunks; 1 MiB por texto. Corpus é texto plano com ID, não um `ConstitutionGraph` nem um `OntologyVersion` completo.

## Evidência

`ChunkStore::retrieve_evidenced` tem default compatível com providers antigos e encaminhamento em `Box<dyn ChunkStore>`. O novo provider retorna `ChunkEvidence` com tenant, ID, texto, digest e `InclusionProof` MMR. Documentos são ordenados por ID dentro do tenant. Folha: domínio `AKG:INVARIANT:RETRIEVAL-CHUNK:v1\0` + CBOR canônico de `{tenant_id,id,text}`. O digest usa domínio adicional `AKG:INVARIANT:CHUNK-DIGEST:v1\0`.

Reutiliza `arkhe-verify-core::mmr::{build_root_and_proof,verify_proof_at}`. A prova vincula bytes, posição e quantidade ao root do snapshot local. Não autentica origem/vigência, qualidade do retrieval, autorização ou verdade factual. Cliente precisa obter o root esperado por canal confiável independente. `ChunkEvidence::verify(tenant, expected_root)` exige esses valores; `snapshot_root(tenant)` permite ao host consultar o compromisso carregado.

O pipeline verifica integridade/correspondência antes de gerar e, após verificar citações, retorna somente evidências citadas em `chunk_evidence`. Com provas, o digest usa domínio `AKG:ASK:PROOF:v3\0` e também vincula os bytes canônicos de textos/provas. Providers antigos mantêm v2 e omitem o campo vazio. O compromisso não equivale a assinatura ou ancoragem externa.

## Seleção

Preparar os mesmos registros por tenant na tabela `chunks` do PostgreSQL, com embeddings 1536D compatíveis com o modelo de query, e no arquivo JSON. Formato: `apps/arkhe-ask/invariants.example.json`. Não há importação automática; um snapshot divergente provoca erro quando o denso devolve conteúdo diferente.

```powershell
$env:ARKHE_RETRIEVER = 'hybrid-invariants'
$env:ARKHE_INVARIANT_CORPUS = 'D:\arkhe\apps\arkhe-ask\invariants.example.json'
# Configurar DATABASE_URL, AZURE_OPENAI_* e Keycloak conforme README do Ask.
cargo run --locked -p arkhe-ask
```

Modo híbrido exige banco/embedder/snapshot válidos no startup. Ausência de `ARKHE_RETRIEVER` mantém seleção anterior; modo desconhecido é erro. Não há fallback silencioso de configuração híbrida inválida para corpus de demonstração.

## Testes e limites

Execução e logs: [RESULTS](evidence/2026-10-26-hybrid-retrieval/RESULTS.md).

Implementados na ordem BM25 → fusão → reranker → integração:

- RAG: recall@1 sintético 1.0 em três queries; fórmula/parâmetros; RRF com indisponibilidade, deduplicação e falha total; recuperação lexical e ID desconhecido; MRR 0.5 → 1.0 e melhora NDCG em três pares sintéticos com um relevante por query.
- Ask: pergunta em português → HTTP → híbrido → citações → inclusão verificável; rejeição de alteração de texto/ID/root/posição/quantidade/sibling; isolamento por tenant; snapshot independente da ordem; fallback; divergência; prova inválida bloqueia geração.
- Teste adicional `pgvector_hybrid_question_returns_verified_snapshot_evidence`: pgvector real em schema temporário, embeddings determinísticos 1536D que deliberadamente fazem o denso errar, e `EchoProvider`. Não é geração Azure nem avaliação de embeddings aprendidos.

```powershell
cargo test --locked --offline -p arkhe-rag -p arkhe-ask
# Com DATABASE_URL configurado para pgvector de desenvolvimento:
cargo test --locked --offline -p arkhe-ask --test hybrid_retrieval pgvector_hybrid_question_returns_verified_snapshot_evidence -- --ignored
```

Métricas sintéticas não estimam melhora geral sobre vetorial. Faltam julgamentos independentes em corpus real, atualização de snapshot e medição de escala. Grafo deôntico e cadeia WASM permanecem pendentes.
