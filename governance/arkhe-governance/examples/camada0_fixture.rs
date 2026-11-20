//! Generator for the Camada 0 files: the signed constitution, the mandates
//! issued under it, and the development trust store that verifies them.
//!
//! These are **development instances**, signed with a public test key, so that
//! the pipeline is proven end to end and the production constitution has
//! something to be compared against. The production constitution is signed by
//! the founder, on the founder's machine, with a key this tooling never sees:
//! see `docs/CAMADA-0.md`.
//!
//! Run:
//! ```text
//! cargo run -q -p arkhe-governance --example camada0_fixture -- --emit trust-store
//! cargo run -q -p arkhe-governance --example camada0_fixture -- --emit constitution
//! cargo run -q -p arkhe-governance --example camada0_fixture -- --emit mandate-engineering
//! cargo run -q -p arkhe-governance --example camada0_fixture -- --emit mandate-evidence
//! ```

use arkhe_governance::mandate::{
    Ceilings, Constitution, Mandate, CONSTITUTION_SCHEMA, MANDATE_SCHEMA,
};
use arkhe_governance::policy_bundle::{sign_policy_bundle, PolicyPayload};
use ed25519_dalek::SigningKey;
use serde_json::json;

/// 2026-11-20T00:00:00Z.
const ISSUED_AT: i64 = 1_795_132_800;
/// 2027-11-20T00:00:00Z — the constitution is reviewed yearly.
const CONSTITUTION_EXPIRES_AT: i64 = 1_826_668_800;
/// 2026-12-20T00:00:00Z — a mandate lives for thirty days.
const MANDATE_EXPIRES_AT: i64 = 1_797_724_800;
/// Ninety days: the longest window any single mandate may carry.
const MAX_MANDATE_SECONDS: i64 = 7_776_000;

const KEY_ID: &str = "dev-founder-key-NOT-FOR-PRODUCTION";
const ISSUER: &str = "arkhe-founder";

fn constitution() -> Constitution {
    Constitution {
        schema: CONSTITUTION_SCHEMA.into(),
        // Every effect any mandate may ever carry. Absence is denial.
        effects: vec![
            "query_knowledge_base".into(),
            "simulate".into(),
            "draft_document".into(),
            "run_tests".into(),
            "prepare_release".into(),
            "prepare_evidence_bundle".into(),
        ],
        // These return to the founder. No mandate may carry them, and a
        // constitution that both permits and reserves an effect is refused.
        reserved: vec![
            "sign_constitution".into(),
            "rotate_master_key".into(),
            "grant_mandate".into(),
            "promote_to_production".into(),
            "approve_payment".into(),
            "sign_contract".into(),
            "publish_public_statement".into(),
        ],
        ceilings: Ceilings {
            currency: "BRL".into(),
            // Development values. The founder's real ceilings are his to set,
            // and changing them is a version bump plus a signature.
            per_action_minor: 50_000,
            daily_minor: 200_000,
        },
        jurisdictions: vec!["BR".into()],
        max_mandate_seconds: MAX_MANDATE_SECONDS,
    }
}

/// No mandate in this set spends anything. A cell that needs money needs a
/// mandate that says so, and `approve_payment` is reserved regardless.
fn no_spend() -> Ceilings {
    Ceilings {
        currency: "BRL".into(),
        per_action_minor: 0,
        daily_minor: 0,
    }
}

fn main() {
    let emit = std::env::args()
        .skip_while(|a| a != "--emit")
        .nth(1)
        .unwrap_or_else(|| "constitution".to_owned());

    // PUBLIC TEST KEY ONLY. Never trust this key for real credentials.
    let key = SigningKey::from_bytes(&[123; 32]);

    let constitution = constitution();
    let constitution_payload = PolicyPayload {
        policy_id: "arkhe-constitution".into(),
        statements: serde_json::to_value(&constitution).unwrap(),
    };
    let constitution_digest = format!("blake3:{}", constitution_payload.digest().to_hex());

    let mandate = |cell: &str, purpose: &str, effects: Vec<String>| Mandate {
        schema: MANDATE_SCHEMA.into(),
        constitution_digest: constitution_digest.clone(),
        parent_mandate_digest: None,
        cell: cell.into(),
        purpose: purpose.into(),
        effects,
        ceilings: no_spend(),
        responsible: "arkhe-founder".into(),
    };

    let document = match emit.as_str() {
        "trust-store" => json!({
            "schema": "arkhe.governance.trust-store/1",
            "warning": "PUBLIC TEST KEY ONLY. Never trust this key for real credentials. \
                        The production trust store is provisioned by the deployment, out of band.",
            "anchors": [{
                "key_id": KEY_ID,
                "public_key_hex": hex::encode(key.verifying_key().to_bytes())
            }]
        }),
        "constitution" => serde_json::to_value(sign_policy_bundle(
            constitution_payload,
            1,
            1,
            ISSUER,
            KEY_ID,
            ISSUED_AT,
            CONSTITUTION_EXPIRES_AT,
            &key,
        ))
        .unwrap(),
        "mandate-engineering" => serde_json::to_value(sign_policy_bundle(
            PolicyPayload {
                policy_id: "arkhe-mandate-engineering".into(),
                statements: serde_json::to_value(mandate(
                    "engineering",
                    "Test, review and prepare releases in an isolated environment. Promotion to \
                     production is reserved and is not delegated here.",
                    vec![
                        "query_knowledge_base".into(),
                        "simulate".into(),
                        "draft_document".into(),
                        "run_tests".into(),
                        "prepare_release".into(),
                    ],
                ))
                .unwrap(),
            },
            1,
            1,
            ISSUER,
            KEY_ID,
            ISSUED_AT,
            MANDATE_EXPIRES_AT,
            &key,
        ))
        .unwrap(),
        "mandate-evidence" => serde_json::to_value(sign_policy_bundle(
            PolicyPayload {
                policy_id: "arkhe-mandate-evidence".into(),
                statements: serde_json::to_value(mandate(
                    "evidence",
                    "Prepare documentary evidence bundles for internal review, as the measured \
                     pilot of docs/CAMADA-0.md defines it.",
                    vec![
                        "query_knowledge_base".into(),
                        "draft_document".into(),
                        "prepare_evidence_bundle".into(),
                    ],
                ))
                .unwrap(),
            },
            1,
            1,
            ISSUER,
            KEY_ID,
            ISSUED_AT,
            MANDATE_EXPIRES_AT,
            &key,
        ))
        .unwrap(),
        other => {
            eprintln!(
                "unknown --emit {other}; expected trust-store, constitution, \
                 mandate-engineering or mandate-evidence"
            );
            std::process::exit(2);
        }
    };

    println!("{}", serde_json::to_string_pretty(&document).unwrap());
}
