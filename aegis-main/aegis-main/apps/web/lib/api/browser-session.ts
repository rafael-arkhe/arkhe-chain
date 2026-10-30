/**
 * Cliente do browser de servidor (KasmVNC + cookie vault).
 * Consome `/governance/vault/browser-session/*` do ontology-module.
 *
 * Shape do backend (F23):
 *   {
 *     chrome_container_healthy: bool,
 *     profile_volume_mounted: bool,
 *     last_probe_at: ISO string | null,
 *     cookies: { instagram: "logged"|"expired"|"never", x_twitter: ..., ... }
 *   }
 */
import { apiFetch } from './client';

export type CookieState = 'logged' | 'expired' | 'never' | string;

export interface BrowserStatus {
  chrome_container_healthy: boolean;
  profile_volume_mounted: boolean;
  last_probe_at: string | null;
  /** Plataforma → estado do cookie. Ex: { instagram: 'logged', x_twitter: 'expired' } */
  cookies: Record<string, CookieState>;
}

export interface BrowserCredentials {
  url: string;
  username: string;
  password: string;
  expires_at?: string;
  note?: string;
}

const BASE = '/governance/vault/browser-session';

export const BrowserSession = {
  status: () => apiFetch<BrowserStatus>(`${BASE}/status`),
  credentials: () => apiFetch<BrowserCredentials>(`${BASE}/credentials`),
  probe: () =>
    apiFetch<BrowserStatus>(`${BASE}/probe`, { method: 'POST' }),
};
