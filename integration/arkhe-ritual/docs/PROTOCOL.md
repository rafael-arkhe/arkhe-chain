# Protocolo v1 do protótipo

## Identidade e bytes

Request fechado: tenant UUID, OperationId, digest completo do WorkIntent,
parameters_digest, input_digest, policy_digest, índice do efeito, destino e
compromisso do payload. `effect_id = BLAKE3(domain_effect || canonical((tenant,
operation, parameters, effect_index, destination)))`. Revisões de política,
análise ou atestação não criam outra identidade para a mesma execução. O conteúdo
e o contexto completo ficam fixados no efeito; divergências são rejeitadas.
O digest de request compromete todos os seus campos em domínio diferente.
Múltiplos efeitos têm índices distintos.

Arrays de bytes são codificadas conforme o perfil `CanonicalEncode` existente;
não se assume que qualquer serializer Serde produzirá byte strings CBOR. O vetor
fixado define a representação interoperável da autorização. UTF-8 não é normalizado.

Envelope contém apenas JSON autoritativo e assinatura. O verificador desserializa
em tipo fechado, exige igualdade com a serialização canônica de transporte,
codifica a projeção no CBOR determinístico do Arkhe, recalcula BLAKE3 com domínio e
usa Ed25519 `verify_strict`. A assinatura cobre o digest de 32 bytes. Não existe
objeto alternativo fornecido pelo chamador para usar após verificar outros bytes.

## Três artefatos

1. Plataforma mock assina vínculo de chave de aplicação, medição aprovada,
   instância, desafio, nonce, tenant, pedido, perfil e prazo. O fornecedor real
   precisará de um verificador de formato específico; o mock não é NRAS.
2. Chave de aplicação assina Analysis: pedido completo, desafio, nonce, digest do
   envelope da plataforma e resultado. Gate real avalia evidência admitida e
   pedido exato. Chave independente do gate assina Authorization completa.
3. Destino emite evidência assinada com efeito, payload, destino, resultado e
   sucesso. Serviço de auditoria confirma estados/epochs e assina ExecutionReceipt
   vinculada à autorização, análise e instante registrado de despacho.

## Transações e tempo

Aceitação: verificar criptografia e tenant → bloquear desafio → conferir registro
persistido → controlar stop/política → inserir efeito tolerando conflito → bloquear
e comparar conteúdo → inserir autorização → consumir desafio → outbox/taxa → commit.
Um efeito existente retorna estado e não gera outro outbox nem débito. O nonce
consumido não é apagado nesta versão. Todos os relógios operacionais vêm do DB.

Aquisição: bloquear controle e efeito → conferir autorização ativa/validade →
epoch+1 e tentativa com mesmo epoch e lease → commit → chamada externa. Alterações
de política usam o mesmo bloqueio de controle. Controle serializa despacho local;
não é prometida execução única global sem deduplicação no destino.

Confirmação e recuperação bloqueiam efeito antes de tentativa. Um worker deve
apresentar seu attempt_id e epoch exatos. Recuperação de lease expirada transforma
tentativa/efeito em unknown e incrementa epoch. Não readquire unknown automaticamente.

Retry exige nova análise/desafio e autorização assinada vigente, conteúdo idêntico,
política ativa e destino durável conhecido. Se o destino já confirmou, reconcilia
em vez de enviar. Para destino sem deduplicação, fica unknown até intervenção.

## Checkpoint

Folha: digest do recibo canônico, cobrindo digests da autorização e análise.
Raiz e prova seguem o MMR do repositório. `SignedCheckpoint` vincula log, tenant,
stream, tamanho, peaks, perfil e raiz. Auditor recebe `CheckpointTrust` por canal
independente. Uma assinatura de checkpoint não prova tempo absoluto, ausência de
outros registros, conformidade do código medido ou honestidade econômica.
