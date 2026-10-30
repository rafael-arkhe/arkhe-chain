# Part II — edição de trabalho em inglês americano

Inclui os capítulos 4–7 completos:

4. Mapping the Arkhe Environment.
5. Identities That Survive Transport.
6. WormGraph and Verifiable Inclusion.
7. From Output to Authorization.

Arquivos: [Markdown](manuscrito/00-part-ii.en.md),
[HTML](dist/arkhe-part-ii-en.html), [EPUB](dist/arkhe-part-ii-en.epub).

O capítulo 7 integra a amostra existente, com exercício adicional de decisão.
Blocos executáveis e saída registrada foram preservados. Os capítulos 4–6 foram
redigidos a partir dos contratos inspecionados no checkout atual. Nomes de
terceiros permanecem nas atribuições e identificadores técnicos necessários.

## Reprodução em 22/10/2026

| Comando | Resultado observado |
|---|---|
| `cargo test --locked -p arkhe-core --test golden_vectors` | 4 testes passaram |
| `cargo test --locked -p arkhe-verify-core --test mmr` | 2 testes passaram |
| `cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates` | 9 + 5 testes passaram |
| `cargo run --locked -p arkhe-kernel --example budget_pco` | Exit 0; total 100; external_action_executed false |

Total: 20 testes direcionados, sem falha ou ignorado nessas suítes. Não foi
executado o workspace inteiro, banco real, CI remoto, WASM no navegador ou efeito
externo. A saída do exemplo mantém os digests registrados na amostra.

O manifest editorial inclui os arquivos de arquitetura, identidade, store e MMR
utilizados, além das fontes do laboratório. Não é atestação integral do build.
Relatório estrutural: [build-report-part-ii-en.json](evidence/build-report-part-ii-en.json).
EPUBCheck e Kindle Previewer permanecem pendentes.

```powershell
python docs/ebook/build.py --lang en-US --section part-ii
```
