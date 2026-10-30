use serde::Deserialize;
use serde_json::Value;
use std::fs;

#[derive(Debug, Deserialize)]
struct GoldenVectorSet {
    vectors: Vec<GoldenVector>,
}

#[derive(Debug, Deserialize)]
struct GoldenVector {
    id: String,
    component: String,
    input: Value,
    expected_output: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MmrProof {
    pub hashes: Vec<String>,
    pub directions: Vec<String>,
    pub kinds: Vec<String>,
}

pub trait ArkheVerifier {
    fn blake3_hash(&self, data: &[u8]) -> String;
    fn canonicalize_gguf(&self, metadata: &Value) -> String;

    /// Must return the root and the inclusion proof for the requested leaf.
    /// Proof arrays are ordered exactly as specified by Arkhe MMR Profile v1.
    fn mmr_root_and_proof(
        &self,
        leaves: &[String],
        target_index: usize,
    ) -> (String, MmrProof);

    fn canonicalize_c2pa_claim_v2(&self, claim: &Value) -> Result<String, String>;
}

fn str_vec(v: &Value) -> Vec<String> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_str().unwrap().to_owned())
        .collect()
}

fn assert_mmr_vector(verifier: &impl ArkheVerifier, v: &GoldenVector) {
    let leaves = str_vec(&v.input["leaves"]);
    let expected_root = v.expected_output["root_hash_hex"].as_str().unwrap();
    let proofs = v.expected_output["proofs"].as_array().unwrap();

    // Every leaf in every MMR vector must have a golden inclusion proof.
    assert_eq!(
        proofs.len(),
        leaves.len(),
        "{}: proof count must equal leaf count",
        v.id
    );

    for expected in proofs {
        let index = expected["target_index"].as_u64().unwrap() as usize;

        let expected_proof = MmrProof {
            hashes: str_vec(&expected["inclusion_proof_hashes"]),
            directions: str_vec(&expected["inclusion_proof_directions"]),
            kinds: str_vec(&expected["inclusion_proof_kinds"]),
        };

        let (root, proof) = verifier.mmr_root_and_proof(&leaves, index);

        assert_eq!(root, expected_root, "{} root @ leaf {}", v.id, index);
        assert_eq!(
            proof.hashes,
            expected_proof.hashes,
            "{} proof hashes @ leaf {}",
            v.id,
            index
        );
        assert_eq!(
            proof.directions,
            expected_proof.directions,
            "{} proof directions @ leaf {}",
            v.id,
            index
        );
        assert_eq!(
            proof.kinds,
            expected_proof.kinds,
            "{} proof kinds @ leaf {}",
            v.id,
            index
        );
    }
}

/// Run this exact function from both native and WASM integration tests.
/// The golden gate must use real adapters; do not substitute mocks.
pub fn assert_golden_vectors(verifier: &impl ArkheVerifier) {
    let raw = fs::read_to_string("tests/golden_vectors.json")
        .expect("read golden_vectors.json");
    let set: GoldenVectorSet = serde_json::from_str(&raw)
        .expect("parse golden_vectors.json");

    for v in &set.vectors {
        match v.component.as_str() {
            "BLAKE3" => {
                let data = hex::decode(v.input["data_hex"].as_str().unwrap()).unwrap();
                let expected = v.expected_output["hash_hex"].as_str().unwrap();
                assert_eq!(verifier.blake3_hash(&data), expected, "{}", v.id);
            }

            "GGUF Canonicalization" => {
                let expected = v.expected_output["canonical_cbor_hex"].as_str().unwrap();
                assert_eq!(
                    verifier.canonicalize_gguf(&v.input["metadata"]),
                    expected,
                    "{}",
                    v.id
                );
            }

            "WormGraph MMR" => assert_mmr_vector(verifier, v),

            "C2PA Manifest Parsing" if v.id == "C2PA-001" => {
                let expected = v.expected_output["canonical_cbor_hex"].as_str().unwrap();
                let got = verifier
                    .canonicalize_c2pa_claim_v2(&v.input["claim_v2"])
                    .expect("positive C2PA vector must parse");
                assert_eq!(got, expected, "{}", v.id);
            }

            "C2PA Manifest Parsing" if v.id.starts_with("C2PA-NEG-") => {
                assert!(
                    verifier
                        .canonicalize_c2pa_claim_v2(&v.input["claim_json"])
                        .is_err(),
                    "{} must reject malformed claim-map-v2",
                    v.id
                );
            }

            other => panic!("unhandled component/vector: {} / {}", other, v.id),
        }
    }
}
