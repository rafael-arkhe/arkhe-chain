# LaneIsolationSeq: Live2 agora passa

27/10/2026. O anexo foi extraído e preservado sem alterar suas definições em formal/seq-v1/LaneIsolationSeq.tla. Executado check_lane_sequential.py, reutilizando o executor parametrizado da matriz. Nenhum módulo anterior foi substituído e nenhum runtime/LLM foi executado.

## Resultado real

Com MaxVer3 e Bugs={}, Live1 PASS e **Live2 PASS**, ambos sob LiveSpec. Live2 com WF_vars(Repair) adicional também PASS. A matriz de42células por singleton reproduziu33PASS e9FALSIFIED, igual à anterior. Mais três testes de liveness e um de deadlock padrão:46resultados esperados confirmados.

Os comentários do anexo que dizem 'Live2 esperado FALHA', 'resultado observado FALSIFIED' e 'versão boa abandonada por Propose/Repair antes de Promote' pertencem ao modelo anterior. Não descrevem esta versão sequencial e não foram aceitos como resultados do novo módulo. Os artefatos originais permanecem intactos para rastreabilidade; este relatório fornece a correção.

## Por que a propriedade mudou

NewVersion agora exige stage NONE/REJECTED/ADMITTED. Propose e Repair ficam ambos desabilitados em CANDIDATE/PROVISIONAL. A versão corrente não pode ser substituída antes do julgamento. RejectDev e RejectHold permitem avançar após uma falha, e ambas as ações têm fairness fraca em LiveSpec.

Assim, uma versão boa que chegue a CANDIDATE fica estável enquanto Promote está continuamente habilitada; em PROVISIONAL fica estável enquanto Admit está habilitada. A fairness impede stuttering eterno nesses pontos. Versões ruins são rejeitadas sob a fairness correspondente e a enumeração limitada avança. Isso difere do guard apenas em Propose testado antes: aqui a restrição está em NewVersion e afeta também Repair.

Essa explicação é argumento de leitura do protocolo, não prova parametrizada produzida por TLAPS. A evidência mecânica é limitada a MaxVer3. O modelo não demonstra que um LLM real gerará um candidato bom: todas as versões/veredictos já são fixadas em Init, e o protocolo percorre esse universo finito. Admissão eventual também não equivale a melhoria do score ou efeito de produção eventual para cada versão.

## Configuração e escopo

Os42configs da matriz checam cada propriedade separadamente; configs que listam várias violações não garantem vários nomes no log. Os configs de safety/liveness gerados declaram CHECK_DEADLOCK FALSE. O teste sem esse ajuste continua detectando deadlock no término, após esgotar versões rejeitadas, agora no estágio REJECTED. Logo o safe.cfg colado sem essa declaração não termina globalmente como 'sem erros' no checker padrão.

O wrapper adicional declara RepairFairSpec == LiveSpec /\\ WF_vars(Repair), e seu cfg usa SPECIFICATION RepairFairSpec. Repetir apenas SPECIFICATION LiveSpec sem substituir sua definição não acrescentaria a hipótese de fairness. O cfg do anexo, isoladamente, não materializa essa mudança.

A nova serialização não acrescenta best. LaneIncumbent.tla e a fachada LaneIsolationWithBest.tla já existem separadamente. Seleção por score, pai de reparo e vínculo gateVer=frozen não devem ser sobrescritos pela repetição do patch com máximo sobre versões futuras. Este módulo testa disciplina de julgamento sequencial, não retenção do melhor candidato.

## Holdout e implementação

HoldoutSealed ainda mede apenas ausência de leitura direta em repairReads. RejectHold depende do holdout e habilita novas propostas/reparos; portanto decisões de rejeição podem influenciar o futuro do loop. Não se deve chamar essa propriedade de não interferência ou selagem completa de feedback. Não há orçamento de consultas ao holdout, isolamento de processo, vínculo de bytes de AST ou prova de refinamento Rust.

Os gates permanecem oráculos, e o comentário 'desconhecidos do pipeline' não formaliza conhecimento. Nenhum THEOREM empírico sobre AGI, síntese ou generalização decorre do PASS.

## Artefatos

D:/arkhe/output/arc3-lane-sequential-20261027/report.json contém matriz, comandos e comparação esperada dos46casos. Logs separados para cada caso; configs em formal/seq-v1/. SHA256 do módulo e jar registrados, hash do wrapper adicional também. Nenhuma nova geração e nenhum candidato real admitido. Classificação: LEMMA das verificações finitas locais.
