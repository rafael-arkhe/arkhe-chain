# Avaliação local do analisador de triagem

O alvo é o `OllamaAnalyzer` real, via `ollama_triage`. O sinal medido é
`supports_proposal`: suporte à severidade/estado propostos com base no relatório.
Não é um detector autônomo de contratos ou uma medição de autorização do gate.

## Conjunto inicial

`tests/evaluation/triage-known-cases.json` contém 12 casos originais sintéticos,
rotulados antes da execução: quatro positivos e oito negativos. Quatro pares
contrastam reentrância, controle de acesso, `tx.origin` e overflow com suas
correções; outros quatro negativos cobrem evidência insuficiente e prompt injection.
Os trechos não são compilados nem executados. Rótulos incluem severidade proposta,
cuja avaliação contém julgamento humano; não são decisões oficiais HackenProof.
Um negativo significa que a alegação específica não é sustentada, não que todo
o contrato esteja livre de vulnerabilidades.

O runner entrega apenas relatório e proposta ao CLI; não entrega o rótulo ou sua
justificativa. Cada caso usa uma inferência, sem retries ou ajuste posterior do
prompt/modelo. O cliente existente fixa o digest do modelo, usa temperatura zero
e confere limites e formato. O nonce do prompt e a execução local impedem prometer
reprodução bit a bit. O perfil é o legado de avaliação sem autoridade verificada.

## Execução

```powershell
python scripts/ollama.py status
cargo build --locked -p arkhe-bugbounty --bin ollama_triage
python scripts/evaluate_triage.py --output docs/evidence/local/2026-10-17/triage-evaluation/run-02
```

Escolha um diretório novo para cada execução; o runner recusa sobrescrita.
Não é necessário instalar agentes, coletar credenciais ou ativar política.
Não há chamada HackenProof, assinatura institucional ou execução de exploit.

São preservados os inputs, config, runner, hashes SHA-256 do executável e inputs,
stdout/stderr por caso, tempos, motivos do modelo, resultados JSON e resumo.
Os hashes identificam conteúdo, sem constituir assinatura ou aprovação.

## Métricas

- TP: suporte correto a uma proposta sustentada; FN: rejeição dessa proposta.
- FP: suporte indevido a uma alegação não sustentada; TN: rejeição correta.
- ERROR: timeout, erro do cliente ou saída inválida, separado de FN/TN.
- Precisão, recall e taxa de FP `completed` usam apenas respostas válidas.
- Cobertura e sucesso positivo/negativo sobre todos os rótulos expõem o impacto
  dos erros, que não podem desaparecer por exclusão dos denominadores.

Não há limiar de aprovação automática. Confiança autodeclarada não é calibração.
O corpus é pequeno, escrito localmente e sem revisão externa dos rótulos; não
permite extrapolar taxas para produção ou reivindicar resultados SmartBugs.
Antes de comparar novos agentes, fixe corpus externo por commit, revise os
rótulos, acrescente repetições e preserve um conjunto separado de avaliação.

Primeira execução: `docs/evidence/local/2026-10-17/triage-evaluation/run-01/`.
