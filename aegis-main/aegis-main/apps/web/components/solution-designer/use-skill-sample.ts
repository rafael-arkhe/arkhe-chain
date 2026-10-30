'use client';

/**
 * #6 — "Rodar amostra" (estilo N8N): dispara uma execução REAL da skill de
 * Coleta com limite pequeno, em modo amostra (não persiste), e faz poll até
 * vir os registros reais.
 *
 * A skill real (scraping/LLM) tem latência IMPREVISÍVEL (pode levar de segundos
 * a vários minutos, e pega rate-limit). Por isso NÃO há timeout arbitrário que
 * "desiste": o poll roda mostrando o TEMPO DECORRIDO ao vivo (o operador vê que
 * está vivo), avisa quando está demorando, e o operador PARA quando quiser. Só
 * um teto de segurança bem alto evita poll eterno se a aba for esquecida.
 */
import * as React from 'react';

import { Solutions } from '@/lib/api';

export type SampleState = 'idle' | 'running' | 'done' | 'error' | 'unsupported';

export interface UseSkillSample {
  state: SampleState;
  records: Record<string, unknown>[];
  nodeType: string | null;
  error: string | null;
  /** Segundos decorridos desde o início (ao vivo enquanto roda). */
  elapsedSec: number;
  /** true quando passou do limiar "está demorando" (aviso de rate-limit). */
  slow: boolean;
  run: (skillKey: string, params: Record<string, unknown>) => Promise<void>;
  /** Para de observar (o operador desiste); o run do backend segue, a UI volta ao início. */
  stop: () => void;
  reset: () => void;
}

const POLL_MS = 4000;
const SLOW_AFTER_SEC = 90; // a partir daqui, avisa que está demorando
const SAFETY_CAP_SEC = 15 * 60; // teto de segurança (poll eterno se aba esquecida)

export function useSkillSample(): UseSkillSample {
  const [state, setState] = React.useState<SampleState>('idle');
  const [records, setRecords] = React.useState<Record<string, unknown>[]>([]);
  const [nodeType, setNodeType] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const cancelRef = React.useRef(false);
  const startRef = React.useRef(0);

  React.useEffect(() => () => { cancelRef.current = true; }, []);

  // Contador de tempo ao vivo enquanto roda (re-render a cada 1s).
  React.useEffect(() => {
    if (state !== 'running') return;
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  const run = React.useCallback(async (skillKey: string, params: Record<string, unknown>) => {
    cancelRef.current = false;
    startRef.current = Date.now();
    setState('running');
    setRecords([]);
    setNodeType(null);
    setError(null);
    setElapsedSec(0);
    try {
      const { sample_id } = await Solutions.skillSample(skillKey, params);
      while ((Date.now() - startRef.current) / 1000 < SAFETY_CAP_SEC) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelRef.current) return;
        const st = await Solutions.skillSampleStatus(sample_id);
        if (st.status === 'done') {
          setRecords(st.output?.records || []);
          setNodeType(st.output?.node_type || null);
          setState('done');
          return;
        }
        if (st.status === 'error' || st.status === 'unsupported') {
          setError(st.error || null);
          setState(st.status);
          return;
        }
      }
      // Teto de segurança: não é "deu erro", é "aguardou demais sem desistir".
      setError('cap');
      setState('error');
    } catch (e) {
      if (cancelRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setState('error');
    }
  }, []);

  const stop = React.useCallback(() => {
    cancelRef.current = true;
    setState('idle');
    setElapsedSec(0);
  }, []);

  const reset = React.useCallback(() => {
    cancelRef.current = true;
    setState('idle');
    setRecords([]);
    setNodeType(null);
    setError(null);
    setElapsedSec(0);
  }, []);

  return {
    state,
    records,
    nodeType,
    error,
    elapsedSec,
    slow: state === 'running' && elapsedSec >= SLOW_AFTER_SEC,
    run,
    stop,
    reset,
  };
}
