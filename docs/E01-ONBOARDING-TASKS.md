# E01 — tarefas pendentes de onboarding

Prioridade vigente: finalizar reprodução em VM limpa e estudo exploratório C01.
Pesquisa Flock permanece separada, NOT_REPRODUCED, sem mudanças em dependências,
carteiras, perfil MMR ou materiais já fixados. Este registro não é autorização
para contatar pessoas ou publicar material comercial.

Responsável informado: admin para operação, observação e revisão; revisão dos
materiais aprovada em 21/10/2026 e independência não estabelecida. Sessões humanas NOT_RUN. O ensaio de
seis checks em outra pasta do mesmo host continua sendo apenas ensaio técnico.

| ID | Entrega | Estado | Dependências | Aceite/evidência exigida |
| --- | --- | --- | --- | --- |
| ONB01 | Fixar materiais C01 | DONE | — | ZIP, tutorial, fixtures, entrypoints e critérios vinculados aos hashes do registro da coorte; digest do ZIP conferido novamente. |
| ONB02 | Revisão humana por admin | DONE | ONB01 | Leitura, aprovação, data declarada 2026-10-21T15:48:36Z e ressalvas registradas em docs/evidence/2026-10-21-e01-operator-review/operator-review.json; mesma identidade nas três funções, sem independência. |
| ONB03 | Selecionar ambiente Windows x64 limpo | PENDING_ENVIRONMENT | ONB01 | Identificar VM/hipervisor, build e imagem de origem disponível; inventário de comandos local inconclusivo, sem provisionar ou instalar automaticamente. |
| ONB04 | Preparar isolamento e snapshot S0 | NOT_RUN | ONB03 | Conta exclusiva, estado inicial inventariado, snapshot identificado, sem discos/pastas graváveis ou clipboard do host; estado de rede da VM observado. |
| ONB05 | Executar ensaio técnico dentro da VM | NOT_RUN | ONB02, ONB04 | Hash fixado, extração nova, doctor PASS/0, A PROOF_VALID/0, B PROOF_INVALID/1; sem SDK do host, com encerramento dos processos observado. Logs e limitações preservados. |
| ONB06 | Preparar cinco sessões autorizadas | NOT_RUN | ONB02, ONB05 | IDs P01–P05, participação autorizada, tutorial fixo, gabarito separado e método de cronometragem. Contatos não são enviados por este backlog. |
| ONB07 | Executar sessões e limpeza entre pessoas | NOT_RUN | ONB06 | Restaurar/verificar S0 por pessoa; medir extração até interpretação, registrar ajuda/desistências e tempos; expurgar segredos e verificar limpeza antes da próxima sessão. |
| ONB08 | Consolidar resultados e decisão exploratória | NOT_RUN | ONB07 | Cinco sessões avaliáveis e >=4 sucessos sem ajuda em <=900s para atingir o alvo; publicar todos os resultados, denominadores, tempos e limitações. Sem extrapolação de adoção ampla. |

O próximo passo é selecionar a infraestrutura ONB03. ONB02 concluiu a revisão
dos materiais; confirmação do ambiente e ensaio técnico continuam pendentes.
O roteiro de comandos é E01-CLEAN-INSTALL-RUNBOOK.md.
Não marcar instalação limpa por ter executado no repositório ou em outra pasta.
Erros/limitações observados são resultados: preservar a corrida adversa e os
hashes anteriores. Kit alterado implica nova revisão/coorte antes das sessões.

## Busca documental delimitada

Em 19/10/2026 foram pesquisados Markdown em docs, design.md, packaging,
integrations e cognition, excluindo docs/evidence. Diretórios node_modules,
ops/local, dist e target ficaram fora dessa busca. Foram usados os termos
Flock, quantum-recoverable, pós-quântico/post-quantum, 28,6/28.6, 87,6/87.6
ou 64 ms. As ocorrências retornadas ficaram na nota FLOCK-RESEARCH-PITCH-NOTE.md,
com atribuição e limites. Nenhuma correção de alegação foi identificada nesse
recorte. Isso não é auditoria semântica de todo o repositório, PDFs, slides,
websites ou materiais já enviados; não prova ausência de toda alegação inflada.
Relatórios históricos e materiais fixados não foram reescritos.

A busca de Get-VM, VBoxManage, vmrun e WindowsSandbox pelo PATH não retornou
comandos no inventário consultado. Isso não comprova ausência de hipervisor,
VMs ou recursos opcionais: a infraestrutura permanece PENDING_ENVIRONMENT.

## Limites de interpretação

E01 é validação empírica de um perfil sintético em devnet. Não é teorema formal,
validação de execução financeira, TEE ou segurança pós-quântica de ponta a ponta.
Troca de algoritmo requer outro perfil e avaliação, sem apagar evidência antiga.
Recuperação de identidade exige um protocolo reconhecido pela autoridade que
controla o estado; não precisa ser necessariamente um programa on-chain em toda
arquitetura possível. Nenhuma capacidade nova decorre apenas de derivar uma seed.
