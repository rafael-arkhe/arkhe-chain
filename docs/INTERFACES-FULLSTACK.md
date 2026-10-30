# Interfaces fullstack — 21/10/2026

## Validação reproduzível

Na raiz: `python scripts/check_interfaces.py`. O comando executa os testes das
quatro aplicações e os três builds de produção. Chladni serve JavaScript sem
etapa de compilação. Use `--skip-build` para executar somente os testes.
O comando usa as dependências instaladas, sem reinstalação automática.

## Entrega local

| Interface | Fluxos verificados | Operação |
|---|---|---|
| Preflight | Renderização Angular, carteira Ed25519, assinatura Memo verificável, proxy RPC, falhas sem sucesso sintético | `npm run dev` em `apps/preflight`, porta 3000 |
| Melodic Lab | Comparação de notas, exportação SHA-256, salvar/listar/recuperar análise, integridade persistida, consulta de configuração, código Python servido pelo backend | `npm run dev` em `apps/melodic-lab`, porta 3001 |
| Intra | 25 testes de documentos, papéis, assinaturas, cadastro, avaliações, persistência e reconciliação; build standalone Windows | `npm run dev` em `apps/arkhe-intra`, porta 3003 |
| Chladni | 12 testes de HTTP, WebSocket, protocolo, histórico e leitura de saúde do kernel | `npm run dev` em `apps/chladni-dashboard` |

Os servidores Angular de produção também usam as portas 3000/3001 por padrão,
respeitam `PORT` e escutam somente em `127.0.0.1`.

## Relatórios Melodic

`POST /api/reports` persiste uma análise; `GET /api/reports` lista as 100 mais
recentes; `GET /api/reports/:sha256` recupera o conteúdo e verifica sua integridade.
Armazenamento padrão: `.data/reports` no diretório da aplicação; substitua com
`ARKHE_MELODIC_REPORT_DIR`. Cada relatório salvo é identificado pelo SHA-256 do
JSON com chaves ordenadas, excluindo o campo `report_hash`. O servidor acrescenta
`storage_provenance=client_analysis_unverified` antes de calcular o digest salvo.
Consequentemente, o digest salvo difere do digest da exportação original.

Persistir uma análise enviada pelo cliente não atesta o resultado. A aplicação
não declara identidade consultada, hash de áudio/MIDI medido, assinatura C2PA ou
ancoragem que não foram executados. Os presets continuam sendo exemplos.

As credenciais `ACOUSTID_API_KEY` e `ACRCLOUD_TOKEN` são lidas apenas do ambiente
do servidor. O endpoint de status retorna somente configuração presente/ausente;
configuração presente não comprova validade ou disponibilidade do provedor.

## Solana Preflight

A carteira efêmera usa Ed25519 nativo e começa sem saldo atribuído. A chave fica
na sessão do navegador. Carteiras antigas derivadas por SHA-256 não são usadas.
Airdrop aceita somente devnet/testnet/localnet. A assinatura do Memo é enviada
uma vez; falha ou resposta perdida não provoca novo envio automático. A UI retém
a assinatura conhecida para inspeção antes de qualquer nova tentativa.
Sucesso exige finalização e leitura da transação com o compromisso esperado.

O proxy aceita apenas métodos conhecidos e endpoints configurados; endpoints
adicionais exigem `ARKHE_SOLANA_RPC_ALLOWLIST` (URLs exatas separadas por vírgula).
Redirecionamentos do RPC são recusados. Carteiras externas usam o método
`request(signAndSendTransaction)` documentado pela Phantom. Uma carteira que não
exponha esse método retorna erro explícito.

Referências: [estrutura Solana](https://solana.com/docs/core/transactions/transaction-structure)
e [envio pela Phantom](https://docs.phantom.com/solana/sending-a-transaction).

## Limites externos

Esta rodada não enviou transações reais, solicitou airdrops nem validou uma
carteira externa conectada. As assinaturas e respostas RPC foram testadas com
controle local. Identificação AcoustID/ACRCloud, extração Demucs/basic-pitch e
embeddings CLAP não são executados pelo fluxo de notas do navegador. A UI usa
metadados de exemplo e cálculos locais. Essas etapas exigem integração própria
com os arquivos originais e serviços/dependências de áudio.

No Intra, publicação Rekor, geração por Ollama e execução de candidatos dependem
da configuração operacional existente; testes não provisionam serviços nem
substituem credenciais ou decisões de governança.

## Resultado desta execução

`python scripts/check_interfaces.py`: PASS, 45 testes aprovados e os três builds
concluídos. `python scripts/check_architecture.py`: PASS (24 crates Rust,
6 pacotes Node e 13 migrações preservadas). O Melodic continua com aviso de
bundle inicial de aproximadamente 535 kB, acima do orçamento de aviso de 500 kB
sem ultrapassar o limite de erro de 1 MB.

Os servidores compilados foram exercitados em portas temporárias: páginas,
health, bloqueio de Host, API desconhecida, status sem segredos e download dos
dois scripts Python passaram. O salvamento foi confirmado na interface do
navegador. Evidências locais: `ops/local/interface-smoke/http-results.json` e
`ops/local/interface-smoke/melodic-report.png`. Os servidores temporários foram
encerrados após a validação.
