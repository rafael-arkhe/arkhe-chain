# Primeiro ensaio real de observação

Execução concluída em Podman rootless/crun em máquina WSL dedicada
`arkhe-containment`, separada do engine do aplicativo. WSL2 compartilha seu
kernel da utility VM entre distribuições; isso não constitui uma VM com kernel
independente nem gVisor/runwasi/WASM.

- Início: 19/10/2026, aproximadamente 01:06, America/Sao_Paulo.
- Duração: 79,305 segundos, dentro do orçamento global de 180 segundos.
- Imagem local: sha256:1cc4af95eb5e7d6caf30aefda71f4c8f8de78eae425a1d773c5490f5b66c19ab.
- Binário compilado somente dentro do container, com fonte fixada na sessão.
- Sete containers: um de compilação e seis alvos; remoção de todos confirmada.
- Lease da máquina dedicado adquirido atomicamente e liberado ao final.

| Observador | Resultado limitado |
| --- | --- |
| identity | PASS: UID mapeado, capabilities e no-new-privileges coerentes |
| cgroup-enforcement | PASS: limites observados pelo agente externo e pela sonda coincidem; sem stress |
| mount-inventory | UNASSESSED: inventário coletado, sem prova de enforcement |
| seccomp-inventory | UNASSESSED: modo/perfil padrão inventariados; sem prova de filtro constitucional |
| subprocess-control | PASS: /bin/true permitido conforme o perfil de build |
| input-read-control | PASS: bytes do sentinela conferidos e integridade preservada |

O agente externo, root na distribuição dedicada, usa uma interface fixa de leitura
sobre processos/cgroups associados ao container ID. Sua fonte é instalada em
arquivo root-owned identificado por hash. O alvo permanece sem capabilities e
sem acesso ao socket do engine ou ao agente. O nonce não autentica a sonda: o
supervisor trata a observação como não confiável e cruza os dados disponíveis.

A primeira tentativa compilou o binário, mas falhou ao usar diretamente um PID
do namespace do serviço do engine na visão de /proc do WSL. O erro e uma falha
de confirmação de limpeza permaneceram no relatório original. Houve remoção
posterior e verificação de engine vazio antes da reconciliação explícita do
lease. A segunda tentativa correlacionou engine PID, NSpid e cgroup, sem mudar
os limites do perfil; foi concluída com seis receipts e sem erros.

## Evidências preservadas

- [Relatório do ensaio concluído](evidence/2026-10-19T040641Z-runtime-first-trial/REPORT.md).
- [Resultados, comandos e identidades](evidence/2026-10-19T040641Z-runtime-first-trial/results.json).
- [SHA256SUMS](evidence/2026-10-19T040641Z-runtime-first-trial/SHA256SUMS).
- [Tentativa anterior com erro](evidence/2026-10-19T040502Z-runtime-first-trial/results.json).

A preparação da máquina e transferência da imagem ocorreram antes do orçamento
do ensaio; a imagem foi transferida do cache local, sem pull durante os testes.
A delegação de controllers foi provisionada na nova máquina antes do pré-voo.
Receipts de provisionamento/reconciliação local ficam em ops/local/containment-vm.
Os relatórios históricos não são reescritos por correções posteriores no código.

## Escopo que permanece pendente

`trial.execution_state=COMPLETE`, `trial.verdict=OBSERVATIONS_COLLECTED`,
`suite.status=INCOMPLETE` e **runtime_verified=false**.

Faltam os 16 vetores restantes, canário de egress, testes negativos de arquivos,
supervisão de stress e validação de syscalls por política fixada. Os quatro PASS
são verificações do piloto, não aprovação global de contenção. Atestação OIDC e
CI remoto continuam pendentes.

Adaptador disponível para repetir o piloto após preparar explicitamente uma
máquina exclusiva, imagem e delegação (usar diretório novo):

```sh
python scripts/run_containment_trial.py --machine arkhe-containment --output docs/evidence/new-runtime-trial
```

O runner não inicia máquina, transfere imagem nem configura cgroups implicitamente.
Não reutiliza automaticamente lease que sobrou de falha. Exit 0 indica conclusão
do piloto sem erros, não aprovação dos 22 vetores.
