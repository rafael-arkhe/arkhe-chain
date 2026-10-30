'use client';

/**
 * GlobalStylesheetMount — Wave G.3 (2026-05-23).
 *
 * Componente leve que lê a Folha de estilo global do tenant via
 * `GET /platform/v23/styles/global-stylesheet` e injeta um `<style>`
 * no DOM quando `enabled = true`. Backend já fez o lint server-side
 * (rejeita border-radius != 0), então aqui é só apply.
 *
 * Montado pelo `AuthShell` em todos os ramos autenticados.
 */
import * as React from 'react';

import { Styles } from '@/lib/api';

export function GlobalStylesheetMount() {
  const [css, setCss] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    Styles.getGlobalStylesheet()
      .then((out) => {
        if (cancelled) return;
        setCss(out.enabled ? out.css ?? '' : '');
      })
      .catch(() => {
        if (!cancelled) setCss('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!css) return null;
  return (
    <style
      data-testid="aegis-global-stylesheet"
      // CSS bruto vem do backend já lintado (server-side rejeita regras
      // proibidas). Como ainda é entrada de operador admin, mantemos
      // dangerouslySetInnerHTML pra preservar quebras e ordem.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}
