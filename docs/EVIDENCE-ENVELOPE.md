# Envelope local de evidência para retrieval B

Implementação de 26/10/2026. [Fontes e limites científicos](audits/2026-10-26-research-and-envelope-audit.md).
Esta fatia acrescenta orçamento estrito opt-in, assinatura do WER e inclusão
MMR persistente; não autoriza efeitos externos nem altera a política dev.

## Orçamento

`ToolBroker` já reservava antes da chamada e liquidava uso real depois dela.
O novo `scripts/llama_cpp_bounded.py` acrescenta um provedor local que:

1. Confere SHA-256 do GGUF e versão de `llama-cpp-python` fixados na configuração.
2. Carrega somente vocabulário e conta o prompt com o próprio tokenizer, sem inferência.
3. Recusa contexto insuficiente e reserva `prompt_tokens + output_cap` no host.
4. Inicia um worker local CPU, reconfere modelo/tokenizer e passa os mesmos token IDs à geração, com `max_tokens` positivo.
5. Liquida `prompt_tokens + completion_tokens`; rejeita discrepância, overrun e truncamento.

Uma falha após admissão sem medição conserva a reserva; timeout mata o worker
local. Não há serviço remoto a cancelar nesse backend. O escopo é tokens de
inferência de uma chamada, não tempo/energia de carregar modelo ou tokenizar.
A biblioteca local é parte da base confiável; não há garantia contra host malicioso.
O checkpoint assina o WER, não certifica o comportamento de toda essa biblioteca.

Exemplo de configuração (substituir caminho, versão e digest por valores reais):

```json
{
  "provider": "llama_cpp",
  "model": "gguf-local-aprovado",
  "model_path": "D:/modelos/modelo.gguf",
  "model_digest": "SHA256_REAL_DO_ARQUIVO_GGUF_64_HEX",
  "runtime_version": "VERSAO_REAL_INSTALADA",
  "context_tokens": 4096
}
```

Não reutilizar o digest de um manifesto/tag Ollama como se fosse o hash do GGUF.
O pacote `llama-cpp-python` é dependência opcional do ambiente de inferência;
ausência, versão divergente e arquivo inválido falham antes da geração.
Configuração Ollama existente continua válida somente com `--allow-observed-total`.
O modo estrito agora recusa Ollama antes de retrieval/inferência, sem trocar
seu rótulo `POSTCHECK_ONLY` por uma garantia inexistente.

## Assinatura, journal e verificação

`arkhe_runtime::portable_wer` assina `AKG:WER:SIGNATURE:v1\0 || canonical_cbor(WER)`
com Ed25519. O WER deve vincular o digest canônico do WorkIntent. O `record_hash`
compromete intent, WER e assinatura sob domínio próprio; o log ancora esse hash.
O CBOR e digest legados do WER não mudam. O export nativo original permanece
unsigned e é preservado; a assinatura está em `portable-wer.json`.

O journal é JSONL local, com criação exclusiva de lock para escritores
cooperantes, validação de todos os prefixos, recusa de execution_id duplicado,
checkpoint assinado por prefixo, `sync_all` e leitura de confirmação. Cada
recibo inclui prova de posição pelo perfil existente `arkhe-mmr@1` e
`SignedCheckpoint`/`CheckpointTrust` do WormGraph. O verificador exige chaves,
log, tenant, stream e limites de contagem/tempo fornecidos externamente.
Nunca aceita como autoridade uma chave embutida no recibo.

Dois signers são aceitos: worker e log. São seeds de 32 bytes (arquivo binário
ou hex). Guardá-los fora dos arquivos versionados e de output, com ACL restrita, sob custódia do
operador. Esta implementação não provisiona nem ativa chaves de produção.
Exemplo de política pública, que deve ser preparada e distribuída pelo operador:

```text
WerTrust {
  worker_public_key: [32 bytes da chave pública aprovada],
  checkpoint: {
    log_id: [32 bytes não zero], public_key: [32 bytes da chave pública do log],
    tenant_id: "tenant-aprovado", stream_id: "pilot-wer",
    minimum_leaf_count: 1, maximum_leaf_count: 100000,
    earliest_issued_at: UNIX_SEGUNDOS_INICIAL, latest_issued_at: UNIX_SEGUNDOS_FINAL
  }
}
```

