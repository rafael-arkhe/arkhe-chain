# bounty_evidence v0.1: candidato local e testes negativos

Atualização: a API atual exige origem externa do bloco/prioridade e oferece roteamento por operador; veja [correções de ancoragem](ANCHOR-PRIORITY-OPERATOR-ROUTING-2026-10-18.md). Os formatos v2 e a ausência de prioridade descritos abaixo são históricos.


Integrado em `integration/arkhe-bugbounty/src/bounty_evidence.rs`, exportado como `arkhe_bugbounty::bounty_evidence`. São quatro componentes, sem vínculo automático com autorização, fila, banco, transação blockchain ou pagamento. Funções de hash/predicado são puras; registro e journal são máquinas de estado determinísticas em memória, com mutação explícita. Nenhum módulo fornece uma garantia de produção por si só.

## A. Política de PoC

PocPolicy fixa chain, fork, drift máximo, alvos, ativo e ganho mínimo. evaluate_poc calcula o resultado a partir das medições fornecidas; não aceita um success booleano. Políticas sem alvos, com identificadores sentinela nulos, chain zero ou ganho mínimo zero são inválidas. O limite de drift é inclusivo e a subtração só ocorre após verificar ordem dos blocos.

Não há execução de PoC nem validação de origem dessas medições. Um atacante pode mentir sobre attacker_gain se o chamador não verificar o harness e seu recibo. Ganho em um ativo não demonstra exploração real, causalidade ou prejuízo líquido: custos, outras posições, estado do fork, contrafactual e invariantes semânticos exigem política/harness específico. Este predicado não equivale a Foundry, reprodução ou differential check.

## B. Compromisso cego

Preservado o formato SHA-256 com domínio e prefixos u64 big-endian por parte. O SHA-256 manual foi substituído pelo `sha2` já declarado no workspace. Os três vetores conhecidos recebidos continuam em teste, além da separação de domínio e partição. Esta API não altera os formatos canônicos BLAKE3 do Arkhe.

commit vincula nonce de 32 bytes e bytes exatos do relatório; verify_reveal confere a abertura. O chamador deve gerar nonce imprevisível de alta entropia e guardá-lo fora do log público; nonce fixo/previsível não oferece ocultação robusta de relatório adivinhável. Não há normalização do relatório. A implementação só calcula o compromisso, não ancora nada no Rekor ou em blockchain.

pre_existence_holds é apenas comparação de um timestamp externo fornecido: exige anchor < patch. Para concluir pré-existência, o chamador precisa verificar a autenticidade do checkpoint, inclusão desse compromisso exato e a origem do timestamp do patch. O booleano isolado não prova isso nem a verdade do relatório.

## C. Registro de verificadores

VerifierRegistry vincula verifier_id, operator_id, key_id, nível declarado, validade e revogação. A autenticação aqui é correspondência de metadados, não validação Ed25519 ou TEE. Os IDs, níveis e operadores devem vir de uma configuração aprovada e evidência autenticada a montante; preencher Hardware em um struct não cria atestação.

A contagem elimina operadores repetidos entre entradas que correspondem a chave, validade e nível solicitados; entradas inválidas não contribuem. Dois IDs sob um operador contam uma vez. Operadores distintos declarados não provam custódia independente ou ausência de controle comum. O registro não foi ligado ao ReviewRouter como atalho de autoridade.

Correções: BTreeMap evita estado de hash aleatório; insert agora retorna Result e rejeita IDs nulos, intervalos vazios/invertidos e duplicação de verifier_id. Não substitui silenciosamente operador/chave/estado revogado. revoke só desativa; não existe reativação implícita. Validade é [not_before, not_after), com expiração no limite superior. Atualização/rotação persistente do registro requer governança própria e permanece pendente.

## D. Simulação de payout

PayoutJournal faz bookkeeping local, sem transferência. Applied significa inserção em memória. Não há persistência, concorrência entre processos, nonce on-chain, recibo de liquidação, moeda/chain/tenant nem exactly-once remoto. Essa estrutura não substitui PgOperations e não é usada pelo executor.

Corrigida uma falha de binding do trecho: com o mesmo op_id, mesmo destinatário/valor e outro vuln_id, o original retornava Replayed. O digest `ARKHE/PAYOUT-PARAMS/v2` inclui vuln_id, recipient e amount. Agora esse retry retorna ParameterMismatch e não consome a segunda vulnerabilidade. Não há migração de dados existentes porque o candidato é novo e não persistente.

IDs/destinatário nulos e valor zero retornam InvalidParameters antes de reservar estado. Repetição idêntica retorna o valor original; outra operação com mesmo vuln_id retorna DuplicateVulnerability. Essa deduplicação é igualdade do identificador: não detecta variantes semânticas do mesmo bug. Canonicalização, escopo/chain/ativo/tenant, autorização, custódia e liquidação continuam exigindo contrato próprio. Os domínios SHA-256 deste candidato não substituem o OperationId canônico existente.

## Verificação e estado

Os testes recebidos foram preservados com adaptação da inserção falível. Regressões adicionais cobrem mudança de bug sob a mesma operação, reserva indevida, IDs inválidos, revogação sem sobrescrita, validade no limite superior, políticas PoC vazias, blocos u64::MAX e montante u128::MAX.

Evidências em `docs/evidence/local/2026-10-18/bounty-evidence/RESULTS.md`. Sem PoC real, transferência, ancoragem, atestação de hardware ou revisão humana nesta rodada. Produção não autorizada; candidato local, sem classificação THEOREM.

Resultado local: 116 testes do workspace passaram, sem falhas. Formatação e arquitetura passaram. Os três comandos registrados preservaram os hashes de fonte antes/depois; os hashes dos logs foram conferidos. Limites operacionais em readiness.json.
