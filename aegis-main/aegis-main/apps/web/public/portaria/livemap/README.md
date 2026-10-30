# livemap — mapa vivo da portaria (repontado para o AEGIS)

> Onda 3 da fusão Safe Tag + AEGIS. A SPA validada (Google Maps satélite +
> marcadores de iniciais + fora-de-rota) é **mantida**; só o backend trocou de
> **Firebase → AEGIS** com **PUSH** (SSE), a capacidade nova da fusão. Ver
> `../../docs/safetag-aegis/dev-onda3-portaria.md`.

## O que a tela faz

Mapa satélite full-screen com **N marcadores** (um por visitante ativo, iniciais
em canvas). Marcador **fora-de-rota** = borda vermelha + animação BOUNCE. Move em
tempo real conforme os visitantes andam.

## O que mudou (e o que NÃO mudou)

**Mantido (intacto):** `initMap`, `generateInitialsMarker`, `getInitials`, o
array `markers[]`, o estilo de fora-de-rota (vermelho + BOUNCE), o mapa satélite.

**Trocado — a camada de dados (`js/aegis-live.js` + `startLive`):**
- As **duas camadas Firebase** (Firestore `tokens where status==active` +
  RTDB `tokens/{id}` por token) → **um único `EventSource`** em
  `/api/stream/live` (same-origin, `withCredentials`). Cada evento `position`
  cria/move o marcador; `is_off_route` pinta de vermelho + BOUNCE; `finalized`/
  `roster removed` remove o marcador. O AEGIS empurra pelo canal Redis Pub/Sub
  do tenant (bridge bus→SSE).

**Removido (herdado):** Firebase (config + CDN app/auth/firestore/database), o
**JWT-na-URL** + a conversão `bridge.safetag.lat/guard/convert-to-firebase-token`
(o operador loga no AEGIS; o cookie httpOnly flui ao EventSource same-origin), e
o analytics Ackee externo.

## Auth (operador, não guest)

O livemap é superfície de **operador**: o porteiro/síndico **loga** no AEGIS
(não é o `/m/{token}` público). Servido **same-origin subpath** atrás do mesmo
edge, o cookie httpOnly `aegis_access` flui automático ao EventSource; o proxy
Next converte cookie→Bearer; o backend exige `security.geo.view` no `/stream/live`.
(EventSource não seta Authorization → **tem de ser same-origin**, não subdomínio.)

## Notas

- **Dead code:** as funções Firebase antigas (`initFirebase`,
  `authenticateWithJWT`, `loadMarkersRealtime`, `setupRealtimeListener`, …)
  permanecem em `app.js` mas **nunca são chamadas** (o fluxo novo é
  `initMap`+`startLive`). Limpeza é follow-up cosmético.
- **Detalhes ricos** (nome/telefone/endereço/rota no InfoWindow) hoje vinham de
  reads Firestore por token; a bridge ainda não desnormaliza esses campos — o
  marcador usa `subject` (iniciais) + posição. Desnormalizar no `guest_fix` é
  follow-up (a auditoria da Onda 3 recomenda).

## Rodar (estático — sem bundler)

`js/aegis-live.js` é ESM nativo (usa `EventSource`, **sem SDK/npm**). Sirva os
arquivos estáticos same-origin com o AEGIS (subpath `/livemap`) OU em dev:

```bash
npm install && VITE_AEGIS_API_BASE=http://127.0.0.1:8002 npm run dev  # :5175
#   abrir /?api=http://127.0.0.1:8002  (?api= só p/ dev cross-origin)
```
