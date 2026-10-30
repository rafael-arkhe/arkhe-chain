# Arkhe E01 Verifier 0.1.0 — Windows x64

Jornada: verificar inclusão MMR via MCP stdio e WASM local. Não é o aplicativo
Intra. Pacote ZIP portátil com runtime Node incluído; não exige instalação de
Node, Rust, Python ou pnpm no destino. Nenhum serviço Solana ou carteira é usado.

1. Obtenha o ZIP e o SHA-256 esperado por canal definido pelo avaliador. Confira
   o arquivo e extraia em uma pasta nova, por exemplo `C:\E01\Verifier`.
2. Abra PowerShell nessa pasta e execute:

```powershell
.\arkhe-verify.cmd doctor
.\arkhe-verify.cmd verify .\fixtures\A.json
$LASTEXITCODE
.\arkhe-verify.cmd verify .\fixtures\B.json
$LASTEXITCODE
```

`doctor` confere os arquivos do manifesto; não autentica o editor. O pacote
não possui assinatura de editor. Não precisa de administrador, login ou rede
para verificar as provas. Use o runtime fornecido, sem copiar dependências do host.

A verificação retorna `PROOF_VALID` ou `PROOF_INVALID`. Código 0 significa prova
válida (ou doctor aprovado), 1 significa prova inválida e 2 indica erro de entrada
ou da ferramenta. Uma prova inválida bem formada é um resultado esperado do
verificador, e não deve ser confundida com falha ao instalar o programa.

Informe ao observador os resultados de A e B, erros, pedidos de ajuda e sua
interpretação. Não envie chaves, credenciais, backups ou dados pessoais.

## O que o resultado permite concluir

Uma prova válida demonstra inclusão em relação à raiz fornecida. Não autentica
o checkpoint, não verifica assinatura de documento, não concede autorização e
não certifica contenção do runtime. `authority` permanece `false`. Os dados
das duas fixtures são sintéticos; não são documentos de cliente.

## Uso como servidor MCP

`mcp-server.cmd` inicia o servidor stdio, sem abrir porta HTTP. Para um cliente
MCP, configure o executável `runtime\node.exe` do kit com argumento absoluto para
`server.mjs`. O servidor oferece `verify_mmr` e `verify_artifact`; hashing e
canonicalização não equivalem a verificação de assinatura ou proveniência.

## Encerramento e versão da sessão

A CLI encerra seu processo MCP após cada verificação. Não instala serviço.
O observador deve registrar versão/hash do ZIP, ambiente e tempos. Mudanças no
kit, tutorial ou fixtures exigem outra versão/coorte. Cinco sessões humanas
ainda são necessárias para avaliar o alvo exploratório de onboarding.
