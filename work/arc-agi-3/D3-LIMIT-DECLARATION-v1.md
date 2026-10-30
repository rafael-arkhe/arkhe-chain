# Declaração de limite após D3-hybrid

Registrada em 2026-10-28. Esta rodada consolida o escopo; não executa novo piloto, restauração ou política contínua com retorno. A suíte mais recente permanece 207 testes PASS, resultado da rodada anterior, não uma nova execução.

## Evidência estabelecida

Nos episódios ativos D2-A1/D2-start/P-pairs registrados, a política não coletou uma transição que rejeitasse a família J1 fornecida. Um candidato J1 permaneceu compatível com cada histórico examinado, embora a dinâmica verdadeira J2 fosse globalmente diferente. Online e referência passiva concordaram nos conjuntos nas trajetórias testadas; não se demonstra correção universal ou independência semântica total.

O controle passivo J2 e o contrafactual D3-hybrid mostram uma evidência suficiente. Na posição A=(2,3), ACTION2 sob J2 permanece por parede intermediária. Isoladamente a transição tem 216 candidatos; conjugada ao prefixo real até a ação 5 elimina os dois sobreviventes, e conjugada ao prefixo até a ação 6 elimina o singleton. O controle J1, que salta, preserva dois/um. D3 é uma análise offline com a verdade do avaliador, não observação nova ou capacidade demonstrada de produzir a transição.

## Limite declarado

A política atual não gerou evidência de rejeição nas execuções examinadas. Não se conclui que nenhuma seed, início, orçamento ou política conseguiria fazê-lo. Tampouco se identifica causa única: escolha de ação, objetivo de exploração, família fornecida, regime de planejamento, orçamento e estados visitados interagem.

Não se afirma que o agente descobriu J2. Rejeitar J1 significaria apenas ausência de candidato que explique o segmento de histórico tratado como estacionário. Não há expansão autônoma, síntese de hipótese ausente, evidência de generalização ARC ou AGI nesta sequência.

## Correções ao anexo

- Intervalo 4–12 não excede 14. As estimativas 1–3 retornos, 4–12 no total ou 4–12 por teste não foram medidas e não podem ser intercambiadas. Com quatro testes e retornos de 1–3 ações depois de cada um, a soma seria 8–16, mas isso é apenas aritmética condicional, não custo comprovado de uma trajetória.
- Para rejeitar os sobreviventes no prefixo real, quando o ator já está em A, basta o teste ACTION2, uma ação adicional (ação 6 ou 7 conforme o prefixo). Não é necessário esgotar todas as ações ou retornar antes desse teste. Isso não demonstra que uma política genérica escolheria essa ação, nem satisfaz um teste geral de exaustão local.
- Após o prefixo 5, nenhuma ação foi executada a partir de A ainda. Após o prefixo 6, ACTION5 foi executada em A. Logo, para cobertura local, as ações pendentes após o prefixo 6 seriam ACTION1–4, não ACTION2–5. Ações testadas em outras posições não equivalem a teste do mesmo par em A.
- Preservação pelo controle J1 é um teste específico contra rejeição indiscriminada, não prova de ausência de artefato ou bug em todo o filtro.
- Contagens do controle executado, como 216 e dois/um para zero, são LEMMA local. A ausência de demonstração de causa exclusiva não é refutação da hipótese causal.
- Guardar explicitamente A como referência fornecida pelo avaliador caracteriza controle guiado. Para exploração livre, a escolha de referências deve ser uma regra genérica que não receba o estado crítico como resposta.

## Trabalho não realizado

Nenhuma nova ação ambiental ou análise de custos de retorno nesta rodada. Não foi implementada D3-continuous, cobertura exaustiva de estados, restauração instantânea ou teste guiado executado de ACTION2 em A. Não se usa a especulação de custo para declarar inviabilidade dessas opções.

Autenticidade histórica externa, isolamento adversarial de holdout, WER nativo, WormGraph, assinatura e ancoragem continuam não integrados nos pilotos. Hash/replay local e snapshots têm os limites já registrados nos relatórios.

## Referências locais

- `D2-ACTIVE-J2-v1.md`: execução ativa inicial.
- `D2-START-v1.md`: três inícios, visita versus execução de ação.
- `D2-PAIRS-v1.md`: maior cobertura sem evidência de rejeição.
- `HISTORY-FAMILY-CONTROL-v1.md`: transições isoladas versus conjunção.
- `D3-HYBRID-v1.md`: ramos contrafactuais nos prefixos reais.

Esta declaração encerra apenas a rodada de análise. Não transforma o limite observado em impossibilidade e não inicia outra coleta automaticamente.
