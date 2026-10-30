# Registro prospectivo de avaliação: cadeia local e replay, sem autenticação externa

27/10/2026. Implementado micro_evaluation_evidence.py e CLI de verificação. Executada nova rodada de dois episódios sintéticos conhecidos,50ações cada, dez de prefixo de aprendizagem e40com learner congelado. Zero chamadas ao LLM, solver Arkhe não executado, nenhuma ação ARC/produção.

## O que foi implementado

Manifesto declarado antes da execução com episódios, horizonte, seeds, código e política. Fontes copiadas para sources/ com hashes. Para cada ação, primeiro é gravado prediction_committed contendo observação before, ação, grade prevista ou abstenção, hashes de código/política/estado do learner e flags de novidade. O writer faz flush e fsync antes de chamar env.step. Depois grava observation_recorded vinculada ao hash do compromisso, com observação posterior e hashes recalculáveis. Não há campos de sucesso antecipado inventados: predicted_win=null/NOT_ESTIMATED e observed_win=null até reward terminal.

Os206eventos incluem início/fim de run e episódios, cem compromissos e cem observações. Cada evento contém seq, previous e hash SHA256 de JSON canônico. Checkpoint local registra contagem, raiz final, digest do manifesto e hash do JSONL. Ele declara signed=false e external_anchor=false. Isso é uma cadeia local própria, **não WorkerExecutionRecord nativo, WormGraph, MMR, InclusionProof ou checkpoint assinado**.

O verificador confere hashes, ordem e pareamento, identidade do episódio/step, ações disponíveis e sequência da política, before/after, partições, flags de novidade, estado do learner e vínculo do código declarado. Reexecuta o ambiente determinístico e o baseline com a versão de ambiente correspondente ao manifesto, reconstruindo predições, transições, congelamento e métricas. Verifica também número de episódios/ações da agenda declarada e ausência de eventos extras. Não executa fontes copiadas do pacote: usa o código confiável do verificador/ambiente instalado e confere sua versão.

## Resultado v2

170testes passaram, incluindo replay prospectivo, truncamento, mutação de evento e rejeição de rótulo falso signed=true. Verificação local completa PASS,206eventos.

|Escopo no sufixo congelado|Consultas|Emitidas|Exatas|Abstenções|
|---|---:|---:|---:|---:|
|Todas|80|72|72|8|
|Não presentes no prefixo usado para fit|77|69|69|8|
|Primeira ocorrência do par na história do episódio|56|49|49|7|

As77consultas ausentes do fit incluem repetições no sufixo. As56primeiras ocorrências são pares novos pela chave de render+ação; não novidade semântica garantida ou amostras independentes. Acerto condicional100%decorre também do consenso de uma família finita fornecida que contém a dinâmica verdadeira, não descoberta livre. Não confundir essas80consultas prequential com os1077probes offline da rodada anterior: são execuções/métricas diferentes.

O manifesto permite reprodução de uma história alegada com seeds e código. A instrumentação foi prospectiva nesta nova rodada, não reconstruída retroativamente para fingir que o piloto anterior já tinha compromissos. A primeira rodada v1foi preservada; v2acrescentou snapshots de fontes, checagem do model_digest/política e rejeição explícita de alegação de assinatura. A rodada/testes finais referem-se a v2.

## O que o anexo atribui além da evidência

**Schema WER.** kernel/arkhe-core/src/worker.rs define WorkerExecutionRecord com module_id/module_version, input_digest/output_digest, evidence_refs, confidence_bps, uncertainty_note, execution_id e bindings opcionais. Os campos específicos de transição do anexo são um payload de avaliação proposto, não esse schema nativo. Integração correta precisaria vincular payloads canônicos usando os mecanismos de digest/validação nativos; não basta produzir JSON parecido. Nenhuma integração nativa ou assinatura foi simulada aqui.

**Holdout.** HoldoutSealed no TLA registra ausência de uma leitura abstrata; não prova acesso bloqueado no Python/OS nem não interferência. O sufixo congelado é separado do fit, mas seus dados continuam no processo do evaluator. Não há MMR privado, cofre de holdout ou processo isolado nesta integração. Colocar dados num MMR não os torna confidenciais.

**Autenticidade e completude externa.** Cadeia/hash/assinatura são garantias distintas. A cadeia detecta alteração relativa ao checkpoint adotado. Se operador reescrever toda a cadeia e seu checkpoint, não há raiz externa para detectá-lo. Mesmo uma assinatura válida provaria vínculo à chave, não veracidade do relato, tempo de predição ou exclusão de outras rodadas ocultas. O run declarado tem contagem verificável, mas não se prova que o operador não executou outros500runs fora dele.

**InclusionProof.** Uma prova de inclusão vincula uma folha a uma raiz. Não demonstra, sozinha, ordem temporal, ausência de folhas/tentativas omitidas, append-only entre checkpoints, independência do dataset ou que o evaluator real executou aquele código. Seriam necessários outros vínculos, protocolo e pressupostos. Checkpoints assinados/publicados e uma agenda externa poderiam ampliar a força da evidência; não foram criados.

**Identificação e causalidade.** A primeira previsão correta, ou mesmo uma sequência de acertos, não prova identificação da regra. Logs não distinguem automaticamente modelo fraco de contaminação de holdout: é preciso especificar/controlar os canais de acesso e o desenho. Não se provou generalização universal ou independência só porque resultados são reprodutíveis.

**Papel de Arkhe.** Nesta integração separamos capacidade do baseline de avaliação. Não é uma definição universal de que toda a arquitetura Arkhe só pode registrar evidência. A validade de um resultado exige ambiente, scorer, dados, protocolo e análise adequados, não apenas infraestrutura criptográfica. MMR/checkpoint Arkhe não são a única forma de tornar dados auditáveis, nem requisito lógico para toda medição local.

**Gates.** Nenhuma política de ContainmentGate foi removida ou relaxada. O toy executa apenas nosso código determinístico e não produz efeitos externos. Isso não justifica desativar contenção numa futura execução de código livre/ações externas. O modelo TLA de ciclos também não se transfere automaticamente para batches reais: faltam estados/controles concretos e refinamento.

## Como verificar

No workspace, executar o Python da venv com o script D:/arkhe/work/arc-agi-3/verify_micro_evidence_cli.py e o diretório D:/arkhe/output/arc3-micro-evaluation-evidence-v2-20261027 como argumento. Ele retorna código0e JSON de resultado local, ou código2com VERIFICATION_FAILED. Não interpreta signed=false como autenticado e rejeita o rótulo signed=true não suportado.

Artifactos v2: manifest.json, events.jsonl, checkpoint.json, sources/ e verification.json. O próprio resultado registra authentication/external_time_or_completeness/holdout_access_isolation=NOT_ESTABLISHED e native_wer_wormgraph=NOT_INTEGRATED.

Classificação LEMMA para execução e verificações locais. Continuam pendentes: vínculo nativo WER/WormGraph, assinatura/identidade/publicação externa, isolamento real de holdout e implantação de um protocolo prospectivo de população de runs. Nenhuma evidência nova de aquisição de objetivo, capacidade do solver, ARC ou AGI.
