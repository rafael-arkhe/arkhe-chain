# Validação local da reconciliação

Data de escopo: 22/10/2026; término UTC: 2026-10-22T20:22:02.581773+00:00

Sem CI remoto, PostgreSQL real, GPU/TEE, sandbox nativo qualificado, Jules live ou pagamento real. Testes AP2 qualificam a ponte autenticada com role sintético, não um SDK AP2 externo.

Fontes Rust/config/scripts permaneceram iguais durante a execução: True. Hashes em inputs.json e logs por gate em results.json.

| Gate | Estado | Exit | Rust passed | Rust ignored | Log |
|---|---|---|---|---|---|
| architecture | PASS | 0 | 0 | 0 | [architecture.log](architecture.log) |
| backlog | PASS | 0 | 0 | 0 | [backlog.log](backlog.log) |
| work-vectors | PASS | 0 | 0 | 0 | [work-vectors.log](work-vectors.log) |
| artifact-vectors | PASS | 0 | 0 | 0 | [artifact-vectors.log](artifact-vectors.log) |
| root-format | PASS | 0 | 0 | 0 | [root-format.log](root-format.log) |
| agi-format | PASS | 0 | 0 | 0 | [agi-format.log](agi-format.log) |
| root-clippy | PASS | 0 | 0 | 0 | [root-clippy.log](root-clippy.log) |
| broker-clippy | PASS | 0 | 0 | 0 | [broker-clippy.log](broker-clippy.log) |
| root-tests | PASS | 0 | 266 | 2 | [root-tests.log](root-tests.log) |
| broker-tests | PASS | 0 | 22 | 0 | [broker-tests.log](broker-tests.log) |
| agi-tests | PASS | 0 | 38 | 3 | [agi-tests.log](agi-tests.log) |
| agi-clippy | PASS | 0 | 0 | 0 | [agi-clippy.log](agi-clippy.log) |
| wasm-build | PASS | 0 | 0 | 0 | [wasm-build.log](wasm-build.log) |
| adapter-build | PASS | 0 | 0 | 0 | [adapter-build.log](adapter-build.log) |
| adapter-tests | PASS | 0 | 0 | 0 | [adapter-tests.log](adapter-tests.log) |
| agi-sdk-tests | PASS | 0 | 0 | 0 | [agi-sdk-tests.log](agi-sdk-tests.log) |
| sigstore-tests | PASS | 0 | 0 | 0 | [sigstore-tests.log](sigstore-tests.log) |
