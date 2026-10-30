# Calibração histórica — perfil candidato v1

`cognition/arkhe-metacognition/src/self_model.rs` calcula estatísticas descritivas
de previsões binárias resolvidas. Não estima automaticamente a confiança de uma
previsão nova e não demonstra RSI, generalização ou um modelo causal do sistema.

## Contrato de evidência

O host autentica assinaturas, integridade, admissão, escopo da coorte e ordem
histórica antes de construir `EvidenceReader`. O leitor é passivo. Timestamps
declarados e hashes não provam, sozinhos, que a previsão antecedeu o resultado.
O host também controla a seleção da amostra: esta função não detecta omissões
seletivas, viés de seleção ou vazamento de dados na produção das previsões.

Cada previsão usa kind `arkhe/calibration-prediction/v1`, subject igual ao digest
da coorte e payload calculado por `prediction_payload_digest`. Cada resultado
usa kind `arkhe/calibration-outcome/v1`, subject e pai causal iguais à referência
da previsão, e payload de `outcome_payload_digest`. Os policy digests do par
devem coincidir. O host define a coorte por módulo, versão, população e política.

Referências vazias, duplicadas, ausentes ou incompatíveis com os payloads são
rejeitadas. O resultado precisa ter timestamp estritamente posterior à previsão.
O limite por chamada é 100.000 pares. A ordenação por identidade torna os digests
independentes da ordem de entrada.

## Métricas e representação

- Probabilidades: inteiros de 0 a 10.000 pontos-base.
- Brier: média do erro quadrático, em partes por milhão, de 0 a 1.000.000.
- ECE: erro absoluto agregado em dez faixas, em pontos-base, de 0 a 10.000.
- Faixas: 0–999, 1000–1999, até 9000–10000; faixas vazias não têm médias.
- Divisões inteiras truncam para baixo. Histórico vazio não produz métricas.
- Abaixo do mínimo informado, o status é `InsufficientHistory`; o mínimo não é
  um teste de significância ou garantia de calibração estatística.

Os digests usam o contrato `CanonicalEncode` existente e separação de domínio.
O resultado observado é representado como inteiro CBOR 0/1 na projeção canônica,
sem alterar o encoder do núcleo. `input_digest`/`output_digest` representam
coorte/histórico na projeção do relatório. O WorkerExecutionRecord vincula
histórico, relatório e referências; não concede autoridade e mantém confiança
ausente. Sua admissão continua dependendo do ContainmentGate.

## Migração e validação

`SelfAssessment.confidence_bps` e `evidence_coverage_bps` agora são `Option<u16>`.
Consumidores devem tratar `None` como desconhecido, sem substituí-lo por zero
ou um escore presumido. `assess` não transforma presença de referências em
confiança ou cobertura. A calibração é uma API separada, ainda sem ingestão
histórica persistente integrada ao host ou ao Intra.

```powershell
cargo test -p arkhe-metacognition --locked --offline
cargo fmt -p arkhe-metacognition -- --check
python scripts/cognition_conformance.py
python scripts/check_architecture.py
```

Os testes usam snapshots sintéticos para validar cálculo e bindings; não são
evidência de desempenho de um agente em tarefas reais.
