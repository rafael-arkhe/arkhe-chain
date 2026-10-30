/**
 * Helper de autenticação reutilizável pros specs Playwright.
 *
 * Faz POST /api/auth/login direto (sem passar pela UI) — o endpoint do
 * Next.js grava os cookies httpOnly `aegis_access` + `aegis_refresh`
 * no contexto do browser. Depois espera o /api/auth/me retornar 200
 * pra garantir que o AuthProvider hidrate antes da próxima navegação.
 *
 * Credenciais default são as do operador "admin" do ambiente demo do
 * ontology-module (ver docs/security-app/auth-iam-port.md). Pode ser
 * sobrescrito por env (E2E_LOGIN_USER / E2E_LOGIN_PASS) ou por
 * argumento na chamada quando o spec quiser autenticar como outro
 * papel.
 *
 * Retorna o principal (whoami) pra specs poderem assert sobre roles /
 * permissions sem fazer fetch extra.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface WhoAmI {
  user_id: string;
  username: string;
  display_name: string;
  email: string | null;
  tenant: {
    id: string;
    slug: string;
    display_name: string;
    features: string[];
  } | null;
  clearances: string[];
  roles: string[];
  permissions: string[];
  must_change_password: boolean;
  totp_enabled: boolean;
}

export interface LoginOptions {
  username?: string;
  password?: string;
  totp_code?: string;
}

const DEFAULT_USERNAME =
  process.env.E2E_LOGIN_USER || "admin";
// Pós-reset do banco (2026-07-03) o admin usa AEGIS_INITIAL_ADMIN_PASSWORD
// (env do container ontology-api) — ver HANDOFF-FASE7 §F7.0a. CUIDADO: 423
// tranca a conta após falhas seguidas; não chutar senha aqui.
const DEFAULT_PASSWORD =
  process.env.E2E_LOGIN_PASS || "AGS-2026-bzYE5FUfpsF7emmHLOkk";

export async function login(
  page: Page,
  opts: LoginOptions = {},
): Promise<WhoAmI | null> {
  const username = opts.username ?? DEFAULT_USERNAME;
  const password = opts.password ?? DEFAULT_PASSWORD;

  const res = await page.request.post("/api/auth/login", {
    data: {
      username,
      password,
      ...(opts.totp_code ? { totp_code: opts.totp_code } : {}),
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(
    res.ok(),
    `login falhou: status=${res.status()} body=${await res.text().catch(() => "")}`,
  ).toBeTruthy();

  // /api/auth/me confirma que o cookie chegou ao backend.
  const me = await page.request.get("/api/auth/me");
  if (!me.ok()) {
    return null;
  }
  return (await me.json()) as WhoAmI;
}
