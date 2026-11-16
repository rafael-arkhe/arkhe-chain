//! Rekor checkpoint and SET verification against a pinned Sigstore trusted root.
//!
//! Same trust capture as `arkhe-verify-self-demo` (Cosign TUF `trusted_root.json`),
//! not live TUF rotation. This is not full Sigstore LEMMA (no Fulcio / OIDC / artifact binding).

use crate::error::ChainError;
use crate::rekor_witness::RekorInclusionWitness;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use p256::ecdsa::signature::Verifier as _;
use p256::ecdsa::{Signature, VerifyingKey};
use p256::pkcs8::DecodePublicKey;
use sigstore_crypto::{verify_signature_auto, Checkpoint};
use sigstore_trust_root::TrustedRoot;
use sigstore_types::bundle::{CheckpointData, InclusionProof};
use sigstore_types::{DerPublicKey, LogKeyId, Sha256Hash, SignatureBytes};
use std::sync::OnceLock;

const TRUSTED_ROOT_JSON: &str = include_str!("../fixtures/sigstore/rekor_trusted_root.json");

fn pinned_trusted_root() -> Result<&'static TrustedRoot, ChainError> {
    static ROOT: OnceLock<Result<TrustedRoot, String>> = OnceLock::new();
    let slot = ROOT.get_or_init(|| {
        TrustedRoot::from_json(TRUSTED_ROOT_JSON).map_err(|e| e.to_string())
    });
    slot.as_ref()
        .map_err(|_| ChainError::ExternalAnchorRekor("trust-root"))
}

/// True when the checkpoint envelope carries at least one `— origin keyhint` signature line.
pub(crate) fn checkpoint_envelope_has_signature(envelope: &str) -> bool {
    let mut seen_blank = false;
    for line in envelope.lines() {
        if line.is_empty() {
            seen_blank = true;
            continue;
        }
        if seen_blank {
            return true;
        }
    }
    false
}

pub(crate) fn verify_witness_log_signatures(witness: &RekorInclusionWitness) -> Result<(), ChainError> {
    let root = pinned_trusted_root()?;
    if checkpoint_envelope_has_signature(&witness.checkpoint_envelope) {
        let inclusion_proof = inclusion_proof_for_witness(witness)?;
        verify_checkpoint_signature(&witness.checkpoint_envelope, &inclusion_proof, root)?;
    }
    if let Some(set_b64) = witness.signed_entry_timestamp.as_deref() {
        verify_set_signature(witness, set_b64, root)?;
    }
    Ok(())
}

fn rekor_set_canonical_bytes(body_b64: &str, integrated_time: i64, log_index: i64, log_id_hex: &str) -> Vec<u8> {
    // Matches Rekor / Python `json.dumps(..., sort_keys=True, separators=(',', ':'))`.
    format!(
        r#"{{"body":"{body_b64}","integratedTime":{integrated_time},"logID":"{log_id_hex}","logIndex":{log_index}}}"#
    )
    .into_bytes()
}

/// Rekor SET uses DER-encoded ECDSA P-256 / SHA-256 over the canonical JSON payload.
/// Sigstore's `verify_signature_auto` (aws-lc-rs) rejects some Rekor SET signatures that
/// Python/cryptography accepts; verify with the `p256` crate instead.
fn verify_set_der_ecdsa(public_key: &DerPublicKey, signature: &[u8], message: &[u8]) -> bool {
    let Ok(verifying_key) = VerifyingKey::from_public_key_der(public_key.as_bytes()) else {
        return false;
    };
    let Ok(sig) = Signature::from_der(signature) else {
        return false;
    };
    verifying_key.verify(message, &sig).is_ok()
}

