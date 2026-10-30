# guestalerts — fila + sirene da portaria (repontado para o AEGIS)

> Onda 3 da fusão Safe Tag + AEGIS. A SPA validada (fila de cartões + **sirene
> contínua** no desvio) é **mantida**; só o backend trocou de **Firebase →
> AEGIS** com **PUSH** (SSE). Ver `../../docs/safetag-aegis/dev-onda3-portaria.md`.

## O que a tela faz

Fila rolável de **cartões de visitante ativo**. Cartão **fora-de-rota** ganha
borda vermelha + status "Fora do Percurso" e dispara a **sirene contínua**
(`setInterval` enquanto houver algum motorista fora de rota). Botão de **mute**
por cartão (persistido em `localStorage`). Modal de desbloqueio de áudio (gesto
do usuário, exigido pelos browsers para tocar som).

## O que mudou (e o que NÃO mudou)

**Mantido (intacto):** o CSS/DOM dos cartões, o modal de áudio, a **máquina de
sirene** (`offRouteDrivers` Set + `startOffRouteNotification`/
`stopOffRouteNotification` + `playNotification`), o mute por cartão.

**Trocado — a camada de dados (`js/aegis-live.js` + `startLiveAlerts`):**
- As **duas camadas Firebase** (Firestore `tokens where status==active` +
  RTDB `tokens/{id}` por token, com o flag `is_off_route`) → **um único
  `EventSource`** em `/api/stream/live` (same-origin, `withCredentials`). Cada
  `position` cria/atualiza o cartão (`upsertCardLive`) e dirige a sirene:
  `is_off_route` → `startOffRouteNotification`; senão → `stopOffRouteNotification`.
  `roster removed`/`finalized` → remove o cartão. O AEGIS empurra pelo canal
  Redis Pub/Sub do tenant (bridge bus→SSE).

**Removido (herdado):** Firebase (config + CDN compat), o **JWT-na-URL** + a
conversão `bridge.safetag.lat/guard/convert-to-firebase-token` (o operador loga
no AEGIS; cookie same-origin), o **Google Maps** (a fila não desenha mapa; era só
p/ a validação manual, agora o desvio vem do backend), o analytics Ackee.

## Auth (operador, não guest) — igual ao livemap

Superfície de **operador**: o porteiro **loga** no AEGIS; servido same-origin
subpath, o cookie httpOnly flui ao EventSource; o backend exige
`security.alertas.view` no `/stream/live`. (EventSource não seta Authorization →
**same-origin**, não subdomínio.)

## Notas

- **Dead code:** as funções Firebase (`authenticateWithJWT`,
  `setupTokensListener`, `setupRTDBListener`, `renderToken`, `resolveReference`,
  `validateRoute`, …) permanecem mas **nunca são chamadas** (o fluxo é
  `initApp`→`showModal`+`startLiveAlerts`). Limpeza é follow-up cosmético.
- **Nome/telefone/endereço** ricos vinham de reads Firestore; a bridge ainda não
  desnormaliza — o cartão usa `subject` (nome) + velocidade. Desnormalizar no
  `guest_fix` é follow-up (auditoria da Onda 3).

## Rodar (estático — sem bundler)

`js/aegis-live.js` é ESM nativo (`EventSource`, **sem SDK/npm**). Servir
same-origin com o AEGIS (subpath `/guestalerts`) OU em dev:

```bash
npm install && VITE_AEGIS_API_BASE=http://127.0.0.1:8002 npm run dev  # :5176
```
