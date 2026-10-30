/**
 * Loja — Frente C (Loja cross-tenant, blueprint re-materialize).
 *
 * A Loja foi repointada do marketplace v23 (que não materializava nada) para
 * /solutions/marketplace: catálogo deployment-wide + Instalar (re-materialize) +
 * Publicar (snapshot do blueprint de um diagrama). Sem auto-seed.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LojaPage from "@/app/painel-de-controle/loja/page";

jest.mock("@/lib/i18n/provider", () => ({ useT: () => (k: string) => k }));
jest.mock("@/components/auth/require-perm", () => ({
  RequirePerm: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/lib/auth/useAuth", () => ({ useCan: () => true }));
jest.mock("@/lib/api/client", () => ({ ApiError: class extends Error {} }));

jest.mock("@/components/ui/toast", () => {
  const fn = Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn() });
  return { toast: fn };
});
const mockToast = (jest.requireMock("@/components/ui/toast") as { toast: jest.Mock & { success: jest.Mock } }).toast;

const mockListings = jest.fn();
const mockInstall = jest.fn();
const mockPublish = jest.fn();
jest.mock("@/lib/api/solucoes-marketplace", () => ({
  SolucoesMarketplace: {
    listings: () => mockListings(),
    install: (id: string) => mockInstall(id),
    publish: (b: unknown) => mockPublish(b),
    detail: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockListDiagrams = jest.fn();
jest.mock("@/lib/api", () => ({ Solutions: { listDiagrams: () => mockListDiagrams() } }));

function _manifest(over: Record<string, number> = {}) {
  return { ontology_types: 2, action_types: 1, agents: 1, flows: 0, logic_functions: 0, pages: 1, ...over };
}

const LISTINGS = [
  {
    id: "l1", publisher_tenant_id: "tA", source_diagram_id: "d1", slug: "caso-cftv",
    title: "Solução Caso CFTV", description: "Painel + coleta", category: "seguranca",
    icon: null, tags: ["cftv"], status: "published", version: 1, install_count: 3,
    published_by: "u1", published_at: "2026-06-18T00:00:00Z", updated_at: null, manifest: _manifest(),
  },
  {
    id: "l2", publisher_tenant_id: "tB", source_diagram_id: "d2", slug: "lpr-hotlist",
    title: "LPR Hotlist", description: "Placas procuradas", category: "seguranca",
    icon: null, tags: ["lpr"], status: "published", version: 1, install_count: 0,
    published_by: "u2", published_at: "2026-06-18T00:00:00Z", updated_at: null, manifest: _manifest({ agents: 0 }),
  },
];

describe("LojaPage · Frente C", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListings.mockResolvedValue(LISTINGS);
    mockInstall.mockResolvedValue({ status: "installed", listing_id: "l1", publisher_tenant_id: "tA", materialized: { ontology_types: 2 }, failures: [] });
    mockPublish.mockResolvedValue(LISTINGS[0]);
    mockListDiagrams.mockResolvedValue([
      { id: "d1", title: "Caso CFTV", slug: "caso-cftv" },
      { id: "d2", title: "LPR", slug: "lpr" },
    ]);
  });

  it("carrega o catálogo deployment-wide via SolucoesMarketplace.listings (sem seed)", async () => {
    render(<LojaPage />);
    await screen.findByTestId("loja-card-caso-cftv");
    expect(screen.getByTestId("loja-card-lpr-hotlist")).toBeInTheDocument();
    expect(mockListings).toHaveBeenCalled();
  });

  it("busca filtra os cards client-side", async () => {
    render(<LojaPage />);
    await screen.findByTestId("loja-card-caso-cftv");
    fireEvent.change(screen.getByTestId("loja-search"), { target: { value: "hotlist" } });
    await waitFor(() => expect(screen.queryByTestId("loja-card-caso-cftv")).toBeNull());
    expect(screen.getByTestId("loja-card-lpr-hotlist")).toBeInTheDocument();
  });

  it("click no card abre o painel de detalhe com o manifesto", async () => {
    render(<LojaPage />);
    fireEvent.click(await screen.findByTestId("loja-card-caso-cftv"));
    expect(await screen.findByTestId("loja-detail")).toBeInTheDocument();
    // manifesto aparece no card e no detalhe
    expect(screen.getAllByTestId("loja-manifest").length).toBeGreaterThan(0);
  });

  it("Instalar abre o modal e confirma → chama install (re-materialize)", async () => {
    render(<LojaPage />);
    await screen.findByTestId("loja-card-caso-cftv");
    fireEvent.click(screen.getByTestId("loja-install-button-caso-cftv"));
    expect(await screen.findByTestId("loja-install-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("loja-install-confirm"));
    await waitFor(() => expect(mockInstall).toHaveBeenCalledWith("l1"));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled());
  });

  it("install com falhas parciais → toast informativo (não success)", async () => {
    mockInstall.mockResolvedValueOnce({ status: "installed", listing_id: "l1", publisher_tenant_id: "tA", materialized: {}, failures: [{ kind: "x" }] });
    render(<LojaPage />);
    await screen.findByTestId("loja-card-caso-cftv");
    fireEvent.click(screen.getByTestId("loja-install-button-caso-cftv"));
    fireEvent.click(await screen.findByTestId("loja-install-confirm"));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("loja.install.partial"));
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("Publicar abre o picker de diagramas e publica o escolhido", async () => {
    render(<LojaPage />);
    fireEvent.click(await screen.findByTestId("loja-publish-button"));
    expect(await screen.findByTestId("loja-publish-modal")).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("loja-publish-diagram-d1"));
    fireEvent.click(screen.getByTestId("loja-publish-confirm"));
    await waitFor(() => expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ diagram_id: "d1" })));
  });

  it("catálogo vazio → empty state, sem chamar seed (v23 aposentado)", async () => {
    mockListings.mockResolvedValue([]);
    render(<LojaPage />);
    await screen.findByTestId("loja-page");
    await waitFor(() => expect(screen.queryByTestId("loja-card-grid")).toBeNull());
    // não há nenhuma noção de seed na Loja nova
    expect(mockListings).toHaveBeenCalled();
  });
});
