# Diagnósticos locais de holdout — v1

Executado em 2026-10-27. Código: `local_holdout_diagnostics.py`. Artefatos: `arc3-holdout-diagnostics-20261027/`. Suíte completa: 173 testes PASS.

## Resultado

| Controle | Observação |
|---|---|
| Leitura DEV pelo wrapper | Negada e registrada |
| Leitura EVAL pelo wrapper | Permitida e registrada |
| Marcador copiado literalmente | Detectado |
| Leitura direta e cópia dos labels sem marcador | Não registrada pelo wrapper; scanner sem detecção |
| Dois batches completos | Consistência interna verificada |
| Primeiro batch removido | Rejeitado |
| Último batch removido, sem referência final | Consistência interna aceita |
| Último batch removido, com hash final original | Rejeitado |

Esses resultados são LEMMA de execução local. O contraexemplo usa fixtures sintéticas conhecidas, não dados confidenciais reais. A ausência de marcador não estabelece ausência de vazamento. O scanner procura bytes literais nos artefatos fornecidos; não inspeciona pesos nem infere contaminação de treinamento. O wrapper observa apenas suas próprias chamadas, com identidade/lane autodeclaradas. O arquivo `private-fixture.json` não possui isolamento de processo ou controle de acesso especial.

## Implementação

Compromisso SHA-256 dos bytes do dataset, tamanho e hash do marcador secreto. O GUID literal permanece na fixture, fora do compromisso público. O manifesto é escrito antes da avaliação. Modelo fixo de identidade, sem LLM, recebe apenas o frame anterior; a predição é escrita antes da comparação pelo avaliador. Quatro transições do microambiente conhecido, grade exata 1/4, em dois batches. Esse número é controle de instrumentação, não evidência de generalização. O processo avaliador possui labels: isto não implementa uma fronteira adversarial.

Cada checkpoint contém ID, hash anterior, registros e digest dos registros. Não é MMR; não oferece inclusion proofs. A referência final usada no controle é fornecida pelo próprio experimento, não por uma testemunha externa. Um produtor pode reescrever toda a história e seus checkpoints. Sem referência externa confiável ou registro prévio dos runs, não há prova de completude.

`LocalEvaluationPredictionOnly` é um registro Python local. Não altera o WER Rust, WormGraph, gate de produção ou política de admissão. Não há assinatura, autenticação, relógio confiável ou isolamento comprovado de holdout. Timestamps são declarações locais; mesmo assinados, não garantiriam tempo real por si sós.

O dataset foi comprometido antes do congelamento declarado do modelo. Essa ordem pode ser legítima: o requisito substantivo é impedir acesso indevido aos labels e alterações durante a avaliação, não exigir universalmente que o dataset só exista após o congelamento. O compromisso sozinho tampouco prova essa separação.

## Fonte conferida

[DatasetCommitment, sharpebench-attest 0.0.14](https://docs.rs/sharpebench-attest/0.0.14/sharpebench_attest/sealed/struct.DatasetCommitment.html) declara `content_hash`, `canary` e `len`, e documenta SHA-256, não BLAKE3. A existência da API não constitui prova da alegação de ausência de leakage. A alegação universal de 320 bytes por proof para 1000 eventos não foi estabelecida; tamanho depende da estrutura, codificação, hashes e metadados.

## Reprodução

Execute `python local_holdout_diagnostics.py <diretório-novo>` neste diretório usando o venv local. O diretório pai deve existir; o programa não sobrescreve uma execução existente. Testes: `python -m unittest discover -s work/arc-agi-3 -p 'test_*.py'` a partir de `D:\arkhe`.

O próximo trabalho de integração exigiria uma fronteira real entre produtor e avaliador e uma referência externa de checkpoints. Esses mecanismos não estão implementados nesta rodada.
