# ADR-007 — Contêiner de apresentação e estado do consumidor

Data: 2026-10-23. Estado: implementado no PoC.

## Contêiner

Escolhido `arkhe-kya-presentation@1`, com `format`, `label`, `receipt` e `status`.
`receipt` mantém o recibo criptográfico KYA existente; `status` é a associação e
snapshot assinados ou null. Nenhum mandato, hash de modelo ou declaração é
copiado para outro campo concorrente do contêiner. Contexto confiável, relógio,
desafio, pins, policy e state file são entradas separadas do consumidor.

O contêiner é transporte não confiável. Não ganha uma nova assinatura exterior:
os componentes são verificados e o status está vinculado ao digest do recibo.
Campos desconhecidos/duplicados e tentativas de incluir policy/context/declaration
são recusados. Isso não cria credencial legal, VC W3C ou prova de runtime.

## High-water mark

Responsável: **operador da CLI local**, não o emissor nem o bundle. O novo modo
`verify-presentation` exige um state file já inicializado. A chave de escopo é
BLAKE3(JCS([issuer, identificador da lista, propósito])); a sequência é guardada
por esse escopo, não por passaporte ou URL do peer.

O piso aplicado é max(policy externa, estado persistido). O estado só avança
após verificação das assinaturas/binding/lista. Avança também se a lista
autenticada revoga a credencial: esse resultado rejeitado não deve permitir
um downgrade posterior para uma lista antiga limpa. Falhas de assinatura não
elevam o piso. Não se reduz a sequência e não se aprende trust material do bundle.

`state-init` cria ficheiro novo, recusando overwrite. Verificação não reinicializa
estado ausente, vazio ou corrompido. Há lock exclusivo entre processos durante
a verificação/atualização e `sync_all` antes do retorno. Escrita interrompida
pode tornar o ficheiro ilegível; a próxima execução rejeita, em vez de reiniciar
em zero. O operador deve recuperar um backup confiável nesses casos.

É armazenamento **local confiável**, limitado a 4096 escopos e 1 MiB de leitura,
sem garantia contra rollback por administrador/disco comprometido. Não é ledger
distribuído, storage à prova de adulteração ou garantia do estado mais recente.
Não apaga nem rotaciona automaticamente estado. O operador conserva cópias e
controla permissões do diretório/ficheiro.

O comando antigo `verify` permanece stateless por compatibilidade, mas declara
`status_state.persisted = false`. Bibliotecas/WASM também não persistem estado
implicitamente. Browser ou backend futuros precisam de storage e policy próprios.
