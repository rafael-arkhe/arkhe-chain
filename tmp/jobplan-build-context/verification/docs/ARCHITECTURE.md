# Architecture

`arkhe-verify-core` owns verification semantics.

Everything else is an adapter:

`CLI | WASM | MCP | GitHub Action | Cosign bridge -> core`

The MCP server must not reinterpret results.
Cosign/Sigstore evidence must not become protected-transition authorization by
mere presence.

WormGraph is the causal evidence substrate consumed/produced by higher layers;
it is not a user-facing verifier implementation.
