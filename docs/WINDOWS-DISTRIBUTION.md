# Distribuição Windows — Arkhe Intra 0.1.0

Entrega local Windows x64 gerada em 18/10/2026. Escopo: Arkhe-Intra com servidor
Next, SQLite, assinaturas, auditoria, verificação WASM e provider Ollama.
O Environment PostgreSQL, os laboratórios e os demais serviços continuam separados.

## Artefatos

- `dist/Arkhe-0.1.0-windows-x64/Arkhe.exe`: entrada gráfica que inicia o serviço e abre o navegador.
- `dist/Arkhe-0.1.0-windows-x64/arkhe-cli.exe`: CLI de operação.
- `dist/Arkhe-0.1.0-windows-x64.zip`: distribuição portátil, 118.645.560 bytes.
- `dist/Arkhe-0.1.0-windows-x64.msi`: instalador por usuário, 97.080.165 bytes.
- `dist/SHA256SUMS.json`: hashes dos dois pacotes.

Node 24 e o runtime .NET necessário aos launchers estão incluídos. Os providers
Rust são builds release. Nenhuma ferramenta de desenvolvimento é necessária
para usar a distribuição. O launcher gráfico e a CLI têm nomes distintos porque
o Windows normalmente não distingue nomes apenas por maiúsculas/minúsculas.

Os dados ficam em `%LOCALAPPDATA%\Arkhe\Intra`, com ACL restrita ao usuário.
O MSI não gera contas, não inicia serviços e não inclui credenciais. O primeiro
start gera as contas no diretório privado. Os testes usam diretórios próprios.
O servidor escuta somente em loopback. Fechar o navegador não para o serviço;
use `arkhe-cli.exe stop`. Feche o serviço antes de atualizar ou remover a instalação.

## Validação executada

| Verificação | Resultado |
|---|---|
| Rust release: Ollama e CLI de verificação | PASS |
| Publicação .NET self-contained: console e GUI | PASS |
| Build Next de produção standalone e TypeScript | PASS |
| Testes funcionais do Intra | 8 PASS, nenhuma falha ou teste ignorado |
| Verificação de arquitetura | PASS: 23 crates, 6 pacotes Node, 13 migrações |
| ZIP extraído: hashes e formatos PE | PASS: 2.249 arquivos; GUI subsystem 2, console subsystem 3 |
| ZIP: exclusão de contas, credenciais e chaves de desenvolvimento | PASS |
| Teste real da distribuição extraída | PASS: 7 grupos, descritos abaixo |
| Interface do pacote no navegador | Tela de login renderizada e conferida visualmente |
| Instalação MSI preliminar silenciosa em diretório de teste | Exit code 0 |
| Extração administrativa do MSI final pelo Windows Installer | Exit code 0 |
| Conteúdo extraído do MSI final | PASS: hashes dos 2.249 arquivos iguais aos do ZIP |
| Operação do conteúdo extraído do MSI | PASS: doctor, start, status e stop |

O teste do ZIP usa PATH contendo somente Windows System32, roda a partir de
outro diretório e usa caminhos com espaços e caracteres Unicode. Confere versão,
help, diagnóstico, erro para comando inválido, estado parado, porta ocupada,
inicialização idempotente e execução do binário gráfico. Depois executa login,
criação de documento, assinaturas de três papéis, verificação, exportação,
bloqueio da publicação sem Rekor, páginas e assets offline. Por fim, para e
reinicia o servidor, confere contas/sessões/documentos persistentes, gera backup
com o servidor parado, recusa sobrescrita e restaura os dados em outro diretório.

Evidências: [testes do pacote](evidence/local/2026-10-18/windows-distribution/package-tests.json),
[hashes](evidence/local/2026-10-18/windows-distribution/SHA256SUMS.json) e
[conteúdo do MSI](evidence/local/2026-10-18/windows-distribution/msi-payload.json).
Os scripts de reprodução ficam em `packaging/windows`.

## Limites

A validação ocorreu nesta máquina Windows, com PATH sem ferramentas de build;
não houve teste em uma VM Windows limpa. Os artefatos não possuem assinatura
de editor. Não há atualização automática. Ollama/modelo e Rekor precisam de
configuração própria. Os limites funcionais e de confiança do perfil local
continuam descritos no README do Intra; esta entrega não o qualifica para produção.

A instalação MSI preliminar permanece em `ops/local/packaging/installed`.
A revisão automática bloqueou seu comando de remoção, sem informar motivo
específico; nenhuma remoção alternativa foi executada. O MSI final foi extraído
em diretório isolado, preservando a instalação de teste anterior.

Consulte [o guia de uso e geração](../packaging/windows/README.md).

## Pacote com credenciais e desenvolvimento (2026-10-18)

`dist/Arkhe-0.1.0-development-windows-x64` reúne o registro por convite, revisão
assinada e bancada de propostas/testes em sandbox. ZIP e MSI têm hashes no arquivo
`dist/Arkhe-0.1.0-development-windows-x64.sha256.json`. Os 2273 arquivos do ZIP
foram conferidos por SHA256. O teste portátil passou com PATH sem ferramentas de
build, incluindo as novas páginas, catálogo de 23 módulos, convite de credencial,
autorização, assinaturas de documentos, backup e restauração.

A aplicação anterior foi preservada em execução. Para trocar a versão portátil,
encerre-a com a CLI da pasta antiga antes de abrir a nova. Não execute dois
launchers simultâneos com o mesmo diretório de dados.

```powershell
.\dist\Arkhe-0.1.0-windows-x64\arkhe-cli.exe stop
python scripts/prepare_development.py --data-dir "$env:LOCALAPPDATA/Arkhe/Intra"
.\dist\Arkhe-0.1.0-development-windows-x64\Arkhe.exe
```

A preparação de sandbox não é necessária para usar documentos ou credenciais.
[Fluxo, dependências e backlog](INTRA-DEVELOPMENT.md) ·
[Evidências dos testes do pacote](evidence/local/2026-10-18/development-sandbox/package-tests.json).

## Pacote de avaliações independentes

`dist/Arkhe-0.1.0-evaluation-windows-x64` inclui `/avaliacoes`, congelamento e
reprodução de baseline, tarefas reservadas, comparação de capacidades e decisões
assinadas de promoção/rollback do estudo. EXE/CLI, ZIP e MSI foram gerados; os
2280 arquivos do ZIP e da imagem administrativa do MSI passaram na conferência
de SHA256. Não foi alterada a instalação anterior em execução.

O teste portátil inclui as novas páginas e autorização da API de avaliações,
além dos fluxos de documentos, credenciais e backup/restauração. Os hashes estão
em `dist/Arkhe-0.1.0-evaluation-windows-x64.sha256.json`.

Para trocar a versão portátil, encerre a CLI antiga antes de abrir o novo
`dist/Arkhe-0.1.0-evaluation-windows-x64/Arkhe.exe`. Prepare a sandbox no diretório
de dados do perfil como descrito acima. Não compartilhe um perfil entre dois
servidores simultâneos.

[Protocolo e limites](CAPABILITY-EVALUATION.md) ·
[Teste portátil](evidence/local/2026-10-18/capability-evaluation/package-tests.json) ·
[Conferência do MSI](evidence/local/2026-10-18/capability-evaluation/msi-tests.json).
