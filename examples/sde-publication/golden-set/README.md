# Coleta de referência para suporte ao cliente

O domínio foi definido pelo usuário. A fonte pública foi obtida da revisão
`d662dc42479c14e202eccd832f8c4b66a035c4cc` de
[Wix/WixQA](https://huggingface.co/datasets/Wix/WixQA/tree/d662dc42479c14e202eccd832f8c4b66a035c4cc).
Os arquivos preservam os bytes de origem e seus hashes em
`sources/wixqa/source-manifest.json`; o cartão upstream declara MIT e pede atribuição
a Wix.com AI Research. Atribuição: Dvir Cohen et al., WixQA, 2025.

Foram contados 200 pares expertwritten e 6.221 artigos, não 6.222, nesta revisão.
As fontes não são o golden set final. Nenhuma inferência ou revisão humana foi feita.

- `RUBRIC.md`: proposta para avaliar fatos, procedimentos, autoridade e tratamento.
- `manifest.template.json`: campos de proveniência, amostragem e revisores pendentes.
- `sources/wixqa/expertwritten.jsonl`: perguntas e gabaritos; não candidatos do agente.
- `sources/wixqa/kb-corpus.jsonl`: KB congelada (aproximadamente 54 MB).
- `sources/wixqa/README.upstream.md`: documentação original da fonte.

Antes de executar calibração externa: identificar revisores e adjudicador; fornecer
tickets anonimizados; revisar rubrica e agrupamento; congelar splits; gerar respostas
do sistema e medir juízes; coletar anotações cegas e resolver desacordos. Só então
montar o JSONL aceito por `calibrate.mjs`. Não preencher campos desconhecidos com
scores simulados ou anotações atribuídas a pessoas que não revisaram os casos.

O script atual não valida o manifesto nem promove o spec a calibrado. Os controles
sintéticos rodam separadamente. WixQA não cria ACL ou políticas de ferramentas da
operação local. Um benchmark público também pode estar contaminado no treinamento
de modelos; registrar essa limitação no relatório externo.

## Executar a baseline de candidatos

```powershell
python examples/sde-publication/golden-set/run_candidates.py
```

Se a carga CUDA falhar, há um perfil CPU separado, sem alterar a configuração global:

```powershell
python examples/sde-publication/golden-set/run_candidates.py --cpu --run-dir examples/sde-publication/golden-set/runs/wixqa-local-cpu-v3
```

`--cpu` registra `num_gpu: 0` nas opções do manifest. Runs CPU/GPU não são
misturados. O timeout configurado continua valendo; uma falha de runtime interrompe
o lote, preservando candidatos já gravados para retomada.

## Medição experimental dos juízes

```powershell
python examples/sde-publication/golden-set/judge_candidates.py --limit 1
```

O avaliador usa o mesmo modelo local em CPU numa única chamada conjunta para
estimar grounding, hallucination e qualidade geral. Os scores são saídas reais
do modelo sob rubrica registrada, mas não são medições independentes nem
probabilidades calibradas. A autoavaliação pode compartilhar vieses da geração.
Não alegar três juízes independentes ou substituir os dois revisores humanos.

`support-output-contract.json` declara o perfil concreto de citações do suporte,
separado do agregador genérico. Ele exige IDs completos de 64 hexadecimais minúsculos
e resolução nos artigos recuperados, além de resposta não vazia e alguma citação.
O perfil de geração v2 inclui explicitamente esse formato no system prompt e
registra o contrato/hash. O piloto v1 permanece separado, sem reescrita de candidatos.

A chamada de avaliação é executada antes do agregador, inclusive para diagnóstico
de respostas que falham no gate. Portanto, zeros realmente retornados pelo modelo
continuam zeros, com `MEASURED_NOT_USED_RULE_GATE` e `used_in_decision: false` quando
o gate falha. Não confundir curta-circuitagem do agregado com ausência da chamada.
`null` representa medição não disponível, e uma saída incompleta/malformada fica
`INVALID`, com resposta bruta preservada. Isso não comprova validade semântica dos
scores, apenas descreve sua procedência e uso. O piloto foi resumido novamente
com esses estados, sem modificar as respostas brutas nem alegar nova medição.

O `rule_judge` verifica somente resposta não vazia e citações: ao menos uma,
com todos os identificadores entre colchetes correspondendo integralmente a um
artigo recuperado. Prefixos com reticências falham; não há reparo silencioso da
resposta. A regra não prova suporte semântico às afirmações. O resultado passa
pelo `aggregate()` existente e é consultivo; nenhuma ferramenta é executada.

As medições ficam em `measured-judges.jsonl`, separadas dos candidatos e dos
pacotes humanos. `blind-review/reviewer-1.jsonl` e `reviewer-2.jsonl` contêm
pergunta, candidato, referências e anotações em branco, sem scores ou split.
Entregar somente o pacote individual ao respectivo revisor. O mapa de IDs fica
fora da pasta dos pacotes; cegamento de acesso e identidade dos revisores ainda
precisam de organização humana. Nenhum pacote foi enviado a terceiros.

Evitar chamadas paralelas neste host CPU: geração e avaliação disputam o mesmo
modelo. Os tempos de uma execução não permitem prever aceleração linear por
quatro ou oito workers. O primeiro tempo inclui carga inicial do modelo.

Requer Ollama já disponível no endpoint local de `config/ollama.json`, com modelo
e digest correspondentes. O script não inicia servidor, não baixa modelos e não
usa provedor remoto. A baseline é RAG lexical BM25 com três artigos e excertos
limitados por caracteres, sobre a KB congelada. Não é o agente Arkhe de produção.
Não consulta `answer` nem `article_ids` na recuperação ou no prompt. Não executa
ferramentas externas. A configuração, versão, digest e hashes ficam no manifest.

Escreve candidatos incrementalmente em `candidates.jsonl` dentro do run-dir e
retoma os IDs concluídos somente com configuração idêntica. O contexto configurado
é limitado; a API pode truncá-lo. A contagem de tokens e motivo de término são
registrados; `done_reason=length` identifica resposta limitada, sem atestar qualidade.
Cada registro inclui os excertos enviados. Não há certeza de reprodução bit a bit
mesmo com temperatura zero e seed fixa.

O JSONL de candidatos não é entrada de calibração: ainda faltam grupos/splits,
scores medidos e rótulos humanos. Os próximos passos de anotação e juízes podem ser
organizados em paralelo, mantendo revisores cegos aos scores. Não impor artificialmente
30% de falhas: prevalência e desenho amostral devem ser declarados e revisados.
O loader de calibração rejeita anotações ausentes; não as converte em kappa nulo.

## Diagnóstico de entrega da rubrica

O modelo local respondeu a `/api/show` com template `{{ .Prompt }}` e também
`renderer: cohere`, `parser: cohere`. A inspeção inicial somente do template foi
incompleta: o modo `_debug_render_only` confirmou a rubrica original integralmente
presente no turno de sistema nativo. Não foi demonstrada falha de entrega do system
prompt. O arquivo `diagnostics/system-rubric-render.json` preserva a prova local.
O perfil alternativo abaixo testou outra apresentação, sem corrigir um defeito
comprovado nem alterar o modelo global:

```powershell
python examples/sde-publication/golden-set/judge_candidates.py --limit 3 --inline-rubric
```

O perfil `joint-inline-rubric-v2` inclui instruções e dados diretamente no prompt
do usuário. Isso não cria uma fronteira de segurança contra prompt injection;
é um diagnóstico de entrega de instruções. O perfil anterior permanece no histórico.
O runner retoma por perfil. Variância não nula não comprova validade dos scores;
uma série constante também não comprova ausência de execução. Verificar a saída
bruta e as justificativas. Ver as [variáveis de template do Ollama](https://docs.ollama.com/modelfile).

O diagnóstico em três candidatos v2 produziu scores variáveis, mas não validou o
juiz. O piloto v3 testou instruções inline com base na hipótese inicial e foi
interrompido para investigar o renderer. Nenhum modelo ou alias foi alterado.

## Geração estruturada v4 — piloto limitado

A [triagem NLI v5](NLI-V5.md) acrescenta um classificador heterogêneo e um gate
de escalada, sem modificar o painel v0.1.0 nem alegar independência estatística.

O [experimento de temperatura e score contrastivo](TEMPERATURE-EXPERIMENT.md)
mede o ajuste em MultiNLI separado do suporte, preserva a proveniência v4/v5 e
mantém os resultados não promovidos.

```powershell
python examples/sde-publication/golden-set/run_candidates.py --cpu --limit 3 --run-dir examples/sde-publication/golden-set/runs/wixqa-local-cpu-v4
```

V4 registra renderer/parser e usa mensagens de sistema quando há renderer nativo.
Pede JSON `{answer, citations}`: `answer` não contém colchetes; o modelo seleciona
IDs completos numa lista restrita aos artigos recuperados. O aplicativo valida o
JSON e renderiza esses IDs em colchetes após a resposta. Isso é uma nova construção
de saída declarada, não reparação silenciosa dos pilotos antigos. A resposta bruta
é preservada, inclusive em falhas de formato, e não é aceita se truncada por limite.
As citações resolvem para fontes, mas não há vinculação ou prova por afirmação.

Os perfis v1–v4 são distintos e não devem ser combinados como a mesma configuração.
O lote amplo não é promovido nem reiniciado automaticamente durante o piloto de
três casos. Scores do mesmo modelo continuam experimentais, sujeitos a erros de
leitura; notas e scores são produzidos conjuntamente, não por juízes independentes.
