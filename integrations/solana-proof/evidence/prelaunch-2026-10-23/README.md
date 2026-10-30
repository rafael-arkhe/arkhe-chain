# Evidências de pré-lançamento — 23/10/2026

**32 testes automatizados aprovados; lançamento público ainda bloqueado.**
Matriz de alcance e pendências: [PRELAUNCH.md](../../PRELAUNCH.md).

- [Resumo estruturado](summary.json) e [JUnit dos 32 testes](unit-tests.xml).
- [Snapshot dos deployments públicos, hashes e autoridades](deployments.json).
- [Binários oficiais de teste: relatório](fixtures/report.json).
- [Cópia dos programas de mainnet executada localmente](mainnet-snapshot/report.json).
- [Cópia dos programas de devnet executada localmente](devnet-snapshot/report.json).
- [Candidato de 125 bps na curva e no DAMM v2](fee125-candidate/report.json).
- [Airdrop local de 1B com distribuição 60/20/15/5](airdrop-local/report.json).
- [Airdrop na devnet pública bloqueado pelo faucet](airdrop-devnet/report.json).
- [Carga sintética e dois processos concorrentes](load-report.json).
- [Regressão de Token-2022 / MemoTransfer](token2022-regression.json).

Cada cenário de Meteora inclui `checks.json`, `events.json`, `receipts.json`,
`transactions.json`, `audit-report.json` e a exportação do journal com checkpoint
assinado e chave pública em `audit/`. As transações serializadas contêm assinaturas
públicas, sem chaves privadas.

O cenário de devnet inclui o estado público entregue aos workers de retomada e
o resultado de cada processo. Eles não leram as chaves originais do criador.
A rejeição do worker perdedor não torna o cenário uma falha: o critério era
exatamente um vencedor. As negativas de autorização/slippage/LP são de preflight,
identificadas como tal em `checks.json`.

As cópias de mainnet/devnet têm genesis **local**. Não são lançamentos públicos
nem comprovam todos os serviços do ambiente público. Inspeção pública foi somente
leitura. Os programas públicos continuam atualizáveis e devem ser revalidados
antes de um lançamento.

Os checkpoints assinados foram emitidos com TTL de teste. Para conferir sua
assinatura histórica, usar o tempo da execução e a chave pública de teste
preservada; isso não constitui inscrição numa raiz de confiança de produção.
Não há prova offline de consenso Solana nestes arquivos.

O airdrop local usa outro mint, independente do candidato DBC de taxas. Juntar
os dois sem reservar explicitamente tokens para venda excederia o supply.
Reservas de equipe/tesouro/LP neste airdrop não são vesting, DAO ou depósito em pool.

[source-manifest.json](source-manifest.json) registra os hashes dos arquivos de
implementação e testes deste pacote na conclusão do ensaio. Os binários `.so`
usados permanecem no diretório `output/prelaunch/`; seus hashes estão nos perfis.
