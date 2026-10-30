# E01 — materiais da coorte fixados

Kit Windows x64 0.1.0 em ZIP portátil, runtime Node e WASM incluídos.
CLI: arkhe-verify.cmd; MCP stdio: mcp-server.cmd. Tutorial e duas fixtures
versionados. ZIP SHA-256: 1484bbad22f04b50caa508343fd7cabe765e3d4f654c80cd62f67aafed55d2ea.

Seis checks técnicos PASS: doctor, prova positiva via MCP/WASM, prova adulterada,
rejeição de fixture alterada pelo doctor, JSON malformado e launcher CMD real.
Execução de cópia extraída fora do repositório, sem Node do host no PATH e sem
NODE_PATH/NODE_OPTIONS. O caminho WASM externo inválido foi sobrescrito pelo
entrypoint interno do kit. Isso não é VM limpa ou prova de isolamento de rede.
A árvore node_modules do host não acompanha o kit; dependências estão no bundle.
Avisos de 12 pacotes de terceiros e licença do runtime incluídos.

Coorte E01-WIN-X64-C01, revisão 1. Tutorial/fixtures/gabarito/critério 4 de 5
sem ajuda em até 900s fixados em config/e01-onboarding-cohort.json. admin exerce
as três funções informadas pelo usuário; independência NÃO estabelecida.
Nenhuma pessoa recrutada, nenhuma sessão humana executada e nenhum gate de
usabilidade aprovado. Mudanças exigem outra revisão/coorte, sem apagar esta.

Kit sem assinatura de editor. Hashes não autenticam origem por si mesmos.
Verificação é inclusão relativa à raiz fornecida; não há autoridade, autenticação
do checkpoint ou aprovação de contenção. runtime_verified=false.
