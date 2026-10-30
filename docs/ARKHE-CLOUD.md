# Arkhe Cloud — especificação de verificação e roadmap

Data da revisão: 25/10/2026. Estado: proposta documental; integrações AWS e gates
Terraform descritos aqui ainda não foram implementados ou executados nesta tarefa.

## Objetivo e fronteira de confiança

Transformar sete módulos de aprendizagem em perguntas verificáveis sobre uma
configuração, com escopo, política, evidência e limites explícitos. O shared
responsibility model orienta a escolha dos controles; não é, por si só, uma
política executável ou uma prova de segurança.

O estado atual do projeto está em [STATUS](STATUS.md). Já existem o
[verificador portátil](../verification/README.md), o
[perfil MMR](MMR-PROFILE.md), o
[WorkerExecutionRecord](../kernel/arkhe-core/src/worker.rs) e o
[ContainmentGate](../kernel/arkhe-kernel/src/lib.rs). A existência desses
componentes não demonstra que um adaptador AWS está integrado ou qualificado.

Um WER identifica entradas, saídas e referências por digest; sozinho não é uma
assinatura, uma atestação in-toto nem prova de admissão. Os futuros adaptadores
devem usar a admissão/committer existente, respeitando o
[ADR-002](adr/ADR-002-no-direct-wormgraph-write.md). O núcleo determinístico recebe
bytes; chamadas AWS, relógio, credenciais e resolução de confiança ficam nos
adaptadores. Não adicionar escrita direta no WormGraph ou autoridade ao leitor.

## Sete módulos

| Módulo | Conteúdo e pergunta verificável | Evidência esperada e limite |
|---|---|---|
| 1. Cloud Foundations | Regions, AZs, preços, billing e responsabilidade compartilhada. Quais recursos, responsabilidades e custos pertencem ao escopo aprovado? | Inventário por conta/região, matriz de responsabilidades, premissas de preço datadas, budgets e alertas. Estimativa e alerta não são teto rígido de despesa nem prova de resiliência. |
| 2. Linux & Networking | Comandos Linux, SSH, DNS, TCP/IP, CIDR, subnets e rotas. Quais caminhos de acesso são permitidos? | Configuração versionada de SSH, SGs, NACLs, rotas e testes de conectividade delimitados por origem/destino/protocolo. SG isolado não prova alcançabilidade completa; considerar IPv6, host e caminhos alternativos. |
| 3. Core AWS Services | EC2, S3, IAM, VPC e RDS. Os controles selecionados satisfazem a política? | Snapshots de configuração e resultados por recurso: acesso S3, identidades/políticas IAM, criptografia, backups e disponibilidade RDS. Backup habilitado não prova restauração; Multi-AZ não substitui backup. |
| 4. Observabilidade e auditoria | CloudTrail e CloudWatch. Os eventos entregues são íntegros e a coleta cobre o escopo declarado? | Logs originais, digests, assinaturas, chaves e relatório de validação; configuração de seletores, trail e entrega; métricas, logs e testes de alarmes. Integridade não prova cobertura universal nem sucesso do efeito de uma API. |
| 5. Infraestrutura como código | Terraform e Policy as Code. O plano aplicado é o mesmo que foi avaliado e autorizado? | Hashes do plano salvo, JSON, código, lockfile, políticas, ferramentas e resultados; recibo de admissão antes do efeito; execução e observação posterior. Plano aprovado não prova configuração final. |
| 6. Conformidade contínua | Config, Security Hub e GuardDuty. Qual postura foi observada, quando e com qual cobertura? | Evaluation results, Configuration Items e findings originais, com conta/região/recurso, origem e tempos de avaliação/coleta. Dados são assíncronos; ausência de finding não equivale a conformidade. |
| 7. Arquiteturas verificáveis | Referência que liga intenção, autorização, efeito e observação. O pacote pode ser verificado por terceiro? | Manifesto, política confiável, WER admitido, atestação assinada e prova de inclusão contra checkpoint confiável independente. Inclusão isolada não prova anterioridade, completude ou extensão entre checkpoints. |

Para os módulos 1–3, escolher regiões e gerações de instância por disponibilidade,
SLO e custo medidos; não tornar monitoramento detalhado ou Multi-AZ universalmente
obrigatórios. Preferir credenciais temporárias e privilégio mínimo, com MFA onde
aplicável. CIDRs RFC 1918 são uma escolha comum, não uma exigência universal da
VPC; IPv6 exige avaliação própria. Consultar as
[regras de CIDR da AWS](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html).

## Módulo 4: contrato proposto para CloudTrail

