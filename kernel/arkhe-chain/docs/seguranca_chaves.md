# Política de Blindagem de Chaves Privadas (KMS/HSM) e Contingência de Governança

Este documento lista requisitos de custódia que este crate ainda não cumpre. O processo do nó guarda a chave Ed25519 do proposer em memória. Não há HSM, não há roster k-de-n e não há imunidade a intervenção. Um administrador pode parar a publicação. Não pode, com o código atual, autorizar uma release sozinho, porque este crate não autoriza release.

---

## 1. Princípios Fundamentais

1. **Inexistência de Chave Mestra ou Backdoor:**
   O protocolo Arkhe não possui chaves administrativas globais (*god keys*), portas dos fundos ou papéis com capacidade de anular regras de consenso, reverter blocos ou mover fundos unilateralmente.
2. **Governança do Código como Lei (*Code-as-Law*):**
   A governança é exercida exclusivamente através de vereditos de conformidade criptográfica (`DecisionVerdict` no domínio canônico `AKG:VERDICT:v1`) e pela validação de blocos acordada entre os validadores da rede.
3. **Fail-Closed sob Qualquer Ambiguidade:**
   Qualquer anomalia de assinatura, integridade de snapshot, formato de prova ZK ou configuração de contingência força o nó a rejeitar a transação ou paralisar o avanço do estado (`FAIL_CLOSED:`), impedindo a aceitação silenciosa de dados inválidos.
4. **Isolamento e Não-Exportabilidade de Segredos:**
   O nó atual guarda o signer Ed25519 na memória do processo. Custódia em HSM ou KMS é um requisito de um ambiente que ainda não foi validado, não uma propriedade deste crate.

---

## 2. Arquitetura Criptográfica Híbrida e Requisitos de Chaves

Conforme especificado em `docs/admissao.md` e `docs/consenso.md`, o `arkhe-chain` opera sob um modelo duplo:

| Papel da Chave | Algoritmo | Tamanho da Chave / Assinatura | Domínio de Assinatura | Função no Protocolo |
| --- | --- | --- | --- | --- |
| **Proposer / Validador** | Ed25519 | Chave: 32 bytes<br>Assinatura: 64 bytes | `AKG:CHAIN:PROPOSER:v1`<br>`AKG:CHAIN:PRECOMMIT:v4` | Assinatura de blocos canônicos e atestações locais de precommit. `v4` liga a rodada, um único part e `arkhe-chain`. `v3`, `v2` e `v1` só reabrem arquivo antigo. Identidade de rede libp2p. |
| **Transação (Remetente)** | Ed25519 | Chave: 32 bytes<br>Assinatura: 64 bytes | `AKG:CHAIN:SENDER:v1` | Assinatura sobre o `subject` da transação (`nonce`, `sender`, `recipient`, `value`, `signature_mldsa`). |
| **Resistência Quântica (ML-DSA)** | ML-DSA-65 (FIPS 204) | Chave: 1952 bytes<br>Assinatura: 3309 bytes | `AKG:CHAIN:MLDSA65:v1` | Assinatura pós-quântica cobrindo os dados da transação (`nonce`, `sender`, `recipient`, `value`). |
| **Governança EVM / Bridge** | Conta Ethereum / Multisig | Endereço: 20 bytes | N/A (EVM calls) | Atualização de contratos de verificação ZK (`setVerifier`) em `ArkheValidityBridge.sol`. |

---

## 3. Blindagem de Chaves Privadas (KMS / HSM)

Para garantir que operadores ou terceiros não possam coagir ou extrair credenciais criptográficas, todo ambiente de produção de nós validadores e sistemas de governança deve aderir aos seguintes requisitos de blindagem:

### 3.1. Requisitos de Hardware e Módulos de Segurança
- **Certificação FIPS:** Uso obrigatório de módulos de segurança de hardware certificados sob **FIPS 140-2/140-3 Level 3 ou Level 4** (ou Common Criteria EAL 4+).
- **Material Não-Exportável (*Non-Exportable Keys*):**
  - Todas as chaves assimétricas devem ser geradas internamente no enclave de segurança via gerador de números aleatórios de hardware (TRNG).
  - Os atributos da chave devem proibir terminantemente a exportação de texto claro (*wrap* desabilitado ou restrito a esquemas de quorum M-de-N com divisão de segredo Shamir).
- **Operação de Assinatura Isolada:**
  - O nó validador solicita a assinatura enviando exclusivamente a mensagem canônica pré-formatada no domínio Arkhe específico.
  - O enclave criptográfico valida as restrições de formato antes de efetuar a computação da assinatura.
- **Suporte Pós-Quântico no KMS:**
  - Para as chaves ML-DSA-65 (FIPS 204), quando o KMS em nuvem não oferecer suporte nativo a primitivas pós-quânticas dentro do silício, deve ser utilizado um módulo criptográfico de isolamento baseado em Confidencial Computing (como AWS Nitro Enclaves, AMD SEV-SNP ou Intel SGX) com atestação remota criptografada, de modo que o material de semente nunca seja exposto ao sistema operacional host.

### 3.2. Segregação de Funções e Controles de Acesso (IAM / RBAC)
- Princípio do Menor Privilégio (*Least Privilege*): A identidade de execução do processo `ArkheNode` possui apenas permissão `kms:Sign` sobre o ARN específico de sua chave de validador.
- Políticas de KMS imutáveis e protegidas contra deleção imediata (*Key Deletion Protection* com quarentena mandatória de 30 dias).
- Desativação de permissões administrativas diretas para contas de usuário individuais em ambientes de produção.

