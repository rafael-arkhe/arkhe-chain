// The handful of outward links the app offers from the profile menu and the
// About dialog. They are collected here so "where does Help go?" has one
// answer rather than one per call site.
// 🔴 Safe Core (D7, 30/09/2026). O nome é nosso, e o `APP_REPOSITORY` **não
// pode** continuar a ser o deles.
//
// 🔴 Isto não é vaidade: o `LICENSE_URL` sai daqui, e o botão *License* do
// About **é** a licença que o cliente lê. Apontar para o `LICENSE` do upstream é
// dizer ao cliente que a licença deste produto é a licença do OpenMausBot — e a
// Apache-2.0 do fork vale para o código do fork, não para o produto que a Safe
// Core vende. 🔴 A licença que vale aqui é `apps/console/NOTICE-AEGIS.md` mais
// `LICENCA-ESTE-FORK.md`, e é essa que o botão tem de abrir.
//
// 🔴 E `FEEDBACK_URL` e `PRO_URL` saíram de fininho, para o Discord e para a
// página de venda **deles**. Um cliente que_reporta um problema vai ao Discord
// de outro, e a venda usa a página deles.
//
// 🔴 `APP_REPOSITORY` fica a apontar para um sítio que **não existe** de momento
// (o repo é privado e ainda não foi publicado). 🔴 É deliberado: um link morto é
// visível, e um link para o GitHub de outro é um link que **funciona** e leva o
// cliente ao sítio errado. O D16 fecha-o com o repositório público, e a prova
// `ferramentas/marca.sh` morde se alguém o trocar por um link que funciona para
// o lado errado.
export const APP_NAME = "AEGIS";
export const APP_REPOSITORY = "https://github.com/Safe-Core/aegis";
/** The docs tree is the help centre, and it is where openmausbot.com sends
 * people too — one destination, not two competing ones. */
export const DOCS_URL = `${APP_REPOSITORY}/tree/main/apps/console/docs`;
export const HELP_CENTER_URL = DOCS_URL;
export const APPROVAL_LEVELS_URL = `${APP_REPOSITORY}/blob/main/apps/console/docs/approval-levels.md`;
/** 🔴 Safe Core: o feedback vai para a Safe Core, e o `Discord` do upstream sai
 * de fininho. Um cliente que relata um problema tem de chegar a quem o pode
 * resolver. */
export const FEEDBACK_URL = "https://aegis.safecore.space/feedback";
export const RELEASES_URL = `${APP_REPOSITORY}/releases`;
/** 🔴 Não existe uma "edição Pro" do AEGIS: a edição é a do fork (o
 * `enterprise/` foi apagado) e a venda é do integrador, pela frota. Deixar
 * este link apontar para a página de venda de outro produto é pior do que não
 * o ter. */
export const PRO_URL = "https://aegis.safecore.space";
export const LICENSE_URL = "https://aegis.safecore.space/licenca";

/** The version Vite inlined from package.json; "dev" when the define is
 * missing (a bare `tsc`/test run outside the bundler). */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

/** "macOS", "Windows", "Linux" — or nothing at all in the browser, where the
 * host OS is not ours to claim. */
export function platformLabel(platform?: string): string | null {
  return (platform && PLATFORM_NAMES[platform]) ?? null;
}

/** Hands a link to the default browser through the preload bridge, falling
 * back to a new tab when the app runs in a plain browser. */
export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
