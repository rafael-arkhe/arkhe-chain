# TriageReport v1 — candidato não aprovado

Este roteiro integra a superfície operacional de governança, mas **não está
coberto pelo digest do perfil, pelas aprovações ou pelo pin do registro**.
O esquema atual não vincula o README. Controle e revise sua versão por canal
independente; vincular criptograficamente o roteiro exigiria uma revisão explícita
do esquema/protocolo e novas aprovações. Não há essa garantia nesta versão.

`profile.json` foi materializado como candidato local. Não há `profile.sig`,
quórum institucional, raiz de confiança provisionada ou política ativa.
O arquivo `PROFILE-DIGEST.txt` identifica conteúdo; não comprova aprovação.

O exemplo parcial em `config/triage-classification.example.json` foi incorporado
para tornar o artefato revisável. Não é uma tabela oficial completa. O campo
`requested_by` contém `REQUIRES-OPERATOR-IDENTITY`; autoria, linhas, módulos e
validade precisam de revisão pelos responsáveis antes da assinatura.

Para este roteiro, o operador deve fornecer `requested_by` no formato
`did:arkhe:employee:<base58>`, correspondente à sua identidade institucional real,
e usar a mesma identidade no intent. Não substitua o placeholder por uma
identidade deduzida do usuário do sistema operacional. Limite da implementação:
`work/arkhe-work/src/employee.rs` define `EmployeeIdentity.did` como `String`,
sem um método `Employee::did` ou validação desse esquema; o perfil também aceita
strings não vazias com até 256 bytes. O formato é um requisito operacional deste
roteiro, não uma restrição mecânica já implementada nem prova de identidade.

O perfil declara `ClassificationDigest` e `ClassificationPolicyDigest` como
evidências obrigatórias. Uma política `VerifiedTriagePolicy` verifica:

1. Registro cujo digest coincide com um pin obtido por canal independente.
2. Quórum configurado, no mínimo dois signatários com chaves públicas distintas.
3. Assinaturas Ed25519 estritas, vinculadas ao perfil, registro e identidade da chave.
4. Chaves ativas, válidas no momento e autorizadas para o ID exato da política.
5. Solicitante, versão, digest do perfil, módulo de análise e validade temporal.

As assinaturas são coletadas fora deste processo. O formato do futuro
`profile.sig` é JSON: `registry_digest` (32 bytes) e `approvals` com `key_id` e
`signature_hex`. `profile.sig.example.json` é vazio e não é uma assinatura.

Após os responsáveis provisionarem o registro, cada signatário pode obter os
bytes exatos para sua ferramenta de assinatura externa:

```powershell
cargo run --locked -p arkhe-bugbounty --bin triage_policy -- signing-bytes governance/profiles/triage-report-v1/profile.json governance/trust-registry/public-keys.json ID-DO-SIGNATARIO
```

A verificação dos arquivos será:

```powershell
cargo run --locked -p arkhe-bugbounty --bin triage_policy -- verify-files governance/profiles/triage-report-v1/profile.json governance/profiles/triage-report-v1/profile.sig governance/trust-registry/public-keys.json DIGEST-DO-REGISTRO-OBTIDO-INDEPENDENTEMENTE
```

O pin não deve ser aprendido do mesmo pacote que se pretende verificar. A
assinatura do administrador e a ancoragem do registro devem ser verificadas
pela administração independente antes de provisionar esse pin. O verificador
local de perfil não confere uma assinatura administrativa ou checkpoint Rekor
por conta própria. Seu resultado afirma somente verificação contra o pin fornecido.

Em Rust, carregue o envelope `SignedTriagePolicyProfile`, o registro e o pin
independente; `VerifiedTriagePolicy::verify` é o único construtor público. Use
`policy.binding()` no executor, `policy.classification_policy()` no analisador
e mova a política para `ContainmentGate::new(policy)`. Nenhum launcher ou política
de desenvolvimento foi alterado para carregar automaticamente o candidato.

