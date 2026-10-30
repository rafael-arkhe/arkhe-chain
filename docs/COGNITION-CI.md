# CI da fronteira cognitiva

A cadeia foi integrada em `.github/workflows/ci.yml`, preservando os jobs gerais
existentes. É disparada por push, pull_request e workflow_dispatch. Não usa
pull_request_target, runners próprios ou segredos de deploy.

## Jobs e isolamento

`cognition-gates` executa uma matriz com três runners Ubuntu descartáveis,
permissão `contents: read`, checkout sem persistir credenciais e fail-fast
independente. Nenhum desses jobs recebe permissão de atestação ou OIDC.

| Gate | Execução |
| --- | --- |
| conformance | SDK: 3 testes unitários, 9 compile-fail e 1 exemplo positivo; integração dos seis módulos com ContainmentGate |
| dependencies | Grafo Cargo com --locked, 4 regressões de dependências e 10 regressões do coletor de evidências |
| architecture | Registro do workspace, ativos embutidos e hashes das migrações publicadas |

Os runners hospedados isolam os jobs entre si. O código sob teste ainda pode
executar subprocessos e acessar rede e arquivos desse runner. Esta cadeia NÃO
certifica a sandbox cognitiva, gVisor, runwasi ou WASM. Não são realizados deploys
nem testes de escape nesta etapa. As ações da cadeia nova estão fixadas por SHA;
a toolchain Rust permanece em 1.96.0. Não há cache compartilhado entre PRs.

## Evidências e comportamento em falhas

`scripts/cognition_ci.py gate` chama o registrador existente `record_gate.py`.
Cada gate preserva logs, resultados, inventários SHA-256 das fontes e uma cópia
da especificação. O digest da especificação é medido antes e depois do gate.
Os artefatos são publicados mesmo quando um comando falha.

`cognition-evidence` usa apenas permissões de leitura. O coletor exige os três
gates, seus comandos esperados em quantidade e ordem, sucesso dos jobs, contexto
de repositório/SHA/run/tentativa idêntico, fontes estáveis e idênticas entre os
gates, além de correspondência dos hashes de logs e inventários. Ausência,
alteração ou mistura de evidências faz a consolidação falhar. O manifesto não
prova honestidade de código que tenha sido autorizado a modificar os testes.

O artefato `cognition-evidence-<tentativa>` contém:

- `results.json`: resultado consolidado e identidade da execução.
- `REPORT.md`: resumo e limites.
- `COGNITION-SDK.md`: cópia exata da especificação examinada.
- `gates/`: receipts, logs e inventários dos gates aprovados.
- `SHA256SUMS`: hashes de todos os arquivos acima, inclusive resultados e norma.

O manifesto não inclui o próprio hash. Nenhum hash é descrito como assinatura.
Artefatos de jobs com falha permanecem disponíveis separadamente. A retenção
configurada é 30 dias, sujeita às políticas do repositório.

## Assinatura e identidade do workflow

`cognition-attestation` é um job separado, sem checkout e sem execução de scripts
do repositório. Só roda após consolidação bem-sucedida, em push ou disparo manual
na branch padrão. PRs e outras branches publicam evidências sem assinatura.
O job verifica SHA256SUMS e usa `actions/attest` com OIDC/Sigstore para atestar
manifesto, norma, resultados e resumo. O bundle criptográfico é publicado como
`cognition-attestation-<tentativa>` e registrado pela API de atestações do GitHub.

A permissão `id-token: write` e `attestations: write` fica exclusivamente nesse
job. Nenhuma chave Ed25519 privada do Arkhe é utilizada; a identidade é a do
workflow do GitHub, não a autoridade constitucional do kernel. A atestação de
proveniência vincula bytes ao workflow, não certifica segurança ou AGI.

Em repositórios públicos elegíveis, a atestação é ativada automaticamente. Em
repositórios privados/internos, configurar a variável de repositório
`ARKHE_ATTESTATIONS_ENABLED=true` somente com suporte a atestações habilitado
(GitHub Enterprise Cloud). Sem opt-in, relatórios e hashes continuam publicados,
e o job de assinatura é ignorado. Falhas de assinatura em um job habilitado fazem
o CI falhar; não há conversão silenciosa em sucesso.

Verificação pelo consumidor, após baixar o artefato e o bundle:

```sh
sha256sum --check --strict SHA256SUMS
gh attestation verify SHA256SUMS --repo OWNER/REPO --signer-workflow OWNER/REPO/.github/workflows/ci.yml
```

Também é possível verificar results.json e COGNITION-SDK.md individualmente pelo
mesmo comando. Conferir commit, workflow e identidade esperados no resultado;
a aprovação de uma execução de PR não equivale à admissão constitucional.

Referências: [actions/attest](https://github.com/actions/attest) e
[disponibilidade e uso de atestações](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Runner equivalente local

Usar uma pasta de execução nova a cada rodada (o runner recusa sobrescrever):

```sh
python scripts/cognition_ci.py gate conformance --output docs/evidence/local-ci/inputs/conformance
python scripts/cognition_ci.py gate dependencies --output docs/evidence/local-ci/inputs/dependencies
python scripts/cognition_ci.py gate architecture --output docs/evidence/local-ci/inputs/architecture
python scripts/cognition_ci.py bundle --inputs docs/evidence/local-ci/inputs --output docs/evidence/local-ci/bundle
```

Execução local é identificada como local e nunca gera assinatura de GitHub.
O workflow remoto só pode ser confirmado depois que esta árvore estiver em um
repositório GitHub e os jobs forem executados. Esta pasta local não possui `.git`.

## Checks recomendados para proteção de branch

Exigir `cognition-conformance`, `cognition-dependencies`, `cognition-architecture`
e `cognition-evidence`, além dos checks gerais já adotados pelo projeto. Revisar
mudanças no workflow, SDK, allowlist e coletor por responsáveis independentes.
A configuração de proteção de branch não é aplicada por este arquivo.
