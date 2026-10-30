// Liga public/cesium -> node_modules/cesium/Build/Cesium para o dev server
// servir os assets do Cesium em /cesium (CESIUM_BASE_URL = '/cesium').
//
// Por que symlink RELATIVO no Linux: no setup Windows+podman o node_modules e'
// um *named volume* montado em /app/node_modules, com namespace diferente do
// host. Um alvo ABSOLUTO (ex.: /mnt/e/.../node_modules) nao resolve dentro do
// container -> assets do Cesium dao 404 -> o globo nao abre. Um symlink
// relativo (../node_modules/...) resolve corretamente nos dois namespaces.
// No Windows nativo usa-se junction (junctions nao aceitam alvo relativo).
import fs from 'node:fs';
import path from 'node:path';

const src = path.join('node_modules', 'cesium', 'Build', 'Cesium');
const dest = path.join('public', 'cesium');

if (!fs.existsSync(src)) {
  console.warn('[cesium] Build/Cesium ausente — pulando link');
  process.exit(0);
}

// Remove link quebrado: o symlink existe (lstat ok) mas o alvo sumiu
// (existsSync segue o link e retorna false). Sem isso, o symlinkSync abaixo
// estoura EEXIST e o link quebrado persiste.
try {
  if (fs.lstatSync(dest) && !fs.existsSync(dest)) fs.unlinkSync(dest);
} catch {
  /* dest nao existe — segue */
}

if (fs.existsSync(dest)) process.exit(0); // ja ligado e valido

fs.mkdirSync(path.dirname(dest), { recursive: true });
const win = process.platform === 'win32';
const target = win ? path.resolve(src) : path.relative(path.dirname(dest), src);
try {
  fs.symlinkSync(target, dest, win ? 'junction' : 'dir');
  console.log('[cesium] assets linked ->', target);
} catch (e) {
  console.warn('[cesium] link falhou:', e.message);
}