O arquivo real deve ser JSON, com arrays de 32 inteiros 0–255. A política não
é gerada com base em alegações do candidato. O piso de contagem previamente
observado deve ser retido fora do host e atualizado pelo verificador; sem isso,
um prefixo antigo corretamente assinado pode ser reapresentado. O piso detecta
remoção de cauda, não equivocation com chaves comprometidas. Checkpoints antigos
continuam válidos apenas no escopo da política de verificação fornecida.

Lock/cauda parcial após crash causam erro e exigem recuperação auditada. Não há
reparo silencioso. O journal não é armazenamento WORM nem substitui o store SQL
transacional de produção. `issued_at` é tempo declarado pelo signer; assinatura
e MMR não fornecem timestamp externo, TEE ou prova de correção semântica.

## Executar

```powershell
cargo build -p arkhe-runtime --example pilot_wer_evidence --locked
python scripts/arkhe_b_retrieval.py --config config/gguf-local.json --corpus tests/evaluation/live-retrieval-local-corpus-v1.json --query "Which model does the local Ollama provider use?" --bridge-exe target/debug/examples/pilot_evidence.exe --retrieval-exe target/debug/examples/pilot_retrieval_citations.exe --output-dir output/B-signed-strict --python-crosscheck --evidence-exe target/debug/examples/pilot_wer_evidence.exe --wer-trust ops/local/wer-trust.json --worker-key-file ops/local/worker.seed --log-key-file ops/local/log.seed --journal ops/local/pilot-wer.jsonl
target/debug/examples/pilot_wer_evidence.exe verify --bundle output/B-signed-strict/portable-wer.json --trust ops/local/wer-trust.json
```

As duas bridges existentes devem estar compiladas. Todos os cinco argumentos de
assinatura são exigidos juntos; sem eles mantém-se o perfil unsigned explícito.
Falha do signer bloqueia `COMPLETED_UNGRADED`, preservando geração e WER já criado.
O manifest fixa hashes do executável e trust público, reconferidos antes de
assinar. Nenhum segredo entra no manifest. O crosscheck lexical e seu grau de
independência não são promovidos pela assinatura.

Smoke criptográfico, sem modelo, com chaves descartáveis e fixture histórico:

```powershell
python scripts/portable_wer_smoke.py --exe target/debug/examples/pilot_wer_evidence.exe --native tests/evaluation/python-citation-reference-export-v1/native-evidence.json --output-dir output/new-envelope-smoke
```

Esse smoke valida o novo selo no momento da execução do comando; não prova a
identidade do executor nem o horário do ensaio histórico que produziu o fixture.

## Revisão externa e validação

O pacote de 75 casos em `output/citation-external-review-20261026/external-review.zip`
já existia e continua pronto para entrega externa. O grader nunca executa código
do revisor nem promove sua declaração de independência a fato verificado.
Independência organizacional exige avaliação externa humana e permanece pendente.

Os testes novos cobrem pré-admissão sem inferência, reserva/liquidação, overrun,
timeout/uso desconhecido, tokens inconsistentes, assinatura, escopo e piso de
confiança, adulteração, duplicata, posição MMR, prefixo e lock/cauda parcial.
O smoke CLI real aceitou o recibo íntegro e rejeitou WER alterado e signer errado.
Os resultados e limitações de execução ficam no relatório de validação em
`output/evidence-envelope-validation-20261026/`.

Atualização do ensaio operacional: foi instalado `llama-cpp-python==0.3.36` em
`tmp/evidence-envelope-venv/`, sem mudar o Python global ou baixar pesos. O teste
com o GGUF local confirmou tokenização de 15 tokens e reserva de 31 (15+16), mas
atingiu timeout de 180 s. O worker foi encerrado e os 31 tokens ficaram reservados
como uso desconhecido. Isso valida a recusa/contabilidade conservadora, não uma
geração concluída. O resultado ficou em `output/bounded-gguf-smoke-20261026/`.
A regressão final está em `output/evidence-envelope-validation-final2-20261026/`.
