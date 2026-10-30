# D2-start — três inícios pareados sob A1

Piloto exploratório executado em 2026-10-28. Código `run_d2_start.py`, pacote `arc3-d2-start-20261028`. Três episódios, 150 ações. Não é uma comparação populacional ou confirmação independente de generalidade.

## Protocolo

Reutiliza o controlador de D2-A1 e muda apenas o início: (1,1), (2,2), (0,3). Mesmo mapa 8×8 com parede (3,3), marcadores 3=(0,0) e 4=(7,7). P2 unitário exceto ACTION2, salto à direita com intermediária e destino livres sob J2. Família candidata J1 de 600 hipóteses fornecida, A1 uniforme, seed 0, horizonte 50, orçamento de exploração 20. Após singleton dentro do orçamento, BFS até alvo diagnóstico 4, seguido da ação estacionária aprendida. Recompensa original ligada à cor 3. Sem RESET ou reabertura de H.

O runner não modifica o módulo antigo: usa o mesmo bytecode com namespace isolado, substituindo apenas a criação do ambiente para ajustar a posição inicial. Um observador de escrita registra visitas e origens de ACTION2; essas métricas não são entregues ao agente. A e B são critérios exclusivos do avaliador.

## Resultado (LEMMA local)

| Início | Visitou A | ACTION2 em A | Visitou B / ACTION2 em B | Primeiro singleton | Primeiro H vazio | Chegada ao alvo |
|---|---:|---:|---:|---:|---:|---:|
| (1,1) | não | não | não / não | 5 | nenhum | 15 |
| (2,2) | não | não | não / não | 5 | nenhum | 12 |
| (0,3) | sim, passo 5 | não | não / não | 6 | nenhum | 14 |

Permanência após chegada: 100% nos três casos. Recompensa: 0/1 por caso, 0/3 no total, pois alvo diagnóstico era 4. Previsões emitidas/exatas: 45/45, 45/45 e 44/44, respectivamente; 16 abstenções nos 150 passos. Nenhuma falha de planejamento. Um candidato J1 permaneceu compatível ao final de cada trajetória; singleton não identifica a verdadeira J2 global.

O contraste mais informativo é (0,3): o ator visitou A mas não executou a ação discriminativa nela. Posição alcançada não equivale a restrição observada. A1 escolheu outra ação e a navegação posterior chegou ao alvo sem contradizer o modelo J1. Nenhuma trajetória visitou B. As posições de origem distintas foram 14,12,11, incluindo observação inicial e estados posteriores.

## Acesso geométrico e interpretação

Testes de semântica confirmam: (2,2)+ACTION3 chega a A; (0,3)+ACTION2 chega a A; (1,3)+ACTION2 permanece porque o destino (3,3) é parede. Essas ações de controle não foram impostas ao piloto. O trecho descartado do anexo sobre (3,2) também estava errado: ACTION4 sobe para (3,1), mantendo x=3; ele não foi incluído como condição.

Os resultados demonstram trajetórias dependentes do início sob política/seed fixas, mas não uma causa única ou incapacidade universal de A1. Aproximar o início não bastou nestes três casos. Não se chama baseline de azar, não se atribui o resultado a representação incorreta sem evidência, e não se promete que varrer mapa resolverá.

## Evidência

O core de D2 compara o conjunto online completo em cada passo com a interseção de restrições calculadas sem Policy.observe; também verifica replay batch da mesma trajetória. Concordância em 150/150 passos, com as dependências de render/advance compartilhadas já declaradas. O replay completo dos três ambientes, decisões, hipóteses, visitas e agregados retorna `LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED`. Isso valida essas execuções, não ausência geral de bugs.

Manifesto e snapshots antes do run, compromissos Writer com flush/fsync antes de env.step. Escrita em C: e cópia ao workspace em D: por latência de fsync conhecida. O teste integrado com os três inícios foi executado antes do piloto e é declarado; não equivale a replicação independente. Dois novos testes cobrem caminhos físicos de uma ação e integração/replay, incluindo relação entre execução e visita.

Sem LLM, objetivo aprendido, síntese de primitivas, WER nativo, WormGraph, AppContainer, assinatura, âncora externa ou alteração de gate. Autenticação histórica e isolamento de holdout não estabelecidos. Nenhuma política sweep foi implementada nesta rodada.

## Próximo teste possível

Comparar uma política de cobertura explicitamente definida com A1, no mesmo mapa/inícios/seeds e orçamento. Se A/B forem usados como metas fornecidas, chamar o experimento de controle guiado, não exploração livre. Se o objetivo for detecção genérica, registrar também qualquer histórico incompatível gerado sem esses dois pares específicos. O resultado ainda dependerá da dinâmica, início e orçamento.

## Reprodução

Com o venv neste diretório: `python run_d2_start.py <diretório-novo>`; `python run_d2_start.py verify <diretório>`. O pai deve existir. Sem sobrescrita. Fontes instaladas precisam corresponder aos snapshots; o verificador não executa snapshots arbitrários.
