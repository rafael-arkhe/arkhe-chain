/**
 * OsdkScopePicker — ações de massa, busca e tri-state.
 *
 * `useT` é mockado como identidade: toda string visível vira a PRÓPRIA chave.
 * É o que permite asserir "nenhuma string crua em inglês" — se um rótulo
 * aparecer como texto humano, é porque escapou do dicionário.
 */
import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";

// jsdom não implementa ResizeObserver — Radix Checkbox usa via useSize().
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

jest.mock("@/lib/i18n/provider", () => ({ useT: () => (k: string) => k }));

const mockList = jest.fn();
jest.mock("@/lib/iam/api", () => ({
    permissionsApi: { list: () => mockList() },
}));

import { OsdkScopePicker, isReadOnlyAction } from "@/components/iam/OsdkScopePicker";

type Perm = {
    id: string;
    key: string;
    resource: string;
    action: string;
    description: string;
    is_system: boolean;
};

const p = (key: string, description: string): Perm => {
    const idx = key.lastIndexOf(".");
    return {
        id: key,
        key,
        resource: key.slice(0, idx),
        action: key.slice(idx + 1),
        description,
        is_system: true,
    };
};

// 4 escopos de API + 1 nav.* (que o picker DEVE descartar).
const PERMS: Perm[] = [
    p("dados.conectores.read", "Listar conectores"),
    p("dados.conectores.review", "Revisar conectores"),
    p("ontology.objects.read", "Ler objetos da ontologia"),
    p("ontology.objects.write", "Gravar objetos da ontologia"),
    p("nav.item.home", "Mostrar item de menu"),
];

const API_KEYS = [
    "dados.conectores.read",
    "dados.conectores.review",
    "ontology.objects.read",
    "ontology.objects.write",
];

function Harness({ initial = [] }: { initial?: string[] }) {
    const [value, setValue] = React.useState<string[]>(initial);
    return (
        <>
            <OsdkScopePicker value={value} onChange={setValue} />
            <output data-testid="selection">{value.join(" ")}</output>
        </>
    );
}

async function mount(initial: string[] = []) {
    render(<Harness initial={initial} />);
    // Aguarda o catálogo resolver (o loading some quando `groups` chega).
    expect(await screen.findByTestId("scope-picker")).toBeInTheDocument();
}

const selection = () =>
    (screen.getByTestId("selection").textContent || "").split(" ").filter(Boolean);

beforeEach(() => {
    mockList.mockReset();
    mockList.mockResolvedValue(PERMS);
});

describe("OsdkScopePicker — seleção em massa", () => {
    it("'Selecionar tudo' marca todos os escopos de API e ignora nav.*", async () => {
        await mount();

        fireEvent.click(screen.getByTestId("scope-select-all"));

        expect(selection()).toEqual([...API_KEYS].sort());
        expect(selection()).not.toContain("nav.item.home");
    });

    it("'Limpar' zera a seleção", async () => {
        await mount(API_KEYS);
        expect(selection()).toHaveLength(4);

        fireEvent.click(screen.getByTestId("scope-clear-all"));

        expect(selection()).toEqual([]);
    });

    it("o contador reflete a seleção viva", async () => {
        await mount();
        expect(screen.getByTestId("scope-count")).toHaveTextContent("0/4");

        fireEvent.click(screen.getByTestId("scope-select-all"));
        expect(screen.getByTestId("scope-count")).toHaveTextContent("4/4");

        fireEvent.click(screen.getByTestId("scope-clear-all"));
        expect(screen.getByTestId("scope-count")).toHaveTextContent("0/4");
    });

    it("o preset 'Somente leitura' pega só as ações de leitura (review NÃO é view)", async () => {
        await mount(["ontology.objects.write"]);

        fireEvent.click(screen.getByTestId("scope-preset-readonly"));

        expect(selection()).toEqual([
            "dados.conectores.read",
            "ontology.objects.read",
        ]);
        expect(selection()).not.toContain("dados.conectores.review");
        // Preset é GLOBAL: substitui a seleção anterior de escrita.
        expect(selection()).not.toContain("ontology.objects.write");
    });

    it("isReadOnlyAction casa por igualdade, não por substring", () => {
        expect(isReadOnlyAction("read")).toBe(true);
        expect(isReadOnlyAction("view")).toBe(true);
        expect(isReadOnlyAction("list")).toBe(true);
        expect(isReadOnlyAction("get")).toBe(true);
        expect(isReadOnlyAction("read_all")).toBe(true);
        // Armadilhas reais do catálogo IAM — ambas são ESCRITA.
        expect(isReadOnlyAction("review")).toBe(false);
        expect(isReadOnlyAction("hotlist")).toBe(false);
        expect(isReadOnlyAction("write")).toBe(false);
    });
});

