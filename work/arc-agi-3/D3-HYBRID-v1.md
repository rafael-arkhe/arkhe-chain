# D3-hybrid — ramificação contrafactual de prefixos reais

Controle offline executado em 2026-10-28. Código `run_d3_hybrid.py`, pacote `arc3-d3-hybrid-20261028`. Zero ações novas no ambiente, quatro restrições contrafactuais. Não é restauração de ambiente nem continuação real da trajetória.

## Fonte e desenho

Fonte: D2-start em (0,3), seed 0. Cadeia completa de 251 registros conferida; hash SHA-256 dos bytes do log e head final registrados. Prefixos até as observações após as ações 5 e 6: em ambos, ator em A=(2,3). O prefixo 5 tem dois candidatos H025_2/H100_1; o prefixo 6 tem apenas H025_2 após a ação real ACTION5.

Para cada prefixo, construir uma ramificação alternativa: ACTION2 em A sob J2, permanece porque a intermediária (3,3) é parede; e um controle J1, que salta até (4,3) livre. Filtrar apenas o prefixo escolhido mais a restrição alternativa. Não anexar o restante da trajetória original, que foi gerado após outras decisões. Os dois prefixos são análises relacionadas da mesma trajetória, não episódios independentes.

## Resultado (LEMMA local)

| Prefixo | Candidatos antes | Após ramo J2 permanece | Após controle J1 salta |
|---|---:|---:|---:|
| Até ação 5 | 2 | 0 | 2 |
| Até ação 6 | 1 | 0 | 1 |

Todos os candidatos sobreviventes preveem o mesmo resultado para ACTION2 em A: salto sob J1. A resposta construída de permanência elimina todos. Isoladamente, a permanência seria explicada por 216 candidatos de H0; ela só é incompatível com o prefixo já observado. A transição J1 de salto é explicada por 24 candidatos de H0, mas preserva apenas os dois/um que já sobreviviam ao prefixo.

Este controle confirma que aquela resposta alternativa bastaria para rejeitar a família no contexto desses prefixos. Não mostra que a política poderia selecioná-la, que executá-la manteria o restante do comportamento, que havia custo suficiente para retorno, nem que ausência de seleção seja causa exclusiva do resultado original. O efeito foi calculado com a dinâmica verdadeira conhecida pelo avaliador, não aprendido ou observado numa nova execução.

## Evidência e verificação

Manifesto e snapshots antes da análise. Copiados log, relatório e manifesto originais para source-trace/; o verificador usa essa cópia e não depende do caminho original para recomputar. O caminho original permanece no manifesto apenas como proveniência declarada. O head de referência vem do relatório local copiado, não de testemunha externa. Detecta alteração relativa à referência, não reescrita integral pelo operador.

`LOCAL_COUNTERFACTUAL_RECOMPUTED`: cadeia de fonte, heads de prefixo, conjuntos de candidatos, resultados construídos, snapshots/fontes e agregado conferidos. A análise usa fontes instaladas correspondentes aos snapshots; não executa fontes arbitrárias do pacote. Ela não reexecuta todas as ações reais do ambiente original: o replay ambiental de D2-start foi executado na rodada anterior; esta verificação trata cadeia/constraints do prefixo e contrafactuais. Não há afirmação de compromisso anterior a uma observação real para os ramos sintéticos.

Um teste novo usa o artefato retido D2-start como fixture de integração e confere dois/um candidatos antes, uma saída prevista por todos, 216 candidatos para permanência isolada, vazio após prefixo+permanência, preservação após salto e zero ações. Esse teste depende do artefato retido estar disponível e não constitui teste hermético sem arquivos. Escrita em C: e cópia a D: por latência conhecida de fsync.

## Limites e próximo passo

A evidência discriminativa específica já tinha suporte no controle passivo anterior; esta análise liga-a ao conjunto efetivamente sobrevivente de uma execução ativa. Não descobre J2, não identifica a dinâmica real entre alternativas ausentes e não constitui prova geral do filtro. D3-continuous seria uma nova escolha de experimento, não consequência lógica obrigatória. Se A for uma meta explicitamente fornecida, chamar o teste de guiado; para exploração livre, a seleção do estado de referência não pode usar a coordenada crítica fornecida pelo avaliador.

Um resultado diferente do previsto exigiria inspecionar os conjuntos e o contexto antes de atribuir bug: um prefixo diferente pode legitimamente preservar outros candidatos. Aqui os sobreviventes foram enumerados, o que torna o resultado verificável neste caso.

Sem LLM, intervenção no ambiente, nova política, AppContainer, WER nativo, WormGraph, assinatura, âncora externa ou mudança de gate. Sem evidência de resolução fora da família, transferência ARC ou AGI.

## Reprodução

Com o venv neste diretório: `python run_d3_hybrid.py <diretório-D2-start> <novo-diretório>`; `python run_d3_hybrid.py verify <diretório>`. Pais devem existir. Sem sobrescrita. O pacote inclui a fonte da trajetória necessária à recomputação offline.
