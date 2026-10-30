/**
 * OsdkCreateDialog — gate de submit, passo do segredo e i18n.
 *
 * `useT` é identidade: cada rótulo renderiza a PRÓPRIA chave. Uma string em
 * inglês visível no DOM prova que o texto não passou pelo dicionário.
 */
import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const mockCreate = jest.fn();
jest.mock("@/lib/iam/api", () => ({
    permissionsApi: { list: () => mockList() },
    osdkApi: { create: (body: unknown) => mockCreate(body) },
}));

import { OsdkCreateDialog } from "@/components/iam/OsdkCreateDialog";

const PERMS = [
    {
        id: "1",
        key: "ontology.objects.read",
        resource: "ontology.objects",
        action: "read",
        description: "Ler objetos da ontologia",
        is_system: true,
    },
    {
        id: "2",
        key: "ontology.objects.write",
        resource: "ontology.objects",
        action: "write",
        description: "Gravar objetos da ontologia",
        is_system: true,
    },
];

const CREATED = {
    id: "tok_1234",
    name: "minha-integracao",
    scopes: ["ontology.objects.read", "ontology.objects.write"],
    expires_at: null,
    last_used_at: null,
    revoked: false,
    created_at: "2026-07-26T10:00:00",
    token: "osdk_live_abc123def456",
};

beforeEach(() => {
    mockList.mockReset().mockResolvedValue(PERMS);
    mockCreate.mockReset().mockResolvedValue(CREATED);
});

/** Abre o modal e espera o catálogo de escopos resolver. */
async function openDialog(onCreated = jest.fn()) {
    render(<OsdkCreateDialog onCreated={onCreated} />);
    fireEvent.click(screen.getByTestId("osdk-create-button"));
    await screen.findByTestId("scope-picker");
    return onCreated;
}

const typeName = (v: string) =>
    fireEvent.change(screen.getByTestId("osdk-create-name"), { target: { value: v } });

