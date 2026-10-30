/**
 * Defaults canônicos do shell — usados como fallback quando o backend
 * não devolve config (source="default") e como base ao popular tabs no
 * composer (operador inicia a partir de algo, não vazio).
 *
 * Estes defaults ESPELHAM o comportamento hardcoded atual:
 *   - banner.custom_text null  → cai pro label do PageShell
 *   - footer visível
 *   - context_switcher visível com promoted workspaces
 *   - theme=light
 *   - sidenav populado com os grupos default (= FALLBACK_NAV)
 *
 * Wave E.1 (2026-05-23) — `feedback_dispersed_features_into_existing_modules`.
 * Wave H.4.Y (2026-05-23) — extended sections (banner/footer/user_menu/
 *   sidenav.groups/homepage.layout).
 * Onda I.2 (2026-05-23) — DEFAULT_MARCA + PRESETS_COLOR_AEGIS extensions
 *   (live preview + presets pra Cores por região / Marca).
 * Onda K.4 (2026-05-23) — Feedback #2: o DEFAULT do sidenav editável e do
 *   Menu do usuário passa a ESPELHAR EXATAMENTE o que era hardcoded antes
 *   (DEFAULT_SIDENAV_GROUPS deriva de FALLBACK_NAV; DEFAULT_USER_MENU_ITEMS
 *   espelha o UserMenuFallback). Botão "Restaurar padrão" reseta pra cá.
 *   Feedback #3: banner.context_slots consolida o conceito de contexto
 *   dinâmico (org/espaço/operação/classificação) e elimina a duplicação
 *   "Texto customizado" + "Subtítulo (legacy)" — só `custom_text` resta.
 */
import { FALLBACK_NAV } from '@/lib/api/fallback';
import type {
  AppShellConfig,
  AppShellSidenavGroup,
  AppShellUserMenuItem,
  BrandOut,
  RegionColorsOut,
} from '@/lib/api';

/**
 * Onda K.4 (Feedback #2) — grupos default da navegação lateral.
 *
 * Derivados de `FALLBACK_NAV` (a topologia hardcoded histórica do
 * security-app: Operação · Análise · Conteúdo). Fonte ÚNICA — se a nav
 * default mudar, muda em `fallback.ts` e propaga aqui automaticamente.
 *
 * Mapeamento NavSection → AppShellSidenavGroup:
 *   section.id    → group.key
 *   section.label → group.label
 *   item.id       → group.item.key
 *   item.perm_key → group.item.perm_required
 */
export const DEFAULT_SIDENAV_GROUPS: AppShellSidenavGroup[] =
  FALLBACK_NAV.sections.map((s) => ({
    key: s.id,
    label: s.label,
    collapsed_by_default: !s.default_open,
    items: s.items.map((it) => ({
      key: it.id,
      label: it.label,
      icon: it.icon ?? null,
      href: it.href,
      perm_required: it.perm_key ?? null,
      badge: it.badge ?? null,
    })),
  }));

/**
 * Onda K.4 (Feedback #2) — itens default do Menu do usuário.
 *
 * Espelha o `UserMenuFallback` de `components/shell/user-menu.tsx`
 * (Configurações · Auditoria · [2FA fixo] · Sair). O item 2FA é injetado
 * pelo renderer (não-configurável); aqui só os configuráveis + logout.
 */
export const DEFAULT_USER_MENU_ITEMS: AppShellUserMenuItem[] = [
  {
    key: 'configuracoes',
    label: 'Configurações',
    icon: 'cog',
    href: '/painel-de-controle',
    kind: 'link',
    visible: true,
  },
  {
    key: 'auditoria',
    label: 'Auditoria',
    icon: 'activity',
    href: '/iam/auditoria',
    kind: 'link',
    visible: true,
  },
  {
    key: 'logout',
    label: 'Sair',
    icon: 'log-out',
    href: null,
    kind: 'logout',
    visible: true,
  },
];

