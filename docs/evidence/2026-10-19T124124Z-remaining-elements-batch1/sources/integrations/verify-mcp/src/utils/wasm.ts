import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export interface ArkheWasm {
  blake3_hex(input: Uint8Array): string;
  canonicalize_gguf_json(input: string): string;
  canonicalize_c2pa_json(input: string): string;
  verify_mmr(leaf: Uint8Array, leafCount: number, proofJson: string, root: Uint8Array): boolean;
}
let loaded: Promise<ArkheWasm> | undefined;
export function loadVerifier(): Promise<ArkheWasm> {
  if (!loaded) {
    const moduleUrl = process.env.ARKHE_VERIFY_WASM_MODULE
      ? pathToFileURL(resolve(process.env.ARKHE_VERIFY_WASM_MODULE)).href
      : new URL("../../../../verification/crates/arkhe-verify-wasm/pkg/arkhe_verify_wasm.js", import.meta.url).href;
    loaded = import(moduleUrl).then((m) => m as unknown as ArkheWasm);
  }
  return loaded;
}
