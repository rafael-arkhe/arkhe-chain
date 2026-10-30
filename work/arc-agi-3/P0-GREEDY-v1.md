# P0 — exploração greedy pareada

## Resultado executado e reexecutado

| Condição | Cobertura | Acerto ITT em pares novos | Erro entre emitidas novas | Sucesso terminal |
|---|---:|---:|---:|---:|
| C00 reset sem flag | 2489/2500 (99,56%) | 1176/1189 (98,91%) | 2/1178 | 0/50 |
| C01 reset com flag | 2489/2500 (99,56%) | 1176/1189 (98,91%) | 2/1178 | 0/50 |
| C10 carry sem flag | 996/2500 (39,84%) | 472/1189 (39,70%) | 1/473 | 0/50 |
| C11 carry com flag | 996/2500 (39,84%) | 472/1189 (39,70%) | 1/473 | 0/50 |

Nas quatro condições, mecânica singleton após cinco ações no primeiro episódio. C00/C01 executam dois resets e terminam com uma mecânica; alarmes nas duas fronteiras têm atraso zero na indexação por ação (detectados após a primeira ação da tarefa nova). Não significa detecção antes de agir. C10/C11 detectam a primeira mudança, ficam vazias e não detectam a segunda dentro de W=3: D1 deliberadamente não dispara sobre vazio. Nenhum falso alarme ou duplicado segundo a associação operacional neste run.

Todos terminam com duas hipóteses de objetivo e zero sucessos. Não houve aquisição incidental de objetivo. Sob a semântica binária, ausência de redução implica que nenhum terminal observado distinguiu os marcadores; recompensa zero sozinha não aprende a cor correta. O piloto não testa política orientada ao objetivo.

C10/C11 possuem digest comportamental idêntico. C00/C01 possuem as mesmas métricas de desempenho, mas D3 difere por construção nos registros internos: não se reivindica identidade de todos os eventos. O sinal não melhorou métricas aqui, pois D1 já disparou na primeira ação de ambas as fronteiras.

Verificação completa: `LOCAL_FULL_REPLAY_VERIFIED`, 200 episódios e 10.000 ações, fontes/snapshots/manifesto/eventos/agregados conferidos. Autenticação e isolamento de holdout: `NOT_ESTABLISHED`. O run completo é uma observação pareada por condição, não replicação independente entre famílias.

Protocolo exploratório, não pré-registro externo nem coleta confirmatória. Executado em 2026-10-27 por `run_p0_greedy.py`.

## Contrato

Quatro condições C00/C01 (reset seletivo sem/com flag) e C10/C11 (carry sem/com flag). Cinquenta episódios por condição: R1 1–20, R2 21–40, R3 41–50. Horizonte 50; 200 episódios, 10.000 ações no total. Família fornecida de 120 permutações dos cinco deslocamentos. Objetivo verdadeiro constante, cor 3, não fornecido à política. Hipóteses de objetivo atualizadas só pelo terminal, sem influência na escolha de ações.

ACTION1–5 rotuladas U,D,L,R,S. Permutações reais seguem a tabela do anexo, não seu nome geométrico: P1=(U,D,L,R,S), P2=(L,R,D,U,S), P3=(D,U,R,L,S). P2 não é uma rotação anti-horária de 90 graus. Layouts 42/43/44, compartilhados dentro de cada tarefa; RNG privado do agente reiniciado com 1000+i a cada episódio i zero-based. Seeds 2000+i registradas como não usadas: o ambiente é determinístico. Reiniciar RNG e contagens por episódio não reinicia hipóteses.

Em cada passo A1 escolhe informação imediata sobre mecânica; no conjunto vazio usa menos tentadas. Não há busca de caminho ou perseguição de marcador. Mapas são reconstruídos em cada episódio. Nas fronteiras, a flag genérica é entregue após a primeira ação; no reset seletivo D3 reabre ambas as famílias. P-carry ignora a flag. Não há sinal no primeiro episódio.

W=3; mudanças no índice global zero-based 1000 e 2000 por condição; alarmes associados causalmente. Omissão significa não detectada nessa janela. Alarmes posteriores não associados são classificados como não associados pela regra operacional, não como demonstração de ausência de causa real.

## Evidência e métricas

Manifesto e snapshots precedem o run. Writer grava e fsync antes de env.step; observação e atualização vinculam o compromisso. Verificador reexecuta todo o run, ações, learner, cadeia e agregados com fontes locais correspondentes aos snapshots. Não executa snapshots arbitrários. Hashes de fontes documentam a versão; não atestam execução histórica contra operador malicioso.

Predição é consenso; abstenção conta como zero no acerto ITT. Novidade é par bruto (grade,ação) ausente antes no mesmo episódio, antes de atualização online. Não é holdout congelado ou selado, nem novidade semântica. Erro condicional pode incluir erros nas fronteiras, quando a verdade deixa de estar no conjunto anterior. Hipóteses singleton são relativas à família fornecida. Campos de primeiro singleton por episódio indicam primeiro passo observado nessa condição, não necessariamente uma nova aquisição (pode ter sido herdado do episódio anterior).

Comparação C10/C11 usa digest dos estados, ações, previsões, resultados de detector e recompensas; exclui IDs de condição, flag entregue e hashes de evidência que diferem por construção.

## Tentativas e escopo

A primeira tentativa `arc3-p0-greedy-20261027` em D: foi interrompida por latência de fsync e preservada com `INCOMPLETE.txt`. Nenhum resultado parcial determinou escolha de política. A repetição usa o mesmo protocolo/seeds/fontes, escreve em C: e é copiada para `arc3-p0-greedy-complete-20261027` no workspace. Isso é uma repetição declarada, não um run único sem tentativas anteriores.

AppContainer, ACL/SACL, assinatura, WER nativo, WormGraph e âncora externa permanecem não integrados. Nenhuma chamada LLM. Nenhuma conclusão de generalização entre famílias, transferência ARC ou AGI.

Mecânica e layout mudam juntos nas fronteiras: objetivo constante não isola causalmente a mecânica de todas as outras mudanças. T1 é controle separado de invariância ao layout; não substitui uma ablação fatorial de layouts neste run.

## Reprodução

`python run_p0_greedy.py <diretório-novo>` e `python run_p0_greedy.py verify <diretório>` neste diretório usando o venv. O pai precisa existir. O segundo comando verifica a cadeia inteira, episódio por episódio e passo por passo, e gera verification.json. Dois novos testes cobrem mapeamento das regras, smoke de 12 episódios, replay, invariância e rejeição de adulteração. Suíte completa: 188 testes PASS.
