# Auditoria da v4 recebida

O original foi preservado em references/user-mask-diagnostic-v4/original.py e executado apenas em controles sintéticos e casos adversariais de entrada. SELFTEST OK. Não substitui a implementação integrada v2/v3.

## Avanços confirmados

O alvo core é estático: none ∩ border2, 3840 células (60 linhas). Não depende das máscaras aprendidas. Os dois preditores são reportados, os frames são validados e lacunas não geram transições inferidas. O perfil de mudanças é explicitamente um proxy, sem identificação de HUD. O bootstrap declara treino fixo e treinos sobrepostos no OOF.

## Limites e correções necessárias

1. O núcleo da v2 integrada possui 3584 células (56 linhas). Comparar diretamente os números dos dois núcleos troca o alvo. Frame completo continua sendo um alvo válido quando a alegação envolve prever o estado inteiro; seu caráter exigente não autoriza ignorar seus erros.
2. O loader agrupa arquivos por game/episode/level, sem namespace do arquivo nem política. IDs repetidos entre arquivos independentes produzem erro de duplicata; timestamps não sobrepostos poderiam conectar arquivos indevidamente. O teste confirmou o erro de duplicata.
3. IDs são convertidos com int(): o teste confirmou rejeição de seed-A. --split level agrupa por (episódio, nível): o mesmo nível em episódios diferentes pode aparecer no treino e no teste. Isso é generalização entre instâncias, não nível global retido.
4. O formato direto não lê snapshots comprimidos referenciados pelos traces arquivados do Arkhe. Não deve ser aplicado a esses arquivos sem o adaptador validado.
5. issued conta todas as consultas, incluindo unseen e abstained. No restante do projeto issued significa previsão emitida. Normalizar os nomes evita confundir denominadores; aqui answered é o número de previsões.
6. Os intervalos individuais não fornecem o intervalo da diferença pareada entre máscaras. Valores indefinidos são descartados sem informar quantos sorteios restam. Com um grupo, o intervalo pontual não quantifica variação entre episódios. Manter a comparação pareada e a perda seletiva explícita da v3.
7. Em K-fold, degenerate vem apenas da primeira dobra, enquanto máscaras de variância mudam entre dobras. Registrar degeneração, células e digest por dobra. A saída não conserva identidades de grupos nem tallies, limitando a auditoria independente da agregação.
8. As classes de conflito descrevem associação nos dados de treino, sem identificar estocasticidade ou causalidade. A presença de conflitos raw numa chave fundida não exclui que a própria fusão acrescente alvos; raw_only não deve ser interpretado como ausência de dano da fusão.

## Evidência sintética

No controle hud_episode, border2 acerta 224/234 consultas no núcleo, contra 0/234 para none; mode acerta 0/234 no frame completo. No controle flag_row0, mode border2 acerta 120/223 previsões (120/234 consultas), enquanto none acerta 180/180 previsões (180/234 consultas). A informação de borda pode ser necessária mesmo quando não muda ao longo do episódio.

Relatórios: D:/arkhe/output/arc3-user-mask-v4-audit-20261027/synthetic-report.json e audit-receipt.json. Nenhuma nova ação ARC, alteração de política ou submissão Kaggle.
