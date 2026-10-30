# Arkhe Intra 0.1.0 — Windows x64

Perfil local de documentos, assinaturas e auditoria. Inclui Node, servidor web,
verificador WASM e providers Rust. Não requer SDK .NET, Node, Rust, Python ou pnpm
no computador de destino. Ollama e seu modelo são opcionais e instalados separadamente.
Não inclui o runtime PostgreSQL, os laboratórios ou a infraestrutura completa do Environment.

## Usar

Extraia o ZIP em uma pasta ou instale o MSI por usuário. Abra `Arkhe.exe` ou use:

```powershell
.\arkhe-cli.exe doctor
.\arkhe-cli.exe start
.\arkhe-cli.exe status
.\arkhe-cli.exe open
.\arkhe-cli.exe stop
.\arkhe-cli.exe backup C:\Backups\Arkhe-primeiro
```

`Arkhe.exe` inicia o serviço local e abre o navegador. Fechar o navegador não
encerra o servidor; use `arkhe-cli stop` ou o atalho Parar Arkhe. O acesso fica em
http://127.0.0.1:3003. Antes de atualizar ou desinstalar, pare o servidor.

Dados, credenciais, chaves e logs ficam em `%LOCALAPPDATA%\Arkhe\Intra`, com ACL
restrita ao usuário. `arkhe-cli data` mostra o caminho. Na primeira execução são
geradas três contas locais; consulte `credentials.json` nesse diretório.
Distribua as chaves somente aos respectivos responsáveis. Não há senha padrão.
O instalador não leva contas ou dados de desenvolvimento. Desinstalar preserva os dados.

Configure `ARKHE_PORT` para outra porta ou `ARKHE_INTRA_DATA_DIR` para outro
diretório privado antes de iniciar. O diretório de backup deve ser novo e externo
aos dados. O backup contém chaves privadas e recebe ACL restrita. Para restaurar,
pare o servidor e copie os arquivos do backup para um diretório privado vazio;
aponte `ARKHE_INTRA_DATA_DIR` para ele e inicie novamente.

O assistente usa o modelo e digest em `config/ollama.json`; `ARKHE_OLLAMA_CONFIG`
pode apontar para configuração própria. Rekor exige `ARKHE_REKOR_URL` e
`ARKHE_REKOR_PUBLIC_KEY_FILE` no ambiente antes de iniciar. Sem isso, publicação
fica bloqueada; criação e assinaturas locais continuam disponíveis.

Este perfil não implementa SSO, multitenancy ou checkpoint testemunhado.
Artefatos desta versão não são assinados com certificado de editor. Atualização
automática não está implementada. Os SDKs só são necessários para gerar o pacote.

## Gerar novamente

Requer Node 24, pnpm, Rust, .NET SDK 8 e WiX 5.0.2 na máquina de build.
Prepare o WASM com `pnpm verify:wasm` e execute:

```powershell
dotnet tool install wix --version 5.0.2 --tool-path ops/local/packaging/tools
python packaging/windows/build.py
```

A pasta de saída precisa estar ausente para evitar mistura de versões.
O build gera EXE, ZIP, MSI e hashes em `dist`.

