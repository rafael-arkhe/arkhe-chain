# ADR-0002 — Cosign as container ecosystem bridge

Status: Accepted.

Arkhe does not build a custom container-signature ecosystem.
Cosign/Sigstore provides transport/signature verification; Arkhe binds resulting
evidence into its own verification/evidence model.