O perfil e as aprovações têm validade. Alterar qualquer campo exige novas
assinaturas e atualização do digest. O processo deve recarregar o registro após
revogação/rotação, substituindo o resolver; uma instância conserva o snapshot
verificado, embora confira os vencimentos em cada autorização.

O objeto pinado é `public-keys.json`, não `profile.json`. Alterar o registro
exige um novo pin distribuído pelo canal independente e nova verificação do
resolver. Como as aprovações também vinculam o digest do registro, sua mudança
exige recolher aprovações para o novo registro; atualizar apenas o pin não basta.

A janela de revogação não é zero: a instância já verificada conserva a aprovação
antiga até a substituição do resolver ou seu vencimento. Não há TTL de snapshot,
recarga periódica automática ou comparação de `revocation_epoch` implementados.
Antes da produção, o operador deve definir o limite de atraso aceitável, a
recarga e o comportamento em falha. Essa decisão operacional permanece pendente;
este roteiro não promete uma latência máxima de revogação.

`VerifiedTriagePolicy` reside em `arkhe-bugbounty` e depende da integridade do
binário implantado e de suas dependências. O pin protege a identidade do registro;
não atesta o código que o verifica. O verificador de artefatos `arkhe-verify.wasm`
não constitui uma verificação independente deste perfil de governança.

## Ordem para aprovação real

1. Os responsáveis fornecem a identidade exata de `requested_by` e revisam a
   tabela completa, módulos e validade. Recalcule o digest após essas alterações.
2. A administração independente finaliza o registro real, seus escopos e quórum,
   comprova sua aprovação/ancoragem e distribui o pin por canal independente.
3. Cada signatário confere o perfil e o registro finalizados, obtém seus bytes
   com `signing-bytes` e assina externamente. Reúna o quórum em `profile.sig`.
4. Execute `verify-files` com o pin externo. Registre o resultado e a procedência
   do pin, sem tratar sucesso local como prova da administração independente.
5. Defina o procedimento de revogação/recarga e só então integre o resolver
   verificado ao `ContainmentGate` da implantação e valide sua configuração.

Estado atual: **CANDIDATE, NOT APPROVED**. `profile.sig` está ausente; somente
`profile.sig.example.json` contém a estrutura vazia. Nenhuma dessas etapas
externas foi comprovada por esta atualização documental.

## O que significa a checagem local passar

O comando executado foi `python scripts/check_triage_candidates.py`. Ele confere
as identidades de conteúdo e exige retorno diferente de zero de `verify-files`
com `profile.sig.example.json` e o registro vazio. Seu PASS confirma a rejeição
do candidato, não a aprovação do perfil. A execução direta desse `verify-files`
retorna código 1: `registry requires at least two distinct governance keys and a
valid quorum`. Essa é a primeira rejeição; não demonstra isoladamente o teste
de assinaturas ausentes com um registro válido. Os testes de governança cobrem
separadamente pin e quórum com registro sintético válido.

O candidato é inerte porque não há `profile.sig`, o registro tem `keys: []` e
o exemplo tem `approvals: []` e digest de registro zero. Não há flag `active`.
`VerifiedTriagePolicy` tem campos privados e seu único construtor público exige
registro válido, pin não zero correspondente e quórum válido. O programa recebe
o pin como argumento: não pode comprovar sozinho que veio de canal independente.
Não basta fornecer qualquer pin para tornar o candidato verificável.

O CLI não oferece entrada para chave privada, seed ou mnemonic; prepara bytes
para assinatura externa. Na versão atual, `--help` cai na mensagem de uso e
retorna código 1; não há um handler dedicado de ajuda. A inspeção do parser
confirma os subcomandos e que flags desconhecidas não habilitam assinatura.

Para conferir novamente a identidade de conteúdo:

```powershell
cargo run --locked -p arkhe-bugbounty --bin triage_policy -- profile-digest governance/profiles/triage-report-v1/profile.json
```

Este artefato é um perfil de integração específico. Não é apresentado como um
`ResolvedPolicyArtifact` institucional já aprovado, protocolo congelado ou política
global do Arkhe. Nenhuma chamada HackenProof é efetuada por esses comandos.
