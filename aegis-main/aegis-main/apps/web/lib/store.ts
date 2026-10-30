'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClassificationLevel } from './classification';

type SidenavState = {
  collapsed: boolean;
  toggle: () => void;
  // #4 — set explícito (ex.: páginas que querem o sidenav retraído por default).
  setCollapsed: (v: boolean) => void;
};

export const useSidenav = create<SidenavState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    { name: 'sidenav-collapsed' },
  ),
);

/**
 * Estado de colapso do sidenav INTERNO do Painel de Controle
 * (`control-panel-shell.tsx`). Espelha exatamente o `useSidenav` da casca
 * global (mesma forma `collapsed`/`toggle`, mesma persistência via
 * `zustand/middleware`/`persist`), mas com chave própria
 * (`cp-sidenav-collapsed`): os dois sidenavs são superfícies distintas, então
 * cada um lembra seu próprio colapso. Preferência pura de UI — não é estado de
 * domínio — então persistir via store leve (igual à app shell) é o padrão certo.
 */
export const useCpSidenav = create<SidenavState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    { name: 'cp-sidenav-collapsed' },
  ),
);

type CommandPaletteState = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));

type ClassificationContext = {
  level: ClassificationLevel;
  label: string;
  setContext: (level: ClassificationLevel, label: string) => void;
};

export const useClassification = create<ClassificationContext>((set) => ({
  level: 'restrito',
  label: 'INVESTIGAÇÕES ATIVAS',
  setContext: (level, label) => set({ level, label }),
}));
