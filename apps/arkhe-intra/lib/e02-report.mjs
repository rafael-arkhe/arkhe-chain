// Acceptance rule for consumers of the detailed envelope, not a proof verifier.
// Re-run the verifier on the original files before trusting an imported report.
export function isCompleteE02Report(result) {
  return result?.outcome === 'VERIFIED' && result.reason === null &&
    result.complete === true && result.aborted === null &&
    Array.isArray(result.checks) && result.checks.length === 9 &&
    result.checks.every((check, index) => check.id === index &&
      check.status === 'PASS' && check.reason === null);
}
