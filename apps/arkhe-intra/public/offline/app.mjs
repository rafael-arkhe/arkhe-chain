import init, * as wasm from '/verifier/arkhe_verify_wasm.js';
import { verifyBundle } from './verify.mjs';
const status = document.querySelector('#status');
let result;
document.querySelector('#form').addEventListener('submit', async event => {
  event.preventDefault(); status.dataset.state = 'busy'; const button = document.querySelector('#verify'); button.disabled = true;
  document.querySelector('#result').hidden = true; status.textContent = 'Verificando localmente…';
  try {
    const file = document.querySelector('#evidence').files[0], trust = document.querySelector('#trust').files[0];
    if (file.size > 262144 || trust?.size > 65536) throw new Error('Arquivo excede o limite de tamanho.');
    await init();
    result = await verifyBundle(JSON.parse(await file.text()), trust ? JSON.parse(await trust.text()) : null, wasm);
    const checks = document.querySelector('#checks'); checks.replaceChildren();
    for (const [label, key] of [['Integridade BLAKE3', 'integrity'], ['Transições', 'state'], ['Assinaturas e confiança', 'signatures'], ['Ancoragem Rekor', 'anchor'], ['Veredito completo', 'verdict']]) {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = result[key]; dd.dataset.state = result[key]; row.append(dt, dd); checks.append(row);
    }
    document.querySelector('#details').textContent = JSON.stringify(result, null, 2); document.querySelector('#result').hidden = false; status.dataset.state = 'done'; status.textContent = 'Conferência concluída. Observe o escopo de cada resultado.';
  } catch (error) { status.dataset.state = 'error'; status.textContent = 'Não foi possível verificar: ' + error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#download').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'arkhe-laudo-offline.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
document.querySelector('#print').onclick = () => window.print();
document.querySelector('#prepare').onclick = async () => { const label = document.querySelector('#offline-status'); try { const registration = await navigator.serviceWorker.register('/offline/sw.js', { scope: '/offline/' }); await navigator.serviceWorker.ready; label.textContent = registration.active ? 'Verificador offline preparado. Conteúdo e chaves não são armazenados no cache.' : 'Verificador instalado. Reabra esta página para confirmar o uso offline.'; } catch { label.textContent = 'Não foi possível preparar o cache offline. Use localhost ou HTTPS.'; } };
