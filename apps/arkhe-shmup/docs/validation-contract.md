# Contrato Arkhe Shmup v1 (proposto)

Este é um protocolo novo do jogo, não a API existente de arkhe-verify.
O crate Rust contém a orquestração fail-closed e portas para adaptadores.
Não há rota HTTP, runtime WASM, replay autoritativo ou ponte ZK conectados.
Sem esses adaptadores, nenhuma partida pode distribuir créditos.

## Transporte e identidade

HTTPS, autenticação de jogador e tenant extraídos da sessão do servidor.
Não aceitar identidade do corpo como autoridade. Limitar corpo a 4 MB,
replay a 108000 ticks (30 minutos a 60 Hz), proof a 128 KB; aplicar rate limit.
UUIDs, inteiros sem sinal; seed u64 em string decimal no JSON para evitar
perda de precisão. Hashes de 32 bytes em hexadecimal minúsculo.

`POST /v1/shmup/matches` retorna ticket assinado com `protocol_version`,
`match_id`, `seed`, `rules_hash`, `verifier_hash`, `issued_at`, `expires_at`,
`ranked`, `challenge`, `season_id`, `entitlement_snapshot_id` e `signature`.
Servidor guarda cópia, jogador/tenant, estado aberto e nonce de uso único.
Algoritmo e key_id são definidos pelo deployment; rejeitar versões desconhecidas,
ticket expirado/reutilizado e jogo sem rules/verifier aprovado.

`PUT /v1/shmup/matches/{match_id}/completion` usa o schema `completion.schema.json`.
`Idempotency-Key` deve ser o match_id. Replay duplicado idêntico retorna o mesmo
recibo; mesmo ID com corpo diferente retorna conflito. Apenas um commit por partida.

Exemplo de resumo (o replay base64 real deve acompanhar):

```json
{
  "protocol_version": 1,
  "match_id": "11111111-1111-4111-8111-111111111111",
  "seed": "42",
  "rules_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "ticks": 3600,
  "waves": 2,
  "absorbed": 10,
  "bosses": 1,
  "final_hash": "0707070707070707070707070707070707070707070707070707070707070707",
  "claimed_base_points": 630,
  "replay_base64": "",
  "human_proof_base64": ""
}
```

Campos adicionais são rejeitados. Valores declarados são comparados com replay;
o exemplo vazio não é uma partida válida. Resposta aceita: `receipt_id`,
`match_id`, `credited_points`, `evidence_hash`, `mmr_status` (`pending`/`anchored`).
Não devolver `anchored` antes da confirmação da ancoragem. Erros 400 formato,
401 sessão, 403 prova/ranked, 409 conflito, 422 divergência, 503 verificador ou
ledger indisponível. Em qualquer erro, zero crédito. Retry de 503 usa mesmo ID.

## Determinismo e WASM

O protótipo Godot usa floats e RNG da engine para demonstração visual. Não é
compatível bit a bit com Rust. Antes de habilitar economia, mover simulação
para um núcleo compartilhado Rust, posições/velocidades em Q16.16, inteiros
com overflow checado e PRNG fixado por versão. Reproduzir nesse núcleo as
entradas quantizadas do cliente e a mesma ordem de colisão/pool.

Formato binário de entrada proposto: por tick, little-endian `tick:u32`,
`x:i16`, `y:i16`, `flags:u8` (bit 0 contato, 1 absorção, 2 dash). Um registro
por tick; sequência estrita desde 0, coordenadas no viewport, flags restantes
zero. Estado serializado com ordem fixa de pools/slots, RNG, HP, cooldowns,
contadores e grants de revive; nunca floats ou JSON na cadeia criptográfica.

`H0 = SHA256("arkhe.shmup.v1\\0" || ticket_hash)`;
`Hn = SHA256(Hn-1 || input_tick || canonical_state_tick)`.
`ticket_hash` deriva da representação canônica do ticket sem assinatura;
essa representação e a serialização do estado precisam de vetores normativos
antes de produção. Checkpoints a cada 120 ticks. Hashes somente detectam
divergência; o servidor precisa reproduzir o estado e validar regras.

ABI proposta para um módulo dedicado `arkhe-shmup-verify.wasm`:
`verify(ptr,len,out_ptr,out_cap)->status`, memória limitada, nenhum relógio,
I/O ou estado global persistente. Ticket, regras e entradas no request;
limitar fuel e tamanho; traps/versão incompatível/timeout rejeitam. Em mobile
nativo Godot exige runtime WASM via GDExtension ou usar o mesmo núcleo nativo;
não confundir a existência do `arkhe-verify.wasm` do repositório com suporte
automático ao replay do jogo. Validação local em worker e checkpoints fora
do frame crítico; o servidor repete a validação independentemente do cliente.

## Arkhe, WormGraph, MMR e Passport

Adaptar evidência à API real de `evidence/arkhe-wormgraph`, usando encoder
AKG-CBOR-v1 de `specs/akg`, domínio registrado, pais do DAG e hash de registro.
Não substituir por JSON ordenado ou CBOR genérico. Commit transacional deve
consumir ticket/concessões, conferir saldo, inserir recibo e outbox de
ancoragem MMR; publicar outbox com retry idempotente. Recibo expõe evidência
e estado de ancoragem. Compra, renovação e VIP usam o mesmo princípio;
reembolsos adicionam eventos compensatórios. O SQL fornecido é uma base de
ledger, não contém saldos, outbox ou transação de produção.

Ranked exige adaptador Human Passport/UltraHonk com chave/circuito fixados,
challenge vinculado à partida, audience, temporada, validade e nullifier
único transacional. Verificar consentimento e minimização de dados. Sem
prova ou verificador, ranked rejeita; partida casual segue regras próprias.
Prova de humanidade não garante que cada entrada de gameplay veio de humano.
Replay e hashes não detectam toda injeção de memória: só rejeitam divergências
observáveis pelas regras autoritativas, sem prometer anticheat absoluto.

## Persistência

SQL separado: aplicar após `arkhe_assert_tenant()` do repositório. Usar
`SET LOCAL app.tenant_id` dentro da transação de conexão autenticada;
rollback e retorno ao pool limpam contexto. Nunca permitir que o cliente
defina esse valor. Role backend não-owner, sem BYPASSRLS ou TRUNCATE.
RLS isola tenants; serviço também confere player_id. Trigger append-only
e revogação de permissões protegem contra o role da aplicação, não contra
DBA. MMR externo detecta alterações privilegiadas depois da ancoragem.
