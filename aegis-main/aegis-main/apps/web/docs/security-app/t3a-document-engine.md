# T3-A — Motor neutro de Document (backend)

**Data:** 2026-06-29 · **Tipo:** feature (backend) · **Escopo:** `ontology-module` · serve `/relatorios` + `/briefings`

Fundação do T3: um gerador de documentos/apresentações **domain-neutral** que
generaliza o stack de brief de campanha (LLM auditado + PDF com burn-in + sign),
sobre o store governado `NotepadDoc`. O **mesmo Document** alimenta `/relatorios`
(documento formal) e `/briefings` (apresentação).

## Modelo (estende NotepadDoc)

Migração `0111_doc_sections` (ADD-alongside, retrocompat — docs antigos seguem):
- `sections` (JSONB, default `[]`) — seções ORDENADAS. Convive com `body_md`.
- `signed_hash` / `signed_by` / `signed_at` — selar/assinar.

**Seção** = `{ id, heading, kind, ... }`, com `kind`:
- `narrative` — gerada por AIP; resultado em `generated.{body, citations, inference_log_id}`. Aceita `prompt` + `context` inline.
- `object_set` / `aggregation` — dados da ontologia (o front resolve ao vivo; o `data_summary` resolvido vira contexto pro modelo narrar).
- `markdown` — texto estático (`body`).

## Geração (auditada)

`app/services/documents/generator.py` (generaliza `brief_generator`, sem templates políticos):
- `DocumentGenerator.generate_document(db, principal, *, sections, context_items, provider, model, only_section_ids)` — itera as seções `narrative`, monta prompt com o contexto (itens globais + `context` inline + resumo das seções de dados), chama `InferenceService.complete` **com `tenant_id`/`user_id`** (auditado no `InferenceLog`), aplica marca-d'água neutra de IA, extrai `[#cite:<id>]`.
- `signing_payload(title, sections)` + `document_signed_hash(payload, signed_by, signed_at)` — assinatura ligada a conteúdo+assinante+instante; invalida em qualquer edição.

## PDF (`app/services/documents/pdf.py`)

Generaliza `brief_pdf` (mesmos primitivos `_BriefPDF`): marca/rodapé **parametrizados**,
**burn-in de classificação** (faixa colorida por nível no topo de cada página),
bloco de assinatura com hash ou **carimbo diagonal RASCUNHO** quando não assinado.
Sem acoplamento a campanha (sem TSE/evidências fixadas).

## Endpoints (`/platform/v23/notepad`)

| Método+Path | Perm | O que faz |
|---|---|---|
| `POST ""` / `PUT /{id}` | (ABAC) | agora aceitam `sections`; edição de conteúdo bumpa versão e **invalida a assinatura** |
| `POST /{id}/generate` | `security.relatorios.edit` | gera as narrativas via AIP (auditado); bumpa versão; invalida assinatura |
| `POST /{id}/sign` | `security.relatorios.close` | sela (grava `signed_hash`); implementa a perm pré-cabeada antes não usada |
| `GET /{id}/pdf` | (ABAC) | PDF com burn-in + assinatura/carimbo |

## Verificação (ao vivo + testes)

- **Live (ferreira, tenant ssp-xx):**
  - `POST` com seções → 201, `sections` persistidas.
  - `GET /pdf` → 200 `application/pdf`, `%PDF-`, burn-in `RESTRITO`.
  - `POST /sign {confirm:true}` → 200, `signed=true`, hash gravado.
  - `POST /generate` → **403** para ferreira (não tem `relatorios.edit`) — a guarda funciona.
  - **Geração LLM auditada** (chamada direta do motor com Principal real): corpo real gerado com marca-d'água + citação `[#cite:PES-1]`; `InferenceLog` `status=success, model=llama-3.3-70b-versatile`.
- **pytest** `tests/unit/test_documents_generator.py` — funções puras (watermark/citações/clean_body/assinatura) + PDF (`%PDF-`).

## Pendências / notas

- **Grant de perm:** garantir que o papel do operador tenha `security.relatorios.edit`
  (hoje `ferreira` tem `close` mas não `edit` — config do catálogo, fora deste código).
- **SDK/OSDK:** refletir os endpoints `generate`/`sign`/`pdf` no `aegis-python-sdk` + OSDK (sync por feature) — pendente.
- Próximas fases: **T3-B** (Transmitir via guest-token `/m/{token}`), **T3-C** (`/relatorios` rico), **T3-D** (`/briefings` apresentação).
