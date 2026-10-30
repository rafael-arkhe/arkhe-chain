# Etapas locais restantes — governança tipada

## Entregue

| Etapa | Implementação / evidência |
|---|---|
| Vínculo tipado no WER | `ClassificationBinding` opcional, coberto pela projeção canônica e recibo Ed25519 |
| Contexto tipado | `SeverityClassification` e `ClassificationPolicy`, exigidos uma vez cada pelo novo perfil |
| Exigência no gate | Campo obrigatório no perfil verificado; texto livre não satisfaz a regra |
| Perfil verificável | Quórum Ed25519, mínimo de duas chaves públicas distintas, validade, escopo, solicitante e módulos |
| Registro | Digest fixado por canal independente; assinaturas vinculam perfil, registro e ID da chave |
| Idempotência | Proposta classificada inclui os dois digests nos parâmetros; `operation_id` v2 preservado |
| Persistência | PostgreSQL real: admissão, reconexão, replay, conflito e isolamento entre tenants |
| Compatibilidade | Vetores legados preservados byte a byte e três novos vetores independentes para o campo opcional |
| Arquivos revisáveis | Perfil candidato, registro vazio, identidades canônicas e roteiro de aprovação |

## Artefatos materializados

- `governance/profiles/triage-report-v1/profile.json`: candidato com campos tipados,
  módulos e identidade de solicitante ainda a revisar.
- `governance/profiles/triage-report-v1/PROFILE-DIGEST.txt`: identidade de conteúdo,
  sem aprovação.
- `governance/profiles/triage-report-v1/profile.sig.example.json`: formato vazio de
  aprovações, rejeitado pelo verificador.
- `governance/trust-registry/public-keys.json`: registro não provisionado, com
  `keys: []` e quórum de dois.
- `governance/trust-registry/REGISTRY-DIGEST.txt`: identidade do candidato vazio,
  **não um pin de confiança**.

Não foram criados `profile.sig`, `public-keys.sig`, chaves privadas institucionais
ou uma ancoragem de transparência. Os caminhos citados na resposta do usuário
foram tratados como propostas, não como arquivos previamente existentes. O
exemplo classificatório original está em `config/triage-classification.example.json`.

## Fluxo e testes

O perfil verificado restringe `TriageReport` ao solicitante e aos módulos
autorizados. Sua aprovação é verificada contra um digest de registro fornecido
independentemente. O executor recebe os digests tipados do analisador e constrói
uma proposta cujo digest inclui classificação e política. O gate confere esse
digest, a admissão do WER e a correspondência exata dos contextos tipados.

O teste E2E com cliente sintético comprova: perfil legado bloqueado antes de
dispatch, execução classificada uma vez, replay da resposta e conflito antes da
segunda escrita quando a classificação muda. Nenhuma chamada HackenProof real
foi feita. Testes reais de Ed25519 demonstram que retirar ou alterar o vínculo
tipado invalida o recibo anterior.

O gate PostgreSQL usa o papel runtime existente e tenants de teste novos. O teste
de persistência usa um verificador que fixa explicitamente o hash da fixture,
não simula aprovação institucional. Os testes de assinatura são separados e usam
chaves sintéticas. O contêiner PostgreSQL, inicialmente parado, foi iniciado para
os testes e devolvido ao estado parado, preservando o volume e as 12 migrações.

Saídas, códigos de retorno e snapshots reais estão em [RESULTS.md](RESULTS.md).

## Ativação ainda depende de evidência externa

1. Responsáveis revisam a política completa, o solicitante, os módulos e a validade.
2. Administração independente provisiona chaves, escopos, quórum e procedimento
   de assinatura/rotação do registro.
3. Assinatura administrativa e ancoragem do registro são comprovadas externamente;
   o pin confiável é distribuído por canal independente.
4. O quórum assina os bytes de aprovação do perfil e fornece `profile.sig`.
5. A implantação verifica os arquivos e instancia `VerifiedTriagePolicy`, usando
   o mesmo classificador no analisador e o binding desse perfil no executor.

O verificador de perfil não implementa a conferência autônoma da assinatura do
administrador do registro ou de um checkpoint Rekor; recebe um pin já confiável.
Sua mensagem de sucesso limita-se a quórum verificado contra o pin fornecido.
A separação administrativa não pode ser comprovada por caminhos de arquivos ou
pela mera existência de duas chaves. Revogações exigem recarga do registro/resolver;
os vencimentos são conferidos em cada autorização.

O candidato não é carregado automaticamente. A política de desenvolvimento
continua rejeitando transições protegidas sem configuração apropriada. As
pendências de escopo HackenProof e autenticação real permanecem separadas; a
allowlist MCP não foi expandida. Os 250 tópicos continuam sem avaliação individual.

## Reconciliação da auditoria do candidato

Foram explicitados no roteiro os três limites apontados: o pin identifica o
registro; revogação só chega a uma instância existente após recarga; e a
verificação do perfil depende da integridade do binário `arkhe-bugbounty`.
Não há TTL de snapshot ou `revocation_epoch`; a política operacional de recarga
e falha permanece a definir. O verificador WASM de artefatos não verifica este
perfil de governança de forma independente.

A ordem operacional exige finalizar o registro antes de coletar assinaturas,
pois estas vinculam seu digest. Uma alteração de registro exige novo pin externo,
novas aprovações e substituição do resolver. O perfil real também precisa de
identidade de operador e revisão da tabela parcial antes de ser assinado.

Correção factual da auditoria: `profile.sig` está ausente, não vazio; o arquivo
vazio é `profile.sig.example.json`. O estado continua **CANDIDATE, NOT APPROVED**.
Esta rodada altera documentação; não cria assinaturas, raízes de confiança,
ancoragem, decisão de produção ou ativação e não reexecuta os testes históricos.