A AWS distingue habilitar a entrega de digests de executar a validação. Cada
digest referencia logs e a cadeia anterior. O leitor deve validar assinaturas,
hashes e continuidade no intervalo declarado, usando o algoritmo e as chaves
previstos pela AWS, sem substituir isso por um hash local do digest.
[Introdução oficial](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-intro.html),
[estrutura dos digests](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-digest-file-structure.html)
e [validação via CLI](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-validation-cli.html).

O pacote proposto identifica conta, região, trail, bucket, chaves/versões dos
objetos, intervalo solicitado, intervalo efetivamente validado, origem das
chaves e versão do validador. Preserva bytes originais e dependências necessárias
à verificação offline; o consumidor precisa de âncoras de confiança independentes.
Objeto ausente, assinatura inválida ou lacuna não pode resultar em sucesso integral.

Antes da validação offline, obter online todas as chaves públicas necessárias via
`ListPublicKeys`, na região e para o intervalo dos digests, e armazená-las com
segurança. Preservar bytes, fingerprints, intervalos de validade e procedência;
selecionar a chave correspondente a `digestPublicKeyFingerprint`. Para arquivos
fora do intervalo inicialmente coletado, repetir a obtenção das chaves. O pacote
não pode estabelecer confiança apenas incluindo uma chave escolhida pelo produtor.

Preservar também a assinatura do digest mais recente, disponível no metadado S3
`x-amz-meta-signature`. Sem ela, a alternativa descrita pela AWS começa pelo
penúltimo digest e não valida o mais recente; registrar essa redução de cobertura.
Mapear os caminhos S3 para cópias locais mantendo as localizações originais para
as verificações. O contrato usa assinaturas RSA e hashes SHA-256 conforme a
[especificação AWS de validação customizada e offline](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-log-file-custom-validation.html).

Verificar separadamente configuração do trail, seletores de management/data
events, regiões/contas cobertas e entrega recente. Eventos de dados exigem
seleção apropriada. Retenção, KMS e Object Lock são controles distintos de
integridade criptográfica; devem seguir a política e ser avaliados separadamente.
Não há um único “hash do bucket” que prove esses controles.

Correlacionar WorkIntent, identidade de sessão e evento exige um vínculo
autenticado definido pelo executor; coincidência de horário não basta. CloudTrail
não é a fonte única para configuração atual, decisão interna ou efeito final.

## Módulo 5: dois gates e uma verificação posterior

1. Na revisão do código, executar Checkov e/ou `trivy config`, registrando
   versões, regras, exceções e digests. A combinação é uma decisão de cobertura,
   não uma stack obrigatória para todos os projetos.
2. Gerar um plano salvo, exportar seu JSON e avaliar OPA/Conftest. Valores
   desconhecidos relevantes para segurança bloqueiam ou exigem verificação
   posterior explicitamente prevista; o JSON não resolve todos os valores.
3. Admitir a evidência da avaliação e vincular autorização ao digest do plano,
   política, commit, ambiente e identidade do executor, com validade e uso único.
   O executor deve consumir exatamente o plano salvo autorizado. Falha ou
   indisponibilidade de admissão bloqueia a execução protegida.
4. Registrar resultado do apply, inclusive falha parcial, e observar recursos
   reais antes de afirmar conformidade. Resultado incerto exige reconciliação;
   não autoriza nova tentativa automática do efeito.

Essa é uma sequência proposta, não um pipeline já instalado. O vínculo entre
autorização e execução requer enforcement no executor/journal; inclusão MMR por
si só não impõe a sequência. Um novo plano invalida a autorização anterior.

