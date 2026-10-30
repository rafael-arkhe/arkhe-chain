# E01 — avanço no transporte

Implementado transporte candidato Memo/devnet com payload versionado, assinatura
Ed25519, simulação, journal antes de envio e conferência do recibo finalizado.
Seis testes locais PASS; arquitetura PASS. Sem novas dependências.

Smoke real: 3 transações preparadas; taxa estimada de 5.000 lamports por mensagem;
as 3 simulações retornaram AccountNotFound na conta efêmera sem saldo.
Tentativa de airdrop de 0,01 SOL de teste: RPC -32603 Internal error.
Nenhuma transação foi transmitida. Ancoragem NOT_RUN; resultado INCOMPLETE.
Taxa estimada não é custo pago, e devnet não comprova custo mainnet.

Fontes e respostas preservadas. O runner usa o mesmo RPC para envio/leitura;
ainda falta observação independente e matriz de 90 tentativas. O segredo da
carteira efêmera não foi persistido. Não foi lida carteira existente.
Próxima dependência: faucet devnet operacional; depois smoke finalizado, leitor
independente e execução da matriz. Ver docs/E01-SOLANA-TRANSPORT.md para comandos,
contrato e limitações. runtime_verified=false permanece inalterado.
