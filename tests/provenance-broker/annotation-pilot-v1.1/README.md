# Pacote de anotação v1.1 — preparado, não anotado

Esta revisão mantém as mesmas 19 tarefas e oito fontes públicas do v1, sem
predições, scores, outcomes congelados, revisores atribuídos ou anotações humanas.
O pacote e o schema v1 foram preservados; não há revisão independente concluída.

- [Protocolo-base v1](../../../docs/architecture/provenance-annotation-protocol-v1.md).
- [Revisão mecânica v1.1](../../../docs/architecture/provenance-annotation-protocol-v1.1.md).
- [Schema v1.1](../../../schemas/provenance-broker/annotation-v1.1.schema.json).
- [Tarefas](tasks.json), `sources/*.txt` e [manifest](manifest.json).

## Alterações

O schema agora exige evidence_span_refs não vazio para Supported, Partial e
Contradicted. Indeterminate pode refletir ausência de evidência e não recebe essa
exigência; NotEvaluated continua exigindo abstention_reason. Justificativa já era
obrigatória no v1; na v1.1, texto apenas com espaços também é rejeitado.

Unmarked e Underspecified não podem ser combinados com outros labels de modalidade,
inclusive entre si. O validador já verificava a exclusividade e a presença de
evidência; a revisão antecipa essas duas falhas também para o schema.

claim_digest continua sendo verificado contra a Claim da tarefa pelo validador.
JSON Schema verifica sua forma, sem recalcular hashes. Referências, fontes, bytes,
fronteiras UTF-8 e ancestralidade de adjudicação também dependem do validador.
Premissas/regras de derivation_note continuam em texto livre; não há certificado
estruturado de inferência nem execução de regras a partir dessa nota.

## Executar

Verificação executada: pacote v1.1 validado (19 tarefas, oito fontes, zero anotações),
seis novos testes de schema/validador passaram e o pacote v1 preservado também
passou na validação usando sua própria revisão de schema e protocolo.

```powershell
python scripts/validate_provenance_annotations.py
python scripts/validate_provenance_annotations.py --packet tests/provenance-broker/annotation-pilot-v1
python -m unittest discover -s tests/provenance-broker/annotation-pilot-v1.1 -p test_schema_revision.py -v
```

O validador escolhe o schema e o protocolo pela revisão retida no manifest. Não
atualiza silenciosamente o pacote antigo. Para futuras anotações, passar arquivos
por --annotation; a validação é mecânica, não revisão do conteúdo.

Os testes usam stubs em memória e não criam anotações. Calibração humana,
concordância pré-adjudicação, adjudicação, revisores e corpus reservado continuam
pendentes. O pacote é público, conhecido pelo autor e com blinding_enforced=false.

O mapa de curadoria `tests/provenance-broker/annotation-curation-v1.1.json` fica fora
do pacote distribuível e não deve acompanhar anotação cega. Isso não é controle
de acesso ao repositório e não torna o corpus reservado.
