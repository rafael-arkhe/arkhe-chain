# D2-A1 — trajetória ativa J2 e replay passivo da mesma evidência

Executado em 2026-10-28. Código `run_d2_active.py`, pacote `arc3-d2-active-20261028`. Uma trajetória contínua, seed 0, 50 ações. Não se trata de coleta populacional, detecção universal ou identificação de J2.

## Contrato executado

Mapa 8×8, parede (3,3), marcador 3 em (0,0), marcador 4 em (7,7), início (1,1). Cinco ações, sem RESET. P2 unitário (L,R,D,U,S), exceto ACTION2: salto de duas células para direita exige intermediária e destino livres, caso contrário permanece. Dinâmica fixa no episódio, verdadeira regra não fornecida à política.

Agente recebe grid, ações, passo, done e recompensa terminal. Família J1 simétrica de 600 candidatos fornecida desde o início, sem J2. A1 uniforme, seed 0; orçamento 20 antes de desabilitar planejamento; se singleton no orçamento, BFS sobre o modelo aprendido até alvo diagnóstico 4, depois ação estacionária. No vazio, fallback menos tentadas. Não há reabertura de H: diagnóstico sobre a conjunção do episódio inteiro. Alvo 4 é fornecido como tarefa de navegação, não objetivo aprendido; recompensa original exige cor 3.

Coordenadas A=(2,3) e B=(2,5) são usadas apenas pelo avaliador para conferir execução de ACTION2. Não são dadas ao agente como metas. A posição da parede já está visível no grid; não se reivindica segredo sobre o mapa.

## Resultado (LEMMA local)

| Critério | Observação |
|---|---|
| C1 ACTION2 em A | não ocorreu |
| C2 ACTION2 em B | não ocorreu |
| C3 histórico incompatível | não; 1 candidato ao final |
| Primeiro singleton J1 | passo 5 |
| C4 conjuntos online/passivo | iguais nos 50 passos |
| C5 primeira chegada ao alvo | passo 15 |
| C6 permanência após chegada | 35/35 |
| C7 recompensa terminal | 0 |
| Emitidas/exatas | 45/45 de 50 consultas |
| Falha de planejamento | nenhuma |

O candidato sobrevivente H025_2 é P2 com ACTION2 saltando sob J1. É compatível com toda a trajetória, embora não seja a dinâmica verdadeira J2 em todos os estados. Singleton não é certificado de verdade fora da evidência observada. Não houve dado que obrigasse o learner a rejeitar esse candidato.

ACTION2 foi executada apenas a partir de (0,1), (1,1), (3,1) e (5,1). Esses saltos não testam a parede da linha 3. O ator teve 14 posições de origem distintas na trajetória, não cobertura do mapa. Não se chama essa execução de teste positivo de detecção: ela mostra ausência de evidência de rejeição naquela trajetória e concordância entre os filtros sobre essa evidência.

## Acesso aos estados — auditoria posterior do avaliador

Uma BFS privilegiada sobre a dinâmica verdadeira, executada após o run e não fornecida ao agente, encontrou 63 posições livres alcançáveis. A pode ser alcançada em quatro ações a partir do início: ACTION1,ACTION2,ACTION3,ACTION3. B em seis: as mesmas, mais ACTION3,ACTION3. Executar ACTION2 a partir dessas posições produz o contraste passivo. Os caminhos estão em `post_run_audit.json`.

Isso exclui inacessibilidade física dessas posições nesta fixture, mas não prova qual política encontrará as duas observações sob orçamento. A1/busca de alvo desta trajetória não as produziu. Não se atribui causa exclusiva a exploração greedy sem comparação controlada com outros controladores e seeds.

## Verificação da conjunção

O filtro online usa Policy com eliminação sem reset. Um cálculo de referência separado constrói, sem chamar Policy.observe, o conjunto de candidatos J1 compatíveis com cada transição e intersecta todos os conjuntos do prefixo. Compara o conjunto completo, não só a contagem, em cada passo. Outro replay em batch sobre a mesma trajetória repete a filtragem e confere os digests online. A implementação compartilha representação/render/advance J1 entre os caminhos de verificação; isto limita independência semântica. O gerador do salto J2 usa intermediária e destino explicitamente.

Concordância nesta execução não prova que não há bug em outros históricos. Tampouco um teste passivo que rejeita outra trajetória impõe rejeição desta. O controle passivo anterior continua distinto, com ACTION1 para direita como efeito fornecido naquele controle; neste ativo a ação relevante é ACTION2, coerente com P2.

Manifesto e snapshots antes da execução. Compromisso Writer com flush/fsync antes de env.step; observação/atualização/diagnóstico vinculados. Replay de todo o episódio e agregados: `LOCAL_ACTIVE_AND_PASSIVE_REPLAY_VERIFIED`, 50 ações. A auditoria BFS é pós-coleta e não integra uma prova de anterioridade. Escrita em C: e cópia para D: por latência de fsync conhecida.

Dois novos testes: semântica de ACTION2 nas duas posições e ACTION1 unitária, ausência de RESET; execução contínua com comparação de conjuntos e replay. Não há teste de D2-sweep, outros inícios ou outras seeds. O teste integrado e o piloto são runs declarados, não confirmações independentes.

Sem LLM, aprendizagem de objetivo, expansão de primitivas, WER nativo, WormGraph, AppContainer, assinatura, âncora externa ou alteração de gate. Autenticação histórica e isolamento de holdout não estabelecidos. D2 não demonstra identificação da verdadeira J2, detecção universal, capacidade ARC ou AGI.

## Reprodução

Com o venv neste diretório: `python run_d2_active.py <diretório-novo>`; `python run_d2_active.py verify <diretório>`. O pai deve existir; não sobrescreve. Fontes instaladas precisam corresponder aos snapshots; nenhum snapshot arbitrário é executado pelo verificador.
