# Arkhe multi-cloud — fases 1 e 2

Implementação no monorepo, sem introduzir consenso ou um segundo repositório.

* **Data:** chart Helm compartilhado, valores AWS/Azure e ApplicationSet no hub.
* **Control:** Git/Argo CD; políticas assinadas continuam sujeitas à verificação do runtime.
* **Evidence:** exportação imutável, replicação incremental S3 → Blob, checkpoint
  verificado antes de publicar um recibo de réplica pronta. Não replica PostgreSQL.

## Validação local

```powershell
python -m pip install -r ops/multicloud/evidence/requirements.txt
python -m unittest discover -s ops/multicloud/tests -v
cargo test -p arkhe-governance --locked
cargo test -p arkhe-wormgraph --locked
helm lint ops/multicloud/charts/arkhe-service --set image.repository=example/arkhe --set image.digest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --set configSecret=arkhe-runtime
terraform -chdir=ops/multicloud/infra/environments/dev init -backend=false
terraform -chdir=ops/multicloud/infra/environments/dev validate
```

## Limites explícitos

Fencing e conteúdos são pré-requisitos de correção/read-only. A revisão implementa
um fence transacional na **mesma autoridade PostgreSQL** para ambos os writers e
um ReplicaBundle recuperável. Veja `docs/REVIEW-CORRECTIONS.md` para configuração,
testes com PostgreSQL real e os limites desse modelo. Cópias independentes do banco
não compartilham o fence e continuam proibidas para promoção automática.

O diretório contém infraestrutura e componentes executáveis; não representa um
deploy realizado. Não há credenciais, domínios, imagem publicada, clusters ou chaves
de produção presumidos. Veja `docs/STATUS.md` para resultados executados.

Keycloak tem estado: não é incluído como pod stateless. Ambos os clusters precisam
do mesmo issuer externo com estratégia própria de disponibilidade e banco.
O Gateway Core ainda precisa de uma imagem HTTP concreta; o chart também atende
`arkhe-ask`, cuja imagem existente expõe `/healthz` na porta 3000. Configuração
de banco, Kafka, identidade e política é fornecida em Secret externo por workload.
Disponibilidade de leitura não implica disponibilidade de escrita no Evidence Plane.

Consulte `docs/ARCHITECTURE.md`, `docs/RUNBOOK-FAILOVER.md` e `evidence/README.md`.
