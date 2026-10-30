# Part III — edição de trabalho em inglês americano

Capítulos completos:

8. Integrating the ContainmentGate.
9. Operation Identity and External Effects.
10. Building an Evidence Adapter.
11. Verification on the Client.

Arquivos: [Markdown](manuscrito/00-part-iii.en.md),
[HTML](dist/arkhe-part-iii-en.html), [EPUB](dist/arkhe-part-iii-en.epub).

Os quatro capítulos incluem exercícios, resultados esperados e limites.
O cenário de publicação é fictício; interfaces implementadas são identificadas
pelos arquivos do repositório. Não há afirmação de integração única e completa
entre todos os componentes. Os nomes de terceiros são mantidos em referências
e identificadores técnicos necessários à reprodução.

## Validação realizada em 22/10/2026

| Comando | Resultado |
|---|---|
| `cargo test --locked -p arkhe-kernel --features sqlite-broker --test rejection_gates --test budget_pco --test action_broker --test broker_durable` | 19 passaram: gate 5, certificado 9, broker 3, journal durável 2 |
| `pnpm verify:wasm` | Exit 0; módulo e bindings gerados |
| `pnpm --filter @arkhe/mcp-server build` | Exit 0; TypeScript compilado |
| `pnpm --filter @arkhe/mcp-server test` | 12 passaram; nenhum ignorado |

Total: **31 testes direcionados**, sem falhas ou ignorados nessas suítes.
A compilação WASM emitiu avisos sobre metadados opcionais e ausência de arquivo
LICENSE no diretório do crate; o build concluiu, sem resolver a revisão de direitos
necessária à distribuição final.

O teste do adapter usou WASM real no runtime JavaScript local e interação stdio
onde coberta pela suíte. Não foi uma validação no navegador. Também não foram
executados banco real, CI remoto, efeito externo, pagamento, publicação ou
qualificação de isolamento do host.

Saídas das execuções e resultados:
[execution-part-iii-en.json](evidence/execution-part-iii-en.json).
O trecho de log WASM preservado nesse arquivo corresponde à conclusão da sessão;
o campo de escopo o identifica, sem afirmar captura integral do comando.

Manifest de insumos editoriais:
[source-manifest-part-iii-en.json](evidence/source-manifest-part-iii-en.json).
Verificação básica do EPUB:
[build-report-part-iii-en.json](evidence/build-report-part-iii-en.json).
EPUBCheck e Kindle Previewer continuam pendentes.

## Reprodução do documento

```powershell
python docs/ebook/build.py --lang en-US --section part-iii
```
