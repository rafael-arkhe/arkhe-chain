import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_BRAND, describeBrand, garantirMarca, loadBrand, MARCA_DO_PRODUTO } from "./brand.ts";

const dirs: string[] = [];
// 🔴 Safe Core (D7, 30/09): a feature desta edicao e `marca`. O duplo
// respondia a `whitelabel`, que nao existe aqui — e com a mudanca do
// `loadBrand` ele ficaria a recusar o ficheiro que o produto escreve.
const licensed = (feature: string) => feature === "marca";
const unlicensed = () => false;

function brandFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-brand-"));
  dirs.push(dir);
  const file = join(dir, "brand.json");
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("brand.json", () => {
  it("is the default brand when no file exists, pointing at where one would go", () => {
    const file = join(tmpdir(), "omb-brand-missing", "brand.json");
    expect(loadBrand({ file, isEntitled: licensed })).toEqual({ brand: DEFAULT_BRAND, source: "default", file });
    expect(describeBrand(loadBrand({ file, isEntitled: licensed }))).toBe("brand: default");
  });

  it("applies a valid file on a licensed server", () => {
    const file = brandFile(JSON.stringify({
      name: "Reliable Platform",
      tagline: "Back office, on autopilot",
      accent: "#1D4ED8",
      logo: "data:image/svg+xml;base64,PHN2Zy8+",
      supportUrl: "https://help.reliable.example",
    }));
    const status = loadBrand({ file, isEntitled: licensed });
    expect(status.source).toBe("file");
    expect(status.brand.name).toBe("Reliable Platform");
    expect(status.brand.accent).toBe("#1D4ED8");
    expect(status.notice).toBeUndefined();
    expect(describeBrand(status)).toBe(`brand: Reliable Platform (from ${file})`);
  });

  it("keeps the default brand on an unlicensed server and says so", () => {
    const file = brandFile(JSON.stringify({ name: "Acme" }));
    const status = loadBrand({ file, isEntitled: unlicensed });
    expect(status.brand).toEqual(DEFAULT_BRAND);
    expect(status.source).toBe("default");
    // 🔴 Safe Core (D7, 30/09): a frase dizia *"not licensed for whitelabel"*
    // e a feature é `marca`. 🔴 A frase é a **única** coisa que diz ao operador
    // porque é que a cara dele não entrou, e uma frase que aponta para uma
    // entitlement que esta edição não tem manda o operador procurar uma licença
    // que ele não precisa.
    expect(status.notice).toContain("`marca`");
  });

  it("explains a broken file in terms of what to change, and never applies it", () => {
    const cases: Array<[string, RegExp]> = [
      ["{not json", /not valid JSON/],
      [JSON.stringify({ name: "" }), /name: name must not be empty/],
      [JSON.stringify({ name: "x".repeat(41) }), /name must be 40 characters or fewer/],
      [JSON.stringify({ name: "Acme", accent: "blue" }), /accent: accent must be a 6-digit hex colour/],
      [JSON.stringify({ name: "Acme", logo: "http://insecure.example/logo.png" }), /logo: logo must be a data:image/],
      [JSON.stringify({ name: "Acme", supportUrl: "http://help.example" }), /supportUrl: supportUrl must be an https/],
      [JSON.stringify({ name: "Acme", colour: "#000000" }), /colour/],
    ];
    for (const [content, expected] of cases) {
      const status = loadBrand({ file: brandFile(content), isEntitled: licensed });
      expect(status.brand, content).toEqual(DEFAULT_BRAND);
      expect(status.notice, content).toMatch(expected);
      expect(status.notice, content).toMatch(/using the default brand$/);
    }
  });

  it("validates before gating, so an unlicensed operator still learns about a broken file", () => {
    const status = loadBrand({ file: brandFile(JSON.stringify({ name: "Acme", accent: "nope" })), isEntitled: unlicensed });
    expect(status.notice).toMatch(/accent/);
  });
});

