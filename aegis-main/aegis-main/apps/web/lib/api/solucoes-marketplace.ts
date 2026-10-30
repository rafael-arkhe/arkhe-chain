/**
 * Loja cross-tenant (Frente C) — cliente do /solutions/marketplace.
 *
 * Modelo "blueprint re-materialize, PULL": publicar SNAPSHOTA o blueprint de uma
 * solução como listagem visível em todo o deployment; instalar re-roda o
 * materialize LOCALMENTE no tenant do operador (a solução inteira nasce no tenant
 * dele). Substitui o uso do marketplace v23 (que não materializava nada) na Loja.
 */
import { aegis } from "./sdk";
import { apiFetch } from "./client";

export interface ListingManifest {
  ontology_types: number;
  action_types: number;
  agents: number;
  flows: number;
  logic_functions: number;
  pages: number;
}

export interface ListingDisplay {
  usa_ontologia_tipos?: { node_type: string; descricao_uso?: string }[];
  usa_datasources?: { nome: string; tipo?: string; obrigatorio?: boolean; observacoes?: string }[];
  modulos_dependentes?: { modulo: string; status?: string; motivo?: string }[];
  interacao_descricao?: string;
  outputs?: { tipo: string; descricao?: string }[];
  recursos_externos?: { tipo?: string; nome: string; custo_aprox?: string }[];
}

export interface SolutionListing {
  id: string;
  publisher_tenant_id: string;
  source_diagram_id: string | null;
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  tags: string[];
  status: "published" | "unlisted";
  version: number;
  install_count: number;
  published_by: string | null;
  published_at: string | null;
  updated_at: string | null;
  manifest: ListingManifest;
  // OEM: listagem de fábrica (Safe Core) — instalar exige a senha do vendor.
  oem: boolean;
  // display rico (contrato onda-i3) — ontologia/conectores/outputs no detail.
  display?: ListingDisplay;
}

export interface InstallResult {
  status: string;
  listing_id: string;
  publisher_tenant_id: string;
  materialized: Record<string, number>;
  failures: unknown[];
}

export const SolucoesMarketplace = {
  /** Catálogo deployment-wide (published) ou as próprias unlisted do publicador. */
  listings: (opts?: { status?: "published" | "unlisted"; q?: string; tag?: string; category?: string }) =>
    aegis.solutions.marketplaceListings<SolutionListing>(opts),
  detail: (id: string) => aegis.solutions.marketplaceDetail<SolutionListing>(id),
  /** Publica o blueprint de um diagrama (snapshot-by-value). */
  publish: (body: { diagram_id: string; title?: string; description?: string; category?: string; tags?: string[] }) => {
    const { diagram_id, ...opts } = body;
    return aegis.solutions.marketplacePublish<SolutionListing>(diagram_id, opts);
  },
  /** Instala = re-materializa no tenant do operador. */
  /** Instala; listagem OEM exige a senha do vendor (Safe Core). POST direto
   *  (o método do SDK não passa corpo — e node_modules é reconstruído no boot). */
  install: (id: string, vendorPassword?: string) =>
    apiFetch<InstallResult>(`/solutions/marketplace/listings/${id}/install`, {
      method: "POST",
      body: JSON.stringify({ vendor_password: vendorPassword ?? null }),
    }),
  patch: (id: string, body: { status?: "published" | "unlisted"; title?: string; description?: string; category?: string; tags?: string[] }) =>
    aegis.solutions.marketplacePatch<SolutionListing>(id, body),
};