---

## 4. Descentralização que o código ainda não entrega

Para assegurar que o desenvolvimento e a governança do código não sejam capturados ou paralisados por entidades únicas, aplicam-se os seguintes pilares:

### 4.1. Conjunto Distribuído de Validadores
- **Diversidade Jurisdicional e Geográfica:**
  - Os validadores registrados em `validators` devem ser operados por organizações e operadores independentes situados em jurisdições legais distintas.
  - Nenhum operador único pode controlar a maioria dos validadores ativos.
- **Imunidade a Reorganizações e Bifurcações:**
  - Conforme arquitetura do `arkhe-chain`, um bloco irmão emitido por outro proposer é registrado como `Fork` e **nunca substitui a ponta canônica** já adotada.
  - Proposers que tentem submeter blocos divergentes na mesma altura são sumariamente marcados com `Equivocation`.
- **Ausência de Quórum Unilateral:**
  - `bft_commit` só passa quando a rodada mais alta do hash canônico excede dois terços dos validadores configurados. O precommit novo exige um único part igual ao hash do bloco e o identificador `arkhe-chain`. A ponta não se move. Não há `CanonicalVote`.

### 4.2. Governança do Código-Fonte e Lançamento de Releases
- **Multi-Assinatura para Modificações de Código:**
  - Commits para repositórios canônicos e criação de releases de software exigem assinaturas criptográficas Ed25519/GPG de pelo menos $M$-de-$N$ mantenedores independentes.
- **Auditoria e Homologação Reproduzível:**
  - O dossiê `docs/homologacao.md` registra que a segunda pessoa ainda não reexecutou o gate e que o checkout isolado não é o comando de teste. A marca de homologação não foi concedida.
- **Distribuição Descentralizada de Código e Estado:**
  - Espelhamento permanente em protocolos descentralizados e imutáveis (como Hashtree/Nostr via `htree://` e git peer-to-peer), eliminando pontos únicos de censura em plataformas centralizadas.

### 4.3. Governança de Smart Contracts (Bridge)
- Em `contracts/ArkheValidityBridge.sol`, o parâmetro `governance` é imutável (`address public immutable governance`).
- O endereço de governança deve ser obrigatoriamente um contrato de Multi-Sig (ex: Gnosis Safe com timelock) mantido por entidades descentralizadas com quórum mínimo qualificado.
- A única prerrogativa do endereço de governança é atualizar o contrato de verificação ZK (`setVerifier`), evento auditável via `VerifierUpdated`. Não há métodos para resgate ou modificação retroativa de blocos liquidados (`settledBlocks`).

---

## 5. Política de Contingência e Modos de Falha (*Fail-Closed*)

A continuidade operacional e a proteção do patrimônio repousam em regras de contingência estritas:

### 5.1. Parada de Emergência Determinística (`emergency.halt`)
- **Mecanismo:** Definido através de `arkhe-chain.properties` (`emergency.halt=true`).
- **Comportamento:**
  - Bloqueio total e imediato de novas admissões na mempool (`ingest`), proposição e selamento de blocos (`propose_and_seal_block`), e adoção de blocos externos (`import_block`).
  - O estado, os saldos e os registros MMR permanecem 100% conservados e inalterados.
- **Fail-Closed em Caso de Configuração Inválida:**
  - Se o arquivo de propriedades for corrompido, removido ou configurado com valor diferente de `true` ou `false`, o método `load_emergency_halt` retorna `HaltConfig` e o nó é colocado em estado de paralisação preventiva (`inner.emergency_halt = true`).

### 5.2. Contingência em Liquidação ZK e Falhas de RPC
- Quando uma prova de liquidação for submetida sem que o verificador Groth16 esteja ativo ou caso ocorra indisponibilidade de transporte RPC:
  - O protocolo aciona `hold_for_absent_verifier`, criando uma `SettlementContingency` em memória.
  - A âncora Bitcoin permanece local (`broadcast = false`), nenhum saldo é alterado e nenhum recibo espúrio é forjado (`receipt = None`).
  - A contingência aguarda resolução descentralizada sem comprometer o livro-razão local.

### 5.3. Rotação de Chaves em Caso de Suspeita de Comprometimento
1. **Identificação e Isolamento:**
   Se uma chave de validador apresentar suspeita de vazamento, o operador deve revogar imediatamente o acesso ao KMS/HSM correspondente e notificar o conjunto de validadores.
2. **Substituição sem Ruptura de Consenso:**
   - A substituição do conjunto de validadores é refletida na inicialização de nós com a nova configuração de chaves públicas autorizadas.
   - Tentativas da chave antiga de assinar blocos na cadeia atual são automaticamente descartadas pelos nós atualizados (`NotProposer` ou `BadProposerSignature`).
3. **Persistência Segura:**
   O arquivo escrito agora é `AKGCHNS7`. `AKGCHNS6` e `AKGCHNS5` ainda abrem. Um arquivo adulterado que não reproduz o estado devolve `ChainError::Snapshot`.

---

## 6. Resumo de Conformidade

Este texto não assegura imunidade. O que o crate faz hoje é recusar assinatura ausente, exigir mais de dois terços dos validadores na rodada mais alta de `bft_commit` e parar quando `emergency.halt` está ligado. HSM, FIPS 140, Nitro, SGX e multisig de release não estão neste repositório.
