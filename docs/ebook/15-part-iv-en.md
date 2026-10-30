# Part IV — edição de trabalho em inglês americano

Capítulos completos:

12. Admission Policies and Trust Lifecycles.
13. Conflicts, Equivocation, and Adjudication.
14. Auditable Costs and Unit Economics.

Arquivos: [Markdown](manuscrito/00-part-iv.en.md),
[HTML](dist/arkhe-part-iv-en.html), [EPUB](dist/arkhe-part-iv-en.epub).

Cada capítulo contém exercício, resultado esperado e limites. O ciclo de política
e a adjudicação são propostas de engenharia. O witness específico de checkpoints
é distinguido do detector geral e do slashing ainda não entregues. CostTracker
é identificado como componente do workspace separado e registro de valores
fornecidos, sem alegação de medição autenticada.

## Validação em 22/10/2026

| Execução | Resultado |
|---|---|
| `cargo test --locked -p arkhe-kernel --test budget_pco --test rejection_gates` | 9 + 5 passaram |
| `cargo test --locked -p arkhe-bugbounty --test durable_gates full_prefix_consistency_rejects_rewritten_history_and_bad_lengths -- --exact` | 1 teste puro passou; feature de banco não habilitada |
| `cargo test --locked --manifest-path agi-coder/Cargo.toml -p agi-coder-tests --test cognition_verification` | 6 passaram; inclui o caso existente de overflow |
| Conferência Decimal do lote sintético | 600.000 micro-USD; US$ 0,06 por proposta; US$ 0,075 por resultado aceito |

Total: **21 testes direcionados**, sem falhas ou ignorados nas execuções listadas.
Os demais casos de cognição no alvo de seis testes não são testes de custo; o
capítulo identifica precisamente qual função contém o caso de overflow.

Não foram executados hardware, banco real, atualização distribuída de chaves,
adjudicação em produção, sanção econômica, pagamento, faturamento ou coleta de
custos reais. A conferência aritmética valida o exemplo inventado, não os preços
ou despesas de um serviço. O teste de consistência usa checkpoints de fixture
sem assinatura e não comprova autenticação de um log real.

Logs: [execution-part-iv-en.json](evidence/execution-part-iv-en.json).
Manifest de insumos: [source-manifest-part-iv-en.json](evidence/source-manifest-part-iv-en.json).
Relatório do documento: [build-report-part-iv-en.json](evidence/build-report-part-iv-en.json).
EPUBCheck e Kindle Previewer permanecem pendentes.

```powershell
python docs/ebook/build.py --lang en-US --section part-iv
```
