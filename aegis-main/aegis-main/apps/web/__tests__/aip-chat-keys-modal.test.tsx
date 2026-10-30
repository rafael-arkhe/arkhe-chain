/**
 * Modal "Configurar chaves" do AIP Chat (Sprint 9). O card do AIP Chat no
 * catálogo abre este modal, que lista os packs do wizard do Vault e grava cada
 * campo preenchido via Vault.setSecret (upsert idempotente). Aqui mockamos o
 * cliente Vault para provar render dos packs + chamada de gravação só nos
 * campos preenchidos. O gesto real (botão→modal→rotate 200) foi provado ao vivo.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

jest.mock("@/lib/i18n/provider", () => ({ useT: () => (k: string) => k }))
jest.mock("@/lib/api/client", () => ({ ApiError: class extends Error {} }))

const mockConnectorKeys = jest.fn()
const mockSetSecret = jest.fn()
jest.mock("@/lib/api/vault", () => ({
  Vault: {
    wizard: () => mockConnectorKeys(),
    connectorKeys: () => mockConnectorKeys(),
    setSecret: (b: unknown) => mockSetSecret(b),
  },
}))

import { KeysModal } from "@/components/agentes/KeysModal"

const PACK = {
  pack_id: "bird-twitter",
  titulo: "Conta no X (Twitter)",
  descricao_curta: "Cookies da conta monitorada.",
  skill_key: "bird-twitter",
  has_probe: true,
  fields: [
    { namespace: "bird", slug: "auth-token", display_name: "auth_token", description: "", kind: "text", scope_skill_key: "bird-twitter", cadastrado: false },
    { namespace: "bird", slug: "ct0", display_name: "ct0", description: "", kind: "text", scope_skill_key: "bird-twitter", cadastrado: true },
  ],
}

beforeEach(() => {
  mockConnectorKeys.mockReset()
  mockSetSecret.mockReset()
})

test("lista os packs do wizard + marca campo já cadastrado", async () => {
  mockConnectorKeys.mockResolvedValue([PACK])
  render(<KeysModal onClose={jest.fn()} />)
  expect(await screen.findByText("Conta no X (Twitter)")).toBeInTheDocument()
  // o campo cadastrado mostra o selo "set"
  expect(screen.getByText("aipChat.keys.set")).toBeInTheDocument()
})

test("salva só os campos preenchidos via setSecret (upsert)", async () => {
  mockConnectorKeys.mockResolvedValue([PACK])
  mockSetSecret.mockResolvedValue({})
  render(<KeysModal onClose={jest.fn()} />)
  await screen.findByText("Conta no X (Twitter)")

  // preenche só o auth-token; deixa o ct0 em branco (= manter)
  fireEvent.change(screen.getByTestId("aip-keys-input-auth-token"), {
    target: { value: "novo-token" },
  })
  fireEvent.click(screen.getByTestId("aip-keys-save"))

  await waitFor(() => expect(mockSetSecret).toHaveBeenCalledTimes(1))
  expect(mockSetSecret).toHaveBeenCalledWith(
    expect.objectContaining({ namespace: "bird", slug: "auth-token", value: "novo-token" }),
  )
})

test("save sem nenhum campo preenchido não grava nada", async () => {
  // Guarda do gesto: sem valor digitado, o save retorna cedo e NÃO escreve no
  // Vault (invariante confiável; a mensagem "nada a salvar" é UX best-effort e
  // pode ser sobrescrita por um load() tardio do wizard).
  mockConnectorKeys.mockResolvedValue([PACK])
  render(<KeysModal onClose={jest.fn()} />)
  await screen.findByText("Conta no X (Twitter)")
  fireEvent.click(screen.getByTestId("aip-keys-save"))
  await new Promise((r) => setTimeout(r, 50))
  expect(mockSetSecret).not.toHaveBeenCalled()
})
