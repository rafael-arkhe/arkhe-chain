/**
 * migrate-sidenav — Onda I.2 (2026-05-23), Feedback #2.
 *
 * O modelo REAL da navegação lateral é `sidenav.groups`. Versões antigas
 * do backend persistiam a árvore em `sidenav.sections` (e, mais antigo
 * ainda, num campo solto `tree`). A UI nunca mais expõe "Seções legacy":
 * ao carregar a config, convertemos qualquer `sections`/`tree` legado em
 * `groups` de forma SILENCIOSA e descartamos o campo legado.
 *
 * Regras:
 *  - Se `groups` já tem itens, respeita — não sobrescreve com legacy.
 *  - Cada `AppShellSidenavSection { title, items[] }` vira um
 *    `AppShellSidenavGroup { key, label: title, collapsed_by_default:false,
 *    items[] }`.
 *  - Cada `AppShellSidenavItem { label, href, icon, perm_key }` vira
 *    `AppShellSidenavGroupItem { key, label, href, icon, perm_required,
 *    badge:null }` (perm_key → perm_required).
 *  - Itens sem href são descartados (group items exigem href).
 *  - `sections` é sempre zerado no resultado (a UI edita só `groups`).
 *
 * A função é PURA e idempotente: rodar de novo sobre a saída devolve o
 * mesmo objeto-equivalente (sem legacy → nada a migrar).
 */
import type {
  AppShellConfig,
  AppShellSidenavGroup,
  AppShellSidenavGroupItem,
  AppShellSidenavSection,
} from '@/lib/api';

let _autoKeySeq = 0;
function autoKey(prefix: string): string {
  _autoKeySeq += 1;
  return `${prefix}-mig-${_autoKeySeq}`;
}

function slugify(s: string, fallback: string): string {
  const base = (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || fallback;
}

function sectionToGroup(
  section: AppShellSidenavSection,
  idx: number,
): AppShellSidenavGroup {
  const items: AppShellSidenavGroupItem[] = (section.items ?? [])
    .filter((it) => typeof it?.href === 'string' && it.href.length > 0)
    .map((it) => ({
      key: slugify(it.label || it.href, autoKey('item')),
      label: it.label ?? '',
      icon: it.icon ?? null,
      href: it.href,
      perm_required: it.perm_key ?? null,
      badge: null,
    }));
  return {
    key: slugify(section.title, `grupo-${idx + 1}`),
    label: section.title ?? `Grupo ${idx + 1}`,
    collapsed_by_default: false,
    items,
  };
}

/**
 * Converte uma config carregada pra forma "groups-only". Não muta a
 * entrada — retorna um novo objeto.
 *
 * `tree` é um campo legado opcional que pode chegar do backend fora do
 * tipo `AppShellConfig` (versões antigas). Aceitamos via cast defensivo.
 */
export function migrateSidenavLegacy(config: AppShellConfig): AppShellConfig {
  const sidenav = config.sidenav ?? ({} as AppShellConfig['sidenav']);
  const existingGroups = sidenav.groups ?? [];

  // Campo legado `tree` (não tipado em AppShellConfig) — formato antigo
  // espelhava `sections`. Lê via cast e trata como sections adicionais.
  const legacyTree = (sidenav as unknown as { tree?: AppShellSidenavSection[] })
    .tree;

  // Se já há grupos, a config é "nova" — só garante sections zeradas e
  // remove o campo `tree` legado.
  if (existingGroups.length > 0) {
    const { tree: _drop, ...sidenavRest } = sidenav as unknown as Record<
      string,
      unknown
    >;
    void _drop;
    return {
      ...config,
      sidenav: {
        ...(sidenavRest as unknown as AppShellConfig['sidenav']),
        sections: [],
        groups: existingGroups,
      },
    };
  }

  // Sem grupos: tenta converter sections (preferencial) ou tree (legado).
  const legacySections: AppShellSidenavSection[] =
    (sidenav.sections && sidenav.sections.length > 0
      ? sidenav.sections
      : legacyTree) ?? [];

  const migratedGroups = legacySections.map((s, idx) => sectionToGroup(s, idx));

  const { tree: _dropTree, ...sidenavRest } = sidenav as unknown as Record<
    string,
    unknown
  >;
  void _dropTree;

  return {
    ...config,
    sidenav: {
      ...(sidenavRest as unknown as AppShellConfig['sidenav']),
      sections: [],
      groups: migratedGroups,
    },
  };
}

/** True se a config carrega resíduo legado que a migração eliminaria. */
export function hasLegacySidenav(config: AppShellConfig): boolean {
  const sidenav = config.sidenav ?? ({} as AppShellConfig['sidenav']);
  const tree = (sidenav as unknown as { tree?: unknown[] }).tree;
  return (
    (sidenav.sections?.length ?? 0) > 0 ||
    (Array.isArray(tree) && tree.length > 0)
  );
}
