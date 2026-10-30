use arkhe_p0_canonicalization_digest::{
    canonical_bytes, digest_canonical, digest_raw, AlgorithmId, CanonicalValue,
    ARKHE_CANONICAL_PROFILE_V1,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct FileVectors {
    vectors: Vec<Vector>,
    invariants: Invariants,
}

#[derive(Debug, Deserialize)]
struct Invariants {
    map_order_equivalent: bool,
    map_order_digest_equivalent: bool,
}

#[derive(Debug, Deserialize)]
struct Vector {
    name: String,
    semantic: serde_json::Value,
    canonical_cbor_hex: String,
    sha256_raw_canonical_hex: String,
    sha256_structured_hex: String,
}

#[test]
fn python_vectors_match_rust() {
    let parsed: FileVectors =
        serde_json::from_str(include_str!("../vectors/canonicalization-v1.json")).unwrap();

    assert!(parsed.invariants.map_order_equivalent);
    assert!(parsed.invariants.map_order_digest_equivalent);

    for vector in parsed.vectors {
        let value = from_json_fixture(&vector.semantic);
        let canonical = canonical_bytes(&value).unwrap();
        assert_eq!(
            to_hex(&canonical),
            vector.canonical_cbor_hex,
            "canonical bytes mismatch: {}",
            vector.name
        );

        let raw = digest_raw(AlgorithmId::Sha256, &canonical);
        assert_eq!(
            to_hex(raw.bytes()),
            vector.sha256_raw_canonical_hex,
            "raw SHA-256 mismatch: {}",
            vector.name
        );

        let structured = digest_canonical(
            AlgorithmId::Sha256,
            ARKHE_CANONICAL_PROFILE_V1,
            &value,
        )
        .unwrap();
        assert_eq!(
            to_hex(structured.bytes()),
            vector.sha256_structured_hex,
            "structured SHA-256 mismatch: {}",
            vector.name
        );
    }
}

fn from_json_fixture(v: &serde_json::Value) -> CanonicalValue {
    match v {
        serde_json::Value::Null => CanonicalValue::Null,
        serde_json::Value::Bool(b) => CanonicalValue::Bool(*b),
        serde_json::Value::Number(n) => {
            if let Some(v) = n.as_u64() {
                CanonicalValue::Unsigned(v)
            } else {
                CanonicalValue::Negative(n.as_i64().unwrap())
            }
        }
        serde_json::Value::String(s) => CanonicalValue::Text(s.clone()),
        serde_json::Value::Array(items) => {
            CanonicalValue::Array(items.iter().map(from_json_fixture).collect())
        }
        serde_json::Value::Object(obj) if obj.contains_key("$bytes") => {
            CanonicalValue::Bytes(from_hex(obj["$bytes"].as_str().unwrap()))
        }
        serde_json::Value::Object(obj) if obj.contains_key("$map") => {
            let entries = obj["$map"].as_array().unwrap();
            CanonicalValue::Map(
                entries
                    .iter()
                    .map(|pair| {
                        let pair = pair.as_array().unwrap();
                        (from_json_fixture(&pair[0]), from_json_fixture(&pair[1]))
                    })
                    .collect(),
            )
        }
        other => panic!("unsupported fixture form: {other:?}"),
    }
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn from_hex(s: &str) -> Vec<u8> {
    assert_eq!(s.len() % 2, 0);
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}
