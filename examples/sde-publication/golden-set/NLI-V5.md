# V5: triagem semântica experimental, separada do painel v0.1.0

```powershell
python -m unittest discover -s examples/sde-publication/golden-set -p test_nli_triage.py -v
python examples/sde-publication/golden-set/nli_triage.py --output-dir examples/sde-publication/golden-set/runs/wixqa-nli-v5-new
```

O comando exige os arquivos locais listados em `models/nli-deberta-v3-base/download-manifest.json`.
O modelo é [cross-encoder/nli-deberta-v3-base](https://huggingface.co/cross-encoder/nli-deberta-v3-base),
revisão `6c749ce3425cd33b46d187e45b92bbf96ee12ec7`, com safetensors e execução CPU.
Foram preservados os arquivos, hashes e ordem de rótulos do config. O cartão oficial
declara treinamento em SNLI/MultiNLI e rótulos contradiction/entailment/neutral.
Não há envio dos dados a provedor remoto de inferência.

## O que mudou

- O classificador DeBERTa é distinto do gerador Cohere. Isso diversifica o mecanismo;
  não comprova independência de erros. Não foi instalado outro LLM generativo.
- `v5-policy.json` registra limiares provisórios antes da execução NLI. O spec
  `ai-output-panel@0.1.0`, seus pesos e suas zonas permanecem inalterados.
- Cada resposta é segmentada em unidades sentenciais literais, sem paráfrase.
  **Não há extração atômica completa verificada.** Abreviaturas como `e.g.` não
  devem virar fragmentos independentes; condicionais e frases compostas continuam
  uma limitação explícita.
- Para cada unidade, o modelo recebe pares premissa/hipótese de janelas dos artigos
  citados, limitadas por palavras. Registra todos os pares e scores. Se o par exceder
  o limite de tokens, ele é marcado indisponível; não há truncamento silencioso.
- O gate decide antes de usar a aceitação do painel: falha estrutural preserva DENY;
  indisponibilidade, contradição forte ou aceitação sem entailment suficiente exigem
  REQUIRE_APPROVAL. A avaliação anterior é preservada como histórico, não como efeito.
- Há sondas sintéticas simples para verificar a ordem dos rótulos. Elas não são
  golden set real nem validam a eficácia do classificador no domínio de suporte.

## Resultados e limites

O primeiro piloto está em `runs/wixqa-nli-v5`; sua fonte foi arquivada como
`nli_triage.snapshot.py`. Nele identificamos fragmentação indevida de `e.g.`.
O piloto com segmentação corrigida fica em `runs/wixqa-nli-v5-sentencefix`, sem
reescrever a primeira execução. Os relatórios conservam model/policy/source hashes.

Softmax não é probabilidade calibrada de verdade. O máximo entre muitas janelas
pode elevar falsos alarmes; contextos condicionais e artigos parcialmente relevantes
podem produzir sinais conflitantes. Um score alto aciona revisão, não prova falsidade.
O caso 002 também escalou no primeiro piloto; isso exige inspeção dos pares, não
uma conclusão automática de que sua resposta inteira está errada.

O wrapper não cria aprovadores humanos, não autoriza ferramentas e não fornece um
rótulo `acceptable`. A calibração permanece PENDING, com independência de erros não
estabelecida. O lote de 200 não foi retomado como parte desta triagem.

## Transporte do system prompt

`diagnostics/system-rubric-render.json` contém o prompt real produzido pelo renderer
Cohere, com a rubrica original no turno SYSTEM. A ausência de `.System` no template
Go impresso não demonstrava ausência de mensagem de sistema; o renderer nativo é
outro caminho de construção. Não foi necessário criar alias nem alterar o modelo.
O piloto inline anterior é uma variante de apresentação, não uma correção causal
comprovada. O juiz antigo recebeu o contexto, como mostram os payloads preservados.
