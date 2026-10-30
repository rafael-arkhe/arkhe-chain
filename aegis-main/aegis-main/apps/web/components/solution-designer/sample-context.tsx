'use client';

/**
 * #6 — ponte da AMOSTRA real entre a Coleta e a IDE. Quando o operador roda a
 * amostra de uma skill (dados reais), guardamos os registros por Tipo de objeto;
 * a IDE (aberta do nó de Processamento) consome a amostra do MESMO tipo p/
 * preencher o painel de entrada com DADOS REAIS (não só o esqueleto). Assim o
 * operador valida nó-a-nó estilo N8N.
 */
import * as React from 'react';

type Samples = Record<string, Record<string, unknown>[]>; // keyed por node_type

const Ctx = React.createContext<{
  samples: Samples;
  setSample: (nodeType: string, records: Record<string, unknown>[]) => void;
}>({ samples: {}, setSample: () => {} });

export function SampleProvider({ children }: { children: React.ReactNode }) {
  const [samples, setSamples] = React.useState<Samples>({});
  const setSample = React.useCallback(
    (nodeType: string, records: Record<string, unknown>[]) => {
      if (!nodeType) return;
      setSamples((s) => ({ ...s, [nodeType]: records }));
    },
    [],
  );
  const value = React.useMemo(() => ({ samples, setSample }), [samples, setSample]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Registros de amostra reais para um Tipo de objeto (vazio se não rodou). */
export function useSampleFor(nodeType: string | undefined): Record<string, unknown>[] {
  const { samples } = React.useContext(Ctx);
  return (nodeType && samples[nodeType]) || [];
}

export function useSetSample(): (nodeType: string, records: Record<string, unknown>[]) => void {
  return React.useContext(Ctx).setSample;
}
