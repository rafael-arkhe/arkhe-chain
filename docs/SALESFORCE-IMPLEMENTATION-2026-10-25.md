# Salesforce Arkhe — implementação de 25/10/2026

Repositório dedicado local: `D:/arkhe/salesforce-arkhe-integration`, branch
`main`, com projeto SFDX na raiz e workspace Rust mínimo em `native/`.
O diretório raiz `D:/arkhe` continua sem metadados Git; não foi inicializado
um repositório indiscriminado de todo o ambiente.

Entregue: intenção de escrita assinada que vincula o SystemModstamp ao bundle
v2; emissão REST com diário persistente e recuperação de resposta perdida;
Flow transacional de outbox; Queueable/Batch/Schedulable com mocks e retries;
validação check-only com cobertura e recusa de jobs pendentes; workflows de
CI e promoção manual com JWT, reviewers obrigatórios e SHA exato aprovado;
geração de Named Credential moderna e procedimento de recuperação.

Oito gates locais passaram no pacote independente: 13 testes Rust, 18 Python,
parser de oito arquivos Apex, 35 XMLs, formatação, Clippy, build e ensaio do
CLI real com transporte Salesforce simulado. Evidências versionadas estão
em `salesforce-arkhe-integration/validation/local/`.

Não houve compilação Apex em org, cobertura Salesforce observada, medição
real CPU/heap, teste de permissões/contenção na org, autenticação OAuth do
receptor, deploy ou execução GitHub Actions. Nenhum serviço receptor, secret,
agenda Apex ou ambiente Salesforce foi provisionado. Não há liberação de produção.

Após autorização Composio, o repositório privado foi criado em
https://github.com/rafael-arkhe/salesforce-arkhe-integration e recebeu a branch
main, SHA `99db2939c9399797dfc8fa2e65776eaa894111f6`, confirmado por ls-remote.
O primeiro CI remoto foi iniciado em
https://github.com/rafael-arkhe/salesforce-arkhe-integration/actions/runs/40198374732.
O job offline passou no GitHub; o job sandbox falhou na autenticação porque
os parâmetros/segredos Salesforce ainda não foram configurados. Não houve
validação ou deploy na org.

O GitHub Environment validation-qa foi criado. A API recusou as regras de
required reviewers de integration-qa e production com HTTP 422, informando
que o plano precisa suportar essa proteção. Nenhuma regra de aprovação foi
removida do pipeline para contornar essa limitação. Secrets Salesforce e
SF_INSTANCE_URL continuam não configurados; nenhum My Domain foi inventado.
A tentativa de proteger main com revisão e checks offline/sandbox foi recusada
com HTTP 403. A mensagem do conector indica permissão insuficiente; não foi
possível confirmar a proteção da branch. A rejeição de billing dos reviewers
é uma evidência separada e não foi atribuída automaticamente a esse HTTP 403.

Guia operacional: `salesforce-arkhe-integration/docs/OPERATIONS.md`.
Reprodução local: `python scripts/verify_local.py` na raiz do repositório dedicado.
