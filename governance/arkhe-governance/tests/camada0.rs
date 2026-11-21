//! Camada 0, as files the code checks.
//!
//! The constitution and the mandates committed under `governance/camada0/` are
//! real `SignedPolicyBundle`s: they verify under the production posture
//! (`SignaturePolicy::Required`), they refuse to be reinstated after a version
//! bump, they expire, and they break if a statement is edited. The mandates are
//! then checked for containment: a delegation may only narrow what it descends
//! from.

use arkhe_governance::mandate::{
    mandate_within_constitution, mandate_within_mandate, Constitution, Mandate, MandateError,
};
use arkhe_governance::policy_bundle::{
    PolicyBundleError, PolicyPayload, SignaturePolicy, SignedPolicyBundle, TrustStore,
};
use serde_json::Value;

const CONSTITUTION: &str = include_str!("../../camada0/CONSTITUTION-v1.json");
const MANDATE_ENGINEERING: &str = include_str!("../../camada0/MANDATE-engineering-v1.json");
const MANDATE_EVIDENCE: &str = include_str!("../../camada0/MANDATE-evidence-v1.json");
const TRUST_STORE: &str = include_str!("../../camada0/DEV-TRUST-STORE.json");

/// Inside every window of the committed files.
const NOW: i64 = 1_795_200_000;
const NINETY_ONE_DAYS: i64 = 91 * 86_400;

fn bundle(source: &str) -> SignedPolicyBundle {
    serde_json::from_str(source).expect("the committed bundle parses")
}