fn verify_set_signature(
    witness: &RekorInclusionWitness,
    set_b64: &str,
    trusted_root: &TrustedRoot,
) -> Result<(), ChainError> {
    let integrated_time = witness
        .integrated_time
        .ok_or(ChainError::ExternalAnchorRekor("set-sig"))?;
    let body_b64 = witness
        .leaf_body_b64
        .clone()
        .unwrap_or_else(|| STANDARD.encode(&witness.leaf_body));
    // SET binds the *entry* global logIndex, not the inclusion-proof leaf index
    // (fixture: entry 3456086791 vs proof leaf 3334182529).
    let log_index = i64::try_from(
        witness
            .entry_log_index
            .ok_or(ChainError::ExternalAnchorRekor("set-sig"))?,
    )
    .map_err(|_| ChainError::ExternalAnchorRekor("set-sig"))?;
    let log_id_hex = witness
        .log_id_hex
        .clone()
        .or_else(|| {
            let key = witness.log_id_key_id.as_deref()?;
            let log_id_bytes = STANDARD.decode(key).ok()?;
            Some(hex::encode(log_id_bytes))
        })
        .ok_or(ChainError::ExternalAnchorRekor("set-sig"))?
        .to_ascii_lowercase();
    let canonical_json = rekor_set_canonical_bytes(&body_b64, integrated_time, log_index, &log_id_hex);
    let signature = SignatureBytes::new(
        STANDARD
            .decode(set_b64)
            .map_err(|_| ChainError::ExternalAnchorRekor("set-sig"))?,
    );
    if let Some(key_id) = witness.log_id_key_id.as_deref() {
        if let Ok(log_key) = trusted_root.rekor_key_for_log(&LogKeyId::new(key_id.to_string())) {
            if verify_set_der_ecdsa(&log_key, signature.as_bytes(), &canonical_json) {
                return Ok(());
            }
        }
    }
    let rekor_keys = trusted_root
        .rekor_keys_with_hints()
        .map_err(|_| ChainError::ExternalAnchorRekor("trust-root"))?;
    for (_hint, public_key) in &rekor_keys {
        if verify_set_der_ecdsa(public_key, signature.as_bytes(), &canonical_json) {
            return Ok(());
        }
    }
    Err(ChainError::ExternalAnchorRekor("set-sig"))
}

fn inclusion_proof_for_witness(witness: &RekorInclusionWitness) -> Result<InclusionProof, ChainError> {
    let root_hash = Sha256Hash::try_from_slice(&witness.root_hash)
        .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-root"))?;
    let hashes = witness
        .sibling_hashes
        .iter()
        .map(|h| Sha256Hash::try_from_slice(h).map_err(|_| ChainError::ExternalAnchorRekor("inclusion")))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(InclusionProof {
        log_index: witness.log_index.into(),
        root_hash,
        tree_size: i64::try_from(witness.tree_size)
            .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-size"))?,
        hashes,
        checkpoint: CheckpointData {
            envelope: witness.checkpoint_envelope.clone(),
        },
    })
}

fn verify_checkpoint_signature(
    checkpoint_envelope: &str,
    inclusion_proof: &InclusionProof,
    trusted_root: &TrustedRoot,
) -> Result<(), ChainError> {
    let checkpoint = Checkpoint::from_text(checkpoint_envelope)
        .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-sig"))?;
    let proof_root_hash = &inclusion_proof.root_hash;
    if checkpoint.root_hash.as_bytes() != proof_root_hash.as_bytes() {
        return Err(ChainError::ExternalAnchorRekor("checkpoint-sig"));
    }
    let rekor_keys = trusted_root
        .rekor_keys_with_hints()
        .map_err(|_| ChainError::ExternalAnchorRekor("trust-root"))?;
    for sig in &checkpoint.signatures {
        for (key_hint, public_key) in &rekor_keys {
            if &sig.key_id == key_hint {
                let message = checkpoint.signed_data();
                verify_signature_auto(public_key, &sig.signature, message)
                    .map_err(|_| ChainError::ExternalAnchorRekor("checkpoint-sig"))?;
                return Ok(());
            }
        }
    }
    Err(ChainError::ExternalAnchorRekor("checkpoint-sig"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rekor_witness::witness_from_rekor_entry_json;
    use crate::DEFAULT_REKOR_BASE_URL;
    use crate::DEFAULT_REKOR_ORIGIN;

    const FIXTURE: &[u8] = include_bytes!("../tests/fixtures/rekor_entry_arkhe_verify_wasm.json");

    #[test]
    fn set_payload_matches_rekor_fixture() {
        let witness = witness_from_rekor_entry_json(
            &[0u8; 32],
            DEFAULT_REKOR_BASE_URL,
            DEFAULT_REKOR_ORIGIN,
            FIXTURE,
        )
        .expect("parse");
        assert_eq!(witness.entry_log_index, Some(3_456_086_791));
        assert_eq!(witness.log_index, 3_334_182_529);
        let root = pinned_trusted_root().expect("trust root");
        let inclusion_proof = inclusion_proof_for_witness(&witness).expect("proof");
        verify_checkpoint_signature(&witness.checkpoint_envelope, &inclusion_proof, root)
            .expect("checkpoint");
        assert!(witness.signed_entry_timestamp.is_some());
        verify_witness_log_signatures(&witness).expect("SET DER ECDSA");
    }
}