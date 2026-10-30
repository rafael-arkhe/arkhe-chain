# Temperatura e score contrastivo — experimento v6, não promovido

## Proveniência corrigida

`diagnostics/v4-v5-candidate-provenance.json` confirma igualdade entre o hash do
JSONL de candidatos v4 e o hash de entrada registrado pelo v5. O v5 não executou
o gerador. A frase negativa do caso 001 já pertence ao v4; a frase positiva é de
outro perfil anterior. Essa diferença não é evidência de não determinismo com
prompt/modelo/configuração idênticos.

## Ajuste de temperatura executado

```powershell
python examples/sde-publication/golden-set/temperature_scale.py --output-dir examples/sde-publication/golden-set/runs/nli-temperature-new
python examples/sde-publication/golden-set/contrastive_triage.py
python -m unittest discover -s examples/sde-publication/golden-set -p 'test_*.py' -v
```

Amostra fixa de 200 pares rotulados do `validation_matched` de
[MultiNLI](https://huggingface.co/datasets/nyu-mll/multi_nli), revisão
`da70db2af9d09693783c3320c4249840212ee221`: 100 para ajuste e 100 para teste,
com uma linha por premissa única. Os grupos foram ordenados por SHA256 com sal
fixo antes da inferência. Fontes, rótulos, seleção e hashes ficam em `sources/multinli`.
O mapeamento do dataset (entailment/neutral/contradiction) é convertido por nome
para o do modelo (contradiction/entailment/neutral), nunca assumido por índice.

Foram medidos logits reais com o mesmo DeBERTa fixado no v5. O script minimiza
NLL apenas no desenvolvimento com busca escalar em log(T), limites [-3,3] e 80
iterações; o teste não participa da seleção. O valor encontrado foi
**T=2.1687846760564096**.

Resultados nos 100 pares de teste:

| Métrica | T=1 | T ajustada |
|---|---:|---:|
| NLL | 0.456536 | 0.307805 |
| Accuracy | 0.89 | 0.89 |
| Brier multiclasse (soma por classe) | 0.199811 | 0.174625 |
| ECE de top-label (10 bins) | 0.106239 | 0.060772 |
| ECE de contradição (10 bins) | 0.046067 | 0.047652 |

Não houve melhoria em todas as métricas: o ECE de contradição piorou ligeiramente.
Temperatura positiva preserva argmax; não corrige classes erradas. O benchmark
genérico não é uma amostra representativa de suporte; exposição prévia do modelo
a seus conjuntos de desenvolvimento não pode ser excluída. Os ECEs são dependentes
da amostra/bins, sem intervalo de incerteza neste experimento.

O relatório é `EXPERIMENTAL_GENERIC_NLI_ONLY`; a calibração no domínio segue
`PENDING`. Não interpretar T ou seus scores como probabilidade de verdade no WixQA.
O método segue [Guo et al.](https://proceedings.mlr.press/v70/guo17a.html), mas
replicar a técnica não transfere automaticamente seus resultados para outro domínio.

## Score contrastivo, preservando os dois extremos

O experimento `contrastive_triage.py` calcula `max entailment - max contradiction`,
mantendo os máximos e todos os pares. Não altera resultados v5 nem o painel v0.1.0.
O [HallDetect](https://arxiv.org/abs/2608.05823) motiva essa formulação; não se afirma
replicação de seu pipeline, extração atômica ou resultados de benchmark.

Antes e depois da transformação por T, os pares preservados são reanalisados. Como
o v5 conservava softmax, a comparação usa log(p), que corresponde aos logits salvo
constante aditiva e arredondamento original. Scores zero/não finitos viram
indisponíveis em vez de se inventarem logits com clipping.

Um único delta apagaria informação: (E=0.9,C=0.9) e (E=0.1,C=0.1) têm diferença
zero, mas o primeiro é conflito e o segundo é falta de evidência. Por isso o
experimento conserva esses estados. Usamos fronteiras provisórias +/-0.5 para o
delta e 0.8 para conflito; **não são limiares calibrados**. Todos os estados que
não sejam suporte exigem aprovação antes de aceitar o resultado do painel.

Nos três casos preservados, o experimento continua em `REQUIRE_APPROVAL`: sinais
de contradição nos casos 001/002 e evidência insuficiente no 003. Isso não fornece
rótulos humanos nem prova melhora de eficácia. Temperatura ajustada por par NLI
também não calibra o máximo selecionado entre múltiplas janelas.

Os relatórios estão em `runs/nli-temperature-multinli-v1` e
`runs/wixqa-contrastive-v6`. O lote de 200 candidatos continua interrompido. Revisores,
adjudicação e validação representativa do domínio permanecem necessários.
