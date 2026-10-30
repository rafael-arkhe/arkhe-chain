/**
 * Garante que o item "Painel de Controle" foi removido do sidenav.
 * Ele agora vive exclusivamente no UserMenu (dropdown do perfil no navbar).
 */
import { FALLBACK_NAV } from '@/lib/api/fallback';

describe('FALLBACK_NAV · sem Painel de Controle', () => {
  const allItems = FALLBACK_NAV.sections.flatMap((s) => s.items);

  it('não contém o item painel-de-controle', () => {
    expect(allItems.find((i) => i.id === 'painel-de-controle')).toBeUndefined();
  });

  it('não contém href /painel-de-controle no sidenav', () => {
    expect(allItems.find((i) => i.href === '/painel-de-controle')).toBeUndefined();
  });

  it('não contém o grupo Plataforma (vazio depois da remoção)', () => {
    expect(FALLBACK_NAV.sections.find((s) => s.id === 'plataforma')).toBeUndefined();
  });
});
