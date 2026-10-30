# T3-B — "Transmitir" real via guest-token /m/{token}

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `ontology-module` + `security-app`

Aposenta o **broadcast-stub morto** (token jogado fora, `resolve_broadcast_token`
nunca chamado) e religa o "Transmitir" ao sistema **guest-token** que funciona:
um Document vira um link público read-only `/m/{token}`.

## Como funciona

1. **Transmitir** (operador): `POST /platform/v23/notepad/{id}/transmit` (perm
   `security.briefings.broadcast`) minta um `GuestToken` com `geo.document_id` e
   `allowed_action_ids=[]` (read-only, sem ações), TTL configurável (default 7
   dias, teto 90), e devolve `{token, link, expires_at}` — o link é
   `build_guest_link(link_base, token)` → `{base}/m/{token}`.
2. **Resolver público** (anônimo): `GET /public/v1/guest/{token}/document` —
   resolve o token (`_resolve_or_404`), pega `geo.document_id`, carrega o
   `NotepadDoc` e devolve `{title, classification_level, version, signed,
   sections, body_md}`. **O token É a autorização** para ESTE doc (mesmo
   princípio do `enforce_perm=False` da superfície de página); o operador decide
   compartilhar. Emite `LineageEvent(guest.document.view)`.
3. **/m/{token}** (frontend): o menu (`GET /public/v1/guest/{token}`) agora
   carrega `document_id`; o `/m` ramifica para a **superfície de documento**
   (`DocSurface`) — banner de classificação + título + seções read-only
   (narrativa/markdown/dados). Reusa o mesmo padrão das superfícies de
   página/ações.

## Governança

- O guest tem `clearances=()`: o operador é responsável por só transmitir o que
  pode ser público. O token autoriza UM doc específico (não um escopo amplo),
  é hashed-at-rest, TTL obrigatório, revogável.
- `LineageEvent(document.transmit)` (emissão) + `guest.document.view` (acesso).

## Arquivos

**Backend (`ontology-module`)**
- `app/routers/platform_v23/notepad.py` — `POST /{id}/transmit` (minta GuestToken).
- `app/routers/public/guest.py` — `GET /{token}/document` + `document_id` no menu.

**Frontend (`security-app`)**
- `app/m/[token]/page.tsx` — branch `DocSurface` (render read-only do documento).
- `app/api/public/guest/[token]/document/route.ts` — proxy público (faltava).
- `lib/api/index.ts` — `Notepad.transmit` (+ `generate`/`sign` e campos novos).
- `app/relatorios/page.tsx` — botão **Transmitir** (gated `briefings.broadcast`)
  → gera o link, copia pra área de transferência, mostra em modal.

## Verificação

- **Ao vivo:** `transmit` → 200 (link `/m/guest_…`); `/m` menu traz `document_id`;
  `/m/{token}/document` → título/classificação/seções.
- **tsc** `--noEmit` limpo.
- **e2e** `e2e/transmitir-documento.spec.ts` — passa em browser real: login → cria
  doc → transmite → `/m/{token}` renderiza o documento read-only (banner PÚBLICO).

## Notas

- O botão Transmitir está no `/relatorios` atual (que já renderiza Documents). No
  `/briefings` (T3-D) o Transmitir será religado ao mesmo endpoint quando a página
  passar a renderizar Documents.
- O broadcast-stub antigo (`workshop_briefings`/`issue_broadcast_token`) segue
  existindo para apps de workshop; será aposentado/repontado em T3-D.
