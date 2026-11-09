# Sincronização

O protocolo é `/arkhe/block-sync/1`, request-response CBOR do libp2p 0.54.1. O servidor escuta com a chave Ed25519 do validador. O mesmo nó mantém o mesmo peer id. `accepted_peers` devolve só esse conjunto, em ordem de id. Não há Kademlia, mDNS nem bootstrap. Um peer fora do conjunto é `P2p("peer")` antes de qualquer importação. A mesma chave é `P2p("self")` e não disca para si.

Os pedidos são `Tip`, `Block { hash }` e `Child { parent }`. `fetch_tip_block` não existe. Importar só o bloco da ponta de uma cadeia de altura 2 é `ParentMismatch`. A adesão é `sync_canonical`, que liga cada ancestral.

Uma chamada importa no máximo 128 blocos. O cursor permanece para o intervalo inteiro. Uma mudança de ponta descarta o cursor. Pai gênese quando a ponta local não é a gênese, ou corpo ausente, pode ser `P2p("fork")`. O tempo limite de uma chamada é 30 segundos.

Uma cadeia de 65 blocos fecha numa chamada. Uma de 129 fecha em duas. Uma de 1025 fecha na nona chamada: oito devolvem o limite e a nona importa o bloco 1025.
