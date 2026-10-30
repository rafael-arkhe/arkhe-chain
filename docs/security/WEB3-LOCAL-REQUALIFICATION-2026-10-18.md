# Requalificação local da triagem Web3

O anexo pede implementar `OllamaAnalyzer` com structured output e executar INV-WER-06/07, idempotência e parameter mismatch contra Ollama real. Esses componentes e testes já existem; esta rodada repete a qualificação em uma captura nova, sem substituir evidências anteriores.

## Correspondência com o código

- `integration/arkhe-bugbounty/src/ollama.rs`: Assessment tipado, schema de saída e análise convertida em WER; Assessment não é prova de severidade nem autorização. `worker_version` vincula release do adaptador ao digest configurado do modelo.
- `integration/arkhe-ollama`: cliente local e verificação de pin do catálogo. Isso não atesta daemon ou pesos executados.
- `integration/arkhe-bugbounty/src/lib.rs`: execução exige admissão e gate; journal faz replay e rejeita conflito de parâmetros. `src/postgres.rs` fornece armazenamento durável.
- `integration/arkhe-bugbounty/src/review.rs`: roteamento e fila de revisão; a política candidata padrão não aprova automação. A revisão humana real continua pendente.
- `integration/arkhe-bugbounty/tests/support/ollama_postgres.rs`: uma inferência real, assinaturas Ed25519, PostgreSQL, replay após reconexão, conflito de parâmetros, módulo/modelo não autorizado, análise não admitida e falha incerta sem evidência de execução bem-sucedida.

## Fronteira desta execução

Ollama e PostgreSQL são reais; o relatório, a governança, o cliente HackenProof e as chaves efêmeras são fixtures de teste. A execução não usa TEE, não constitui revisão humana e não contata HackenProof. Um recibo assinado continua dependendo da confiança no emissor. Não demonstra acurácia da classificação, eficácia Web3, Foundry, fork, differential checking, exploit ou prova ZK.

Não foram adicionados scanners, agentes paralelos ou execução de exploits: o próximo passo explícito do anexo é a qualificação local da triagem. As afirmações sobre ferramentas e literatura no texto recebido não foram verificadas nem convertidas em lemas do repositório.

## Evidência

Diretório: `docs/evidence/local/2026-10-18/web3-local-requalification/`. O teste exige captura inédita e não exporta as chaves privadas. `results.json` e `RESULTS.md` registram comandos, resultados e hashes de fonte. A captura inclui versão observada do provedor, registros e assinaturas públicas. Produção permanece não autorizada; integração HackenProof real e qualificação de hardware continuam pendentes.

Resultado executado: PASS no teste integrado (82,882 s) e PASS na verificação da captura persistida após reconexão (2,703 s). Cada comando executou um teste, sem falhas. A rodada fez uma inferência real; a segunda verificação não fez inferência. Ambos mantiveram o hash de fonte antes/depois. INV-WER-06/07, replay idempotente e conflito de parâmetros foram verificados no cenário local assinado com PostgreSQL; upstream HackenProof permaneceu simulado. Nenhuma mudança de implementação foi necessária para satisfazer este próximo passo do anexo.
