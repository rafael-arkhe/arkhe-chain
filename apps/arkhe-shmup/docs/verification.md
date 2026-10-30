# Verificação — 26/10/2026

Executado em Windows, Godot 4.5.1 oficial, modo headless:

| Verificação | Resultado |
|---|---|
| Importação do projeto e scripts no editor | Passou sem erros de parse |
| `--script tests/pool_test.gd` | Passou: capacidade fixa, exaustão, reutilização, double release, expiração, 10000 resets, consultas entre células, arraste, gesto e assinatura |
| `--script tests/game_test.gd` | Passou: absorção, auto-fire, dash invulnerável, 1000 tiros hostis, 600 ticks, colisões, derrota e reinício |
| Cena principal `--quit-after 600` | Terminou com código 0 e sem erros |
| `cargo test --manifest-path backend/Cargo.toml` | 5 testes passaram |

Testes Rust usam adaptadores de teste deliberadamente isolados. Não comprovam
replay criptográfico, idempotência de banco, verificação de recibos de loja,
ZK ou ancoragem MMR. Nenhum serviço de produção foi conectado/modificado.
Migração SQL não foi aplicada; requer PostgreSQL 16 e roles configuradas.

Headless comprova execução lógica; não mede qualidade visual, touch em aparelho,
GPU, consumo, alocações internas da engine ou orçamento de frame. Android/iOS,
safe-area, HDR, compressão, tamanho de pacote e metas de FPS seguem pendentes.
