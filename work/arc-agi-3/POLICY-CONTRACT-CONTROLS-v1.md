# Controles do contrato de políticas — v1

Implementação offline em `policy_contract_controls.py`, com seis testes em `test_policy_contract_controls.py`. Não é coleta C00–C11, agente completo ou sandbox Windows.

## Semântica implementada

Família fornecida: 120 permutações bijetivas dos cinco deslocamentos. Hipóteses de mecânica são permutações completas, não cinco conjuntos independentes: isso preserva a restrição de bijeção. Objetivos: {3,4}. O mapa corrente é fornecido pelo chamador a cada transição; não há transferência de posições entre layouts.

D1 dispara quando um conjunto de mecânicas anteriormente não vazio fica vazio. D2 usa compatibilidade com recompensa binária terminal; `None` não filtra, e recompensa zero fora dos marcadores preserva ambas as hipóteses. O reset restaura ambas as famílias iniciais e filtra novamente com a mesma observação. Essa escolha descarta também conhecimento de objetivo quando só a mecânica contradiz, e vice-versa; não foi comparada com resets seletivos. P-carry nunca reabre um conjunto vazio.

O fallback usa a ação menos tentada, desempate por RNG privado semeado e incremento da contagem após a escolha. A contagem é reiniciada em `start_episode`. É uma primitiva de fallback, não uma política completa de exploração/planejamento. Não há runner prospectivo novo: o módulo recebe transições já observadas. O registro anterior com Writer continua disponível, mas a integração dessas políticas com `env.step` ainda não foi executada.

## Casos executados

- T1: layouts 1000 e 1100, mesma permutação; sem D1 e hipótese preservada.
- T2: troca left/up indistinguível no canto; sem alarme na transição bloqueada, alarme quando a observação distingue as regras.
- T3a: P-reset recupera hipóteses de H0 e reaproveita transição contraditória.
- T3b: P-carry fica vazio, abstém e percorre as cinco ações menos tentadas; D1 não se repete com conjunto vazio.
- T3c: salto de duas células não explicado por H0; ambos permanecem sem hipótese.
- Objetivo: ausência de recompensa e zero fora do marcador não disparam D2; recompensa contraditória sobre marcador restaura e filtra os objetivos.
- Invariância P-carry: 20 ações de fallback e resultados internos iguais com flag ausente/presente, mesmas seeds. A comparação exclui o próprio campo da flag; não testa uma execução completa do ambiente.
- Alarmes: associação causal à mudança mais recente em [alarme-W, alarme], sem associar alarme anterior a mudança futura; duplicados separados de falsos alarmes. W é parâmetro e não foi fixado para coleta confirmatória.

Seis métodos de teste passam. São controles finitos e específicos, não prova de correção completa ou de capacidade. Nenhuma chamada LLM, modificação de gate, assinatura, ancoragem ou configuração de ACL/SACL/AppContainer.

## Pendências antes do experimento

Fixar calendário de mudanças, W, política de ação com hipóteses ainda ambíguas, navegação, controle dos episódios/objetivos e momento de entrega de `task_changed`. Integrar previsões comprometidas antes de `env.step` e observações vinculadas depois. Uma flag entregue antes da primeira ação pode permitir reset preventivo; tratá-la apenas após a ação é outra intervenção e deve ser explícita. A janela simétrica do anexo foi substituída pela associação causal acima para não perdoar alarmes antecipados por proximidade com mudanças futuras.
