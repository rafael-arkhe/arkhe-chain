# Evidências do reexecutor Gravit

Análise e comandos: `../../GRAVIT-DETERMINISTIC-REPLAY-2026-10-24.md`.

- `results.json`: síntese e exit codes dos quatro contêineres usados.
- `final/integration-results.json`: execução final, 9 testes aprovados.
- `final/golden-vectors.json`: hashes das 44 decisões recalculadas do perfil com registro.
- `final/samples/`: requisições, respostas fornecidas, respostas recalculadas e relatórios de cada invocação dos testes. O input negativo acima de 1 MiB é representado por hash para evitar duplicação.
- `standalone-match/`: CLI pelo entrypoint normal, novo sujeito assinado, MATCH/exit 0.
- `standalone-mismatch/`: CLI pelo entrypoint normal, decisão adulterada com ID recalculado, MISMATCH/exit 1 esperado.
- `trusted-context.json`: hashes aprovados dos 18 arquivos de runtime, base e commit.
- `Dockerfile`, `image-inspect.json`, `container-inspect.json`, `environment.json`: build, imagem executada, controles de execução e versões Python/dependências.
- `image-build*.log`, `integration-tests*.log`: primeiras execuções e execução final preservadas. A imagem final acrescenta a retenção de amostras dos testes; a imagem anterior já havia passado nos 9 testes.
- `files-sha256.json`: manifesto de hashes das evidências e fontes locais, excluindo o próprio arquivo.

Fontes executáveis: `scripts/gravit_replay.py`, `scripts/prepare_gravit_replay.py`, `scripts/test_gravit_replay.py`. A raiz é pública e de teste; os relatórios são não assinados. MATCH não é Allow. Não há fallback automático de observação.

Os contêineres desta rodada foram removidos depois da captura dos metadados. A VM iniciada para a rodada foi encerrada e a imagem final foi preservada para replay. O erro esperado de comparação da amostra adulterada não é falha da suite.
