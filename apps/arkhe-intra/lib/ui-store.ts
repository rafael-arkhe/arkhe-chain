'use client';
import { create } from 'zustand';
export const useUi = create<{ search: string; setSearch: (search: string) => void }>(set => ({ search: '', setSearch: search => set({ search }) }));