A documentação do mantenedor orienta a
[migração de tfsec para Trivy](https://github.com/aquasecurity/tfsec/blob/master/tfsec-to-trivy-migration-guide.md);
isso não fundamenta, sozinho, uma data formal de descontinuação. Conftest possui
[saída SARIF](https://www.conftest.dev/output/), cuja publicação no GitHub depende
da configuração e permissões de code scanning, separada da decisão do gate.

Planos e JSON podem conter segredos: manter acesso/retenção restritos, não publicar
bytes brutos em SARIF ou logs. Fixar versões e identidades verificadas dos
artefatos de ferramentas. Referências:
[workflow de planos salvos](https://developer.hashicorp.com/terraform/cli/run),
[formato JSON](https://developer.hashicorp.com/terraform/internals/json-format).

## Módulos 6–7: postura e atestação

O [ADR proposto](adr/ADR-019-cloud-evidence-adapters.md) define a ingestão de Config
e Security Hub. A política deve explicitar idade máxima, tolerância de atraso,
contas/regiões esperadas e comportamento para dados ausentes, erro ou cobertura
incompleta. Uma decisão vale para a observação declarada, não para “agora” sem
qualificação temporal. Remediação automática é uma ação protegida separada.

Para atestações, definir primeiro um predicado de infraestrutura versionado.
`arkhe:infrastructure:v1` é um nome de trabalho, não um padrão publicado. Congelar
URI de tipo, schema, canonicalização, identidade/issuer, assinatura, trust roots,
replay, validade, referências e casos negativos antes de anunciar interoperabilidade.
Preservar o schema do WER; usar um adaptador que o vincule ao subject e à política.

O [in-toto Attestation Framework](https://github.com/in-toto/attestation/blob/main/spec/README.md)
separa predicado, statement, envelope e bundle. DSSE e Cosign são mecanismos
possíveis de transporte/autenticação; uma assinatura não valida a verdade do
predicado. [SLSA Provenance](https://slsa.dev/spec/v1.1/provenance) descreve
proveniência de build; usá-la para um artefato IaC não atesta automaticamente a
configuração em execução nem concede um nível SLSA à integração.

WormGraph e Rekor não são intercambiáveis por analogia: verificar separadamente
assinatura de checkpoint, testemunho/confiança e garantias de consistência. O
perfil MMR local informa que inclusão não prova extensão entre checkpoints.

## Roadmap e critérios de saída

As fases abaixo pertencem ao Arkhe Cloud; não redefinem fases homônimas de outros
projetos. Todas permanecem propostas até existir evidência dos critérios.

| Fase | Entrega | Critério de saída |
|---|---|---|
| F0 — contratos | Revisão deste documento e ADR; escopo de controles, ameaças e schemas de entrada/saída | Responsáveis aprovam política, modelo de confiança, tratamento de segredos e matriz de cobertura; fixtures e resultados esperados definidos. |
| F1 — qualificação portátil | Adaptadores offline de CloudTrail e relatórios Terraform sobre o núcleo existente | Pacote verificável sem AWS; positivos e negativos para adulteração, chave não confiável, objeto ausente, intervalo incompleto, política/plano divergente e checkpoint incorreto; paridade native/WASM onde suportada. |
| F2 — integração controlada | Leitor AWS somente leitura e gate Terraform com executor protegido | Teste em sandbox comprova bloqueio antes do apply, consumo do plano exato, admissão existente, replay rejeitado e reconciliação de falha parcial; custos e permissões medidos. |
| F3 — postura e referência | Config/Security Hub, política de freshness e atestação versionada | Reordenação/duplicação/atraso/cobertura ausente testados; pacote offline interoperável; exercício completo intenção → autorização → efeito → observação. |

CloudTrail e Terraform podem começar com parsers e fixtures offline em F1.
Ativação protegida e alegações de prova portátil completa aguardam sua
qualificação. Não é necessário presumir que todo MMR está ausente, nem que os
módulos 4–5 independem de admissão, autorização e confiança no checkpoint.

## Revisão factual do material recebido

| Afirmação | Tratamento nesta proposta |
|---|---|
| Habilitar integridade do CloudTrail prova os logs | Corrigida: habilitação entrega digests; um validador precisa verificá-los. |
| WER já é atestação in-toto e prova de execução | Corrigida: o struct local contém referências/digests; admissão, assinatura e vínculo ao efeito exigem mecanismos adicionais. |
| O MMR portátil ainda não existe | Corrigida: já há implementação e perfil; falta qualificar o novo caminho de nuvem. |
| Config/Security Hub demonstram conformidade instantânea | Corrigida: declarar tempo de observação, freshness e cobertura. |
| Audit Manager deixou de aceitar novos clientes em 30/04/2026 | A [AWS](https://docs.aws.amazon.com/audit-manager/latest/userguide/audit-manager-availability-change.html) informa modo de manutenção e bloqueio de configuração em novas contas. Clientes existentes continuam no escopo conta/região já configurado, sem expansão para novas regiões; organizações já configuradas podem adicionar contas da própria organização às avaliações, mas não estender o serviço a novas organizações. |
| tfsec descontinuado; Terrascan arquivado; Packer 1.16 com SLSA | Migração tfsec/Trivy documentada; datas e afirmações sobre Terrascan/Packer não foram adotadas como premissas, pois não são necessárias ao contrato. |

## Validação desta entrega

Revisão documental contra os arquivos locais citados e fontes oficiais vinculadas.
Nenhuma chamada AWS autenticada, scanner, apply, assinatura, implantação ou teste
de integração foi executado. Os critérios acima descrevem trabalho futuro; este
documento não atribui status VERIFIED nem comprova conformidade operacional.
