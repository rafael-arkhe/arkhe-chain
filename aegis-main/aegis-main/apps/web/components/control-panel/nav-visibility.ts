/**
 * Visibilidade de item de sidenav por permissão — PURO e testável sem render.
 * Espelha o backend `Principal.has_permission` (admin short-circuita). Extraído do
 * `canSee` do ControlPanelShell p/ poder ser coberto por teste isolado.
 */
export type NavPermSpec = {
  /** Perm única exigida. Item SEM `perm`/`anyPerm` = sempre visível. */
  perm?: string;
  /** QUALQUER uma destas perms basta (least-privilege p/ hubs multi-recurso). */
  anyPerm?: string[];
};

/**
 * Perms da camada de DADOS. O hub `/dados` consolida 7 recursos heterogêneos
 * (Conexões/Câmeras/Datasets/Arquivos/Marcações). O item de
 * sidenav "Dados" aparece p/ quem tem QUALQUER uma — Onda 0: mata o over-gate
 * `data.datasets.read` que escondia o hub inteiro de quem só tinha a perm de uma aba
 * (espelha o gating por-aba da própria página `dados/page.tsx`). Conexões usa a
 * canônica `connectors.manage` (não `iam.governance`).
 */
export const DATA_NAV_ANYPERM: string[] = [
  'data.datasets.read',
  'connectors.manage',
  // §C C5 — a seção Câmeras (registro/gestão) mora no hub Dados; quem só tem
  // a perm de câmera precisa ver o item "Dados" no sidenav.
  'security.cameras.manage',
  'data.media.read',
  'markings.read',
  'compute.providers.read',
];

export function principalCanSeeNav(
  item: NavPermSpec,
  principal: { roles: string[]; permissions: string[] } | null,
): boolean {
  if (!principal) return false;
  if (principal.roles.includes('admin')) return true;
  if (item.anyPerm && item.anyPerm.length > 0) {
    return item.anyPerm.some((p) => principal.permissions.includes(p));
  }
  if (!item.perm) return true;
  return principal.permissions.includes(item.perm);
}
