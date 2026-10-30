# E01 iniciado — baseline local

PASS: lotes determinísticos de 1.000, 5.000 e 10.000 folhas, gerados no núcleo
Rust em release; 100 provas por lote verificadas no WASM/Node. Todas as 1.200
adulterações de folha, raiz, caminho ou contagem foram rejeitadas.

Latências completas em offline-results.json. São observações locais, sem
validação em navegador ou máquina independente. Native/WASM compartilham
algoritmos; paridade não é auditoria independente do algoritmo. Fetch bloqueado
no processo não constitui isolamento de rede no SO.

Devnet respondeu a três consultas somente de leitura. Nenhuma transação foi
assinada ou enviada. Ancoragem, taxas, finalização e 90 tentativas permanecem
NOT_RUN. Não há carteira exclusiva E01 provisionada nesta entrega; nenhuma
carteira existente foi lida. Não foi instalada CLI ou solicitada moeda de teste.

## Reprodução

```powershell
cargo build -p arkhe-verify-core --example poc_mmr_batch --release --locked --offline
# Capturar stdout do executável em fixtures.json usando encoding UTF-8.
node scripts/poc_e01_verify.mjs fixtures.json offline-results.json
python scripts/check_architecture.py
```

Fontes e fixtures preservados, hashes em SHA256SUMS. O exemplo usa somente dados
sintéticos e não acessa rede/chaves. O próximo estágio exige implementação do
transporte, payload versionado e signer exclusivo devnet; envio/finalização e
leitura independente ainda precisam ser ensaiados.

Referências técnicas consultadas: [RPC oficial](https://solana.com/docs/rpc/http)
e [getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage).
Auditoria arquitetural PASS. runtime_verified=false; nenhum selo foi alterado.
