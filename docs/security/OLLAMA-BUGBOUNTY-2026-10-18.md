# Ollama no bug bounty — implementação e verificação local

## Papel e contrato

Ollama ocupa Analyze em Read → ScopeCheck → Analyze → Admit → Propose → Authorize
→ Execute → Record. Não recebe ferramentas nem credenciais HackenProof.
O relatório é entrada não confiável. A resposta é proposta não confiável e só um
worker verificado, governança e kernel podem autorizar a operação protegida.

O anexo descreve como próximo passo implementar OllamaAnalyzer, mas esse adapter
já existe em integration/arkhe-bugbounty/src/ollama.rs. Ele avalia suporte à
severidade/estado propostos e valida JSON de forma independente. TriageAnalysis
de classificação continua um contrato separado, validado contra política
confiável; não se substituiu o contrato de classificação por uma saída livre do LLM.

## Alterações nesta rodada

- module_version de novos WERs inclui release do adapter e digest do modelo:
  `<adapter-version>+model.<digest>`. O registro TrustedWorkerKey já verifica a
  versão exata antes de aceitar o recibo assinado. É necessária aprovação explícita
  desse novo binding; perfis/raízes ativos não foram promovidos automaticamente.
- O schema enviado ao Ollama inclui limites de tamanho da justificativa; parsing,
  campos desconhecidos e limites continuam sendo verificados pelo host.
- O cliente rejeita nomes cloud conhecidos, entradas com metadata remota e
  duplicação do modelo no catálogo. Confere digest antes e depois da geração.
  Isso detecta deriva observável, sem alegar prova atômica dos pesos executados.
- Teste opt-in reutiliza uma única análise real nos quatro cenários de fronteira.
  Não há retries de inferência, mudança de prompt após ver resultado nem fallback.

O output_digest permanece vinculado aos parâmetros da proposta porque o gate
exige essa igualdade. O digest do artefato de análise e seus dados de modelo são
cobertos pelo WER, juntamente com a nova module_version. Substituir o output por
um hash de análise sem mudar o contrato do gate quebraria essa vinculação.
Não se inventou self_check=Pass como autoridade de admissão.

## Evidência e alcance

Comando opt-in e resultado real ficam em
`docs/evidence/local/2026-10-18/ollama-bugbounty-boundaries/RESULTS.md`.
O probe usa o modelo já instalado e o digest em config/ollama.json. Não baixa nem
escolhe qwen3 ou outro modelo com base apenas na recomendação do anexo.

O teste exige inferência real bem-sucedida para uma fixture sintética, captura o
WER candidato e verifica: INV-WER-06 (sem evidência admitida, rejeita), INV-WER-07
(falha externa simulada gera log, não execução bem-sucedida), replay sem segunda
escrita e ParameterMismatch sem segunda escrita. Backend, scope, política e
admissão são fixtures em memória. Não demonstra assinatura de worker em produção,
PostgreSQL nesse cenário, uma chamada HackenProof real ou acurácia semântica.
O log registra modelo, digest, versão do servidor, versão do worker e hash do
candidato. Não é um novo run de avaliação, revisão humana ou execução do holdout.

Execução observada: **PASS**, uma inferência real, servidor Ollama `0.40.6`,
modelo `north-mini-code-1.0:latest`, digest
`d8b269ad5c7c7144ce104b83ce93bc3efb85e0f74e01be6be5f5d6f7ca90b60f`.
O teste real terminou com 1 passed / 0 failed / 0 ignored; os quatro cenários
internos estão discriminados no log. Hash do candidato:
`84a35af9be40e06c525a190f67105179104fe1337f6d2a553bc0df9386fa0c0e`.
Esse hash e o log não são um recibo criptográfico de worker nem WER persistido
em WormGraph de produção. Os testes padrão são registrados separadamente.

## Correções às afirmações do anexo

1. Temperatura zero não garante determinismo. A própria recomendação oficial é
   reduzir temperatura para maior regularidade; o nonce também varia entre pedidos.
2. JSON Schema limita forma; parsing local e avaliação factual continuam necessários.
3. Loopback não prova privacidade nem ausência de egress. Ollama também suporta
   modelos cloud; é necessário impor configuração/isolamento no deployment.
4. Delimitadores com nonce são formatação, não proteção completa contra injection.
5. Tamanhos, requisitos de RAM e qualidade de modelos dependem de variante,
   quantização, contexto e hardware. Nenhum desempenho comparativo foi inferido.
6. Pin de nome/digest informado pelo daemon não prova integridade de um daemon
   comprometido. Assinatura do worker vincula uma análise a um worker autorizado;
   não transforma seu conteúdo em verdade.

Fontes primárias conferidas em 2026-10-18:
[structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
[tool calling](https://docs.ollama.com/capabilities/tool-calling),
[catálogo](https://docs.ollama.com/api/tags),
[cloud](https://docs.ollama.com/cloud).

Não foram expostas ferramentas ao modelo, ratificados perfis de produção,
alterados rótulos históricos ou declarada revisão independente de run-01.
