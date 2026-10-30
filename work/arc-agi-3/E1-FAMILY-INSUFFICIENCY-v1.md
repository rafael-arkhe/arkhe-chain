# E1 — insuficiência observável da família

Dois controles sintéticos locais executados em 2026-10-27, 50 ações cada. Código: `run_e1_family.py`; saída: `arc3-e1-family-20261027`. Sem LLM, expansão de primitivas, sandbox ou autenticação externa.

## Protocolo fixado

Mesma família fornecida de 120 permutações; dinâmica-base P2 de P0/P1, layout 43, RNG do agente 1000. Política A1, reset seletivo e fallback menos tentadas. Cada caso começa de H0. No passo declarado, o ambiente executa um único salto de duas células, voltando à dinâmica-base nos passos seguintes. O salto usa o primeiro destino válido de [(2,0),(-2,0),(0,2),(0,-2)], sem exigir que a célula intermediária esteja livre. A regra é condicional ao tempo e não pertence à família estacionária fornecida. O agente não recebe a regra verdadeira ou o passo do salto.

Caso imediato: salto no passo 1. Caso com prefixo indistinguível: dez ações da dinâmica-base, salto no passo 11. O prefixo foi fixado em dez, não construído para exigir singleton exatamente em cinco ações. Chegar a singleton é uma observação do run, não uma premissa imposta ao learner.

## Resultado (LEMMA local)

| Caso | Primeiro singleton | Primeira evidência incompatível | OUTSIDE_FAMILY | Previsões após detecção | Fallback após detecção |
|---|---:|---:|---:|---:|---:|
| Imediato | nenhum | passo 1 | passo 1 | 0/49 | 49/49 |
| Prefixo indistinguível | passo 4 | passo 11 | passo 11 | 0/39 | 39/39 |

Nenhuma declaração prematura, atraso zero após a observação discriminativa em ambos. Isso não significa prever a divergência antes de agir: a transição é executada e então filtrada. Nenhum sucesso terminal, 0/2. O fallback foi executado, não demonstrado como resolvedor.

O caso tardio mantém um singleton compatível com o prefixo e perde-o diante do salto; não representa identificação correta da dinâmica global não estacionária. D1 detecta contradição do conjunto corrente; o reset refiltra H0 e continua vazio porque nenhuma primitiva prevê o salto. O diagnosticador do avaliador refiltra separadamente toda H0 e só marca `OUTSIDE_FAMILY` quando a transição inteira não é explicada. Esse rótulo não foi acrescentado ao schema do WER nem ao core de Policy; os eventos `case_diagnostic` são diagnósticos do avaliador. Nos passos seguintes, transições comuns podem ser explicadas por H0, mas o conjunto corrente permanece vazio por política; `NO_CURRENT_HYPOTHESIS` não é confundido com nova evidência fora da família.

## Registro e verificação

Compromissos Writer com flush/fsync antes de cada env.step; observações vinculadas por hash; atualização e diagnóstico registrados depois. Manifesto e snapshots gravados antes dos casos. Escrita em C: e cópia ao workspace para evitar a latência observada anteriormente em D:. Replay completo dos 100 passos: `LOCAL_FULL_REPLAY_VERIFIED`, fontes, hashes, ações, transições, learner e agregados conferidos. Teste integrado executa ambos os casos, verifica persistência do vazio, ausência de detecção prematura, fallback, singleton anterior à divergência e replay.

São duas fixtures construídas para conter uma transição inequívoca, não uma estimativa de sensibilidade em população diversa. Nenhum caso prova detecção universal de mudança fora da família. Se uma regra externa produzir apenas observações compatíveis nos estados visitados, o teste não autoriza declará-la incompatível. Prefixo indistinguível não testa navegação para buscar ativamente evidência: o salto está agendado e ocorre qualquer que seja a ação.

Abstenção persistente após um único salto é uma decisão conservadora já especificada, não prova de que todas as transições posteriores sejam impossíveis de prever. Nenhuma recuperação de família nova foi implementada. P1, ARC-AGI-3, RHAE e AGI não são reavaliados aqui. Nenhuma alegação de autenticidade externa ou completude absoluta de runs.

## Reprodução

Com o venv, neste diretório: `python run_e1_family.py <diretório-novo>`; `python run_e1_family.py verify <diretório>`. O pai deve existir. O verificador exige fontes instaladas iguais aos snapshots; não executa snapshots arbitrários.
