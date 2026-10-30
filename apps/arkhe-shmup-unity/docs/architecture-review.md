# Decisões sobre o texto recebido

O novo texto foi aplicado como orientação para a versão Unity. O protótipo
Godot e o esqueleto Rust anteriores foram preservados. As correções abaixo
fazem parte da implementação; as afirmações do texto não foram tratadas como
resultados de teste.

| Trecho recebido | Correção adotada |
|---|---|
| Pool cresce com `Instantiate` ao esgotar | Toda a capacidade é criada em `Initialize`; esgotamento retorna null. A contagem vem de slots ativos, sem aproximação por prewarm. |
| `Return` em `OnDisable` | O pool controla a ativação e a devolução explicitamente. Identidade de pool/slot e geração rejeitam retornos duplicados ou callbacks de uma vida anterior. |
| `verticalOffset * deltaTime` somado ao delta | Offset limita o alvo acima do dedo; não injeta movimento por frame. Movimento relativo, captura por fingerId e cancelamento ao perder foco. |
| Hash do resumo comparado ao `state_hash` dentro desse próprio resumo | Compromisso do estado, digest das entradas e bytes assinados são objetos distintos. Elimina autorreferência e circularidade da assinatura. |
| Backend emite chave privada, mas ela nunca sai do keystore | Dispositivo gera a chave; backend registra a pública após challenge autenticado. Suporte Ed25519 em hardware deve ser verificado por plataforma; não é garantido neste scaffold. |
| Assinatura + upper bound de eventos declarados impedem inventar score | Assinatura autentica a origem; não prova que os eventos aconteceram. Recompensa real exige replay autoritativo e regras versionadas. O gate Rust anterior exige igualdade do resumo reproduzido. |
| `SELECT FOR UPDATE` seguido por queries em PgPool | Lock só protege corretamente a operação se SELECT, consumo, saldo, recibo e outbox compartilham uma transação/conexão. Em erro, rollback de tudo; retry idempotente. |
| Leaf por concatenação de campos representa AKG-CBOR | Usar o encoder/domain registry e envelope reais do repositório, com pais do DAG. A fórmula recebida não implementa AKG-CBOR-v1. |
| Nullifier de liga rejeitado depois de qualquer partida | Nullifier de liga identifica inscrição única; reutilizar essa inscrição pelo mesmo jogador nas partidas autorizadas. Desafio e consumo por partida evitam replay. Rejeitar vínculo do mesmo humano a outra conta na mesma liga. |
| `tenaxum` e `audit::ensure_isolation` já fazem parte do backend | Não encontrados na busca em storage/sql e kernel/arkhe-core. Integração não foi assumida. O contrato usa o `arkhe_assert_tenant()` real, que retorna text. |
| Pool prova zero GC; pontuação limitada prova anticheat | São hipóteses de implementação com limites. Callbacks, renderização, UI e SDKs ainda podem alocar. Eventos auto-declarados coerentes podem ser falsos. |

O offset é limitado pelas bordas seguras e pela suavização/velocidade máxima.
Portanto não existe garantia absoluta de separação dedo/nave em cada frame,
especialmente ao tocar acima da nave ou no topo da tela. O teste confirma a
restrição do alvo em condições válidas, sem prometer uma impossibilidade
geométrica. Se o produto exigir ocultação zero, reserve uma área inferior
exclusiva para controle e faça a nave operar fora dessa área.

## Contrato e adaptadores

`MatchSubmissionGate` valida estrutura e exige codec canônico, signer e
verificador local explícitos. Qualquer ausência/erro impede criar submissão;
não há implementação fictícia de WASM. O núcleo Rust em
`../arkhe-shmup/backend` segue separado e só distribui por `RewardLedger` após
`Integrity.replay`. Nenhum dos adaptadores de produção foi conectado.

O DTO C# da proposta usa IDs/seed de 32 bytes; o protocolo JSON anterior usa
UUID e seed u64. São representações distintas, NÃO intercambiáveis. Uma
migração exige versão de protocolo e mapeamento assinado/armazenado no
servidor; não truncar IDs ou seeds. Este protótipo não envia nenhum deles.
O contrato de transporte anterior continua em
`../arkhe-shmup/docs/validation-contract.md` (caminho relativo a apps).

WASM local é validação de consistência, sem prova de execução honesta. Mesmo
uma assinatura válida e hash coerente não permitem ao servidor dispensar o
replay. Chaves/tickets e multiplicadores fornecidos pelo cliente nunca são
autoridade. Divergência/trap/timeout rejeitam, e erros transitórios mantêm
submissão pendente, sem saldo provisório. Não mapear todo erro a 403: formato,
autenticação, conflito e indisponibilidade têm semânticas próprias no contrato.

Compras só alteram entitlements depois de recibo validado e evidência durável
no ledger transacional. Se o produto exigir checkpoint MMR externo prévio,
manter entitlement `pending_anchor` até esse checkpoint. Caso contrário,
outbox durável pode publicar ancoragem posterior, com estado explícito no recibo.
Não confundir append no WormGraph com confirmação externa de MMR.

Inscrição Human Passport, circuito Noir, emissor, revogação, verifier UltraHonk,
versionamento da chave e política de nullifiers precisam de implementação e
testes reais. Não há fallback silencioso para attestation em liga que exige ZK.
Uma prova humana também não atesta que cada toque foi feito por uma pessoa.
