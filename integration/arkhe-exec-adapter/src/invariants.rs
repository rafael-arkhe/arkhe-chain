//! Invariants that check real work, not test fixtures.
//!
//! Until this module existed, every `impl Invariant` in the repository was in
//! this crate's own tests. The property the crate documents — that the
//! automatable fraction of a job is the part someone can write a decidable
//! invariant for — had no instance.
//!
//! The one here is not new code. `arkhe_anonymize::release` was already a pure
//! function of a JSON value returning a binary verdict with a closed reason;
//! wiring it was finding it, not writing it.

use crate::{Invariant, Outcome, TaskSpec};
use arkhe_anonymize::{release, Status};

/// The output carries no direct identifier.
///
/// `release` suppresses and then checks, so running it over an output and
/// asking whether anything *had* to be suppressed is the decidable property:
/// an output needing no redaction never carried an identifier to begin with.
/// A `Refused` status is worse than redactions — a pattern survived even after
/// suppression — and is reported as such.
///
/// **The version is an obligation, not decoration.** An auditor replays
/// `check` and must reach the same verdict, and this check delegates to
/// `arkhe-anonymize`, whose label set decides it. Changing that label set
/// changes the verdict for the same bytes, so it must change `VERSION` too, or
/// two different checks will claim to be the same one.
pub struct NoDirectIdentifier;

/// Bump this when `arkhe_anonymize`'s detection changes, for any reason.
pub const NO_DIRECT_IDENTIFIER_VERSION: &str = "arkhe-anonymize/0.1.0";

impl Invariant for NoDirectIdentifier {
    fn id(&self) -> &str {
        "invariant.no-direct-identifier"
    }

    fn version(&self) -> &str {
        NO_DIRECT_IDENTIFIER_VERSION
    }

    fn check(&self, _spec: &TaskSpec, output: &[u8]) -> Outcome {
        let value: serde_json::Value = match serde_json::from_slice(output) {
            Ok(value) => value,
            Err(error) => {
                return Outcome::Failed {
                    reason: format!("output does not parse as JSON: {error}"),
                }
            }
        };

        let outcome = release(&value);
        if outcome.status == Status::Refused {
            return Outcome::Failed {
                reason: format!(
                    "a direct-identifier pattern survived suppression: {}",
                    outcome.report.residual_risk
                ),
            };
        }

        // The counters are categories, not field names: `labeled` for a field
        // whose key is a known identifier label, and `cpf`, `email`, `phone`
        // for a value pattern found anywhere, including inside free text under
        // an innocuous key.
        let found: Vec<String> = outcome
            .report
            .redactions
            .iter()
            .map(|(category, count)| format!("{category} x{count}"))
            .collect();
        if found.is_empty() {
            Outcome::Held { note: None }
        } else {
            Outcome::Failed {
                reason: format!("output carries direct identifiers: {}", found.join(", ")),
            }
        }
    }
}
