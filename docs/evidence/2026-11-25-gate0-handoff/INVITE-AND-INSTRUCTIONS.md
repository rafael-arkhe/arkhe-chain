# Convite e Instruções — Auditoria Independente Gate 0 (`arkhe-verify-v0.1.0-alpha.1`)

## Mensagem pronta para envio (Português)

> Olá! Preciso de uma verificação independente (Gate 0 / M1) do binário portátil **Arkhe Verify (`arkhe-verify-v0.1.0-alpha.1`)** em máquina limpa, fora do meu ambiente. Leva ~5 minutos, não precisa de Rust instalado, não usa banco de dados e não usa nenhuma chave privada.
>
> **1. Baixe os arquivos do seu SO na Pre-Release:**  
> https://github.com/rafael-arkhe/arkhe-chain/releases/tag/arkhe-verify-v0.1.0-alpha.1  
> - O kit do seu sistema (`arkhe-verify-gate0-x86_64-unknown-linux-gnu.zip`, `...-pc-windows-msvc.zip` ou `...-aarch64-apple-darwin.zip`)  
> - `RELEASE-SHA256SUMS` e `attestation.json`  
> - `GATE0-REPORT-TEMPLATE.md`
>
> **2. Confira integridade e atestação Sigstore OIDC antes de extrair/executar:**
> - Linux/macOS: `sha256sum -c RELEASE-SHA256SUMS --ignore-missing`
> - Windows (PowerShell): `Get-FileHash .\arkhe-verify-gate0-x86_64-pc-windows-msvc.zip -Algorithm SHA256` (comparar com `RELEASE-SHA256SUMS`)
> - Opcional com GitHub CLI (`gh`): `gh attestation verify <arquivo.zip> --bundle attestation.json --repo rafael-arkhe/arkhe-chain`
>
> **3. Extraia o `.zip` e rode o verificador portátil (ou execute manualmente os comandos de `AUDIT-1-PAGE.md`):**
> - Conferência automática completa (requer Python 3): `python -B verify_release.py --kit . --run-gate0`
> - Ou diretamente os comandos do binário `./arkhe-provenance-mcp` (`.\arkhe-provenance-mcp.exe` no Windows) listados abaixo e em `AUDIT-1-PAGE.md`.
>
> **4. Devolva o arquivo `GATE0-REPORT-TEMPLATE.md` preenchido** com os `overall` e exit codes observados (`0`, `2` ou `1`). Muito obrigado!

---

## Ready-to-Send Invite (English)

> Hi! I need an independent third-party Gate 0 verification of the portable **Arkhe Verify (`arkhe-verify-v0.1.0-alpha.1`)** binary on a clean machine (no Rust toolchain, no database, no private keys required; takes ~5 minutes).
>
> **1. Download from the Pre-Release:**  
> https://github.com/rafael-arkhe/arkhe-chain/releases/tag/arkhe-verify-v0.1.0-alpha.1  
> - Your OS bundle (`arkhe-verify-gate0-x86_64-unknown-linux-gnu.zip`, `...-pc-windows-msvc.zip`, or `...-aarch64-apple-darwin.zip`)  
> - `RELEASE-SHA256SUMS`, `attestation.json`, and `GATE0-REPORT-TEMPLATE.md`
>
> **2. Verify checksum & Sigstore OIDC attestation before running:**
> - `sha256sum -c RELEASE-SHA256SUMS --ignore-missing` (or `Get-FileHash` on Windows)
> - `gh attestation verify <archive.zip> --bundle attestation.json --repo rafael-arkhe/arkhe-chain`
>
> **3. Unzip and run:**
> - Automated check (Python 3): `python -B verify_release.py --kit . --run-gate0`
> - Or run the manual `HOW_TO_AUDIT.md` / `AUDIT-1-PAGE.md` commands below directly with `./arkhe-provenance-mcp` (`.exe` on Windows).
>
> **4. Send back the filled `GATE0-REPORT-TEMPLATE.md`.** Thank you!

---

## Comandos manuais completos (`HOW_TO_AUDIT.md` + R-02)

*(Linux/macOS: `./arkhe-provenance-mcp`; Windows: `.\arkhe-provenance-mcp.exe`)*

```bash
# 1. Admissão (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/admission.json --trust fixtures/trust.json --expect-purpose gate0-lab --subject fixtures/subject.bin --policy fixtures/policy.json

# 2. Commit (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/commit.json --trust fixtures/trust.json --expect-purpose gate0-lab --admission fixtures/admission.json

# 3. Âncora pendente sem transporte externo (exit 2, overall INCONCLUSIVE)
./arkhe-provenance-mcp verify --receipt fixtures/anchor.json --trust fixtures/trust.json --expect-purpose gate0-lab --commit fixtures/commit.json

# 4. Artefato com prova de Merkle (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/artifact.json --trust fixtures/trust.json --expect-purpose gate0-lab --artifact fixtures/artifact.bin --model fixtures/model.json --data fixtures/data.json --pipeline fixtures/pipeline.json

# 5. Ação de agente SEM veredito de invariante (exit 2, overall INCONCLUSIVE, llm_output INCONCLUSIVE)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin

# 6. MESMA ação de agente COM veredito nomeado (exit 0, overall PASS, llm_output PASS)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin --invariant fixtures/verdict.json --expect-invariant invariant.valor-present

# 7. Veredito de invariante isolado (exit 0, overall PASS)
./arkhe-provenance-mcp verify --receipt fixtures/verdict.json --trust fixtures/trust.json --expect-purpose gate0-lab --output fixtures/artifact.bin --action fixtures/action.json

# 8. R-02 match: versão exata conferida (exit 0, overall PASS, llm_output PASS)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin --invariant fixtures/verdict.json --expect-invariant invariant.valor-present --expect-invariant-version 1.0.0

# 9. R-02 mismatch: versão divergente (exit 1, overall FAIL, llm_output FAIL)
./arkhe-provenance-mcp verify --receipt fixtures/action.json --trust fixtures/trust.json --expect-purpose gate0-lab --plan fixtures/plan.json --output fixtures/artifact.bin --model fixtures/model.json --artifact fixtures/artifact.bin --invariant fixtures/verdict.json --expect-invariant invariant.valor-present --expect-invariant-version 9.9.9
```
