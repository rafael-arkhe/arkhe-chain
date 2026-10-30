// Runtime import target served from public/verifier (gitignored; built by
// scripts/build_verifier.py with wasm-pack --target web). The specifier is
// absolute so bundlers leave the import to the browser ESM loader.
declare module '*arkhe_verify_wasm.js' {
  export default function init(moduleOrPath?: unknown): Promise<unknown>;
  export function blake3_hex(input: Uint8Array): string;
  export function verify_mmr(leaf: Uint8Array, leaf_count: number, proof_json: string, root: Uint8Array): boolean;
}
