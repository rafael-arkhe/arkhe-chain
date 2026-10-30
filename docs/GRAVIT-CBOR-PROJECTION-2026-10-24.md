# Projeção binária Gravit: contrato de teste v2

A projeção passou a codificar `request_bytes` e `decision_bytes` como **byte strings CBOR, major type 2**, contendo exatamente os bytes capturados. Os critérios de admissão, o digest SHA3-256 recomputado do artefato e a autorização pelo ContainmentGate permanecem os mesmos do recorte anterior. O adaptador de produção continua ausente.

## Representação e versionamento

Foi acrescentada `arkhe_core::canonical::encode_map_with_bytes(fields, bytes)`: monta um mapa com campos JSON existentes e campos binários explicitamente tipados. Usa comprimentos definidos e mínimos, ordena chaves pelos bytes codificados e recusa chaves duplicadas, inclusive colisões entre os dois grupos de campos. Não há inferência de bytes pelo nome de novos campos nem conversão global de arrays JSON. `encode_value` e os encodings anteriores de WorkIntent/WER não foram alterados.

O contrato de teste usa agora:

- domínio BLAKE3-256 `AKG:GRAVIT:EXTERNAL:v2\0`, com NUL final;
- perfil `digest-binding-test-only-v2` e module_version `contract-test-v2`;
- os mesmos metadados de vínculo da projeção anterior;
- request e decisão como byte strings, preservando inclusive floats e espaços dos bytes capturados.

A representação mudou, portanto os compromissos, execution_id e WER derivados também mudam. O domínio e o perfil foram versionados para impedir uma alteração silenciosa do significado de v1. Não há migração ou reinterpretacão de compromissos v1 como v2. O relatório e as evidências anteriores descrevem historicamente o teste v1; o código atual é v2.

Exemplo literal de CBOR esperado pelo teste do encoder:

```text
{"a": h'001718ff', "z": [0, 255]}
a2 61 61 44 00 17 18 ff 61 7a 82 00 18 ff
         ^^ byte string         ^^ array comum
```

O teste de integração também exige os bytes literais de `request_bytes = h'00ff'` e `decision_bytes = h'302e383830303030'` (texto capturado `0.880000`). Ele verifica a projeção efetivamente usada no compromisso, sem analisar ou reformatar o float.

## Validação

`cargo test -p arkhe-core -p arkhe-kernel`: **39 testes aprovados, 0 falhas**, na configuração padrão: 7 no core e 32 no kernel. Há 3 novos testes do encoder e 1 novo teste da projeção, além dos 7 testes anteriores de tradução. Os 4 testes existentes de golden vectors do core continuam aprovados, incluindo vetores Python independentes de WorkIntent/WER. A feature sqlite-broker não foi habilitada.

Os testes novos cobrem bytes esperados literais, distinção de array comum e byte string, ordem determinística do mapa, rejeição de duplicatas e cabeçalhos nos limites 0/23/24/255/256/65535/65536. As rejeições anteriores por hash inválido, substituição de conteúdo, parâmetros alterados e falta de admissão permanecem aprovadas.

Logs e hashes: `docs/evidence/2026-10-24-gravit-cbor/`. O primeiro log precede a inclusão do teste literal da projeção; `tests-final.log` é a execução final.

## Correções e limites

A adoção de byte strings alinha esta projeção à representação binária determinística usada no Arkhe; não torna o objeto Gravit intercambiável com os esquemas E02 ou KYA. Cada um mantém domínio, schema e contrato de confiança próprios.

Arrays CBOR de bytes 0–255 usam 1 ou 2 bytes por elemento, além do cabeçalho; a expansão fixa de 5× citada no comentário recebido não se aplica a essa codificação CBOR. Byte strings usam um byte por elemento, além do cabeçalho.

O Gravit v0.6.0 assina registros de evidência e o registro de verificadores; não há assinatura Ed25519 do DecisionRecord validada neste recorte. A validação de assinaturas, raízes, quórum, relógio, freshness e persistência permanece pendente. O controle positivo de digest continua sintético, com assinaturas invalidadas pela alteração dos hashes. Esta mudança resolve somente a representação binária solicitada.
