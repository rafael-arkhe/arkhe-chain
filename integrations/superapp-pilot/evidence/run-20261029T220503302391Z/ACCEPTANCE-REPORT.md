# Aceitação local — Arkhe SuperApp Pilot

Execução: 20261029T220503302391Z (UTC). PASS nos comandos registrados em results.json.

- 12 testes Rust: sete cenários contratuais e cinco regressões de segurança.
- 13 testes Python, incluindo 26 posições/layouts MMR produzidos pelo perfil Rust existente.
- Execução WASM real; API permitida de laboratório retorna 1; API não declarada negada e gravada com sync_all.
- HTTP real em loopback: distribuição, admissão, execução e falha após encerramento do servidor.
- Pacote exportado e conferido pela implementação Python separada, sem importar o cliente Rust.
- Build release, formatação e Clippy concluídos. Logs, hashes de fontes e hashes de artefatos acompanham este relatório.

## Sete cenários

| Cenário | Teste Rust | Resultado |
|---|---|---|
| Bundle adulterado | t1 | PASS |
| Assinatura inválida | t2 | PASS |
| Checkpoint vencido, bloqueio de execução e broker | t3 | PASS |
| API não declarada, negação durável | t4 | PASS |
| Provider HTTP indisponível, sem fallback | t5 | PASS |
| Substituição e import real não admitido | t6 | PASS |
| Chaves do atacante contra confiança pinada | t7 | PASS |

## Limites

As chaves são fixtures públicas e determinísticas. O trust file é entrada externa ao pacote, mas foi gerado para a demonstração: não houve cerimônia independente de provisionamento de confiança nem auditor externo humano.
O verificador Python é uma implementação separada, criada nesta mesma execução. Valida assinaturas, bytes, inclusão MMR, política e janela temporal; não prova execução fiel ou completude do log.
Checkpoint único de laboratório, sem quorum de witnesses ou ancoragem externa. Eventos são persistidos em JSONL, append pelo aplicativo; não há proteção contra administrador do host, nem implementação de WormGraph de produção.
Sem interface gráfica: o status EVIDENCE_DEGRADED é exposto pela API e pelo CLI. Sem JS, câmera física, contatos reais ou TCC. APIs de demonstração apenas.
Sem deploy Akash, backend de inferência remoto, ensaio de recuperação entre provedores ou medição de custo. O teste de indisponibilidade cobre o transporte HTTP local de distribuição.
Relógio do host e configuração de confiança pertencem ao host confiável. Revogação offline além do snapshot/política não é alegada.
O diretório D:/arkhe não é um repositório Git; não foi criado commit/tag. Identificação por hashes de fontes e binários, sem alegação de build reproduzível bit a bit.
