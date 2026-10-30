# Harness e protocolo da sonda de contenção

Estado: harness prepare/collect implementado e runner parcial disponível.
O harness prepare/collect não inicia Podman; o adaptador separado
run_containment_trial.py executou os seis observadores em containers rootless.
Nenhum payload da sonda foi executado no host Windows.

## Separação de autoridade

1. `scripts/containment_probe.py prepare` gera sessão, 22 requests, nonces únicos,
   fixtures inofensivas e cópia da fonte Rust, todos com hashes SHA-256.
2. `packaging/sandbox/containment-probe/main.rs` é a fonte standalone, sem crates
   externas, destinada a compilação e execução no container. Recebe somente um
   ID cadastrado e nonce hexadecimal; não recebe código ou caminhos arbitrários.
3. `collect` valida respostas NÃO CONFIÁVEIS e preserva seus hashes. Não decide
   se a sandbox conteve uma tentativa. `OBSERVED` vira `UNASSESSED`.
4. O adaptador OCI completo e os receipts de lifecycle/limpeza executaram os 22
   vetores, incluindo oráculos de rede, arquivos negativos, recursos e Seccomp
   dinâmico. A corrida de 2026-10-20 produziu `OBSERVATIONS_COMPLETE`, sem
   `runtime_verified` e sem selo; a admissão semântica continua separada.
   Evidência: `docs/evidence/2026-10-20T134143Z-unified-dynamic-trial5/unified-results.json`.

O coletor não aceita PASS, runtime_verified ou campos adicionais vindos da sonda.
O nonce impede atribuição de uma resposta a outra requisição/sessão; não é uma
assinatura, prova de honestidade da sonda ou mecanismo de consumo único.
Um host comprometido ainda pode forjar seus próprios arquivos de evidência.

## Wire protocol v1

A sonda emite uma única linha JSON UTF-8 (máximo 64 KiB):

```json
{
  "protocol": "arkhe-containment-probe/v1",
  "vector_id": "identity",
  "nonce": "64 caracteres hexadecimais minúsculos da requisição",
  "state": "OBSERVED",
  "observations": "observações brutas, não uma decisão",
  "errno": null
}
```

Apenas OBSERVED, ERROR e UNSUPPORTED são aceitos. `errno`, quando disponível,
é o código numérico retornado por io::Error::raw_os_error; não se infere errno
pela mensagem traduzida. Booleanos não são aceitos como códigos inteiros.
Estados com sinais, OOM e exit code do container ainda precisam do executor;
a sonda não deve inventar observações após ser morta.

O coletor rejeita JSON com chaves duplicadas, NaN/Infinity, envelope desconhecido,
nonce/ID/protocolo incompatível, corpo acima de 32 KiB, arquivo acima de 64 KiB,
symlink de arquivo e hashes alterados de requests, fixtures ou fonte preparada.
As identidades do catálogo, norma e fonte do runtime devem permanecer estáveis.
Alterações exigem nova preparação; planos e relatórios antigos não são reescritos.

## Cobertura implementada da fonte Rust

Os 22 IDs estão registrados. Seis possuem observadores básicos:

| Vetor | Observação |
| --- | --- |
| identity | /proc/self/status |
| cgroup-enforcement | memory.max, pids.max e cpu.max |
| mount-inventory | /proc/self/mountinfo |
| seccomp-inventory | modo no status do processo; não identifica o filtro efetivo |
| subprocess-control | exit code de /bin/true, permitido no perfil de build |
| input-read-control | sentinela criada pela sessão |

Posteriormente foram implementados sete vetores adicionais de arquivos,
com execução real documentada em [FILESYSTEM-CONTAINMENT.md](FILESYSTEM-CONTAINMENT.md).
O ensaio posterior [NETWORK-CONTAINMENT.md](NETWORK-CONTAINMENT.md) acrescenta
quatro vetores de rede. São 17 IDs implementados e cinco ainda UNSUPPORTED.
FFI, mount e stress continuam pendentes; os inventários não são aprovação global. Inventário de configuração não prova enforcement.

Antes de observar, a sonda exige Linux, UID real 10001, CapEff=0,
NoNewPrivs=1 e fixture em /input com o nonce esperado. Essas guardas evitam uso
acidental em ambiente errado; não provam que o processo está em uma sandbox.
A fonte passou por --emit=metadata sem execução no Windows. Posteriormente foi
compilada em Linux dentro da imagem imutável, e os seis observadores foram
executados em containers rootless; veja [RUNTIME-TRIAL.md](RUNTIME-TRIAL.md).

## Uso disponível

Usar diretórios novos em cada preparação/coleta:

```sh
python scripts/containment_probe.py prepare --output docs/evidence/probe-session-001
python scripts/containment_probe.py collect --session docs/evidence/probe-session-001 --observations docs/evidence/probe-observations-001 --output docs/evidence/probe-report-001
```

No diretório de observações, cada resposta deve ter o nome <vector_id>.json.
Ausência gera PLANNED; resposta válida sem oráculo gera UNASSESSED; falhas de
protocolo geram ERROR. A coleta sempre permanece INCOMPLETE e retorna 2, inclusive
se todas as respostas tiverem sido fornecidas. Isso impede aprovação acidental
como gate de runtime no CI. Não converter esse exit code para PASS.

`session.json`, `requests/`, `fixtures/`, `probe.rs` e SHA256SUMS ficam na sessão.
`results.json`, receipts brutos aceitos e seus hashes ficam no relatório.
Nenhum receipt sintético dos testes unitários é usado como evidência real.

## Próximos componentes necessários para executar

- Adaptador do mesmo builder de política usado por sandboxArguments, sem cópia
  divergente de flags; conexão com o lock da bancada.
- Compilação na imagem imutável; um alvo por vetor e watchdog externo.
- Canário de rede isolado com controles positivos pareados, sem destinos públicos.
- Oráculos dos sentinelas fora dos mounts, inventários OCI e perfil seccomp fixado.
- Supervisão de cgroups reduzidos e coleta independente de sinais/eventos.
- Cleanup por IDs exatos com comprovação antes de qualquer avaliação global.

Mesmo após esses componentes, PASS valerá somente para os vetores, imagem,
política, engine e arquitetura efetivamente ensaiados. Não provará ausência de
escapes em geral, isolamento gVisor/runwasi/WASM ou eficácia de AGI.

Especificação do executor e dos oráculos: [RUNTIME-EXECUTOR.md](RUNTIME-EXECUTOR.md).

A preparação também fixa network-wire.rs como suporte do binário; o coletor
rejeita hash divergente do suporte, além da fonte principal.

Atualização de recursos: [RESOURCE-CONTAINMENT.md](RESOURCE-CONTAINMENT.md).
Três vetores aprovados em perfil reduzido Podman rootless; suíte global ainda
INCOMPLETE e runtime_verified=false. Evidências: `docs/evidence/2026-10-19T044610Z-resource-trial/results.json`.

Atualização de syscalls (2026-10-19): [SYSCALL-CONTAINMENT.md](SYSCALL-CONTAINMENT.md).
Controles de subprocesso/FFI e negação de mount ensaiados; teste seletivo de
getppid aprovado em perfil seccomp explícito distinto. Não há aprovação da
tabela completa nem transferência para o perfil implícito. Suíte INCOMPLETE;
runtime_verified=false.
