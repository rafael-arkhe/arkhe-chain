//! Run reports from schedulers that cannot build canonical WERs themselves
//! (Laravel `schedule:run`, cron wrappers). The authenticated runtime builds
//! the WER, so the report proves only that a bearer of the API token said the
//! run succeeded; the admission time is the store's, not the reporter's.
use arkhe_core::{canonical::encode_value, worker::WorkerExecutionRecord, Digest32};
use serde::Deserialize;
use serde_json::json;

const MAX_ID_BYTES: usize = 128;

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunReport {
    pub module_id: String,
    pub module_version: String,
    /// Unique per run; retries of the same run must reuse it.
    pub execution_id: String,
}

impl RunReport {
    /// The WER this report is admitted as. Identical reports yield the same
    /// WER, so retries keep the first admission time.
    pub fn worker_record(&self, actor: &str) -> Result<WorkerExecutionRecord, &'static str> {
        for (field, value) in [
            ("module_id", &self.module_id),
            ("module_version", &self.module_version),
            ("execution_id", &self.execution_id),
        ] {
            if !is_id(value) {
                return Err(match field {
                    "module_id" => "invalid module_id",
                    "module_version" => "invalid module_version",
                    _ => "invalid execution_id",
                });
            }
        }
        let report = encode_value(&json!({
            "actor": actor, "module_id": self.module_id,
            "module_version": self.module_version, "execution_id": self.execution_id,
        }));
        Ok(WorkerExecutionRecord {
            classification: None,
            operation: None,
            module_id: self.module_id.clone(),
            module_version: self.module_version.clone(),
            input_digest: Digest32::blake3(b"AKG:RUN-REPORT:v1\0", &report),
            output_digest: Digest32::ZERO,
            evidence_refs: vec![],
            confidence_bps: None,
            uncertainty_note: None,
            execution_id: self.execution_id.clone(),
        })
    }
}

fn is_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_BYTES
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
}
