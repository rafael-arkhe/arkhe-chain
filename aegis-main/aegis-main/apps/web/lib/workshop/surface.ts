'use client';

/**
 * WorkshopSurface — contexto da SUPERFÍCIE onde a engine de widgets roda.
 *
 * Os widgets são genéricos e agnósticos de audiência. O que muda entre
 * superfícies (app autenticado do operador vs `/m/{token}` público) é QUEM
 * resolve dados e QUEM executa escritas — nunca um atributo do widget. Este
 * contexto carrega esses provedores injetáveis; vazio (default) = comportamento
 * autenticado (cliente Workshop/Ontology padrão).
 *
 * A superfície pública `/m` provê um `writeback` token-scoped: o
 * `writeback_form` despacha uma Action ALLOWLISTADA no token (caminho gated +
 * auditado que já existe), em vez do create autenticado. Sem isso, o form usa o
 * caminho autenticado normal.
 */
import { createContext, useContext } from 'react';

export interface WorkshopWritebackPayload {
  target_kind: string;
  fields: Record<string, unknown>;
  node_id?: string;
}

export interface WorkshopSurface {
  /** Escrita escopada pela superfície (ex.: guest → Action allowlistada no token).
   *  Ausente → o widget usa o caminho de escrita autenticado padrão. */
  writeback?: (payload: WorkshopWritebackPayload) => Promise<{ id: string }>;
}

export const WorkshopSurfaceContext = createContext<WorkshopSurface>({});

export function useWorkshopSurface(): WorkshopSurface {
  return useContext(WorkshopSurfaceContext);
}
