# F0/F1 — evidências locais

Reprodução: `python scripts/regulatory_f0_f1_checks.py`. Requer toolchain instalada e conexão Podman `arkhe-runtime` disponível com PostgreSQL 16 local para o harness isolado.

| Gate | Resultado observado | Log |
|---|---|---|
| Formatação raiz | exit 0 | [root-format.log](root-format.log) |
| Testes raiz | 296 aprovados, 0 falhas, 3 ignorados | [root-tests.log](root-tests.log) |
| Clippy raiz, todos os targets padrão | exit 0, `-D warnings` | [root-clippy.log](root-clippy.log) |
| Workspace Pix independente | 16 aprovados, 0 falhas | [pix-tests.log](pix-tests.log) |
| Clippy Pix | exit 0, `-D warnings` | [pix-clippy.log](pix-clippy.log) |
| Build runtime real | exit 0 | [runtime-build.log](runtime-build.log) |
| Servidor HTTP e PostgreSQL reais | 6 verificações, exit 0 | [live-http-postgres.log](live-http-postgres.log) |

[Manifest e hashes](results.json), [migração](live-migration.log), [resposta HTTP e ambiente](live-result.json).

PostgreSQL observado: 16.15; 17 migrações aplicadas/verificadas no banco vazio. A role não administrativa não tem privilégios UPDATE/DELETE/TRUNCATE em wormgraph_records. `/v1/health` e `/health` responderam 200 com autenticação e 401 sem ela. `/v1/retention` retornou 366/92 dias e declarou histórico operacional não medido. A configuração de 365 dias foi recusada no boot. O contêiner de teste foi removido.

Há quatro testes novos no pacote arkhe-pix-bcb: segregação em ambas as direções/ambientes, estados desconhecidos/inativos/não checados, reutilização de credencial e gate da entrada de assinatura. São registros de confiança sintéticos, **não certificados X.509 reais**. Uma entrada CERTPIA válida na política ainda resulta em NotImplemented na fronteira de assinatura de produção.

Os três testes PostgreSQL ignorados da suíte padrão não foram convertidos em PASS por este harness. Não houve operação PSP/BCB, assinatura ICP-Brasil, HSM, teste de doze meses ou CI remoto do patch.

[Mapa de requisitos, fontes oficiais e limitações](../../REGULATORY-ALIGNMENT-2026-10-24.md).