/// The deployment's trust store, built from the committed anchors. The bundle
/// never carries its own trust material.
fn trust_store() -> TrustStore {
    let document: Value = serde_json::from_str(TRUST_STORE).unwrap();
    let mut store = TrustStore::new();
    for anchor in document["anchors"].as_array().unwrap() {
        let key: [u8; 32] = hex::decode(anchor["public_key_hex"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        store
            .insert(anchor["key_id"].as_str().unwrap(), key)
            .expect("the anchor is a valid key");
    }
    store
}

fn constitution() -> (Constitution, String) {
    let bundle = bundle(CONSTITUTION);
    let constitution: Constitution =
        serde_json::from_value(bundle.payload.statements.clone()).expect("statements are typed");
    let digest = format!("blake3:{}", bundle.payload_digest().to_hex());
    (constitution, digest)
}

fn mandate(source: &str) -> (Mandate, SignedPolicyBundle) {
    let bundle = bundle(source);
    let mandate: Mandate =
        serde_json::from_value(bundle.payload.statements.clone()).expect("statements are typed");
    (mandate, bundle)
}

#[test]
fn the_committed_constitution_verifies_under_the_production_posture() {
    let bundle = bundle(CONSTITUTION);
    let binding = bundle
        .verify(&trust_store(), 1, SignaturePolicy::Required, NOW)
        .expect("the committed constitution verifies");
    assert_eq!(binding.policy_id, "arkhe-constitution");
    assert_eq!(binding.version, 1);
    assert_eq!(binding.policy_digest, bundle.payload_digest());
}

#[test]
fn an_empty_trust_store_is_a_configuration_error_not_a_pass() {
    assert_eq!(
        bundle(CONSTITUTION).verify(&TrustStore::new(), 1, SignaturePolicy::Required, NOW),
        Err(PolicyBundleError::TrustStoreRequired)
    );
}

#[test]
fn a_retired_constitution_cannot_be_reinstated() {
    // The deployment has already accepted version 2; re-presenting version 1,
    // still validly signed, is a rollback.
    assert_eq!(
        bundle(CONSTITUTION).verify(&trust_store(), 2, SignaturePolicy::Required, NOW),
        Err(PolicyBundleError::RollbackDetected)
    );
}

#[test]
fn the_constitution_has_an_end_and_a_beginning() {
    let bundle = bundle(CONSTITUTION);
    assert_eq!(
        bundle.verify(
            &trust_store(),
            1,
            SignaturePolicy::Required,
            bundle.issued_at - 1
        ),
        Err(PolicyBundleError::NotYetValid)
    );
    assert_eq!(
        bundle.verify(
            &trust_store(),
            1,
            SignaturePolicy::Required,
            bundle.expires_at
        ),
        Err(PolicyBundleError::Expired),
        "expires_at is exclusive, so a yearly review is not optional"
    );
}

#[test]
fn an_unsigned_constitution_is_refused_in_production() {
    let mut bundle = bundle(CONSTITUTION);
    bundle.signature = None;
    assert_eq!(
        bundle.verify(&trust_store(), 1, SignaturePolicy::Required, NOW),
        Err(PolicyBundleError::UnsignedBundle)
    );
}

#[test]
fn raising_a_ceiling_after_signing_breaks_the_signature() {
    let mut bundle = bundle(CONSTITUTION);
    bundle.payload.statements["ceilings"]["daily_minor"] = Value::from(100_000_000u64);
    assert_eq!(
        bundle.verify(&trust_store(), 1, SignaturePolicy::Required, NOW),
        Err(PolicyBundleError::InvalidSignature),
        "the signature covers the statements, so the ceilings are not editable"
    );
}

#[test]
fn the_committed_mandates_verify_and_stay_inside_the_constitution() {
    let (constitution, digest) = constitution();
    for source in [MANDATE_ENGINEERING, MANDATE_EVIDENCE] {
        let (mandate, bundle) = mandate(source);
        bundle
            .verify(&trust_store(), 1, SignaturePolicy::Required, NOW)
            .expect("the committed mandate verifies");
        assert_eq!(
            mandate_within_constitution(
                &constitution,
                &digest,
                &mandate,
                bundle.issued_at,
                bundle.expires_at,
            ),
            Ok(()),
            "{} is outside the constitution",
            bundle.payload.policy_id
        );
        // No committed mandate spends anything.
        assert_eq!(mandate.ceilings.per_action_minor, 0);
        assert_eq!(mandate.ceilings.daily_minor, 0);
    }
}

#[test]
fn a_mandate_cannot_carry_a_reserved_decision() {
    let (constitution, digest) = constitution();
    let (mut mandate, bundle) = mandate(MANDATE_ENGINEERING);
    assert!(constitution
        .reserved
        .iter()
        .any(|r| r == "promote_to_production"));
    mandate.effects.push("promote_to_production".into());
    assert_eq!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &mandate,
            bundle.issued_at,
            bundle.expires_at
        ),
        Err(MandateError::ReservedDecisionDelegated(
            "promote_to_production".into()
        ))
    );
}

#[test]
fn a_mandate_cannot_permit_what_the_constitution_omits() {
    let (constitution, digest) = constitution();
    let (mut mandate, bundle) = mandate(MANDATE_EVIDENCE);
    mandate.effects.push("send_external_email".into());
    assert_eq!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &mandate,
            bundle.issued_at,
            bundle.expires_at
        ),
        Err(MandateError::EffectNotPermitted(
            "send_external_email".into()
        ))
    );
}

#[test]
fn a_mandate_cannot_raise_a_ceiling_or_change_currency() {
    let (constitution, digest) = constitution();
    let (mandate, bundle) = mandate(MANDATE_EVIDENCE);

    let mut greedy = mandate.clone();
    greedy.ceilings.daily_minor = constitution.ceilings.daily_minor + 1;
    assert_eq!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &greedy,
            bundle.issued_at,
            bundle.expires_at
        ),
        Err(MandateError::CeilingExceeded {
            limit: constitution.ceilings.daily_minor,
            requested: constitution.ceilings.daily_minor + 1,
        })
    );

    let mut foreign = mandate;
    foreign.ceilings.currency = "USD".into();
    assert!(matches!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &foreign,
            bundle.issued_at,
            bundle.expires_at
        ),
        Err(MandateError::CurrencyMismatch { .. })
    ));
}

