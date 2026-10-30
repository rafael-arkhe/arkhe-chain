/**
 * App-shell editor subcomponents (Onda I.2 — 2026-05-23).
 *
 * Refinements pra `/painel-de-controle/app-shell` e abas Marca + Cores
 * por região do `/styles-configurator`. Centraliza imports a partir de
 * `@/components/app-shell-editor`.
 */

export { ShellMockPreview } from './ShellMockPreview';
export type { ShellMockPreviewProps } from './ShellMockPreview';

export { UserMenuPreview } from './UserMenuPreview';
export type { UserMenuPreviewProps } from './UserMenuPreview';

// Onda K.3 (2026-05-23) — preview unificado marca + cores (Feedback #6).
// Substitui MarcaPreviewCard + RegionColorsPreview (removidos): um só
// shell mock reflete marca E cores juntos, sem dois previews separados.
export { IdentidadeVisualPreview } from './IdentidadeVisualPreview';
export type { IdentidadeVisualPreviewProps } from './IdentidadeVisualPreview';

export { FullscreenToggle } from './FullscreenToggle';
export type { FullscreenToggleProps } from './FullscreenToggle';

export { SortableList, SortableRow } from './SortableList';
export type {
  SortableListProps,
  SortableRowProps,
  SortableRowRenderProps,
} from './SortableList';

// Onda K.4 (2026-05-23) — selects inteligentes (Feedback #4 + #10):
// substituem inputs de texto livre de href/perm-key por dropdowns
// populados (label humano, valor técnico escondido).
export {
  RouteSelect,
  PermSelect,
  MultiSearchableSelect,
  MarkingSelect,
  WorkspaceSelect,
  OrgSelect,
  SpaceSelect,
  useRegisteredPages,
  useIamPermissions,
  useMarkings,
  useWorkspaces,
  useOrganizations,
  useSpaces,
  _resetOptionSourceCaches,
} from './option-sources';
export type {
  RouteSelectProps,
  PermSelectProps,
  MarkingSelectProps,
  BindingSelectProps,
} from './option-sources';
