'use client';

/**
 * UserView — Refactor Fase A do Workshop parity roadmap (2026-05-20).
 *
 * Persiste filtros/seleções por (app_id, user) via endpoint
 * `WorkshopUserState` no ontology-module:
 *   - `GET    /workshop/apps/{id}/states`
 *   - `PUT    /workshop/apps/{id}/states`     {name, bindings}
 *   - `DELETE /workshop/apps/{id}/states/{state_id}`
 *
 * O `user_id` é resolvido server-side a partir do `principal` (cookies
 * httpOnly via proxy). Cliente só passa o appId.
 *
 * Substitui o MVP localStorage do Sprint 4 — regra
 * [[feedback_no_localstorage_for_persistence]] obriga backend.
 */
import { Workshop, type BackendUserState } from './client';

export interface UserView {
  id: string;
  name: string;
  bindings: Record<string, unknown>;
  saved_at: number;
}

function fromBackend(s: BackendUserState): UserView {
  const ts = s.updated_at ?? s.created_at;
  return {
    id: s.id,
    name: s.name,
    bindings: s.bindings ?? {},
    saved_at: ts ? new Date(ts).getTime() : Date.now(),
  };
}

export const UserViews = {
  /** Lista views do usuário corrente pra o app. */
  list: async (appId: string): Promise<UserView[]> => {
    const rows = await Workshop.listUserStates(appId);
    return rows.map(fromBackend);
  },

  /** Cria OU sobrescreve por nome (PUT é upsert no backend). */
  upsert: async (
    appId: string,
    name: string,
    bindings: Record<string, unknown>,
  ): Promise<UserView> => {
    const row = await Workshop.upsertUserState(appId, {
      name: name.trim() || `View ${new Date().toLocaleString('pt-BR')}`,
      bindings,
    });
    return fromBackend(row);
  },

  remove: async (appId: string, viewId: string): Promise<void> => {
    await Workshop.removeUserState(appId, viewId);
  },
};