describe("OsdkCreateDialog — passo 1 (criar)", () => {
    it("submit fica desabilitado sem nome e sem escopo", async () => {
        await openDialog();
        expect(screen.getByTestId("osdk-create-submit")).toBeDisabled();
    });

    it("submit continua desabilitado com nome mas zero escopos", async () => {
        await openDialog();
        typeName("minha-integracao");
        expect(screen.getByTestId("osdk-create-submit")).toBeDisabled();
    });

    it("submit continua desabilitado com escopos mas sem nome", async () => {
        await openDialog();
        fireEvent.click(screen.getByTestId("scope-select-all"));
        expect(screen.getByTestId("osdk-create-submit")).toBeDisabled();
    });

    it("nome curto é rejeitado com erro traduzido após o blur", async () => {
        await openDialog();
        fireEvent.click(screen.getByTestId("scope-select-all"));
        typeName("ab");
        fireEvent.blur(screen.getByTestId("osdk-create-name"));

        expect(screen.getByTestId("osdk-create-name-hint")).toHaveTextContent(
            "osdk.create.name_invalid",
        );
        expect(screen.getByTestId("osdk-create-submit")).toBeDisabled();
        expect(screen.getByTestId("osdk-create-name")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    });

    it("nome + ao menos um escopo habilita o submit", async () => {
        await openDialog();
        typeName("minha-integracao");
        fireEvent.click(screen.getByTestId("scope-select-all"));

        expect(screen.getByTestId("osdk-create-submit")).toBeEnabled();
    });

    it("o rodapé mostra a contagem de escopos selecionados", async () => {
        await openDialog();
        expect(screen.getByTestId("osdk-create-summary")).toHaveTextContent("0");

        fireEvent.click(screen.getByTestId("scope-select-all"));
        expect(screen.getByTestId("osdk-create-summary")).toHaveTextContent("2");
    });

    it("criar envia nome aparado + escopos e avisa o painel", async () => {
        const onCreated = await openDialog();
        typeName("  minha-integracao  ");
        fireEvent.click(screen.getByTestId("scope-select-all"));
        fireEvent.click(screen.getByTestId("osdk-create-submit"));

        await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
        expect(mockCreate).toHaveBeenCalledWith({
            name: "minha-integracao",
            scopes: ["ontology.objects.read", "ontology.objects.write"],
        });
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });

    it("falha da API vira erro traduzido + detalhe do servidor como dado", async () => {
        mockCreate.mockRejectedValue(new Error("403 forbidden"));
        await openDialog();
        typeName("minha-integracao");
        fireEvent.click(screen.getByTestId("scope-select-all"));
        fireEvent.click(screen.getByTestId("osdk-create-submit"));

        const err = await screen.findByTestId("osdk-create-error");
        expect(err).toHaveTextContent("osdk.create.error");
        expect(err).toHaveTextContent("403 forbidden");
        // Continua no passo 1 — o segredo nunca apareceu.
        expect(screen.queryByTestId("osdk-token-output")).toBeNull();
    });
});

describe("OsdkCreateDialog — passo 2 (segredo)", () => {
    async function createOk() {
        await openDialog();
        typeName("minha-integracao");
        fireEvent.click(screen.getByTestId("scope-select-all"));
        fireEvent.click(screen.getByTestId("osdk-create-submit"));
        return screen.findByTestId("osdk-token-output");
    }

    it("revela o token uma vez, com aviso e metadados", async () => {
        const field = await createOk();

        expect(field).toHaveValue("osdk_live_abc123def456");
        expect(field).toHaveAttribute("readonly");
        expect(screen.getByTestId("osdk-secret-warning")).toHaveTextContent(
            "osdk.secret.warning",
        );
        expect(screen.getByTestId("osdk-secret-meta")).toHaveTextContent("tok_1234");
        expect(screen.getByTestId("osdk-secret-meta")).toHaveTextContent("2");
        // O formulário de criação sumiu — sem chance de emitir dois tokens.
        expect(screen.queryByTestId("osdk-create-submit")).toBeNull();
        expect(screen.getByTestId("osdk-create-done")).toBeInTheDocument();
    });

    it("copiar usa a clipboard API e troca o rótulo", async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });

        await createOk();
        fireEvent.click(screen.getByTestId("osdk-token-copy"));

        await waitFor(() =>
            expect(writeText).toHaveBeenCalledWith("osdk_live_abc123def456"),
        );
        await waitFor(() =>
            expect(screen.getByTestId("osdk-token-copy")).toHaveTextContent(
                "osdk.secret.copied",
            ),
        );
    });

    it("clipboard indisponível instrui a copiar à mão", async () => {
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
            configurable: true,
        });

        await createOk();
        fireEvent.click(screen.getByTestId("osdk-token-copy"));

        expect(await screen.findByTestId("osdk-copy-failed")).toHaveTextContent(
            "osdk.secret.copy_failed",
        );
    });
});

describe("OsdkCreateDialog — i18n", () => {
    const RAW_EN = [
        "New application",
        "New OSDK application",
        "Application secret",
        "Application name",
        "Data entities",
        "Create application",
        "Creating",
        "Cancel",
        "Done",
        "Copied",
        "Copy this token",
        "Loading catalogue",
    ];

    it("o gatilho não carrega string crua", async () => {
        render(<OsdkCreateDialog onCreated={jest.fn()} />);
        expect(screen.getByTestId("osdk-create-button")).toHaveTextContent(
            "osdk.create.trigger",
        );
    });

    it("o passo 1 roteia todo rótulo pelo dicionário", async () => {
        await openDialog();

        expect(screen.getByTestId("osdk-create-submit")).toHaveTextContent(
            "osdk.create.submit",
        );
        expect(screen.getByTestId("osdk-create-name-hint")).toHaveTextContent(
            "osdk.create.name_hint",
        );

        const body = document.body.textContent || "";
        for (const raw of RAW_EN) expect(body).not.toContain(raw);
    });

    it("o passo 2 roteia todo rótulo pelo dicionário", async () => {
        await openDialog();
        typeName("minha-integracao");
        fireEvent.click(screen.getByTestId("scope-select-all"));
        fireEvent.click(screen.getByTestId("osdk-create-submit"));
        await screen.findByTestId("osdk-token-output");

        expect(screen.getByTestId("osdk-create-done")).toHaveTextContent(
            "osdk.secret.done",
        );
        expect(screen.getByTestId("osdk-token-copy")).toHaveTextContent(
            "osdk.secret.copy",
        );

        const body = document.body.textContent || "";
        for (const raw of RAW_EN) expect(body).not.toContain(raw);
    });
});
