'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth/useAuth';
import { ControlPanelShell } from '@/components/control-panel/control-panel-shell';
import { Header } from './header';
import { Sidenav } from './sidenav';
import { Footer } from './footer';
import { CommandPalette } from './command-palette';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { GlobalStylesheetMount } from '@/components/shell/global-stylesheet-mount';
// Wave G.1 — Toaster global p/ feedback de Marketplace install + outras
// acoes de painel. Mount em todos os shells autenticados.
import { Toaster } from '@/components/ui/toast';
// Wave H.4.B (2026-05-23) — Pilha de Comunicados (banners globais
// agendados) renderizada ACIMA do header em todo shell autenticado.
import { ComunicadosBanner } from '@/components/shell/comunicados-banner';
// Wave H.4.C (2026-05-23) — Cores por região: injeta CSS variables
// (--banner-bg, --sidenav-bg, ...) com fallback aos tokens DS.
import { RegionColorsMount } from '@/components/shell/region-colors-mount';
// Missão brand (2026-07-09) — Marca do tenant (nome/logo) disponível pro
// chrome inteiro via contexto, igual ao padrão de cores/CSS acima.
import { BrandWhenAuthed } from '@/components/shell/brand-context';
// Wave H.1 (2026-05-23) — runtime de Tours operacionais. Detecta tours
// não-vistos para o usuário atual + dispara overlay quando o pathname
// casa com trigger.target_pages.
import { TourRunner } from '@/components/tours/tour-runner';

/**
 * Aplica o theme da config (light|dark) na tag <html>. Roda em todo
 * mount/route change pra refletir override do operador sem reload.
 *
 * Wave E.1 (2026-05-23).
 */
function ThemeApplier() {
  const { config } = useAppShellConfig();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (config.theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [config.theme]);
  return null;
}

/**
 * Wave G.3 (2026-05-23) — monta o `<style>` global do tenant (Folha de
 * estilo global). Roda só quando o operador está logado; em /login não
 * tem principal e o fetch retornaria 401. Backend já lintou o CSS antes
 * de gravar — aqui é só apply.
 */
function GlobalStylesheetWhenAuthed() {
  const { principal } = useAuth();
  if (!principal) return null;
  return <GlobalStylesheetMount />;
}

/**
 * Wave H.4.C (2026-05-23) — monta CSS variables de cores por região do
 * tenant. Igual ao GlobalStylesheet: só roda quando há principal, e
 * caches no fetch falham silenciosamente (fallback aos tokens DS).
 */
function RegionColorsWhenAuthed() {
  const { principal } = useAuth();
  if (!principal) return null;
  return <RegionColorsMount />;
}

/**
 * Rotas externas que o Painel de Controle linka. Quando o operador está
 * em cp mode (`?cp=1` ou cookie aegis_cp=1), navegação dentro dessas
 * raízes mantém o sidebar do painel visível. Acesso direto (via main
 * sidenav ou URL bar sem cookie) renderiza com chrome global normal.
 *
 * Sprint H1.7 (2026-05-22): introduzido pra resolver navegação interna
 * de Workshop/IAM/etc — Links internos descartam querystring, então
 * `?cp=1` se perdia. Cookie + pattern matching resolvem.
 */
const CP_LINKED_PATTERNS = [
  '/workshop',
  '/agentes',
  '/ontologia',
  '/iam',
  '/fluxos',
];

function isCpLinkedRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return CP_LINKED_PATTERNS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

function writeCookie(value: string) {
  if (typeof document === 'undefined') return;
  if (value) {
    document.cookie = `aegis_cp=${value}; path=/; samesite=lax`;
  } else {
    document.cookie = 'aegis_cp=; path=/; max-age=0; samesite=lax';
  }
}

