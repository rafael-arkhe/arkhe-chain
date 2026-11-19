use arkhe_depin::{
    adapters::gensyn::{GensynAdapter, VerdeReceipt},
    attestation::{AttestationVerdict, NrasAttestationPort, NrasChallenge},
    proof::Mmr,
    types::HardwareAttestation,
};
use arkhe_network::{DistributionObservation, NetworkBundle, NetworkPipeline, RequireAttestation};
use arkhe_p2p::verify::{DualVerifier, ExpectedDigests};
use arkhe_p2p::Limits;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::Serialize;
use std::time::Duration;

const JWKS: &str = include_str!("../../arkhe-depin/fixtures/nras_jwks.fixture.json");
const SECRET: &[u8] = b"arkhe-nras-fixture-secret-key-32b!";

#[derive(Serialize)]
struct FixtureClaims {
    nonce: String,
    iat: i64,
    exp: i64,
    #[serde(rename = "x_arkhe_profile")]
    profile: String,
}

fn gensyn_receipt() -> arkhe_depin::types::NativeReceipt {
    let raw: VerdeReceipt = serde_json::from_str(include_str!(
        "../../arkhe-depin/fixtures/gensyn_verde_receipt.synthetic.json"
    ))
    .unwrap();
    GensynAdapter::normalize(&raw).unwrap()
}

fn mint_jwt(challenge: &NrasChallenge, now: i64) -> String {
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some("arkhe-nras-fixture-1".into());
    encode(
        &header,
        &FixtureClaims {
            nonce: hex::encode(challenge.nonce),
            iat: challenge.issued_at,
            exp: now + 120,
            profile: "arkhe-nras-fixture-v1".into(),
        },
        &EncodingKey::from_secret(SECRET),
    )
    .unwrap()
}

#[tokio::test]
async fn pipeline_roundtrip_with_p2p_and_verified_nras() {
    let bytes = b"arkhe-network-fixture-blob";
    let expected = ExpectedDigests {
        sha256: {
            use sha2::{Digest, Sha256};
            Sha256::digest(bytes).into()
        },
        blake3: *blake3::hash(bytes).as_bytes(),
    };
    // DualVerifier is the only seal constructor path for VerifiedBlob.
    let limits = Limits {
        max_bytes: 1024,
        deadline: Duration::from_secs(1),
    };
    let verifier = DualVerifier::new(expected, limits).unwrap();
    let blob = verifier.verify(&bytes[..]).await.unwrap();
    let distribution =
        DistributionObservation::from_verified(&blob, 1, Some("npub-synthetic-publisher".into()));

    let now = 1_780_000_000i64;
    let challenge = NrasChallenge {
        nonce: [3u8; 32],
        issued_at: now,
        max_age_secs: 300,
    };
    let jwt = mint_jwt(&challenge, now);
    let port = NrasAttestationPort::from_jwks_json(JWKS).unwrap();
    let attestation = port.verify(&jwt, &challenge, now);
    assert!(matches!(attestation, AttestationVerdict::Verified { .. }));

    let bundle = NetworkBundle {
        receipt: gensyn_receipt(),
        distribution: Some(distribution),
        attestation,
    };
    let hardware = HardwareAttestation {
        nras_jwt: Some(jwt),
        ppcie_report: None,
        nonce: challenge.nonce,
        gpu_measurement: None,
    };

    let pipeline = NetworkPipeline {
        require_attestation: RequireAttestation::Verified,
    };
    let mut mmr = Mmr::new();
    let anchored = pipeline.compose(bundle, Some(hardware), &mut mmr).unwrap();
    let trusted = mmr.checkpoint().unwrap();
    pipeline.verify(&anchored, &trusted).unwrap();

    let exported = serde_json::to_vec(&anchored).unwrap();
    let imported: arkhe_network::AnchoredNetworkBundle = serde_json::from_slice(&exported).unwrap();
    pipeline.verify(&imported, &trusted).unwrap();
}

#[test]
fn optional_attestation_anchors_without_hardware() {
    let pipeline = NetworkPipeline {
        require_attestation: RequireAttestation::Optional,
    };
    let bundle = NetworkBundle {
        receipt: gensyn_receipt(),
        distribution: None,
        attestation: AttestationVerdict::Unsupported,
    };
    let mut mmr = Mmr::new();
    let anchored = pipeline.compose(bundle, None, &mut mmr).unwrap();
    pipeline
        .verify(&anchored, &mmr.checkpoint().unwrap())
        .unwrap();
}

#[test]
fn verified_policy_rejects_unsupported_and_tamper_breaks_verify() {
    let pipeline = NetworkPipeline {
        require_attestation: RequireAttestation::Verified,
    };
    let bundle = NetworkBundle {
        receipt: gensyn_receipt(),
        distribution: None,
        attestation: AttestationVerdict::Unsupported,
    };
    let mut mmr = Mmr::new();
    assert!(pipeline.compose(bundle, None, &mut mmr).is_err());

    let now = 1_780_000_000i64;
    let challenge = NrasChallenge {
        nonce: [4u8; 32],
        issued_at: now,
        max_age_secs: 300,
    };
    let jwt = mint_jwt(&challenge, now);
    let attestation = NrasAttestationPort::from_jwks_json(JWKS)
        .unwrap()
        .verify(&jwt, &challenge, now);
    let bundle = NetworkBundle {
        receipt: gensyn_receipt(),
        distribution: Some(DistributionObservation {
            sha256: [1; 32],
            blake3: [2; 32],
            candidates_tried: 1,
            publisher: None,
            complete: true,
        }),
        attestation,
    };
    let hardware = HardwareAttestation {
        nras_jwt: Some(jwt),
        ppcie_report: None,
        nonce: challenge.nonce,
        gpu_measurement: None,
    };
    let anchored = pipeline.compose(bundle, Some(hardware), &mut mmr).unwrap();
    let trusted = mmr.checkpoint().unwrap();

    let mut tampered = anchored.clone();
    tampered.bundle.distribution.as_mut().unwrap().blake3[0] ^= 1;
    assert!(pipeline.verify(&tampered, &trusted).is_err());

    let mut tampered = anchored.clone();
    tampered.proof.attested.receipt.payload[0] ^= 1;
    assert!(pipeline.verify(&tampered, &trusted).is_err());
}

#[test]
fn incomplete_distribution_observation_is_recorded() {
    let obs = DistributionObservation::incomplete(
        ExpectedDigests {
            sha256: [9; 32],
            blake3: [8; 32],
        },
        3,
        Some("publisher".into()),
    );
    assert!(!obs.complete);
    assert!(obs.validate_structure());
}