describe("the brand's favicon", () => {
  it("accepts a small data URI or an https URL and refuses anything else", async () => {
    const { brandSchema } = await import("./brand.ts");
    expect(brandSchema.safeParse({ name: "Agent Ada", favicon: "data:image/png;base64,iVBORw0KGgo=" }).success).toBe(true);
    expect(brandSchema.safeParse({ name: "Agent Ada", favicon: "https://agentada.cc/icon.png" }).success).toBe(true);
    expect(brandSchema.safeParse({ name: "Agent Ada", favicon: "http://agentada.cc/icon.png" }).success).toBe(false);
    expect(brandSchema.safeParse({ name: "Agent Ada", favicon: "/icon.png" }).success).toBe(false);
    expect(brandSchema.safeParse({ name: "Agent Ada", favicon: `data:image/png;base64,${"A".repeat(130_000)}` }).success).toBe(false);
  });
});

// ═══ Safe Core (D7b): a face do produto, e a regra de nunca sobrescrever ═══

describe("a face do produto", () => {
  it("e a AEGIS, com a cor da casa e a marca embutida", () => {
    expect(MARCA_DO_PRODUTO.name).toBe("AEGIS");
    expect(MARCA_DO_PRODUTO.accent).toBe("#2D77BE");
    // 🔴 A URI tem de ser base64: o SVG traz `#2D77BE` dentro de si, e um `#`
    // por Percent-encoding numa data URI cortava a URI a meio — sem erro
    // nenhum, e com o ecrã a mostrarem nada.
    expect(MARCA_DO_PRODUTO.logo).toMatch(/^data:image\/svg\+xml;base64,/);
    const base64 = MARCA_DO_PRODUTO.logo!.split(",")[1]!;
    expect(Buffer.from(base64, "base64").toString("utf8")).toContain("#2D77BE");
  });

  it("escreve o ficheiro quando nao ha nenhum, e o que escreve passa no esquema", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-marca-"));
    dirs.push(dir);
    const file = join(dir, "brand.json");

    const feito = garantirMarca({ file });
    expect(feito.accao).toBe("escrita");
    expect(existsSync(file)).toBe(true);

    // 🔴 E o ficheiro escrito tem de ser **aceito pelo esquema do produto**:
    // uma face que o proprio `loadBrand` recusa e uma face que nao existe.
    const status = loadBrand({ file, isEntitled: licensed });
    expect(status.source).toBe("file");
    expect(status.brand.name).toBe("AEGIS");
    expect(status.brand.accent).toBe("#2D77BE");
    expect(status.brand.logo).toBeTruthy();
  });

  it("NUNCA sobrescreve a cara que o operador pôs", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-marca-"));
    dirs.push(dir);
    const file = join(dir, "brand.json");
    const doOperador = JSON.stringify({ name: "LR4 Tecnologia", accent: "#111111" });
    writeFileSync(file, doOperador);

    const resultado = garantirMarca({ file });
    expect(resultado.accao).toBe("presente");
    // 🔴 A cara do operador é sagrada: um produto que a reescreve muda o
    // ecrã de quem o configurou, e o sintoma é a marca dele voltar ao AEGIS
    // depois de um upgrade, sem nada que o explique.
    expect(readFileSync(file, "utf8")).toBe(doOperador);
  });

  it("nao apaga um ficheiro que exista mesmo partido", () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-marca-"));
    dirs.push(dir);
    const file = join(dir, "brand.json");
    writeFileSync(file, "{isto nao e json");

    // 🔴 Um ficheiro partido é um defeito que o operador tem de VER (o
    // `loadBrand` diz-lhe porquê). Apagá-lo às cegas esconde-o.
    expect(garantirMarca({ file }).accao).toBe("presente");
    expect(readFileSync(file, "utf8")).toBe("{isto nao e json");
  });

  it("diz porque nao conseguiu escrever, em vez de falhar calado", () => {
    const resultado = garantirMarca({
      file: join(tmpdir(), "aegis-marca-inexistente", "marca", "brand.json"),
    });
    expect(resultado.accao).toBe("recusada");
    expect(resultado.motivo).toBeTruthy();
  });
});