export const DEFAULT_APP_SHELL: AppShellConfig = {
  homepage: {
    logo: null,
    hero_text: null,
    sections: [],
    // Onda J.1 — null = Home padrão (seed). Quando setado, é o slug da
    // Página renderizada em `/`.
    page_id: null,
  },
  navbar: {
    logo: null,
    items: [],
    // Onda M1.a (#4) — config do campo de busca do header. Placeholder
    // operacional (pessoa/veículo/BO/mandado/endereço); compact off por
    // padrão (busca expandida no header). Render é de outro agente.
    search: {
      placeholder: 'Buscar pessoa, veículo, BO, mandado, endereço…',
      compact: false,
    },
  },
  sidenav: {
    style: 'default',
    sections: [],
    // Onda K.4 (Feedback #2) — `groups` fica vazio no DEFAULT_APP_SHELL para
    // que o RENDERER do sidenav caia no fallback canônico (`useNavTree` →
    // FALLBACK_NAV), preservando os testids `section-operacao` / `nav-painel`
    // do shell renderizado. O EDITOR, porém, SEMEIA os grupos default
    // (DEFAULT_SIDENAV_GROUPS) quando o operador abre a aba sem grupos
    // salvos — assim ele "vê os itens como antes" e pode restaurar.
    groups: [],
    width_px: 220,
    dense: false,
    footer_link: null,
  },
  footer: {
    visible: true,
    columns: [],
    // Wave H.4.Y
    status_bar_items: [],
    copyright_text: null,
    version_visible: true,
  },
  banner: {
    visible: true,
    // Onda K.4 (Feedback #3) — `subtitle` foi consolidado em `custom_text`
    // (eram a mesma coisa). Mantemos o campo no tipo só por compat de
    // leitura de configs antigas; a UI nunca mais o edita.
    subtitle: null,
    // Wave H.4.Y
    enabled: true,
    classification_default: null,
    custom_text: null,
    bg: null,
    text: null,
    position: 'top',
    show_clock: false,
    show_timezone: false,
    dismissible: false,
    // Onda K.4 (Feedback #3) — slots de contexto dinâmico. O banner vira
    // uma barra de contexto viva: mostra Org/Espaço/Operação ATUAIS
    // (lidos de MeContextApi) + permite TROCAR via o switcher existente.
    // Defaults: classificação sempre, org sim, espaço/operação opt-in.
    context_slots: {
      organization: true,
      space: false,
      project: false,
      classification: true,
    },
    show_context_switcher: true,
    // Onda M1.a (#11) — política de truncamento dos slots do banner. Liga
    // o corte por slot (24 chars), com encolhimento responsivo em telas
    // estreitas. Mantém o banner em uma linha. Render é de outro agente.
    truncate: {
      enabled: true,
      max_chars_per_slot: 24,
      responsive: true,
    },
  },
  context_switcher: {
    visible: true,
    default_scope: 'org',
    show_promoted_workspaces: true,
  },
  theme: 'light',
  // Wave F.1 + Onda I.5 (apps_menu)
  marketplace: {
    enabled_app_slugs: [],
    apps_menu: {
      enabled: false,
      items: [],
    },
  },
  permissions: {
    default_workspace_id: null,
    landing_page_overrides: [],
  },
  // Wave H.4.Y · Onda K.4 (Feedback #2) — default = itens de antes.
  user_menu: {
    items: DEFAULT_USER_MENU_ITEMS,
  },
  // M2 (2026-05-24) — personalização da tela /login. Default = marca AEGIS
  // neutra (use_default_aegis=true). O operador pode expor a marca do
  // tenant desligando o toggle e preenchendo logo/slogan/cor/fundo/mensagem.
  login: {
    use_default_aegis: true,
    logo_url: null,
    slogan: null,
    background: null,
    primary_color: null,
    message: null,
  },
};

// ─── M2 (2026-05-24) — Defaults da tela de login ───────────────────────────
//
// Valores canônicos AEGIS exibidos na /login quando `use_default_aegis` é
// true (ou quando o backend público ainda não respondeu). Espelham
// DEFAULT_MARCA + o slogan oficial Safe Core ("Clareza para decisões
// complexas."). É o mesmo texto de `login.subtitle` no dicionário i18n.

export const DEFAULT_LOGIN = {
  logo_url: '/aegis-logo.svg',
  slogan: 'Clareza para decisões complexas.',
  primary_color: '#2D77BE',
};

// ─── Onda I.2 (2026-05-23) — Defaults da Marca (Feedback #7) ───────────────
//
// O form Marca pré-carrega esses valores quando o backend devolve brand
// vazio. Operador "vê algo" no primeiro acesso — sem campos null sem pista
// do que preencher (`feedback_no_phase_status_in_ui`).
//
// `logo_default_url` aponta pro asset estático em /public/aegis-logo.svg
// (servido pelo Next), o slogan default é o slogan oficial Safe Core, e o
// PWA herda o nome canônico do produto.

