// Polyfill p/ crypto.randomUUID — Web Crypto API só expõe randomUUID
// em "secure contexts" (HTTPS ou localhost/127.0.0.1). Quando o
// operador acessa o security-app via IP da LAN (ex:
// http://192.168.1.65:3002) o browser não disponibiliza a função e
// o Next 15 / React 19 quebram com
// "crypto.randomUUID is not a function" durante a hidratação.
//
// O polyfill usa crypto.getRandomValues (sempre disponível, mesmo em
// non-secure contexts) pra gerar um UUID v4 RFC 4122.
//
// Carregado como <script src="/crypto-polyfill.js"> síncrono no <head>
// do app/layout.tsx — roda antes de qualquer chunk JS do Next.
(function () {
  if (typeof crypto !== 'object') return;
  if (typeof crypto.getRandomValues !== 'function') return;
  if (typeof crypto.randomUUID === 'function') return;
  crypto.randomUUID = function () {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i = 0; i < 16; i++) {
      h.push(b[i].toString(16).padStart(2, '0'));
    }
    return (
      h.slice(0, 4).join('') +
      '-' +
      h.slice(4, 6).join('') +
      '-' +
      h.slice(6, 8).join('') +
      '-' +
      h.slice(8, 10).join('') +
      '-' +
      h.slice(10).join('')
    );
  };
})();
