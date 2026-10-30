/**
 * components/control-panel/nav-visibility — gate de item de sidenav (Onda 0).
 * Prova a lógica anyPerm (qualquer-de) e que o item "Dados" (DATA_NAV_ANYPERM)
 * aparece p/ quem tem QUALQUER perm de dados — matando o over-gate data.datasets.read.
 */
import { principalCanSeeNav, DATA_NAV_ANYPERM } from '@/components/control-panel/nav-visibility';

const P = (permissions: string[], roles: string[] = []) => ({ roles, permissions });

describe('principalCanSeeNav', () => {
  test('null principal → false', () => {
    expect(principalCanSeeNav({ perm: 'x' }, null)).toBe(false);
  });
  test('admin short-circuita perm e anyPerm', () => {
    expect(principalCanSeeNav({ perm: 'x.y' }, P([], ['admin']))).toBe(true);
    expect(principalCanSeeNav({ anyPerm: ['a', 'b'] }, P([], ['admin']))).toBe(true);
  });
  test('perm única: exige a perm exata', () => {
    expect(principalCanSeeNav({ perm: 'data.datasets.read' }, P(['data.datasets.read']))).toBe(true);
    expect(principalCanSeeNav({ perm: 'data.datasets.read' }, P(['markings.read']))).toBe(false);
  });
  test('anyPerm: QUALQUER uma basta', () => {
    expect(principalCanSeeNav({ anyPerm: ['a', 'b', 'c'] }, P(['c']))).toBe(true);
    expect(principalCanSeeNav({ anyPerm: ['a', 'b'] }, P(['z']))).toBe(false);
  });
  test('sem perm nem anyPerm → sempre visível', () => {
    expect(principalCanSeeNav({}, P([]))).toBe(true);
  });
});

describe('item "Dados" (DATA_NAV_ANYPERM) — Onda 0 mata o over-gate', () => {
  const dados = { anyPerm: DATA_NAV_ANYPERM };
  test('connectors.manage SOZINHO vê Dados (antes data.datasets.read travava)', () => {
    expect(principalCanSeeNav(dados, P(['connectors.manage']))).toBe(true);
  });
  test('markings.read sozinho vê Dados', () => {
    expect(principalCanSeeNav(dados, P(['markings.read']))).toBe(true);
  });
  // 🔴 `data.pipelines.read` saiu da lista com a secção Pipelines (a 29/09/2026,
  // quando o DAG foi retirado do produto). A prova mede a lista **de agora**,
  // e não a de quando foi escrita: uma prova que continua a pedir a
  //_pipeline_ depois de a secção não existir não está a proteger nada, está
  // a descrever um produto que já não existe — que é a forma mais cara de uma
  // prova ficar verde.
  test('provedores/arquivos também abrem Dados', () => {
    ['compute.providers.read', 'data.media.read'].forEach((p) =>
      expect(principalCanSeeNav(dados, P([p]))).toBe(true),
    );
  });
  test('zero perm de dados → não vê', () => {
    expect(principalCanSeeNav(dados, P(['security.painel.view']))).toBe(false);
  });
});
