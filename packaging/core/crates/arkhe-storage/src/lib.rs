//! Append-only directory of admission receipts.
//!
//! Replaying the same admission bytes returns the existing commit. A different
//! payload under the same admission id conflicts. Nothing here is an effect.

use arkhe_flow::{
    commit_body, empty_root, read_json, sign_body, write_json, Receipt, Secret, Trust, VerifyInput,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Chain {
    schema: String,
    root: String,
    entries: Vec<Entry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {
    index: u64,
    admission_id: String,
    admission_sha256: String,
    commit_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppendOutcome {
    pub replayed: bool,
    pub commit: Receipt,
}

pub fn append(dir: &Path, admission_path: &Path, secret: &Secret, trust: &Trust) -> anyhow::Result<AppendOutcome> {
    let bytes = fs::read(admission_path)?;
    let admission: Receipt = serde_json::from_slice(&bytes)?;
    let verdict = arkhe_flow::verify(VerifyInput {
        receipt: &admission,
        trust,
        expect_purpose: Some(&trust.purpose),
        subject_sha256: admission.body.get("subject_sha256").and_then(|value| value.as_str()),
        policy_sha256: admission.body.get("policy_sha256").and_then(|value| value.as_str()),
        admission_id: None,
        commit_id: None,
        artifact_sha256: None,
        model_sha256: None,
        data_sha256: None,
        pipeline_sha256: None,
        plan_sha256: None,
        output_sha256: None,
        action_id: None,
        invariant: None,
        expect_invariant: None,
        anchor_checkpoint: None,
        anchor_inclusion: None,
    });
    if verdict.overall != "PASS" || admission.body.get("kind").and_then(|value| value.as_str()) != Some("admission") {
        anyhow::bail!("admission did not verify against the supplied trust");
    }
    let digest = hex::encode(Sha256::digest(&bytes));
    let mut chain = load(dir)?;
    if let Some(existing) = chain.entries.iter().find(|entry| entry.admission_id == admission.id) {
        if existing.admission_sha256 != digest {
            anyhow::bail!("admission id already stored with different bytes");
        }
        return Ok(AppendOutcome {
            replayed: true,
            commit: read_json(&commit_path(dir, existing.index))?,
        });
    }
    let previous = chain.root.clone();
    let index = chain.entries.len() as u64;
    let commit = sign_body(secret, &commit_body(&admission.id, index, &previous)?)?;
    fs::create_dir_all(dir.join("leaves"))?;
    fs::create_dir_all(dir.join("commits"))?;
    let leaf = leaf_path(dir, index);
    fs::write(&leaf, &bytes)?;
    write_json(&commit_path(dir, index), &commit)?;
    chain.entries.push(Entry {
        index,
        admission_id: admission.id.clone(),
        admission_sha256: digest,
        commit_id: commit.id.clone(),
    });
    chain.root = commit.body["root"].as_str().unwrap().to_string();
    write_json(&dir.join("chain.json"), &chain)?;
    Ok(AppendOutcome { replayed: false, commit })
}

pub fn root_of(dir: &Path) -> anyhow::Result<String> {
    Ok(load(dir)?.root)
}

fn load(dir: &Path) -> anyhow::Result<Chain> {
    let path = dir.join("chain.json");
    if !path.exists() {
        return Ok(Chain {
            schema: "arkhe-storage/v1".to_string(),
            root: empty_root(),
            entries: Vec::new(),
        });
    }
    let chain: Chain = read_json(&path)?;
    if chain.schema != "arkhe-storage/v1" {
        anyhow::bail!("chain schema is not arkhe-storage/v1");
    }
    Ok(chain)
}

fn leaf_path(dir: &Path, index: u64) -> PathBuf {
    dir.join("leaves").join(format!("{index:06}.json"))
}

fn commit_path(dir: &Path, index: u64) -> PathBuf {
    dir.join("commits").join(format!("{index:06}.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use arkhe_flow::{emit_gate0, secret_from_seed, GATE0_STORAGE_SEED};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn replay_keeps_one_commit_and_conflict_fails() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let fixture = std::env::temp_dir().join(format!("arkhe-storage-fixture-{stamp}"));
        let dir = std::env::temp_dir().join(format!("arkhe-storage-{stamp}"));
        emit_gate0(&fixture).unwrap();
        let trust = read_json(&fixture.join("trust.json")).unwrap();
        let secret = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
        let first = append(&dir, &fixture.join("admission.json"), &secret, &trust).unwrap();
        assert!(!first.replayed);
        let second = append(&dir, &fixture.join("admission.json"), &secret, &trust).unwrap();
        assert!(second.replayed);
        assert_eq!(first.commit.id, second.commit.id);
        assert_eq!(root_of(&dir).unwrap(), first.commit.body["root"].as_str().unwrap());

        let mut tampered = fs::read(fixture.join("admission.json")).unwrap();
        tampered.push(b' ');
        let bad = fixture.join("admission-bad.json");
        fs::write(&bad, tampered).unwrap();
        assert!(append(&dir, &bad, &secret, &trust).is_err());
        let _ = fs::remove_dir_all(&fixture);
        let _ = fs::remove_dir_all(&dir);
    }
}