describe("OsdkScopePicker — busca", () => {
    it("filtra grupos e folhas por texto", async () => {
        await mount();
        expect(screen.getByTestId("scope-group-ontology.objects")).toBeInTheDocument();

        fireEvent.change(screen.getByTestId("scope-search"), {
            target: { value: "conectores" },
        });

        expect(screen.getByTestId("scope-group-dados.conectores")).toBeInTheDocument();
        expect(screen.queryByTestId("scope-group-ontology.objects")).toBeNull();
    });

    it("filtra pela descrição e casa sem acento", async () => {
        await mount();

        fireEvent.change(screen.getByTestId("scope-search"), {
            target: { value: "ontologia" },
        });

        expect(screen.getByTestId("scope-group-ontology.objects")).toBeInTheDocument();
        expect(screen.queryByTestId("scope-group-dados.conectores")).toBeNull();
    });

    it("busca sem resultado mostra estado vazio traduzido", async () => {
        await mount();

        fireEvent.change(screen.getByTestId("scope-search"), {
            target: { value: "zzzz" },
        });

        expect(screen.getByTestId("scope-no-match")).toHaveTextContent(
            "osdk.scope.no_match",
        );
    });

    it("'Selecionar tudo' com filtro ativo pega só o que está visível", async () => {
        await mount();

        fireEvent.change(screen.getByTestId("scope-search"), {
            target: { value: "conectores" },
        });
        fireEvent.click(screen.getByTestId("scope-select-all"));

        expect(selection()).toEqual([
            "dados.conectores.read",
            "dados.conectores.review",
        ]);
        // O contador continua medindo contra o catálogo INTEIRO.
        expect(screen.getByTestId("scope-count")).toHaveTextContent("2/4");
    });
});

describe("OsdkScopePicker — grupos", () => {
    it("o master do grupo é tri-state", async () => {
        await mount(["ontology.objects.read"]);

        const group = within(screen.getByTestId("scope-group-ontology.objects"));
        expect(group.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
        expect(screen.getByTestId("scope-group-count-ontology.objects")).toHaveTextContent(
            "1/2",
        );
    });

    it("o master do grupo marca e desmarca o grupo inteiro", async () => {
        await mount();

        const groupBox = within(
            screen.getByTestId("scope-group-ontology.objects"),
        ).getByRole("checkbox");

        fireEvent.click(groupBox);
        expect(selection()).toEqual([
            "ontology.objects.read",
            "ontology.objects.write",
        ]);

        fireEvent.click(groupBox);
        expect(selection()).toEqual([]);
    });

    it("grupos vêm colapsados e o toggle revela as folhas", async () => {
        await mount();
        expect(screen.queryByTestId("scope-item-ontology.objects.read")).toBeNull();

        const toggle = screen.getByTestId("scope-group-toggle-ontology.objects");
        expect(toggle).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(toggle);

        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByTestId("scope-item-ontology.objects.read")).toBeInTheDocument();
    });

    it("uma folha alterna sozinha", async () => {
        await mount();
        fireEvent.click(screen.getByTestId("scope-group-toggle-ontology.objects"));

        const leaf = within(
            screen.getByTestId("scope-item-ontology.objects.write"),
        ).getByRole("checkbox");
        fireEvent.click(leaf);

        expect(selection()).toEqual(["ontology.objects.write"]);
    });

    it("a busca abre os grupos que casaram", async () => {
        await mount();

        fireEvent.change(screen.getByTestId("scope-search"), {
            target: { value: "conectores" },
        });

        expect(screen.getByTestId("scope-item-dados.conectores.read")).toBeInTheDocument();
    });
});

describe("OsdkScopePicker — i18n", () => {
    it("nenhum rótulo é string crua: tudo sai como chave do dicionário", async () => {
        await mount();

        expect(screen.getByTestId("scope-select-all")).toHaveTextContent(
            "osdk.scope.select_all",
        );
        expect(screen.getByTestId("scope-clear-all")).toHaveTextContent(
            "osdk.scope.clear_all",
        );
        expect(screen.getByTestId("scope-preset-readonly")).toHaveTextContent(
            "osdk.scope.preset_readonly",
        );
        expect(screen.getByTestId("scope-expand-all")).toHaveTextContent(
            "osdk.scope.expand_all",
        );
        expect(screen.getByTestId("scope-count")).toHaveTextContent(
            "osdk.scope.selected_suffix",
        );
        expect(screen.getByTestId("scope-search")).toHaveAttribute(
            "placeholder",
            "osdk.scope.search_placeholder",
        );

        const picker = screen.getByTestId("scope-picker").textContent || "";
        for (const raw of [
            "Select all",
            "Clear",
            "Read only",
            "Expand all",
            "Loading catalogue",
            "load failed",
        ]) {
            expect(picker).not.toContain(raw);
        }
    });

    it("o erro de carga é traduzido e mantém o detalhe do servidor como dado", async () => {
        mockList.mockRejectedValue(new Error("boom"));
        render(<Harness />);

        const err = await screen.findByTestId("scope-error");
        expect(err).toHaveTextContent("osdk.scope.load_error");
        expect(err).toHaveTextContent("boom");
    });
});
