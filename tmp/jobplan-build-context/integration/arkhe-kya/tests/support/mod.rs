use arkhe_kya_experimental::*;
use ed25519_dalek::{Signer, SigningKey};

// Public deterministic fixture seeds ONLY. Never use these keys for a principal.
pub fn fixture() -> (Passport, Context) {
    let principal = SigningKey::from_bytes(&[1; 32]);
    let agent = SigningKey::from_bytes(&[2; 32]);
    let mandate = Mandate {
        profile: PROFILE.into(),
        label: LABEL.into(),
        principal_did: did_key(principal.verifying_key().as_bytes()),
        agent_id: did_key(agent.verifying_key().as_bytes()),
        audience: "test-counterparty".into(),
        actions: vec!["read:proof".into()],
        not_before: 1000,
        expires_at: 2000,
    };
    let record = AgentIntegrityRecord {
        profile: PROFILE.into(),
        label: LABEL.into(),
        agent_id: mandate.agent_id.clone(),
        principal_did: mandate.principal_did.clone(),
        declared_model_blake3: blake3::hash(b"not a real GGUF; synthetic model bytes")
            .to_hex()
            .to_string(),
        mandate_digest: mandate_digest(&mandate).unwrap(),
        audience: mandate.audience.clone(),
        challenge: "counterparty-test-challenge-0001".into(),
        issued_at: 1100,
    };
    let mut passport = Passport {
        principal_signature: hex::encode(
            principal
                .sign(&mandate_payload(&mandate).unwrap())
                .to_bytes(),
        ),
        agent_signature: hex::encode(agent.sign(&record_payload(&record).unwrap()).to_bytes()),
        mandate,
        record,
        inclusion: Inclusion {
            leaf_count: 3,
            leaf_index: 1,
            steps: vec![],
        },
    };
    let leaf = inclusion_leaf(&passport).unwrap();
    let (root, steps) = arkhe_verify_core::mmr::build_root_and_proof(
        &[b"other-0".to_vec(), leaf, b"other-2".to_vec()],
        1,
    )
    .unwrap();
    passport.inclusion.steps = steps
        .into_iter()
        .map(|s| Step {
            kind: s.kind,
            direction: s.direction,
            hash: s.hash,
        })
        .collect();
    let context = Context {
        trusted_principal_did: passport.mandate.principal_did.clone(),
        audience: "test-counterparty".into(),
        action: "read:proof".into(),
        challenge: passport.record.challenge.clone(),
        now: 1150,
        expected_root: hex::encode(root),
        expected_leaf_count: 3,
        expected_model_blake3: Some(passport.record.declared_model_blake3.clone()),
    };
    (passport, context)
}
