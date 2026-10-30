export interface AttestationResult { verified: false; reason: string }
/** No fabricated GPU evidence: an NRAS/hardware verifier must be configured first. */
export function attestGpu(): AttestationResult { return { verified: false, reason: 'GPU attestation provider is not configured. No hardware claim has been verified.' }; }
