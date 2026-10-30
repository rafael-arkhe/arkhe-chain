# Validação — Arkhe GovTech

Data: 24/10/2026. Aplicação local em http://127.0.0.1:3012/govtech.

## Resultado

- Build Next.js de produção: PASS, incluindo `/govtech` (12,6 kB da rota; 123 kB no primeiro carregamento).
- TypeScript: PASS.
- Suíte do Intra com o GovTech: 87 testes, 87 passaram, zero falhas ou skips.
- Teste direcionado GovTech após inclusão do verificador HTML independente: 9 testes, todos passaram.
- Navegador IAB: criação e envio de proposta sintética como owner; revisão e assinatura Ed25519 como reviewer; retorno ao owner e execução local; download do pacote e verificação no browser. Quatro eventos e um recibo persistidos. Nenhum efeito externo.
- Console do navegador após recarregar a versão final: nenhum erro ou warning capturado.
- Inspeção visual do painel e breakpoint de 390 × 844. Navegação e tabela têm rolagem horizontal local em telas estreitas; o conteúdo geral tem contenção horizontal. Não constitui auditoria completa de acessibilidade.
- Servidor reiniciado com o novo build, mantendo a proposta, a sessão e o recibo no SQLite.

## Evidências

- `dashboard.png`: painel final com contagens derivadas do banco.
- `mobile.png`: visualização móvel.
- `synthetic-evidence.json`: pacote do fluxo exercitado no navegador, sem chaves privadas ou senhas.
- `arkhe-govtech-verificador-offline.html`: verificador independente distribuível como arquivo único.
- Logs locais: `D:/arkhe/tmp/govtech-build.log`, `D:/arkhe/tmp/govtech-full-tests.log` e `D:/arkhe/tmp/govtech-tests.log`.

O checkpoint utilizado no teste do browser foi extraído do próprio pacote para exercitar o caminho positivo com dados sintéticos. Esse procedimento não estabelece confiança independente. Para auditoria real, o auditor deve reter o checkpoint por outro canal. Os testes negativos usam o checkpoint original retido pelo teste e rejeitam conteúdo ou cadeia adulterados.

## Pendência do repositório

`python scripts/check_architecture.py` retorna `FAIL active Rust crate missing from the unified workspace`. A inspeção de manifestos diretos identificou `integration/arkhe-kya`, `integration/arkhe-p2p` e `integration/arkhe-pix` fora de `workspace.members`. Esses componentes não foram criados ou alterados por esta implementação. O registro global precisa ser reconciliado em tarefa própria; esta entrega não declara que o gate global de arquitetura passou.

## Escopo

Produto funcional para validação local, uma organização por instalação. Perfis de órgão não são tenants. O verificador usa cadeia JSON/SHA-256 e Web Crypto; não foi conectado ao ContainmentGate Rust ou a um PgWormGraph/PCO Rust. O despacho é um simulador transacional local. gov.br, ICP-Brasil, SIAFE, SEI, e-GP, HSM/TEE, SCITT/WIMSE e assinaturas pós-quânticas estão explicitamente pendentes. Não há publicação externa ou alteração de implantação existente.

Leia o guia: `D:/arkhe/docs/GOVTECH-APP.md`.
