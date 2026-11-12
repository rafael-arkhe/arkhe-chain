# Estado e snapshot

A conta de gênese é `genesis-alloc`. A oferta inicial é `100_000_000`. O débito e o crédito de uma transferência acontecem juntos, ou nenhum dos dois acontece.

A folha do MMR é `tx.record()`, o hash `AKG:CHAIN:TXREC:v1` da transação canônica inteira, incluindo o payload. A fronteira é `arkhe_verify_core::rbb::mmr::Frontier`. `mmr_root` devolve essa raiz crua.

`state_root` é outro compromisso, domínio `AKG:CHAIN:STATE:v1`, sobre a raiz MMR, a contagem, os saldos e os nonces. As chaves das contas não entram nesse compromisso. O cabeçalho do bloco guarda `state_root`. Na importação, o estado reproduzido tem de bater com esse campo e com `mmr_count`.

Quando o registro de atestados tem ao menos uma folha, o domínio passa a `AKG:CHAIN:STATE:v2` e o compromisso cobre também a raiz e a contagem desse registro. Um estado com o registro vazio mantém o compromisso v1, byte a byte. `mmr_count` continua contando só transações. Os detalhes estão em [atestados.md](atestados.md).

## Arquivo

`ArkheNode::open` relê a cadeia desde a gênese. `new` sem caminho fica só na memória.

O arquivo escrito sem caminhada pausada é `AKGCHNS7`: altura, ponta, picos do MMR, saldos, nonces, blocos, mempool, chaves Ed25519, chaves ML-DSA, blocos irmãos, precommits com rodada e as citações de blocos de execução. O arquivo termina com os 32 bytes do BLAKE3 do gênese. `AKGCHNS8` acrescenta a ponta anunciada, o cursor e os corpos já conferidos quando o sync para no limite. O import que fecha apaga esse cursor. `AKGCHNS9` acrescenta a altura confirmada pelo quórum. `AKGCHN10` junta essa altura ao cursor de sync. `AKGCHNS6` ainda abre; o precommit desse arquivo não traz rodada e volta como rodada 0. `AKGCHNS5` ainda abre e traz as citações vazias. `AKGCHNS1`, `AKGCHNS2`, `AKGCHNS3` e `AKGCHNS4` devolvem `Snapshot`. `ArkheNode::open` ainda abre um arquivo sem esses 32 bytes, e a escrita seguinte grava o hash de quem abriu. O processo `arkhe-chain` não adota esse arquivo: devolve `Genesis` e não reescreve. Outro BLAKE3 é `Genesis` nos dois caminhos, e o arquivo não é reescrito.

Uma diferença de altura, ponta, picos, saldos, nonces ou chaves também devolve `Snapshot`. Um precommit com a assinatura alterada não abre, e o arquivo não é reescrito. Uma escrita que falha no selo não move ponta, saldo nem mempool. Uma escrita que falha ao gravar um precommit remove esse precommit da memória.

A importação e o selo reexecutam a fila. O que deixou de aplicar sai. O nonce seguinte permanece.
