/**
 * Cookie names + helpers used by the Next.js auth proxy routes.
 *
 * Defense-grade defaults:
 *   - httpOnly                — JS in the browser cannot read the value (XSS-resistant)
 *   - secure                  — sent only over HTTPS (relaxed for localhost dev)
 *   - sameSite=strict         — never sent on cross-site
 *   - access cookie           — path=/, short TTL (matches JWT exp)
 *   - refresh cookie          — path=/api/auth/refresh, longer TTL — narrow path so it
 *                               only travels with the refresh request itself
 *
 * Espelha politicians-app/lib/auth/cookies.ts: em modo Cloudflare Tunnel
 * (CLIENT_SLUG setado) o cookie é setado com domain=<CF_ZONE> e
 * SameSite=Lax pra que o browser envie pro subdomínio
 * <slug>-browser.<zone>. Em LAN-only, SameSite=Strict.
 */
export const ACCESS_COOKIE = "aegis_access";
export const REFRESH_COOKIE = "aegis_refresh";

const isPublicHttps =
  process.env.NODE_ENV === "production" || !!process.env.CLIENT_SLUG;

const COOKIE_DOMAIN = process.env.CLIENT_SLUG
  ? process.env.CF_ZONE || "safecore.space"
  : undefined;

const COOKIE_SAMESITE: "strict" | "lax" = process.env.CLIENT_SLUG
  ? "lax"
  : "strict";

export interface CookieOpts {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict" | "lax";
  path: string;
  maxAge: number;
  domain?: string;
}

export function accessCookieOpts(maxAgeSeconds: number): CookieOpts {
  const opts: CookieOpts = {
    httpOnly: true,
    secure: isPublicHttps,
    sameSite: COOKIE_SAMESITE,
    path: "/",
    maxAge: maxAgeSeconds,
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  return opts;
}

export function refreshCookieOpts(maxAgeSeconds: number): CookieOpts {
  const opts: CookieOpts = {
    httpOnly: true,
    secure: isPublicHttps,
    sameSite: COOKIE_SAMESITE,
    path: "/api/auth/refresh",
    maxAge: maxAgeSeconds,
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  return opts;
}

export function clearCookieHeaders(): string[] {
  const expired = "Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0";
  const ss = COOKIE_SAMESITE === "lax" ? "Lax" : "Strict";
  const dom = COOKIE_DOMAIN ? `Domain=${COOKIE_DOMAIN}; ` : "";
  return [
    `${ACCESS_COOKIE}=; Path=/; ${dom}HttpOnly; SameSite=${ss}; ${expired}`,
    `${REFRESH_COOKIE}=; Path=/api/auth/refresh; ${dom}HttpOnly; SameSite=${ss}; ${expired}`,
  ];
}