export const DEFAULT_MARCA: BrandOut = {
  company_name: 'Safe Core',
  logo_url: '/aegis-logo.svg',
  // Marca branca canônica AEGIS — correta sobre o cabeçalho/sidenav escuros.
  logo_dark_url: '/logo-white.svg',
  slogan: 'Clareza para decisões complexas.',
  primary_color: '#2D77BE',
  favicon_url: '/favicon.ico',
  pwa_name: 'AEGIS',
  pwa_short_name: 'AEGIS',
};

// ─── Onda I.2 (2026-05-23) — Presets paleta AEGIS (Feedback #6) ────────────
//
// 3 presets canônicos pra "Cores por região". O operador clica um chip,
// aplica em todas as regiões de uma vez, e pode ajustar fields
// individualmente. Cada preset cobre as 6 regiões (banner/sidenav/navbar/
// footer/comunicados/backdrop) com seus 3-4 fields cada.

export interface RegionColorPreset {
  /** Slug canônico — backend devolve esses 3 em /styles/region-colors/presets. */
  key: 'default-sharp' | 'alto-contraste' | 'dark-operacional';
  label: string;
  description: string;
  colors: RegionColorsOut;
}

export const PRESET_DEFAULT_SHARP: RegionColorPreset = {
  key: 'default-sharp',
  label: 'Padrão AEGIS',
  description:
    'Tema operacional padrão. Slate-900 + accent âmbar sutil em destaque.',
  colors: {
    banner: { bg: '#0D2C4D', text: '#FFFFFF', accent: '#FFC107' },
    sidenav: { bg: '#FFFFFF', text: '#1B2533', active: '#2D77BE' },
    navbar: { bg: '#FFFFFF', text: '#1B2533', active: '#2D77BE' },
    footer: { bg: '#F4F5F7', text: '#6A7280', accent: '#D5D9DD' },
    comunicados: {
      info: '#2D77BE',
      warning: '#E8B33B',
      danger: '#C8341F',
      success: '#3D9F58',
    },
    backdrop: { bg: '#000000', opacity: '0.4' },
  },
};

export const PRESET_ALTO_CONTRASTE: RegionColorPreset = {
  key: 'alto-contraste',
  label: 'Alto Contraste',
  description:
    'Acessibilidade WCAG AAA: preto puro + branco puro, amarelo no foco.',
  colors: {
    banner: { bg: '#000000', text: '#FFFFFF', accent: '#FFEE00' },
    sidenav: { bg: '#FFFFFF', text: '#000000', active: '#FFEE00' },
    navbar: { bg: '#FFFFFF', text: '#000000', active: '#FFEE00' },
    footer: { bg: '#000000', text: '#FFFFFF', accent: '#FFEE00' },
    comunicados: {
      info: '#0040D0',
      warning: '#FFEE00',
      danger: '#C8000F',
      success: '#007F1F',
    },
    backdrop: { bg: '#000000', opacity: '0.7' },
  },
};

export const PRESET_DARK_OPERACIONAL: RegionColorPreset = {
  key: 'dark-operacional',
  label: 'Dark Operacional',
  description: 'Sala de operações: preto + cinza-grafite + acento vermelho.',
  colors: {
    banner: { bg: '#0A0A0A', text: '#F0F0F0', accent: '#C8341F' },
    sidenav: { bg: '#161A1F', text: '#D5D9DD', active: '#C8341F' },
    navbar: { bg: '#161A1F', text: '#D5D9DD', active: '#C8341F' },
    footer: { bg: '#0A0A0A', text: '#9AA0A6', accent: '#C8341F' },
    comunicados: {
      info: '#4A8FD1',
      warning: '#E8B33B',
      danger: '#C8341F',
      success: '#3D9F58',
    },
    backdrop: { bg: '#000000', opacity: '0.6' },
  },
};

export const PRESETS_COLOR_AEGIS: RegionColorPreset[] = [
  PRESET_DEFAULT_SHARP,
  PRESET_ALTO_CONTRASTE,
  PRESET_DARK_OPERACIONAL,
];
