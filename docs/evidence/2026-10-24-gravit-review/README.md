# Evidências Gravit — 24/10/2026

Execução concluída: `container-results.json` tem status PASS e o contêiner da segunda tentativa terminou com exit code 0. Ver a análise em `../../GRAVIT-TRUST-COMPARISON-2026-10-24.md`.

- `sources.json`: commits e SHA256 das fontes usadas no contexto.
- `python-golden.log`, `python-tests.log`, `rust-tests.log`: 47 vetores, 50 testes Python e 5 testes Rust.
- `python-canary.log`, `rust-canary.log`: falhas esperadas após adulterar uma resposta de referência; original restaurado antes das etapas seguintes.
- `canonical-vectors.json`: decisões completas e comparação adicional por JSON compacto ordenado.
- `contract-probes.json`: nove requisições e respostas sintéticas, com assinaturas sob fixtures públicas.
- `evaluation-pack.log`, `eval-results/`, `BENCHMARK.md`: resultados das simulações e replay.
- `environment.json`, `versions.log`, `gravit-rust-Cargo.lock`: versões Python/Rust, dependências e lock Rust gerado.
- `container-inspect.json`, `image-inspect.json`, `Dockerfile`: ambiente e controles efetivamente usados.
- `image-build*.log`, `container-run*.log`, `attempt-01/`: histórico preservado, incluindo falha inicial de rede no build e falha de exportação de metadados da primeira execução.
- `sha256.json`: hashes dos arquivos finais desta pasta, excluindo o próprio manifesto.

Imagem local concluída: `0f65c70efd46927afd01a86aa27d7b49e5e84e1189cce56587e2874c96521979`. Contexto preparado em `D:\arkhe\ops\local\gravit-review-20261024\context`; harness em `D:\arkhe\scripts\gravit_review_container.py`. A imagem permanece disponível para replay. O Dockerfile registra o build realizado, mas instala dependências por nomes: um rebuild futuro não é automaticamente idêntico. As versões efetivas e a imagem são as referências desta execução.

O harness executa `python tools/verify_golden.py`, `pytest -q`, `cargo test --locked --offline` e `python -m eval.run`, além das comparações e sondagens. Não foi executado literalmente o Makefile upstream; as dependências foram provisionadas previamente e seus caminhos configurados pelo harness.

Para repetir em PowerShell (a pasta de saída deve ser nova):

```powershell
podman machine start arkhe-runtime
$replayOut = 'D:\arkhe\ops\local\gravit-replay-new'
New-Item -ItemType Directory -Path $replayOut -ErrorAction Stop
podman --connection arkhe-runtime run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 10001:10001 --ulimit nofile=1024:1024 --tmpfs /work:rw,size=1536m,mode=1777 --tmpfs /tmp:rw,size=256m,mode=1777 -v "${replayOut}:/out:rw" 0f65c70efd46927afd01a86aa27d7b49e5e84e1189cce56587e2874c96521979
```

Não reutilizar a pasta deste relatório como saída. A imagem e os caches são locais; o replay não exige acesso à rede. Os contêineres desta inspeção foram removidos após captura dos metadados; a VM iniciada para o teste foi encerrada. `arkhe-files-sha256.json` fixa os arquivos locais inspecionados e o harness.

Não há certificação de segurança, conformidade formal com drafts ou autorização de produção nestes resultados. A comparação de artefatos byte a byte é específica dos arquivos publicados enumerados em `container-results.json`.