#[test]
fn a_mandate_cannot_outlive_the_longest_delegation() {
    let (constitution, digest) = constitution();
    let (mandate, bundle) = mandate(MANDATE_EVIDENCE);
    assert_eq!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &mandate,
            bundle.issued_at,
            bundle.issued_at + NINETY_ONE_DAYS,
        ),
        Err(MandateError::WindowTooLong {
            maximum: constitution.max_mandate_seconds,
            requested: NINETY_ONE_DAYS,
        })
    );
}

#[test]
fn a_mandate_from_another_constitution_is_refused() {
    let (constitution, digest) = constitution();
    let (mut mandate, bundle) = mandate(MANDATE_EVIDENCE);
    mandate.constitution_digest = format!("blake3:{}", "0".repeat(64));
    assert!(matches!(
        mandate_within_constitution(
            &constitution,
            &digest,
            &mandate,
            bundle.issued_at,
            bundle.expires_at
        ),
        Err(MandateError::ConstitutionMismatch { .. })
    ));
}

#[test]
fn a_subdelegation_may_only_narrow_its_parent() {
    let (constitution, digest) = constitution();
    let (parent, parent_bundle) = mandate(MANDATE_ENGINEERING);
    let parent_digest = format!("blake3:{}", parent_bundle.payload_digest().to_hex());

    // A narrower child: a subset of the parent's effects.
    let mut child = parent.clone();
    child.parent_mandate_digest = Some(parent_digest.clone());
    child.cell = "engineering/tests".into();
    child.purpose = "Run the test suite only.".into();
    child.effects = vec!["run_tests".into()];
    assert_eq!(
        mandate_within_mandate(
            &constitution,
            &digest,
            &parent,
            &parent_digest,
            &child,
            parent_bundle.issued_at,
            parent_bundle.expires_at,
        ),
        Ok(())
    );

    // The same child asking for one effect the parent does not hold, even
    // though the constitution permits it.
    let mut wider = child.clone();
    wider.effects.push("prepare_evidence_bundle".into());
    assert!(constitution
        .effects
        .iter()
        .any(|e| e == "prepare_evidence_bundle"));
    assert_eq!(
        mandate_within_mandate(
            &constitution,
            &digest,
            &parent,
            &parent_digest,
            &wider,
            parent_bundle.issued_at,
            parent_bundle.expires_at,
        ),
        Err(MandateError::EffectNotPermitted(
            "prepare_evidence_bundle".into()
        )),
        "a subdelegation inherits from its parent, not from the constitution"
    );

    // And a child that does not name its parent.
    let mut orphan = child;
    orphan.parent_mandate_digest = None;
    assert!(matches!(
        mandate_within_mandate(
            &constitution,
            &digest,
            &parent,
            &parent_digest,
            &orphan,
            parent_bundle.issued_at,
            parent_bundle.expires_at,
        ),
        Err(MandateError::ParentMismatch { .. })
    ));
}

#[test]
fn a_constitution_that_reserves_what_it_permits_is_refused() {
    let (mut constitution, _) = constitution();
    constitution.reserved.push("run_tests".into());
    assert_eq!(
        constitution.validate(),
        Err(MandateError::ReservedDecisionDelegated("run_tests".into())),
        "permitting and reserving the same effect is not a policy, it is a contradiction"
    );
}

/// The constitution's digest is what every mandate cites, so it must be
/// reproducible from the committed bytes alone.
#[test]
fn the_constitution_digest_the_mandates_cite_is_the_committed_one() {
    let (_, digest) = constitution();
    let payload: PolicyPayload = bundle(CONSTITUTION).payload;
    assert_eq!(digest, format!("blake3:{}", payload.digest().to_hex()));
    for source in [MANDATE_ENGINEERING, MANDATE_EVIDENCE] {
        let (mandate, _) = mandate(source);
        assert_eq!(mandate.constitution_digest, digest);
    }
}
