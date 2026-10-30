# Harness experimental: extração, suporte, comparação e integração

Execução local: 2026-10-29. Revisão independente: pending. Corpus público,
conhecido pelo autor. Nenhum fixture anterior, rótulo ou política foi promovido.

## Artefatos

- [Configuração](config.json) e [dependências utilizadas](requirements.txt).
- [Harness](../../../scripts/provenance_extraction_harness.py).
- [Relatório executado](runs/gliner2.5-multi-rule-pt-v1/report.json) e
  [manifest de integridade local](runs/gliner2.5-multi-rule-pt-v1/manifest.json).
- Diretórios `extraction/`, `support/` e `integration/` no run: resultados completos,
  raw scores, julgamentos, referências de artefatos e payloads de simulação.
- [Auditor dos resultados](../../../scripts/validate_provenance_extraction_run.py)
  e [nove testes de fronteiras entre estágios](test_harness.py).

## Estágios e responsabilidades

### 1. Extração real

Foi executado `fastino/gliner2.5-multi-v1`, revisão
`cf5593a5d45e3bbf204b9df621b13b1c0cf25ee3`, usando gliner2 2.1.0, PyTorch CPU
2.11.0 e transformers 5.2.0. As chamadas usam AutoExtractor e o checkpoint boundary,
conforme o [model card primário](https://huggingface.co/fastino/gliner2.5-multi-v1).

São 19 fixtures (baseline P-02 e 18 da extensão v2), com oito fontes únicas em
português. Textos repetidos são extraídos uma única vez. Os dois fixtures de limite
de bytes foram excluídos desta experiência de extração; isso está registrado no
relatório. Não foram alterados ou truncados para caber no modelo.

Extraem-se entidades e relações sugeridas, com classificação documental de
polaridade e modalidade. Os qualificadores são do documento, sem atribuição
automática a cada relação. O harness verifica cada span retornado contra o texto e
converte offsets de caracteres para bytes UTF-8. Antes da inferência, verifica o
limite usando o próprio word splitter da implementação fixada. Scores não são
tratados como probabilidades calibradas nem como SemanticOutcome.

O snapshot local foi baixado pela revisão exata e suas metadatas de cache são
verificadas. Hashes SHA-256 de configuração, tokenizer, encoder config e pesos estão
no relatório. Pesos e ambiente virtual ficam em `ops/local`, fora dos artefatos
de resultado. A execução habilitou flags offline/telemetria do Hugging Face, mas
**não houve teste de isolamento com firewall ou captura de rede**.

### 2. Avaliação de suporte por regra

O avaliador identificado `arkhe-support-rule-pt@1`, método Rule, é separado do
modelo. Ele lê a Claim e os trechos originais, vincula as referências dos artefatos
de extração e abstém-se se houver span inválido. Usa uma gramática literal restrita
à migração de Atlas para PostgreSQL 16, com polaridade, possibilidade e correção
explicitamente vinculada a um relato anterior. Não usa o outcome congelado para
decidir; não converte classificações nem scores do extrator em suporte.

Predicados não suportados geram NotEvaluated. Relatos conflitantes sem correção
explicitamente vinculada geram Indeterminate. Esta regra é um baseline de autoria
para o corpus conhecido, não um avaliador geral de entailment ou verdade.

### 3. Comparação experimental

Resultados observados, contra referências **provisórias**:

| Medida | Resultado | Alcance |
|---|---|---|
| Entidades com tipo e span exatos | TP=14, FP=1, FN=0; F1=0,9655 | Oito fontes; referência literal de autoria, sem revisão independente |
| Polaridade documental | 8/8 coincidências | Labels deste experimento, não polaridade por relação |
| Modalidade documental | 1/8 coincidências | Não há evidência de adequação desta configuração para modalidade |
| Avaliador de suporte Rule | 18/19 coincidências (94,74%) | Julgamento da regra, não do GLiNER; fixtures compartilham fontes |

A divergência do avaliador é `V2-ENDPOINTS-NO-RELATION`: rótulo provisório
Indeterminate, regra NotEvaluated por predicado não suportado. Ela foi preservada.
Predicados extraídos são retidos, mas sua qualidade não é pontuada sem anotações de
relações. A métrica de entidades não demonstra extração correta de relações.

Essas medidas não são acurácia independente, generalização ou qualificação para
produção. Não foram ajustados labels ou parâmetros para ocultar as divergências.
Os artefatos retêm também todos os desacordos documentais de modalidade.

### 4. Integração e simulação de política

Primeiro o host verifica o controle com as observações previamente aceitas do
fixture. Depois é apresentado o novo avaliador Rule com identidade experimental,
sem assinatura da autoridade de laboratório. As 19 tentativas são bloqueadas por
avaliador não confiável. A regra não foi relabelada como Human, não recebeu a
identidade fixture-reviewer e não foi assinada com a chave do fixture.

O relatório também executa uma **simulação da função pura** com esse novo resultado
para diagnosticar a política: 15/19 decisões e 12/19 payloads coincidem com os
oráculos anteriores. Desacordos são esperados porque a política continua exigindo
o avaliador humano retido para Assertion, e os payloads de análise identificam o
avaliador diferente. Essa simulação não autentica observações nem autoriza entrega.

Portanto, o estágio autenticado experimental permanece **bloqueado**, com payload
vazio. Não existe integração positiva end-to-end do novo avaliador com o broker.
Aceitá-lo exigirá um perfil de confiança e política experimental revisados e
versionados; esta execução não os cria implicitamente. A saída extraída não foi
admitida como nova evidência no WormGraph.

## Reproduzir

O ambiente criado foi `ops/local/provenance-harness-venv`, com acesso aos pacotes
Python existentes via `--system-site-packages`; as versões utilizadas estão fixadas
em requirements.txt. Modelos locais não são copiados para os fixtures.

Pré-carga do checkpoint, quando ainda não disponível:

```powershell
ops/local/provenance-harness-venv/Scripts/python.exe -c "from huggingface_hub import snapshot_download; snapshot_download('fastino/gliner2.5-multi-v1', revision='cf5593a5d45e3bbf204b9df621b13b1c0cf25ee3', allow_patterns=['config.json','encoder_config/*','*.safetensors','tokenizer*.json','README.md'], local_dir='ops/local/provenance-harness-models/gliner2.5-multi-v1')"
```

Execução e auditoria, sem regenerar qualquer oráculo do broker:

```powershell
ops/local/provenance-harness-venv/Scripts/python.exe -u scripts/provenance_extraction_harness.py
python scripts/validate_provenance_extraction_run.py
python -m unittest discover -s tests/provenance-broker/extraction-harness -p test_harness.py -v
```

O auditor verifica artefatos de extração reais, bindings de spans, referências,
métricas, avaliações, bloqueio de ingestão e hashes dos materiais v1/v2 preservados.
Os nove testes adicionais usam stubs para testar separação entre estágios; não são
substitutos da execução real do modelo. Esta experiência não usa API de inferência
nem serviço de avaliação hospedado.

## Pendências preservadas

O [protocolo de anotação candidato](../../../docs/architecture/provenance-annotation-protocol-v1.md)
e o [pacote público de tarefas](../annotation-pilot-v1/README.md) foram preparados
para o próximo passo, sem predições e sem os outcomes congelados. Não há revisores
atribuídos ou anotações concluídas; o baseline deste experimento permanece congelado.

Revisão independente, corpus reservado, cobertura completa dos limites, integração
autenticada do novo avaliador, classificador de suporte geral, qualificadores por
relação, política de promoção, federação real, pin monotônico persistente,
indexação assíncrona real, Cognee e medição de ganho de recuperação.
