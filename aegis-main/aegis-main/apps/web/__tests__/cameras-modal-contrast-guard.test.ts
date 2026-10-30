/**
 * GUARDA DE CONTRASTE — modais de /cameras (bug do operador 2026-07-05:
 * "texto branco sobre modal branco"). Causa-raiz: os modais saem por
 * ModalPortal → document.body e HERDAM a cor quase-branca do <body>
 * (dark-first); um card claro (bg-canvas-light/bg-white) SEM redeclarar
 * `text-text-on-light` deixa inputs/títulos invisíveis.
 *
 * Este teste varre os componentes de câmera e FALHA se algum card claro de
 * modal esquecer a redeclaração — o mesmo padrão que FloatingPopover e
 * confirm-dialog sempre fizeram (a prova por contraste da auditoria).
 */
import * as fs from 'fs';
import * as path from 'path';

const DIR = path.resolve(__dirname, '..', 'components', 'cameras');

describe('modais de /cameras — contraste do card claro', () => {
  it('todo card claro (bg-canvas-light/bg-white) de modal redeclara text-text-on-light', () => {
    const offenders: string[] = [];
    for (const name of fs.readdirSync(DIR)) {
      if (!name.endsWith('.tsx')) continue;
      const text = fs.readFileSync(path.join(DIR, name), 'utf8');
      if (!text.includes('ModalPortal')) continue; // só componentes que portalam
      // card root: classe com fundo claro + borda (o padrão dos 6 modais)
      const cards = text.match(/className="[^"]*bg-(?:canvas-light|white)[^"]*border[^"]*flex flex-col[^"]*"/g) || [];
      for (const c of cards) {
        if (!/text-text-on-light|surface-light/.test(c)) {
          offenders.push(`${name}: ${c.slice(0, 100)}…`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
