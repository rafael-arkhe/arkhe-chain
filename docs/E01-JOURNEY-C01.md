# E01 — jornada selecionada, coorte C01

Estado: COHORT_MATERIALS_PINNED. Sessões humanas NOT_RUN. Este registro fixa
materiais de estudo, sem congelar a arquitetura ou conceder autoridade.

| Item solicitado | Definição |
| --- | --- |
| Jornada primária | Verificador MMR via MCP stdio e WASM local |
| Kit | Arkhe E01 Verifier 0.1.0, Windows x64; adaptador MCP 0.2.0 |
| Formato | ZIP portátil, Node incluído, sem instalação de SDK no destino |
| Entrada CLI | `arkhe-verify.cmd doctor` e `arkhe-verify.cmd verify <proof.json>` |
| Entrada MCP | `mcp-server.cmd`, ou `runtime/node.exe` com argumento `server.mjs` |
| Tutorial | `TUTORIAL.md` dentro do ZIP, bytes fixados no registro da coorte |
| Fixtures | A e B em `fixtures/`; hashes e gabarito do avaliador no registro externo |
| Coorte/revisão | E01-WIN-X64-C01 / 1 |
| Critério exploratório | ≥4/5 sucessos sem ajuda, jornada ≤900s, ambos os resultados e interpretação corretos |
| Operador | admin, conforme resposta do usuário |
| Observador | admin, conforme resposta do usuário |
| Revisor | admin; revisão humana ainda pendente |
| Independência | Não estabelecida: mesma identidade nas três funções |
| Intra EXE/MSI | Fora desta jornada; eventual avaliação requer coorte distinta |

Artefato: `dist/Arkhe-E01-Verifier-0.1.0-windows-x64.zip`.

SHA-256 do ZIP:

```text
1484bbad22f04b50caa508343fd7cabe765e3d4f654c80cd62f67aafed55d2ea
```

Registro dos hashes, gabarito e critérios:
`config/e01-onboarding-cohort.json`. O gabarito fica fora do kit entregue ao
participante. O kit não possui assinatura de editor; a origem do hash esperado
precisa ser registrada por quem o distribui.

## Resultado técnico e limites

Seis verificações passaram na cópia extraída em outra pasta do mesmo Windows:
integridade, prova positiva, prova adulterada, alteração de fixture detectada,
JSON malformado e launcher CMD. O PATH não continha Node do host, NODE_PATH e
NODE_OPTIONS foram removidos. O entrypoint usou o WASM interno mesmo com uma
variável externa apontando para módulo inexistente. Dependências de terceiros
estão no bundle, com avisos incluídos; imports externos são nativos do Node.

Isso não equivale a VM limpa, isolamento de rede no SO ou sessão humana.
`docs/evidence/2026-10-19T162850Z-e01-onboarding-kit/REPORT.md` preserva os
resultados e fontes usados. Não há resultado de adoção, tempo de participantes
ou revisão independente. Não é necessário comprar SOL ou carregar uma carteira.

## Próxima condição de execução

Revisão humana do tutorial por admin, preparação e verificação de uma VM limpa
e registro de suas limitações. Depois, organizar as cinco sessões autorizadas
sem excluir desistências ou intervenções. Não contatar participantes
automaticamente. Mudança de material requer nova revisão/coorte, preservando
os resultados anteriores. A checklist operacional é
`docs/E01-CLEAN-ONBOARDING-CHECKLIST.md`.
