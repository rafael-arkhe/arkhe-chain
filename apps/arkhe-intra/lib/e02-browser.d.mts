export interface E02BrowserInput {
  expectedLeafCount?: number;
  includeDetails?: boolean;
  signature?: string;
  refText: string | Record<string, unknown>;
  anchorText?: string | Record<string, unknown> | null;
  datasetText: string;
  cluster?: string;
  datasetOrigin?: string;
}

export interface E02VerifierWasm {
  blake3_hex(input: Uint8Array): string;
  verify_mmr(leaf: Uint8Array, leaf_count: number, proof_json: string, root: Uint8Array): boolean;
}

export function verifyE02Browser(input: E02BrowserInput, wasm: E02VerifierWasm): import('./e02.mjs').E02Result;