export function AuthShell({
  children,
  initialCpMode = false,
}: {
  children: React.ReactNode;
  /** Sprint H1.7: hidratado do server (cookie) pra evitar flash. */
  initialCpMode?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLogin = pathname === '/login' || pathname?.startsWith('/login/');
  // Sprint E4 (Parity Audit, 2026-05-21): rota /workshop/kiosk/{id} é
  // fullscreen — sem sidenav/header global. O page.tsx do kiosk renderiza
  // seu próprio chrome mínimo (barra de título + ícone).
  const isKiosk = pathname?.startsWith('/workshop/kiosk/');
  // Sprint H1 (2026-05-22): rota /painel-de-controle (e filhas) é
  // full-bleed Palantir-style — espelho do Foundry Control Panel.
  const isPainelDeControle = pathname?.startsWith('/painel-de-controle');
  // Onda 2 (2026-05-25) — superfície pública do morador (token de convidado):
  // zero chrome, zero auth. A página é autossuficiente e fala com o backend
  // pelo proxy anônimo /api/public/*.
  const isPublicGuest = pathname === '/m' || pathname?.startsWith('/m/');
  // Sprint PR2 (2026-05-22): rota /sala/[slug] é o viewer Carbon-like
  // da Sala — fullbleed, sem chrome global. A Sala renderiza sua própria
  // menu bar Carbon (Navigation + Tabs + Module Button + Utility).
  const isSalaViewer = pathname?.startsWith('/sala/');
  // Sprint H1.4 (2026-05-22): rota externa com ?cp=1 entra em cp mode.
  const hasCpFlag = searchParams?.get('cp') === '1';
  // Sprint H1.7 (2026-05-22): cookie persiste cp mode entre navegações
  // internas (Workshop edit etc. — Links nativos perdem o querystring).
  const [cookieCpMode, setCookieCpMode] = useState(initialCpMode);
  const cpLinked = isCpLinkedRoute(pathname);

  // Detecta ?cp=1 → grava cookie + atualiza state.
  useEffect(() => {
    if (hasCpFlag) {
      writeCookie('1');
      setCookieCpMode(true);
    }
  }, [hasCpFlag]);

  // Limpa cookie quando o operador sai do escopo (não é painel nem rota
  // cp-linked). Isso garante que clicar "Voltar ao AEGIS" → / volta
  // chrome normal, e que rotas como /buscar /geo /alertas etc. nunca
  // herdam cp mode acidentalmente.
  useEffect(() => {
    if (!isPainelDeControle && !cpLinked) {
      writeCookie('');
      setCookieCpMode(false);
    }
  }, [isPainelDeControle, cpLinked]);

  // cp mode externo só vale em rota cp-linked + (flag ou cookie).
  const cpMode = cpLinked && (hasCpFlag || cookieCpMode);

  if (isPublicGuest) {
    // Sem AuthProvider/shell: o morador não tem (nem precisa de) sessão.
    return <>{children}</>;
  }

  if (isLogin) {
    // AuthProvider também envolve /login pra que, após o submit, o
    // hook useAuth().refresh() carregue o principal antes da navegação.
    return <AuthProvider>{children}</AuthProvider>;
  }

  if (isKiosk || isPainelDeControle || isSalaViewer) {
    // AuthProvider preservado (precisa de principal pra RequirePerm),
    // mas sem Sidenav/Header/Footer/CommandPalette. Rotas internas
    // do painel são wrappadas pelo layout do painel (não aqui).
    // ThemeApplier roda mesmo em kiosk/painel pra refletir override.
    // Wave H.1 (2026-05-23): TourRunner desligado em /painel-de-controle
    // (operador admin não deve receber tours operacionais lá) e em /kiosk
    // (fullscreen apresentação não deve ter overlay).
    // Wave H.4.B (2026-05-23): ComunicadosBanner aparece em painel +
    // sala viewer (admin precisa ver banners enquanto opera), mas NÃO
    // em /kiosk (fullscreen apresentação não deve ter overlay extra).
    return (
      <AuthProvider>
        <ThemeApplier />
        <GlobalStylesheetWhenAuthed />
        <RegionColorsWhenAuthed />
        <BrandWhenAuthed>
          {!isKiosk && <ComunicadosBanner />}
          {children}
        </BrandWhenAuthed>
        <TourRunner disabled={isPainelDeControle || isKiosk} />
        <Toaster />
      </AuthProvider>
    );
  }

  if (cpMode) {
    // Rota externa em cp mode — envelopa no ControlPanelShell pra
    // sidebar do painel persistir + footer "Painel de Controle" levar
    // de volta. Sem header/sidenav/footer global.
    return (
      <AuthProvider>
        <ThemeApplier />
        <GlobalStylesheetWhenAuthed />
        <RegionColorsWhenAuthed />
        <BrandWhenAuthed>
          <ControlPanelShell>{children}</ControlPanelShell>
        </BrandWhenAuthed>
        <TourRunner disabled />
        <Toaster />
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <ThemeApplier />
      <GlobalStylesheetWhenAuthed />
      <RegionColorsWhenAuthed />
      <BrandWhenAuthed>
        <div className="flex flex-col h-screen">
          {/* Wave H.4.B (2026-05-23) — Pilha de Comunicados (banners
              globais agendados). Aparece acima do header em todo shell
              autenticado; some quando não há comunicados ativos. */}
          <ComunicadosBanner />
          <Header />
          <div className="flex-1 flex overflow-hidden">
            <Sidenav />
            <main className="flex-1 flex overflow-hidden bg-canvas-light text-text-on-light">{children}</main>
          </div>
          <Footer />
        </div>
      </BrandWhenAuthed>
      <CommandPalette />
      <TourRunner />
      <Toaster />
    </AuthProvider>
  );
}
