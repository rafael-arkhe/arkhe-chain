# Resultado da revisão e implementação do envelope

Data de referência: 26/10/2026. Checkout `D:\arkhe`. Não houve deploy,
publicação, contato com revisores ou modificação de autoridade de produção.

## Regressão final

`output/evidence-envelope-validation-final2-20261026/report.json` contém
comandos exatos, hashes antes/depois e logs. Todas as fontes listadas ficaram
iguais durante a execução final.

| Validação | Resultado |
|---|---|
| Python: broker, Ollama, backend estrito, retrieval B, B/C legado, crosscheck e revisão externa | 70 testes passaram |
| Rust: runtime e WormGraph, bibliotecas, integrações e examples | 93 execuções passaram; 4 integrações PostgreSQL ignoradas por ambiente requerido |
| Clippy: runtime alterado, novo teste e novo example, `--no-deps -D warnings` | PASS |
| Rustfmt: três arquivos Rust novos | PASS |
| Smoke CLI Rust real, assinatura + inclusão offline | PASS; rejeitou WER adulterado e signer errado |
| Inferência real GGUF | FAILED por timeout de 180 s; não contar como teste de geração aprovado |
| Admissão com orçamento insuficiente no tokenizer real | PASS; nenhuma reserva/generation worker iniciada |

São 163 execuções de testes aprovadas, não 163 capacidades ou casos científicos
independentes. Examples compartilham alguns testes de suporte. As quatro
integrações ignoradas não foram exercitadas com PostgreSQL nesta entrega.

Clippy com propagação aos crates locais também foi tentado: encontrou avisos
preexistentes em `arkhe-rag::ConstrainedDecoder` (large_enum_variant) e
`arkhe-governance::sign_policy_bundle` (too_many_arguments). O PASS acima é
deliberadamente restrito ao pacote alterado com `--no-deps`, sem suprimir esses
avisos globalmente ou declarar o workspace inteiro aprovado.

## Ensaio real e limites

O runtime CPU `llama-cpp-python==0.3.36` foi instalado somente em
`tmp/evidence-envelope-venv/`; dependências globais e pesos permaneceram iguais.
O GGUF existente foi fixado pelo hash do arquivo, distinto do manifesto Ollama.
O tokenizer retornou 15 tokens, e o broker reservou 31 (15 + limite de saída 16).
Não houve conclusão dentro de 180 s. O subprocesso foi encerrado; uso final
permanece desconhecido, com reserva conservada. Nenhum texto foi aceito como
saída concluída. Artefatos: `output/bounded-gguf-smoke-20261026/`.

O segundo ensaio real usou orçamento de um token: a admissão foi recusada antes
do worker de geração, com zero tokens medidos/reservados. Isso não dispensa
ensaio nominal concluído em ambiente/modelo apropriados.

O smoke criptográfico sela um fixture histórico com chaves descartáveis e
política pública de laboratório. Valida assinatura e MMR no novo momento de
selagem; não autentica o runtime nem o horário da geração original.
O executável recompilado foi reconferido em
`output/evidence-envelope-smoke-final-20261026/result.json`, com PASS e rejeição
de adulteração/signer incorreto; as chaves privadas temporárias foram removidas.

## Pendências que não foram promovidas

- Revisão organizacional externa do LEX-ASCII-1 e adequação semântica da heurística.
- Execução nominal completa do novo backend com modelo real e jornada B completa.
- Custódia/rotação/revogação operacional, checkpoint testemunhado externamente e armazenamento de produção.
- Provas formais gerais, treino atestado, qualificação de contenção e demonstração de AGI.

[Auditoria bibliográfica](../../audits/2026-10-26-research-and-envelope-audit.md),
[roadmap](../../RESEARCH-ROADMAP-2026-10-26.md) e
[contrato/execução](../../EVIDENCE-ENVELOPE.md).
