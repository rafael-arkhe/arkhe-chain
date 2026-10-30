# Arquitetura e decisões

## ADR-001 — três planos

Data Plane HTTP pode executar em AWS/Azure, usando imagens por digest e issuer
OIDC comum. Serviços com bancos, filas ou histórico exigem estratégias próprias;
não se assume que todo arkhe-ask ou Keycloak seja stateless. A sessão HTTP não
deve depender do filesystem efêmero de um pod. Secret externo configura cada
serviço. Os charts não desativam autenticação nem habilitam dev-header.

Terraform provisiona a base. Git/Argo CD reconcilia manifests. Terraform também
é declarativo; a escolha GitOps se deve à reconciliação contínua de Kubernetes,
não a uma suposta natureza imperativa do Terraform.

Evidence é append-only. A réplica contém exportações verificáveis; não é uma
read replica SQL nem um novo ramo causal. Mudar de provider preserva o mesmo
tenant/stream/prefixo, e um escritor único precisa ser garantido por fencing.

## ADR-002 — hub-and-spoke

Instale Argo CD em um hub com acesso às APIs privadas EKS/AKS. Registre os dois
clusters com credenciais mínimas; não versione secrets de acesso a clusters.
Adapte `gitops/projects/arkhe.yaml.example` para repositório e APIs exatos.
O ApplicationSet seleciona cluster secrets com labels:

```yaml
arkhe.io/plane: data
arkhe.io/cloud: aws # ou azure
```

Adicione annotations ao secret cadastrado no hub:

```yaml
arkhe.io/repo-url: https://github.com/OWNER/REPO.git
arkhe.io/revision: COMMIT_SHA
arkhe.io/image-repository: YOUR_REGISTRY/arkhe-ask
arkhe.io/image-digest: sha256:IMAGE_DIGEST
arkhe.io/config-secret: arkhe-ask-runtime
```

O template usa Go templates e missingkey=error; ausência de configuração falha.
O exemplo gera uma Application por cluster para uma instância HTTP. Para Gateway
e arkhe-ask simultâneos, instancie ApplicationSets com nomes e annotations próprios
ou adicione um matrix generator de serviços. A imagem de Gateway não é inventada.
AWS e Azure têm valores específicos; a sobreposição declarativa de Control Plane
usa Kustomize e precisa ser integrada a Applications com o mesmo fan-out.
O ConfigMap de contrato não assina nem carrega uma política: publique o payload
SignedPolicyBundle real, configure trust store no runtime e verifique a admissão.
Self-heal de manifests não substitui verificação criptográfica de políticas.

## ADR-003 — cópia imutável e ancoragem

O replicador autentica manifestos Ed25519, valida escopo e cadeia, copia objetos
ausentes, verifica SHA-256 na leitura de retorno e só publica recibo após os gates.
O gate Rust reutiliza o perfil MMR e SignedCheckpoint existentes. O gate Sigstore
usa Cosign e TrustedRoot pinado, exigindo bundle com inclusão e checkpoint.
Rekor prova inclusão de artefatos em um log; não oferece armazenamento dos blocos,
consenso entre clouds, recuperação dos envelopes ou fencing do escritor.

O exportador `PgWormGraph::export_replica_snapshot` usa uma transação repeatable-read
para checkpoint, journal WormGraph, envelopes e conteúdos conhecidos. ReplicaBundle
assina também epoch e o conteúdo completo. O gate nativo oferece ReplicaReader após
validar integridade e MMR. O OperationJournal dos demais serviços e bancos não é
automaticamente coberto por esse perfil; agendamento continua uma integração.
O armazenamento contém versões/retention; configure IAM para impedir substituição
de nomes e deleção. Object Lock sem escrita condicional ainda permite novas versões
de uma mesma chave no S3; o protocolo exige chaves por conteúdo e upload condicional.

## ADR-004 — failover antes de consenso

Root separado `infra/environments/routing` cria Cloudflare LB. Healthcheck é um
recurso Monitor separado, com consecutive_down=3; `retries` trata timeout imediato,
não significa três intervalos. O tempo de convergência precisa ser medido.
`active_active_reads=true` usa random steering; false mantém pools por prioridade.
O fallback recebe tráfego até se estiver unhealthy quando todos falham: o cliente
deve tratar erro/indisponibilidade. Origins precisam de TLS e ingress válidos.
O plano Cloudflare precisa incluir recursos/intervalos usados. O provider 4.52.0
é pinado pelo schema validado; atualizar para v5 exige migração de schema.

O LB não elege writer. Saúde HTTP não prova atualidade nem integridade das evidências.
O fence implementado usa uma autoridade PostgreSQL comum, locks transacionais e
login distinto por writer. Triggers validam e persistem epoch em cada INSERT de
evidências/objetos/checkpoints/packages. A promoção CAS espera os writes admitidos,
rejeita snapshot incompleto e impede o login anterior de escrever após o commit.
Isso não permite promover dois bancos independentes: particionar a autoridade
torna escrita/promoção indisponíveis. Não se usa Object Lock como eleição de líder.
Verifique o último prefixo autorizado e RPO tolerável, faça fencing do escritor AWS,
promova com epoch/lease do mecanismo real, teste escrita/append e retorno da AWS
como réplica. Em partição sem fencing verificável, o Evidence Plane recusa promoção.
CometBFT/consenso fica adiado até validar esse fluxo em ambiente real.

## Referências primárias consultadas em 26/10/2026

* [Argo CD Cluster Generator](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/Generators-Cluster/)
* [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
* [Azure Blob Python upload](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-upload-python)
* [Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)
* [Cosign verify-blob implementation](https://github.com/sigstore/cosign/blob/main/cmd/cosign/cli/verify/verify_blob.go)
* [Cloudflare LB schema 4.52.0](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v4.52.0/docs/resources/load_balancer.md)
