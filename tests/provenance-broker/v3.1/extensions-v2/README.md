# Extensão material v2 — lacunas do mapa de cobertura

Data: 2026-10-29. Status: candidata, revisão independente pendente.
Esta extensão adiciona 20 fixtures; não substitui nem reescreve os 28 fixtures v1.

## Artefatos e execução

- [Perfil v2](../../../../schemas/provenance-broker/profile-v2.json) e
  [schema v2](../../../../schemas/provenance-broker/fixture-v2.schema.json).
- `fixtures/*.json`: oráculos de autoria explícita, bytes, provas, observações
  assinadas, snapshots e payloads completos. Os motores não geram expected_output.
- [Manifest](manifest.json): hashes dos materiais v2 e hash do manifest v1 preservado.
- [Relatório](conformance-report.json): comparação integral Python/Node/host local.

```powershell
python scripts/validate_provenance_broker_v2.py --report tests/provenance-broker/v3.1/extensions-v2/conformance-report.json
python -m unittest discover -s tests/provenance-broker/v3.1 -p test_extension_v2.py -v
```

O [gerador](../../../../scripts/materialize_provenance_broker_v2.py) é ferramenta de
autoria, separada da validação e dos motores. Verifica hashes v1 antes de materializar.
Não deve ser executado durante a conformidade para regenerar saídas esperadas.

## Mapeamento dos cenários

| Lacuna | Instância material |
|---|---|
| P-05 dois seguros | V2-P05-TWO-SAFE: chunk-1 e chunk-2 liberados; Claim e semantic ausentes |
| Negação literal | V2-NEGATION-POSITIVE-CLAIM rejeita Claim positiva; V2-NEGATION-NEGATIVE-CLAIM permite Claim negativa |
| Hipótese literal | V2-HYPOTHESIS-ASSERTED rejeita afirmação factual; V2-HYPOTHESIS-POSSIBLE retém modalidade Possible |
| Correção explícita | V2-CORRECTION-OLD-CLAIM rejeita relato corrigido; V2-CORRECTION-ANALYSIS libera ambos para análise |
| Pontas sem relação | V2-ENDPOINTS-NO-RELATION: pessoa e organização em trechos sem emprego expresso; avaliação Indeterminate |
| Agregação | Sete casos V2-AGG-* cobrem fonte negada/desconhecida, agregado negado, política negada e permissões explícitas entre tenants/escopos |
| Rollback | V2-ROLLBACK-VALID-OLD-PROOF: prova válida de raiz antiga com uma folha, observações frescas, mínimo do host de duas folhas |
| Projeção atrasada | V2-PROJECTION-REVOKED e V2-PROJECTION-STILL-CURRENT confrontam índice atrasado com estado autorizado retido |
| Fronteiras materiais | V2-LIMIT-CHUNK-AND-PAYLOAD-EXACT permite 32768 bytes por trecho / 65536 no payload; V2-LIMIT-CHUNK-OVER rejeita 32769 bytes |

Todas as avaliações linguísticas são observações assinadas retidas de teste. Estes
fixtures não executam GLiNER nem demonstram correção de um classificador semântico.
Bindings mecânicos permanecem completos nos cenários de negação, hipótese e correção;
o julgamento semântico é a dimensão que muda. Datas distintas não implicam contradição;
o texto de correção declara explicitamente o erro do relato anterior.

## Extensão de autorização

O contexto do host pode conter `aggregation { aggregate_id, constituent_refs }`.
Isso não é um campo livre aceito do chamador em CandidateInput. A observação
assinada da autoridade de laboratório contém:

- `source_authorizations`: chunk_id, tenant, scope e Permitted/Denied/Unknown.
- `aggregate_authorizations`: aggregate_id, principal, constituent_refs e verdict.

Identidades e escopos são comparados com os registros verificados. Referências
de constituintes precisam corresponder exatamente ao conjunto necessário. Exige-se
permissão de cada fonte e do agregado. Cross-tenant também exige
`cross_tenant_aggregation_permitted=true`; o padrão é false. Nenhum grant de agregado
compensa acesso negado a uma fonte. A autoridade sintética está configurada para os
tenants de teste; não há inferência de autoridade federada em produção.

## Extensão de frescura e projeção

Âncoras do host incluem `stream_id` e `minimum_leaf_count`. O mínimo é uma observação
confiável do host, nunca um campo de CandidateInput. Para consulta atual, número
de folhas inferior ao mínimo produz Stale mesmo que a prova e o timestamp sejam
válidos. O teste confirma que relaxar o mínimo faz a mesma prova antiga passar:
a rejeição decorre de frescura monotônica, não de adulteração.

As provas desta extensão têm uma ou duas folhas sob o perfil MMR congelado; não
se altera o algoritmo MMR. Um provedor real teria de manter e autenticar o mínimo
por stream, preservar seu estado entre reinicializações e tratar forks. Nada disso
é demonstrado pelo pin sintético. Consulta histórica mantém as regras da v3.1.

`projection` registra observação do índice, não autoridade de estado. Índice atrasado
não pode promover Revoked a Current; tampouco invalida automaticamente um estado
que a fonte autorizada ainda confirma como atual. Estes são cenários congelados,
sem um indexador assíncrono ou banco vivo.

## Coerência de validação e limites

O fixture over-limit contém uma violação intencional do schema em
`chunks/0/bytes_hex`, declarada em `expected_schema_error_paths`. O auditor exige
essa falha específica, depois compara a decisão RequestInvalid. Não é um fixture
de entrada válida nem uma exceção que permita bytes acima do limite.

O contrato de pedido do host testa só CandidateInput; os materiais que o host recebe
são contexto de teste injetado. A verificação de fontes detecta o limite excedido e
a função de decisão rejeita antes de liberar conteúdo. O perfil continua sem alegar
cobertura de todos os valores de u64, limites de trechos, premissas ou profundidade.

## Estado da evidência

Todos os 20 oráculos passaram na comparação integral com os dois motores e o host
local. Dez testes específicos cobrem autorização assinada alterada, substituição de
constituintes, tenant incompatível, fontes/escopos distintos, rollback, projeção e
fronteiras. Os materiais v1 preservam seus hashes; sua conformidade é reexecutada
separadamente após mudanças nos motores.

Os motores e fixtures têm o mesmo autor. `independent_review` permanece pending.
Não existe P-07 reservado neste diretório: todos os casos são públicos. Revisão
por terceiro e corpus efetivamente reservado exigem processo separado. Permanecem
pendentes serviços reais, cobertura completa de limites, GLiNER/Cognee e ganho de
recuperação. Não há alegação de correção universal ou liberação em produção.
