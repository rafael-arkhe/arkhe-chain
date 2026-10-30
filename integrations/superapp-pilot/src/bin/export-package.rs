use arkhe_superapp_pilot::*;
use std::{fs, path::PathBuf, sync::Arc};
fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let output = PathBuf::from(
        std::env::args()
            .nth(1)
            .unwrap_or_else(|| "evidence/demo".into()),
    );
    fs::create_dir_all(&output)?;
    let now = SystemClock.now();
    let (artifact, trust, gate) = demo::fixture(now);
    let audit = output.join("audit.jsonl");
    if audit.exists() {
        return Err("use a fresh output directory; refusing to mix audit runs".into());
    }
    let client = Client::new(trust.clone(), Arc::new(SystemClock), audit.clone());
    let consent = vec!["camera".into()];
    let token = client.admit(&artifact, consent.clone())?;
    let value = client.execute(&token)?;
    if value != 1 {
        return Err("unexpected guest result".into());
    }
    let _ = client.call_api(&token, "contacts");
    let events: Vec<Event> = fs::read_to_string(audit)?
        .lines()
        .map(serde_json::from_str)
        .collect::<std::result::Result<_, _>>()?;
    let mut package = EvidencePackage {
        version: 1,
        artifact,
        policy: trust.policy.clone(),
        policy_digest: trust.policy.digest()?,
        evaluated_at: now,
        decision: "Allow".into(),
        consent,
        events,
        gate_pubkey: [0; 32],
        gate_signature: vec![],
    };
    package.sign(&gate)?;
    fs::write(
        output.join("package.json"),
        serde_json::to_vec_pretty(&package)?,
    )?;
    // Fixture only: this file is not independent provisioning of production trust.
    fs::write(
        output.join("DEMO-TRUST-NOT-PRODUCTION.json"),
        serde_json::to_vec_pretty(&trust)?,
    )?;
    fs::write(
        output.join("artifact.json"),
        serde_json::to_vec_pretty(&package.artifact)?,
    )?;
    // Cross-language compatibility over every position of several peak layouts.
    let mut vectors = Vec::new();
    for count in [1, 2, 3, 5, 7, 8] {
        for index in 0..count {
            let mut p = package.clone();
            let mut leaves = vec![b"unrelated evidence".to_vec(); count];
            leaves[index] = p.artifact.manifest.unsigned_bytes()?;
            let (root, proof) = arkhe_verify_core::mmr::build_root_and_proof(&leaves, index)?;
            p.artifact.proof = proof;
            p.artifact.leaf_index = index;
            p.artifact.checkpoint.count = count;
            p.artifact.checkpoint.root = root;
            p.artifact
                .checkpoint
                .sign(&ed25519_dalek::SigningKey::from_bytes(&[22; 32]));
            p.sign(&gate)?;
            vectors.push(p);
        }
    }
    fs::write(
        output.join("mmr-packages.json"),
        serde_json::to_vec_pretty(&vectors)?,
    )?;
    println!(
        "DEMO_EXPORTED wasm_result={value} package_sha256={}",
        hex::encode(hash(&fs::read(output.join("package.json"))?))
    );
    Ok(())
}
