# Arkhe Verify — Relatório de Auditoria Independente (Gate 0 / M1)

> **Instrução ao auditor:** preencha este arquivo após executar os comandos numa máquina limpa (sem `DATABASE_URL`, sem PostgreSQL, sem código-fonte do autor e sem sementes privadas) e devolva-o assinado/datado por um canal verificável.

---

## 1. Identificação do Auditor e Ambiente Limpo

- **Auditor / Organização (nome ou handle):** `______________________________`
- **Data e hora UTC da execução:** `YYYY-MM-DDTHH:MM:SSZ`
- **Sistema Operacional e Arquitetura:** `______________________________` (ex.: Ubuntu 24.04 x86_64 / Windows 11 x64 / macOS arm64)
- **Confirmação de independência:**
  - [ ] Executado fora da máquina e da conta do autor (`rafael-arkhe`)
  - [ ] Sem `DATABASE_URL` e sem PostgreSQL configurado
  - [ ] Sem acesso a arquivos `arkhe-secret/v1` ou sementes privadas

---

## 2. Verificação Pré-Execução (Integridade + Proveniência Sigstore)

- **Release / Tag avaliada:** `arkhe-verify-v0.1.0-alpha.1` (Commit `cebf25e00ac253fb63615bc8073fb97ac382f1a7`, Run CI `45625806852`)
- **Arquivo `.zip` baixado:** `______________________________`
- **SHA-256 calculado localmente do `.zip`:** `________________________________________________________________`
- **Bate com `RELEASE-SHA256SUMS`?** [ ] Sim  [ ] Não
- **`gh attestation verify <arquivo.zip> --bundle attestation.json --repo rafael-arkhe/arkhe-chain`:** [ ] PASS (exit 0)  [ ] Não executado / FAIL
- **`python -B verify_release.py --kit . --run-gate0` (após extrair o `.zip`):** [ ] PASS (exit 0, 0 segredos privados)  [ ] FAIL

---

## 3. Tabela de Vereditos Observados (Execução Manual)

| # | Comando | `overall` observado | Componente(s) decisivo(s) | Exit code observado | Confere? |
|---|---|---|---|---|---|
| 1 | `admission.json` (`--subject` + `--policy`) | | `subject` / `policy` | (esperado `0`) | [ ] |
| 2 | `commit.json` (`--admission`) | | `recompute` / `binding` | (esperado `0`) | [ ] |
| 3 | `anchor.json` (`--commit`) | | `anchor` / `binding` | (esperado `2`) | [ ] |
| 4 | `artifact.json` (4 arquivos + Merkle) | | `merkle` + 4 vínculos | (esperado `0`) | [ ] |
| 5 | `action.json` **sem** `--invariant` | | `llm_output` | (esperado `2`) | [ ] |
| 6 | `action.json` **com** `--invariant` + `--expect-invariant invariant.valor-present` | | `llm_output` / `produced` | (esperado `0`) | [ ] |
| 7 | `verdict.json` (`--output` + `--action`) | | `held` / `binding` / `output` | (esperado `0`) | [ ] |
| 8 | **R-02 match:** `action.json` + `--expect-invariant invariant.valor-present --expect-invariant-version 1.0.0` | | `llm_output` | (esperado `0`) | [ ] |
| 9 | **R-02 mismatch:** `action.json` + `--expect-invariant invariant.valor-present --expect-invariant-version 9.9.9` | | `llm_output` + `notes` (`1.0.0` vs `9.9.9`) | (esperado `1`) | [ ] |

---

## 4. Observações e Fronteiras Confirmadas

- [ ] Confirmado que `PASS` verifica apenas assinatura Ed25519 sob `trust.json` nomeado e hashes SHA-256 dos arquivos locais — **não** autoriza efeito (`{"effect":"none"}`) nem prova verdade semântica no mundo real.
- [ ] Confirmado que `fixtures/` usa chaves públicas de laboratório (`purpose: gate0-lab`), não raízes de confiança de produção.

**Comentários / achados / divergências (se houver):**
```text
(opcional)
```
