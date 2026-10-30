# Ablação de feedback: 40 chamadas locais

Executada em 27/10/2026. Mesmo north-mini-code-1.0:latest, schema, exemplos genéricos, parser, DSL, temperature0, seed0, contexto8192, saída1024 e timeout180s. Quarenta requests de geração: dez por condição, cinco por controle. Esse orçamento total é maior que o experimento anterior de quatro chamadas; o teto por chamada foi preservado. Sem ações ARC, submissão ou admissão de candidatos.

## Desenho e escopo

Todas as condições partem do mesmo programa arquivado de sete nós, hash registrado no plan.json. Não são cadeias adaptativas: cada chamada recebe o mesmo treino e a versão declarada do feedback do pai congelado. A omite feedback; B preserva o contraexemplo atual; C acrescenta x/y, before, predicted e required em cada pixel divergente do primeiro contraexemplo; D acrescenta a instrução para não repetir identidade, preservando NOOP/bloqueios. O pai não é acrescentado como AST ao prompt: mantém-se a estrutura do feedback atual.

Ordem A/B/C/D fixa e intercalada por controle/repetição; não randomizada. Exemplos de identidade permanecem iguais em todas as condições. Dez requests por condição não são dez seeds independentes, nem garantem dez respostas válidas. Houve variação de respostas mesmo com seed/temperatura fixas. Os resultados são descritivos, condicionais ao modelo, evidência, prompt e ordem usados. Não identificam prior interno nem decidem sozinhos entre modelo, prompt e DSL.

## Resultado

|Condição|Requests|Executadas|Mesmo hash do pai entre executadas|Pares divergentes no replay diagnóstico|Células exigidas corretas|Alvos estacionários corretos|Treino PASS|
|---|---:|---:|---:|---:|---:|---:|---:|
|A sem feedback|10|6|6/6|10/16|0/12|6/6|0|
|B atual|10|10|6/10|15/25|0/20|10/10|0|
|C coordenadas|10|6|5/6|7/13|0/12|6/6|0|
|D não repetir identidade|10|10|0/10|15/25|0/20|10/10|0|

São 39 respostas completas, uma falha operacional HTTP500/CUDA em A, sete rejeições de tipo (três A, quatro C) e 32 propostas executadas. Todas as 32 preservam a grade em todos os inputs examinados. Os 47 pares que exigiam mudança falharam; as 64 células que exigiam alteração ficaram incorretas. Os 32 pares estacionários foram corretos, incluindo 15 ações NOOP e 17 movimentos bloqueados. Esses totais repetem os mesmos controles, não representam 79 transições distintas.

O gate original interrompe no primeiro mismatch; o diagnóstico percorre todos os pares para contar erros. Portanto 'pares divergentes' não é o número de eventos FIRST_GRID_MISMATCH emitidos pelo gate. Foram 32 falhas FIRST_GRID_MISMATCH, uma por proposta executada. Taxas condicionais de hash não devem esconder rejeições: sobre todos os dez requests, mesmo hash conta A6, B6, C5, D0.

D produziu um único programa alternativo repetido dez vezes. Evitou o hash anterior, mas não a identidade empírica de grade. B/C também mudaram hashes sem corrigir as transformações. Logo a métrica de hash isolada produziria uma impressão enganosa de progresso. Não há ganho comportamental observado por detalhar o contraexemplo ou instruir não repetir identidade nesta rodada. Isso não refuta esses métodos em outros prompts, modelos ou tarefas, nem demonstra impossibilidade de representação pela DSL.

## Verificação e artefatos

137 testes passaram, incluindo separação de mudança exigida/NOOP e consistência das condições de feedback. Requests completos, respostas, usage, plano, inventário, report e summary em D:/arkhe/output/arc3-feedback-ablation-20261027/. Modelo descarregado e servidor iniciado pela tarefa encerrado. Nenhuma mudança do schema, gate ou política de admissão. Evidência local: LEMMA, restrita a esta execução.

Scripts: run_feedback_ablation.py, summarize_feedback_ablation.py. Não foram feitas chamadas adicionais para repor falhas ou obter dez propostas válidas por condição. O próximo desenho deve tratar exemplos/prompt ou configuração como fatores explícitos e medir comportamento, sem interpretar variação sintática como aprendizado.
