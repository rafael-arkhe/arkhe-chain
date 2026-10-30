/**
 * #4 — todo widget registrado declara um ícone, e esse ícone está no registro
 * `iconByName` (senão cai em Shield → a "repetição" reportada na paleta). Guarda
 * contra (a) widget sem ícone e (b) ícone declarado mas não-registrado.
 */
import { Shield } from 'lucide-react';

import '@/components/workshop/widgets'; // side-effect: popula o REGISTRY
import { getRegisteredWidgets } from '@/components/workshop/WorkshopV2Renderer';
import { iconByName } from '@/lib/icon-by-name';

describe('paridade de ícones dos widgets', () => {
  const widgets = getRegisteredWidgets();

  it('há widgets registrados', () => {
    expect(widgets.length).toBeGreaterThan(20);
  });

  it('todo widget declara um ícone', () => {
    const semIcone = widgets.filter((w) => !w.meta.icon).map((w) => w.type);
    expect(semIcone).toEqual([]);
  });

  it('todo ícone declarado resolve (não cai em Shield, salvo quando é o próprio shield)', () => {
    const caemEmShield = widgets
      .filter((w) => w.meta.icon && w.meta.icon !== 'shield' && iconByName(w.meta.icon) === Shield)
      .map((w) => `${w.type} → ${w.meta.icon}`);
    expect(caemEmShield).toEqual([]);
  });
});
