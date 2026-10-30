# Evidências locais — M3 + M20 / E02

Reprodução: `python scripts/verify_e02_delivery.py`, da raiz `D:\arkhe`.

| Verificação | Evidência | Resultado observado nesta entrega |
|---|---|---|
| Paridade nativo↔WASM | [native-wasm.log](native-wasm.log), [native-wasm-result.json](native-wasm-result.json) | 165 casos, 20 aceitos, 145 rejeitados; exit 0 |
| Testes do fluxo e vetores congelados | [test.log](test.log) | 20 testes, 20 pass, 0 fail; exit 0 |
| TypeScript | [typecheck.log](typecheck.log) | output do compilador vazio; exit 0 |
| Build de produção | [build.log](build.log) | build concluído; exit 0 |
| Chromium / M3 / M20 | [ui.log](ui.log), [ui-result.json](ui-result.json) | 9 cenários de UI + 4 verificações axe; exit 0 |

O resultado efetivamente observado e os códigos de saída estão em [results.json](results.json). O manifest inclui hashes SHA-256 de fontes, fixtures e binários WASM utilizados. Os logs guardam o output real das ferramentas; o script acrescenta apenas comando, diretório e exit code. Não há uma mensagem sintética de sucesso atribuída ao TypeScript.

## Cobertura de UI

O teste carrega o WASM publicado no browser, abre o resultado, confere os nove checks, usa Tab e Shift+Tab 24 vezes em cada direção, abre M20, exporta JSON, fecha por Escape, reabre e fecha pelo botão. Confere foco devolvido ao disparador de cada abertura. Também verifica execução offline após aquecimento, root adulterada e ausência de overflow horizontal no desktop e em 390px.

A contenção permite o foco no viewport do dialog (`body`, no ponto de retorno do Chromium), mas falha se qualquer controlo de fundo receber foco. O @axe-core/playwright 4.10.2 (motor axe 4.10.3) executa regras WCAG A/AA nos quatro estados registrados no JSON. Isso não equivale a auditoria completa de acessibilidade, leitor de ecrã ou certificação de outros browsers.

Capturas: [desktop](m20-desktop.png), [detalhes MMR](m20-desktop-details.png), [falha no celular](m20-mobile-failure.png). A revisão visual cobre os estados capturados, não todas as combinações de conteúdo.

## Resposta aos pontos da auditoria

- Os logs dos testes e do TypeScript estão persistidos, com exit codes; os resultados anteriores na conversa não substituíam estes artefactos entregáveis.
- A paridade é entre duas orquestrações JavaScript que partilham o núcleo Rust/WASM, não entre motores criptográficos independentes. Um segundo teste agora compara um processo Rust nativo com o WASM nos 165 casos, sem alegar algoritmos independentes.
- A execução detalhada tem `complete` e `aborted`; o helper de consumo recusa envelopes incompletos. O envelope continua editável e não substitui a reexecução da prova.
- `arkhe-mmr@1` define domínios 00, 01 e 02; a proposta de introduzir 03 não corresponde ao perfil congelado. Há teste dos cinco vetores, incluindo múltiplos picos.
- A fórmula E02 de OperationId exclui parameters; campos adicionais são rejeitados.
- A referência/assinatura REF é um identificador fornecido pelo recibo. Este fluxo não autentica a assinatura Ed25519 nem obtém uma chave pública de registry confiável.

[Relatório técnico completo](../../M3-M20-E02.md).

Classificação: execução local verificada dentro destes cenários. Não é prova formal, execução em CI, auditoria de produção ou atestação de recibos on-chain.


Execução remota posterior: [dossiê do run E02 40091638278](../remote-ci/e02-40091638278/README.md), com logs do próprio runner, digest do artefacto e escopo da projeção de fontes.
