# Run-02 — preparação prospectiva, sem inferência

Registro histórico da versão candidata 1. A revisão prospectiva vigente está em
`RUN-02-V2.md`, com cinco repetições; nenhuma das versões executou run-02.

Foram materializados critérios candidatos em `docs/security/run-02-criteria.md`,
antes de inferências externas. Não houve ratificação humana ou registro externo
de pré-registro. O manifesto local identifica a versão, não comprova autoridade
ou timestamp independente. Limites propostos: FPR <=10%, recall/acordo >=90%,
kappa >=0,80, erros <=5%, flip rate <=10%. Não são limites de produção aprovados.

## Execuções desta rodada

```text
python scripts/prepare_external_triage_review.py --per-category 8 --output tests/evaluation/external-review/expanded-24
Prepared 24 external sources at commit 230e649123477eff332742a59a1c7cc6dc286cab; no inference; all labels pending human review.

python scripts/triage_statistics.py
TP=4 TN=7 FP=1 FN=0 ERROR=0
Wilson 95%: FPR [0.02241749, 0.47088818]
            precision [0.37553463, 0.96377589]
            recall [0.51010916, 1.0]

python tests/evaluation/test_triage_statistics.py
Ran 5 tests — OK
```

O catálogo fixado possui 143 entradas. As 24 fontes selecionadas têm sete grupos
candidatos por URL de origem, sem interseção de grupos entre 18 fontes de
desenvolvimento e seis reservadas. Hashes dos arquivos foram conferidos. Não há
revisão de aliases, duplicatas ou negativos concluída; a reserva ainda é candidata.

## Correções do parecer recebido

- O denominador da FPR de 12,5% é oito negativos rotulados. Houve cinco previsões
  positivas: entre elas, um erro corresponde a 20% (proporção de falsas descobertas).
- Esses valores dependem de rótulos preliminares. FP=1 é uma contagem relativa
  aos rótulos preservados, não confirmação humana da verdade semântica.
- Não há critério de confiança suficiente no gate atual. O texto do parecer que
  sugere esse critério contradiz a implementação. Confiança não autoriza operação.
- Não foi incorporada a alegação genérica de SAST com 68–95% de falsos positivos:
  não há comparabilidade estabelecida de corpus, tarefa e denominador.
- Concordância binária usará acordo e Cohen's kappa, com indefinição reportada.
  Alpha/ICC não serão acrescentados apenas para produzir mais números.

O Wilson é resumo binomial ilustrativo condicionado a rótulos, não inferência
válida sobre toda a população a partir de pares sintéticos por conveniência.
Métodos consultados:
https://www.statsmodels.org/stable/generated/statsmodels.stats.proportion.proportion_confint.html
https://www.statsmodels.org/stable/generated/statsmodels.stats.inter_rater.cohens_kappa.html

## Pendências reais

Revisor humano identificável, revisão sem exposição prévia quando declarada
cega, rótulos/alegações/severidades, controles negativos, validação de split e
transformações sem respostas reveladas, ratificação dos critérios e congelamento
final dos inputs. O pacote neutro e seu formulário continuam sem parecer humano.
Não preencher formulários com self-check de IA.

Slither, Mythril (`myth`), `solc` e `forge` não foram encontrados no PATH nesta
rodada. Nenhuma instalação ou comparação estática foi executada. A avaliação
deve fixar compiladores, mapeamento de alertas e equivalência de tarefa antes
de comparar; instalação por si só não preenche o baseline.

Não houve nova inferência, WER, admissão, assinatura, aprovação de governança,
ativação ou escrita externa. Logs e hashes são evidência operacional, não
autoridade normativa. **Estado: PRELIMINARY / RUN-02 NOT EXECUTED**.
