# Provisionamento

O ambiente dev compõe módulos reais EKS, AKS, S3 Object Lock e Azure Blob.
Forneça redes privadas existentes (subnets AWS em pelo menos duas AZs), resource
group Azure, grupos administradores, assinatura Azure via ARM_SUBSCRIPTION_ID e
versões Kubernetes suportadas pelos dois providers no momento do provisionamento.
Não se fixa Kubernetes 1.30 do anexo, pois seu suporte depende da data e do provider.

Instale Terraform >=1.10, configure login federado dos providers, crie um arquivo
`terraform.tfvars` local com todas as variáveis declaradas em environments/dev/main.tf.
Use init/validate/plan antes de apply. Não execute apply sem revisar custo e retenção:
S3 COMPLIANCE não permite apagar versões antes de expirar a retenção.

Backend local serve somente para validação. Antes de uso compartilhado, adicione
backend remoto com locking, criptografia e acesso restrito; faça init -migrate-state.
Não copie estado nem tfvars para Git. Comite o lockfile de providers após init.
Crie roots separados para staging/prod, com seus próprios backends e identidades.

Este conjunto não cria VPC/VNet, conectividade do hub aos clusters privados,
controladores de ingress, IAM federado dos workloads ou exportador
de eventos. Essas integrações precisam dos identificadores reais da organização.
O replicador usa S3 GetObject e Azure Blob Data Contributor via workload identity;
restrinja seus escopos aos prefixos/container de réplica e não dê delete/bypass.

O container Blob possui política de retenção inicialmente **unlocked**. Teste-a e
bloqueie-a pelo procedimento Azure antes de declarar WORM em produção.

O root `environments/routing` é separado: cria Cloudflare Monitor, pools e LB.
Precisa de CLOUDFLARE_API_TOKEN com escopos adequados, account_id, zone_id, hostname
e origins reais, além de Cloudflare Load Balancing habilitado. Validação não
confirma disponibilidade desses recursos no plano contratado. Ajuste certificados
e annotations do ingress conforme o controller (por exemplo ACM no ALB).
