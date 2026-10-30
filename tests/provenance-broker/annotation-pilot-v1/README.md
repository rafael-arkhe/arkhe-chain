# Pacote público de anotação — piloto v1

A [revisão mecânica v1.1](../annotation-pilot-v1.1/README.md) acrescenta restrições
ao schema em um pacote separado. Este pacote e seu schema foram preservados.

Status: preparado, **não anotado**. São 19 tarefas Claim+fontes, com oito fontes
UTF-8 únicas, extraídas do corpus público já usado no experimento. Repetições de
fontes entre tarefas não constituem exemplos independentes adicionais.

## Material para os revisores

- [Protocolo candidato](../../../docs/architecture/provenance-annotation-protocol-v1.md):
  unidades, critérios, métricas e processo pré-adjudicação.
- [Tarefas](tasks.json): Claims alvo e referências das fontes, sem outcomes
  congelados, predições, scores ou expected_output.
- `sources/*.txt`: bytes originais, sem normalização ou alteração de acentos.
- [Schema de anotações](../../../schemas/provenance-broker/annotation-v1.schema.json).
- [Manifest](manifest.json): integridade local e hashes do baseline preservado.

IDs de tarefa são opacos para não revelar a descrição do cenário pelo nome.
O mapa de curadoria fica em `tests/provenance-broker/annotation-curation-v1.json`,
fora deste pacote, e não deve acompanhar a distribuição para anotação cega.
Como o repositório é público/conhecido, essa separação não impõe controle de acesso:
`blinding_enforced=false`. Exposição a predições e outras anotações deve ser registrada.

As Claims são perguntas/alvos de avaliação, não rótulos de suporte. Sua polaridade
e modalidade são partes do alvo e não instruções para concordar com ele.

## Estado e fluxo

Não há revisores atribuídos, arquivos de anotação, decisões adjudicadas ou métricas
humanas. `independent_review=pending`, `review_status=not_started`, assignments vazio.
Não foi enviada solicitação a terceiros nem marcada revisão como concluída.

O protocolo planeja duas anotações independentes por unidade neste piloto, retendo
as versões pré-discussão. Entidades usam correspondência de spans; relações incluem
pontas/predicado e qualificadores; suporte usa categorias com justificativas. Kappa
é uma opção conforme o desenho, não uma exigência universal. Os detalhes estão no
protocolo. A adjudicação conserva referências aos arquivos originais e não os apaga.

Anotações novas são uma referência versionada separada. Elas não sobrescrevem os
rótulos provisórios do harness nem alteram automaticamente independent_review dos
fixtures ou a confiança de avaliadores do broker.

## Verificar o pacote

```powershell
python scripts/validate_provenance_annotations.py --packet tests/provenance-broker/annotation-pilot-v1
```

Para verificar futuras anotações:

```powershell
python scripts/validate_provenance_annotations.py --annotation caminho/rodada-a.json --annotation caminho/rodada-b.json
```

O [validador](../../../scripts/validate_provenance_annotations.py) verifica schema,
hashes, baseline, bytes UTF-8, IDs, referências, escopo de fontes e coerências mecânicas.
Não determina se o julgamento é semanticamente correto nem prova cegamento,
independência das pessoas ou concordância humana. Zero arquivos anotados é um estado
válido do pacote preparado, não uma revisão realizada.

O [preparador](../../../scripts/prepare_provenance_annotation.py) é ferramenta de
autoria. Não executar para atualizar silenciosamente uma rodada já distribuída;
mudanças de fontes, protocolo ou baseline exigem nova versão do pacote.

## Corpus reservado

Verificação local realizada em 2026-10-29: schema e pacote passaram na validação
mecânica (19 tarefas, oito fontes, zero arquivos anotados). Sete testes com stubs
em memória passaram: referências, Claim alvo, offsets UTF-8, evidência obrigatória,
campos desconhecidos e pré-condições de adjudicação. Não são anotações humanas.

Este pacote **não é reservado**. Curadoria, separação de desenvolvimento e avaliação,
controle de acesso e revisão por terceiros continuam pendentes. Não é possível tornar
o corpus conhecido neste pacote um holdout por renomeação de arquivos.
