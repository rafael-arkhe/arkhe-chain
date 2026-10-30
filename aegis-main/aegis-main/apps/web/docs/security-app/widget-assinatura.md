# Widget de Assinatura (Incremento D / #3)

**Data:** 2026-06-29 · **Tipo:** feature · **Escopo:** `security-app` + `ontology-module` + `aegis-python-sdk`

Faltava um jeito de assinar um documento. Agora há um widget de **Assinatura**: o
operador cadastra a assinatura **uma vez** (envia uma imagem **ou** desenha à mão)
e **reusa** em qualquer documento. Decisões do operador: por-usuário reutilizável,
gestão **inline** na config do widget, upload **+** desenho no canvas.

## Como funciona (reuse-first)

A assinatura tem dois lugares:
- **Cofre por-usuário** (`/me/signature`): a assinatura salva do operador, guardada
  no MinIO gateada por `tenant/usuário`; a chave em `User.metadata_['signature_key']`.
  Só o dono lê o original.
- **No documento**: ao aplicar, a imagem é **copiada** para o escopo do doc
  (`Notepad.upload` → `notepad/{id}/…`) e renderiza pela MESMA via de mídia da
  figura — ou seja, operador, **/m guest** e **PDF** já funcionam (T3-G2/G3), sem
  código novo de serve.

## Backend

- **`ontology-module` `me_context.py`**: `GET /me/signature` (há assinatura?),
  `GET /me/signature/image` (serve gateado ao dono), `PUT /me/signature`
  (data_url → MinIO, cap 2 MB, só imagem; auditado), `DELETE /me/signature`.
- **`pdf.py`**: render da seção `signature` — embarca a imagem (`_image`, já
  pré-resolvido por object_key) sobre a linha "assinado por / cargo / data";
  sem imagem, desenha a linha p/ assinar à mão.
- **Catálogo** (`aegis.workshop.widget_catalog`): nova entrada `signature`
  (core_display, proposable). **GOTCHA:** o container monta
  `../aegis-python-sdk/aegis` sobre `/app/aegis` (read-only) — a fonte é o repo
  **`aegis-python-sdk`**; a cópia vendorizada em `ontology-module/aegis` é
  shadowed. Editado nos DOIS + sync do `lib/workshop/widget-catalog.json`.

## Frontend

- `components/ui/signature-pad.tsx`: canvas de desenho à mão (pointer-based, sem
  dependência; `toDataUrl()`/`clear()`).
- `components/workshop/widgets/signature.tsx`: o widget — imagem + linha
  "assinado por / cargo / data". Config `signed_by`/`role`/`show_date`.
- `widget-section.tsx`: `SignatureConfigField` (config própria, no lugar do upload
  genérico): **Minha assinatura** (usa o cofre) · **Enviar imagem** · **Desenhar**
  (canvas) + checkbox "salvar como minha assinatura". `signature` em
  `MEDIA_URL_FIELD` → o /m guest e o PDF herdam o serve.
- `Me.signature/setSignature/removeSignature/signatureImageUrl` (cliente).

## Verificação

- **standalone (container)**: rotas `/me/signature` registradas; catálogo tem
  `signature`; PDF renderiza a seção (com e sem imagem).
- **jest**: `signature-widget` (4) · `widget-catalog-parity` (signature em
  backend+frontend) · `widget-icons-parity` (ícone resolve) · sem regressão. **tsc** limpo.
- **e2e** `relatorios-assinatura`: cofre `/me/signature` (PUT→GET→image); add do
  widget pela palette; aplica a assinatura **salva** (renderiza imagem); **desenha**
  no canvas (drag do mouse) e aplica (renderiza); salva + PDF embarca. Regressão de
  mídia (`m-guest` + `media-upload`) verde.
