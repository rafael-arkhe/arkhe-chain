# Reset seletivo e passo prospectivo — v1

Implementação: `policy_contract_controls.py` e `prospective_policy_step.py`. Cinco novos métodos de teste em `test_selective_prospective_policy.py`. Não é execução C00–C11 nem coleta confirmatória.

## Decisões materializadas

- `Policy(reset_mode='selective')`: D1 restaura só mecânicas, D2 só objetivos; se ambos contradizem, ambos são restaurados. Flag genérica D3 restaura ambos, pois não identifica o componente alterado. Modo total permanece disponível e é o default para preservar os controles anteriores.
- Hipóteses restauradas são filtradas pela mesma transição/recompensa que disparou o reset. Ausência de recompensa não filtra objetivos. Dinâmica fora da família deixa conjunto vazio.
- `choose_discriminative`: sob pesos uniformes nas permutações sobreviventes, minimiza a contagem esperada de hipóteses restantes, soma dos quadrados dos tamanhos das partições dividida por |H|. Empates: menor contagem de tentativas, depois RNG privado semeado. É escolha informativa imediata sobre mecânica, não busca de caminho nem aquisição de objetivo. Nenhuma garantia de alcançar um estado discriminativo se todas as ações empatarem.
- `step`: grava compromisso por Writer com flush/fsync, chama env.step, grava observação vinculada e só então atualiza hipóteses. A flag configurada como pós-primeira-ação é entregue ao detector depois da primeira transição; não indica que o agente descobriu a mudança por essa ação. Fonte e model_digest são fornecidos pelo chamador, não atestados pela função.

## Testes executados

1. Contradição de mecânica recupera hipóteses sem apagar objetivo conhecido.
2. Contradição de objetivo restaura objetivos sem apagar mecânica compatível.
3. Layouts 1000/1100 sem D1; salto fora da família produz vazio e não gera resets D1 repetidos.
4. Ambiguidade left/up preservada na transição bloqueada; A1 seleciona uma das duas ações discriminativas no estado adequado. Flag genérica reabre ambos os componentes.
5. Um passo real do microambiente: a chamada instrumentada de env.step reabre o arquivo e encontra o compromisso já escrito; observação e atualização posteriores referenciam seu hash. Flag entregue após a primeira ação.

Os controles anteriores de P-carry, reset total, T2 e alarmes permanecem na suíte. Esses testes não equivalem a repetir cada combinação de T1–T3 em todos os modos.

## Correções ao anexo e limites

Reset total acopla descarte das duas componentes, mas não constitui automaticamente confundimento de uma comparação de políticas totais previamente definida. Reset seletivo é outra política; não é condição universal para métricas interpretáveis.

A1 não é necessária para produzir transições discriminativas: exploração uniforme ou menos tentada também pode encontrá-las. A1 de um passo não resolve navegação ativa. Sem distribuição sobre hipóteses, "redução esperada" não estava definida; aqui adotou-se a uniforme explicitamente.

W=3 pode ser um parâmetro de relatório, mas não garante que evidência discriminativa exista nesse intervalo. Não houve novo cálculo de alarmes. Antes de C00–C11, fixar W, calendário de mudanças e política completa de navegação/objetivo. A proposta de pós-primeira-ação foi implementada apenas no passo controlado, não numa população de tarefas.

O registro é prospectivo pela ordem do código e do controle executado. Não é prova externa de tempo, autenticação do produtor, completude de runs ou isolamento adversarial. Não há WER nativo, WormGraph, assinatura, AppContainer ou publicação externa nesta rodada. Os testes não usam LLM e os artefatos temporários do teste são descartados.
