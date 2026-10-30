/**
 * GUARDA DE DS — classes BANIDAS do AEGIS (ordem expressa do operador,
 * 2026-07-04): `shadow-panel-light` e qualquer sombra COLORIDA derivada dos
 * tokens que resolvem em #F4F6F8 (panel-light / secondary / muted) — elas
 * geram `--tw-shadow-color: #F4F6F8; --tw-shadow: var(--tw-shadow-colored)`,
 * na contramão do DS (SÓ BORDA, SEM GLOW). Este teste varre o código-fonte e
 * FALHA se alguém reintroduzir.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'lib'];
const EXTS = new Set(['.tsx', '.ts', '.css']);
// shadow-panel-light | shadow-secondary | shadow-muted (com ou sem variantes
// hover:/focus: na frente — o regex pega a classe em qualquer posição).
const BANNED = /shadow-(panel-light|secondary|muted)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

describe('classes banidas do DS', () => {
  it('nenhum arquivo usa shadow-panel-light/shadow-secondary/shadow-muted (sombra colorida #F4F6F8)', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      for (const file of walk(abs)) {
        const text = fs.readFileSync(file, 'utf8');
        const m = text.match(BANNED);
        if (m) offenders.push(`${path.relative(ROOT, file)} → "${m[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
