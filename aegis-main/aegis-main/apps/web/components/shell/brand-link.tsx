'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { useAppShellConfig } from '@/lib/app-shell/preview-provider';
import { useBrand } from '@/components/shell/brand-context';

/**
 * `<BrandLink>` — Missão #6 (2026-05-24).
 *
 * Logo + wordmark "AEGIS" no canto superior-esquerdo do chrome, alinhado
 * com a coluna do `<Sidenav>` logo abaixo. Voltar ao painel (href="/").
 *
 * Dois problemas que esta extração resolve (estava inline no header):
 *
 *  1. DESALINHAMENTO. O `<Sidenav>` dimensiona via
 *     `style={{ width: config.sidenav.width_px }}` (slider do operador,
 *     200–320px) e colapsa para 44px. O brand link estava fixo em
 *     `w-[220px]` e ignorava `width_px`, então a borda direita deste link
 *     não batia com a borda direita da sidenav em nenhuma largura ≠ 220.
 *     Aqui lemos `width_px` com o MESMO clamp da sidenav e dirigimos a
 *     largura por inline style — as duas colunas passam a casar em
 *     qualquer largura e durante toda a animação.
 *
 *  2. ANIMAÇÃO TRAVADA. O link animava `transition-[width,padding,gap]`
 *     em 300ms enquanto o span "AEGIS" animava `transition-[max-width,
 *     opacity]` em 200ms — duas linhas-do-tempo desencontradas em nós
 *     aninhados + padding/gap animando = o "custa a diminuir e aumentar".
 *     Agora animamos UMA única propriedade (`width`, 300ms ease-in-out),
 *     idêntico à sidenav; o `<Image>` ganha `shrink-0` para nunca espremer
 *     no meio da transição; e o wordmark é renderizado condicionalmente
 *     (como a sidenav faz), eliminando a segunda timeline de vez.
 */
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 44;

export function BrandLink({ collapsed }: { collapsed: boolean }) {
  const { config } = useAppShellConfig();
  const brand = useBrand();
  // Missão brand (2026-07-09) — nome/logo do tenant (Marca em
  // styles-configurator) em vez do literal "AEGIS"/"/logo-white.svg"
  // hardcoded. Sem brand carregada (loading / sem personalização) cai nos
  // mesmos defaults de sempre.
  const wordmark = brand.company_name || brand.pwa_short_name || 'AEGIS';
  // Este cabeçalho é superfície ESCURA (bg-raised-dark/border-border-dark) —
  // prefere o logo p/ fundo escuro; degrada pro logo primário e depois pro
  // mark branco canônico (que já é correto no escuro).
  const logoSrc = brand.logo_dark_url || brand.logo_url || '/logo-white.svg';
  const hasCustomLogo = !!(brand.logo_dark_url || brand.logo_url);
  // Mesmo clamp que o `<Sidenav>` (lib/.../sidenav.tsx) — mantém as duas
  // colunas com a largura idêntica em qualquer posição do slider. Leitura
  // DEFENSIVA de `sidenav.width_px` (idêntico ao `resolveSearch` do header):
  // se a config em runtime não trouxer o campo (config antiga / track de
  // config em paralelo), caímos no default 220 sem quebrar o render.
  const widthPx = Math.max(
    MIN_WIDTH,
    Math.min(MAX_WIDTH, Math.floor(config.sidenav?.width_px ?? 220)),
  );

  return (
    <Link
      href="/"
      data-testid="brand-link"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        // `shrink-0` é CRÍTICO: o `<header>` é `flex items-stretch` e o
        // bloco de busca ao lado é `flex-1`. Sem `shrink-0` o flexbox
        // comprime este link (a largura inline vira só flex-basis) e ele
        // colapsa pra ~25px — exatamente o "desalinhado" relatado. Igual
        // ao `<Sidenav>`, que já é `shrink-0`, fixamos a largura aqui.
        'flex shrink-0 items-center border-b border-r border-border-dark hover:bg-raised-dark overflow-hidden',
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'justify-center px-0 gap-0' : 'px-3 gap-2',
      )}
      style={{ width: collapsed ? COLLAPSED_WIDTH : widthPx }}
      aria-label="Voltar ao painel"
    >
      <Image
        src={logoSrc}
        alt=""
        width={18}
        height={18}
        className="shrink-0 opacity-95"
        priority
        unoptimized={hasCustomLogo}
      />
      {!collapsed && (
        <span
          data-testid="brand-link-name"
          className="font-semibold text-[12px] tracking-[0.18em] whitespace-nowrap leading-none truncate"
        >
          {wordmark}
        </span>
      )}
    </Link>
  );
}
