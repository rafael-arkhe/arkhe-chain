'use client';

/**
 * useIsMobile — Sprint L15 (2026-05-23).
 *
 * Hook simples que detecta se a tela é fone (< 640px por default).
 * Inscreve no `resize` da window para se manter sincronizado.
 *
 * Uso:
 *   const isMobile = useIsMobile();
 *   if (isMobile) return <MobileLayout/>;
 *
 * Critério: 640px é o breakpoint `sm` do Tailwind. Operador AEGIS em
 * tablet (>= 768px) cai no layout desktop.
 */
import * as React from 'react';

export function useIsMobile(breakpointPx = 640): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpointPx;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    function handle() {
      setIsMobile(window.innerWidth < breakpointPx);
    }
    handle();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, [breakpointPx]);

  return isMobile;
}
