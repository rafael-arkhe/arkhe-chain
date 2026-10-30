// White-label as config: a brand.json next to the data dir renames and recolours
// the product for one deployment. The file is customer data (it never lives in
// this repo); applying it is the `whitelabel` entitlement, so an unlicensed
// server reads the file, reports what it found, and keeps the default brand.
// Read on every request so an edit shows up on the next reload, no restart.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { DATA_DIR } from "./config.ts";
import { entitled } from "./enterprise.ts";

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_CHARS = 300_000;
const MAX_FAVICON_CHARS = 120_000;

export const brandSchema = z
  .object({
    /** Product name shown in the window title, onboarding and settings. */
    name: z.string().trim().min(1, "name must not be empty").max(40, "name must be 40 characters or fewer"),
    /** One line under the name on the welcome screen. */
    tagline: z.string().trim().max(120, "tagline must be 120 characters or fewer").optional(),
    /** Accent colour for buttons, links and focus rings; text on it is derived for contrast. */
    accent: z.string().regex(HEX_COLOUR, "accent must be a 6-digit hex colour such as #C2510A").optional(),
    /** Welcome-screen mark: an inline data:image/... URI or an https:// URL. */
    logo: z
      .string()
      .max(MAX_LOGO_CHARS, `logo must be under ${MAX_LOGO_CHARS} characters (inline a small SVG or link an https:// image)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "logo must be a data:image/... URI or an https:// URL")
      .optional(),
    /** Where "get help" points for this deployment. */
    supportUrl: z.string().url().startsWith("https://", "supportUrl must be an https:// URL").optional(),
    /** Tab and home-screen icon: an inline data:image/... URI (PNG or SVG, small) or an https:// URL. */
    favicon: z
      .string()
      .max(MAX_FAVICON_CHARS, `favicon must be under ${MAX_FAVICON_CHARS} characters (a 64px PNG or a small SVG)`)
      .refine((v) => v.startsWith("data:image/") || v.startsWith("https://"), "favicon must be a data:image/... URI or an https:// URL")
      .optional(),
  })
  .strict();

export type Brand = z.infer<typeof brandSchema>;

// 🔴 Safe Core (D7, 30/09/2026): a marca de fábrica é AEGIS.
//
// 🔴 Isto NÃO é uma preferência de quem fez o fork: a Apache-2.0 §6 não
// concede direitos de marca, e o `LICENSING.md` do upstream é explícito —
// *"The OpenMausBot name and mascot are trademarks of Milind Soni… a product
// built on OpenMausBot needs its own name unless a partner agreement says
// otherwise."* Sem acordo de parceiro, o nome deles **não pode** ser o que o
// cliente vê.
//
// 🔴 E o `accent` **entra aqui**, e é o azul-aço da casa (`#2D77BE`). 🔴 Este
// comentário dizia o contrário — *"pareceria funcionar e não funcionaria"* — e
// eu não o tinha verificado: escrevi-o a partir da leitura de `loadBrand`, que
// tem um portão de entitlement, e não a partir do que acontece **quando não há
// ficheiro**. O `DEFAULT_BRAND` não passa por esse portão, e o operador vê
// este valor numa instalação nova. 🔴 A lição é a da casa: **afirmar que algo
// não funciona é tão medível como afirmar que funciona.**
//
// 🔴 Os dois caminhos juntos, e cada um com o seu sítio:
//   * **de fábrica** (este valor): o que uma instalação nova mostra;
//   * **por ficheiro** (`brand.json`, agora aplicado — ver a feature `marca` em
//     `enterprise.ts`): o que o operador de uma instalação põe.
//
// 🔴 E o `#2D77BE` é o accent **único** da casa (`CLAUDE.md` da raiz). O
// upstream traz **dez** acentos, um por pele; aqui só muda o de fábrica, e as
// peles que o operador escolher continuam a ter o acento que ele escolheu.
export const DEFAULT_BRAND: Brand = { name: "AEGIS", accent: "#2D77BE" };

export interface BrandStatus {
  brand: Brand;
  /** "file" when brand.json is applied; "default" otherwise (see notice for why). */
  source: "default" | "file";
  /** The path consulted, so an operator knows where to put the file. */
  file: string;
  /** Why the file was not applied, in terms of what to change. */
  notice?: string;
}

export function brandFile(): string {
  return process.env.OMB_BRAND_FILE || join(DATA_DIR, "brand.json");
}

/** Resolve the brand for this server right now. Never throws. */
export function loadBrand(options: { file?: string; isEntitled?: (feature: string) => boolean } = {}): BrandStatus {
  const file = options.file ?? brandFile();
  const isEntitled = options.isEntitled ?? entitled;
  const fallback = (notice?: string): BrandStatus =>
    notice ? { brand: DEFAULT_BRAND, source: "default", file, notice } : { brand: DEFAULT_BRAND, source: "default", file };
  if (!existsSync(file)) return fallback();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fallback(`${file} is not valid JSON (${error instanceof Error ? error.message : String(error)}); using the default brand`);
  }
  const parsed = brandSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return fallback(`${file}: ${where}${issue?.message ?? "invalid"}; using the default brand`);
  }
  // 🔴 Safe Core (D7, corrigido a 30/09/2026). A feature é **`marca`**, e era
  // `whitelabel` — que esta edição **não** tem.
  //
  // 🔴 O efeito era silencioso e era o pior: o `brand.json` era lido, validado
  // e **deitado fora**, e o operador via a marca de fábrica sem uma linha que
  // dissesse porquê. A `enterprise.ts` foi corrigida no D7 (a feature `marca`
  // existe), e esta linha ficou pelo caminho — meia cura, que é pior do que
  // nenhuma: o código parecia certo e a marca não aparecia.
  //
  // 🔴 E o nome não é `whitelabel` **de propósito**: a lista de features é o
  // vocabulário de *edição*, e dizer que há uma edição paga ativa que não
  // existe é pior do que dizer que há uma feature que há.
  if (!isEntitled("marca")) {
    return fallback(`${file} found but this edition has no \`marca\` feature; using the default brand`);
  }
  return { brand: parsed.data, source: "file", file };
}

/** One line for the startup log. */
export function describeBrand(status: BrandStatus): string {
  if (status.source === "file") return `brand: ${status.brand.name} (from ${status.file})`;
  return `brand: default${status.notice ? ` (${status.notice})` : ""}`;
}

// ═══ Safe Core (D7b, 30/09/2026): a face do produto, e quem a escreve ═══

/// 🔴 **Porquê base64 e não a URI crua:** o SVG traz `fill: #2D77BE` dentro de
/// si, e um `#` por Percent-encoding numa data URI **corta a URI a meio** — o
/// `src` virava um fragmento e o ecrã mostrava nada, sem erro nenhum. Base64 não
/// tem esse caractere, e é por isso que é base64 e não uma escolha de conveniência.
const LOGO_AEGIS_BASE64 =
  "PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIg" +
  "dmlld0JveD0iMCAwIDUxMiA1MTIiIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIj4NCgk8dGl0" +
  "bGU+QUVHSVM8L3RpdGxlPg0KCTxzdHlsZT4NCgkJLmFlZ2lzLW1hcmsgeyBmaWxsOiAjMkQ3" +
  "N0JFIH0NCgk8L3N0eWxlPg0KCTxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xhc3M9ImFl" +
  "Z2lzLW1hcmsiIGQ9Im0xOTIgMTE5LjZxNDguNiAxLjQgODUuNSAzMy4ybDcgNiAyMC0xOS45" +
  "IDIwLTE5LjkgNjguNSA2OC41IDY4LjUgNjguNS02OC41IDY4LjUtNjguNSA2OC41LTIwLTE5" +
  "LjktMjAtMTkuOS03IDZjLTE4LjcgMTYuMS00MC4xIDI2LjUtNjUuMSAzMS41LTEyLjIgMi40" +
  "LTM3LjYgMi40LTQ5LjcgMC0yOC4zLTUuNy01My4yLTE5LjEtNzMuMS0zOS43LTE4LjUtMTkt" +
  "MzAuNS00MS42LTM2LjMtNjguMi0yLjItMTAuNS0yLjUtNDAuNy0wLjQtNTEuMyAzLjUtMTcu" +
  "OCAxMS40LTM3LjIgMjEuNi01Mi41IDYuNS05LjggMjYtMjkuNCAzNS41LTM1LjcgMTkuMy0x" +
  "Mi45IDQwLjMtMjAuNiA2NC0yMy43IDEuOS0wLjIgMTAtMC4yIDE4IDB6bS0xOS41IDM1LjRj" +
  "LTM5LjkgNi4yLTcyLjkgMzYuMS04My42IDc2LTIuNiA5LjctMy42IDI4LjktMiAzOS45IDYu" +
  "NiA0NC43IDQyLjcgODAuMiA4Ny43IDg2LjIgMTcuNCAyLjMgMzkuMS0wLjkgNTQuOC04IDgu" +
  "NS0zLjggMjEuOS0xMi43IDI2LjYtMTcuNWwzLjQtMy42LTM1LjktMzYtMzYtMzYgMzYtMzYg" +
  "MzUuOS0zNi0zLjQtMy42Yy00LjctNC44LTE4LjEtMTMuNy0yNi42LTE3LjUtMTUuNi03LjEt" +
  "NDAtMTAuNS01Ni45LTcuOXptMTA3LjUgNTcuNWwtNDMuNSA0My41IDQzLjggNDMuNyA0My43" +
  "IDQzLjggODcuOS04Ny45LTQzLjYtNDNjLTIzLjktMjMuNy00My44LTQzLjItNDQuMi00My40" +
  "LTAuMy0wLjEtMjAuMiAxOS40LTQ0LjEgNDMuM3oiLz4NCjwvc3ZnPg0K";

/// A face do **produto** — não a do parceiro, e não a do operador.
///
/// 🔴 São três rostos e nunca se misturam:
/// * o **de fábrica** (`DEFAULT_BRAND`): nome e cor, sem logo — que é o que uma
///   instalação nova mostra enquanto não há ficheiro;
/// * o **do produto** (isto): a cara AEGIS com a marca, e é o que este fork
///   escreve quando não há ficheiro;
/// * o **do operador** (o `brand.json` que a pessoa põe): sagrado, e
///   `garantirMarca` **nunca** o toca.
export const MARCA_DO_PRODUTO: Brand = {
  name: "AEGIS",
  accent: "#2D77BE",
  logo: `data:image/svg+xml;base64,${LOGO_AEGIS_BASE64}`,
};

export interface MarcaGarantida {
  /** Onde o ficheiro vive (ou viveria). */
  file: string;
  /** `escrita` = o produto criou-o agora; `presente` = já havia. */
accao: "escrita" | "presente" | "recusada";
  /** Só quando `recusada`: porquê. */
  motivo?: string;
}

/// 🔴 Escreve a face do produto **se não houver ficheiro**, e nunca antes.
///
/// A regra é a mesma que a instância usa para a marca do parceiro: escreve-se
/// **quando o destino nunca teve marca**, e a partir desse momento a escolha é
/// do operador. Um produto que reescreve a cara de quem o configurou é um
/// produto que muda de rosto sozinho — e o sintoma é o operador ver a sua
/// marca voltar ao AEGIS depois de um upgrade, sem nada que o explique.
///
/// E **não** sobrescreve um ficheiro que exista **mesmo inválido**: um
/// `brand.json` partido é um defeito que o operador tem de ver (o `loadBrand`
/// diz-lhe porquê), e apagá-lo às cegas é escondê-lo.
export function garantirMarca(opcoes: { file?: string; escrever?: (file: string, texto: string) => void } = {}): MarcaGarantida {
  const file = opcoes.file ?? brandFile();
  if (existsSync(file)) return { file, accao: "presente" };
  const texto = `${JSON.stringify(MARCA_DO_PRODUTO, null, 2)}
`;
  try {
    (opcoes.escrever ?? ((alvo: string, corpo: string) => writeFileSync(alvo, corpo)))(file, texto);
    return { file, accao: "escrita" };
  } catch (error) {
    return {
      file,
      accao: "recusada",
      motivo: error instanceof Error ? error.message : String(error),
    };
  }
}
