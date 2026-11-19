//! Portable receipts for the packaged core.
//!
//! A receipt is a signed statement. Verifying it recomputes the statement
//! from the bytes the caller supplies. It does not apply an effect, and it
//! does not talk to PostgreSQL.

use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub const RECEIPT_SCHEMA: &str = "arkhe-receipt/v1";
pub const TRUST_SCHEMA: &str = "arkhe-trust/v1";
pub const SECRET_SCHEMA: &str = "arkhe-secret/v1";
pub const VERDICT_SCHEMA: &str = "arkhe-verdict/v1";
pub const DOMAIN: &[u8] = b"ARKHE-RECEIPT-V1\n";

pub const GATE0_FLOW_SEED: [u8; 32] = [0x01; 32];
pub const GATE0_STORAGE_SEED: [u8; 32] = [0x02; 32];
pub const GATE0_ANCHOR_SEED: [u8; 32] = [0x03; 32];
/// Not written into the published Gate 0 fixture: `emit_gate0` stays a
/// three-role trust, so a verdict only discharges against a roster that
/// deliberately lists the invariant role.
pub const GATE0_INVARIANT_SEED: [u8; 32] = [0x04; 32];
pub const GATE0_PURPOSE: &str = "gate0-lab";
pub const GATE0_SUBJECT: &[u8] = b"gate0-subject";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Secret {
    pub schema: String,
    pub role: String,
    pub seed_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Trust {
    pub schema: String,
    pub purpose: String,
    pub keys: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub schema: String,
    pub id: String,
    pub body: Value,
    pub signer: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Verdict {
    pub schema: String,
    pub receipt_id: String,
    pub kind: String,
    pub overall: String,
    pub components: BTreeMap<String, String>,
    pub persistence: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

impl Verdict {
    pub fn exit_code(&self) -> i32 {
        match self.overall.as_str() {
            "PASS" => 0,
            "INCONCLUSIVE" => 2,
            _ => 1,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VerifyInput<'a> {
    pub receipt: &'a Receipt,
    pub trust: &'a Trust,
    pub expect_purpose: Option<&'a str>,
    pub subject_sha256: Option<&'a str>,
    pub policy_sha256: Option<&'a str>,
    pub admission_id: Option<&'a str>,
    pub commit_id: Option<&'a str>,
    pub artifact_sha256: Option<&'a str>,
    pub model_sha256: Option<&'a str>,
    pub data_sha256: Option<&'a str>,
    pub pipeline_sha256: Option<&'a str>,
    pub plan_sha256: Option<&'a str>,
    pub output_sha256: Option<&'a str>,
    /// The agent-action receipt id a verdict receipt claims to be about.
    pub action_id: Option<&'a str>,
    /// A signed invariant verdict offered to discharge the axiom.
    pub invariant: Option<&'a Receipt>,
    /// The invariant id the caller requires. Without it nothing discharges.
    pub expect_invariant: Option<&'a str>,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn canonical(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(true) => "true".to_string(),
        Value::Bool(false) => "false".to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => serde_json::to_string(text).expect("string"),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().map(canonical).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|key| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(key).expect("key"),
                        canonical(&map[key])
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

pub const MERKLE_PROFILE: &str = "arkhe-storage-merkle/v1";
pub const LLM_OUTPUT_UNVERIFIED: &str = "llm_output_unverified";

pub fn artifact_statement(artifact: &str, model: &str, data: &str, pipeline: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"arkhe-storage-leaf/v1\n");
    hasher.update(artifact.as_bytes());
    hasher.update(b"\n");
    hasher.update(model.as_bytes());
    hasher.update(b"\n");
    hasher.update(data.as_bytes());
    hasher.update(b"\n");
    hasher.update(pipeline.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn merkle_leaf_node(statement: &str) -> String {
    labeled_sha("leaf", statement, "")
}

pub fn prove_merkle(statements: &[String], index: usize) -> anyhow::Result<(String, Vec<String>)> {
    if statements.is_empty() || index >= statements.len() {
        anyhow::bail!("merkle index is outside the leaves");
    }
    let mut level: Vec<String> = statements.iter().map(|statement| merkle_leaf_node(statement)).collect();
    let mut cursor = index;
    let mut proof = Vec::new();
    while level.len() > 1 {
        if cursor % 2 == 1 {
            proof.push(format!("L:{}", level[cursor - 1]));
        } else if cursor + 1 < level.len() {
            proof.push(format!("R:{}", level[cursor + 1]));
        }
        let mut next = Vec::new();
        let mut pair = 0;
        while pair < level.len() {
            if pair + 1 == level.len() {
                next.push(level[pair].clone());
            } else {
                next.push(labeled_sha("node", &level[pair], &level[pair + 1]));
            }
            pair += 2;
        }
        cursor /= 2;
        level = next;
    }
    Ok((level[0].clone(), proof))
}

pub fn fold_merkle(statement: &str, index: u64, proof: &[String]) -> anyhow::Result<String> {
    let mut acc = merkle_leaf_node(statement);
    let mut cursor = index;
    for step in proof {
        let (side, sibling) = step.split_once(':').ok_or_else(|| anyhow::anyhow!("merkle proof step is malformed"))?;
        if !is_hex64(sibling) || (side != "L" && side != "R") {
            anyhow::bail!("merkle proof step is malformed");
        }
        let sibling_is_left = cursor % 2 == 1;
        if (side == "L") != sibling_is_left {
            anyhow::bail!("merkle proof side does not match the index");
        }
        acc = if side == "L" {
            labeled_sha("node", sibling, &acc)
        } else {
            labeled_sha("node", &acc, sibling)
        };
        cursor /= 2;
    }
    Ok(acc)
}

fn labeled_sha(label: &str, left: &str, right: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update(b"\n");
    hasher.update(left.as_bytes());
    if !right.is_empty() || label == "node" {
        hasher.update(b"\n");
        hasher.update(right.as_bytes());
    }
    hex::encode(hasher.finalize())
}

pub fn artifact_body(
    artifact: &str,
    model: &str,
    data: &str,
    pipeline: &str,
    leaf_index: u64,
    merkle_root: &str,
    proof: &[String],
) -> anyhow::Result<Value> {
    for digest in [artifact, model, data, pipeline, merkle_root] {
        if !is_hex64(digest) {
            anyhow::bail!("artifact digest must be 64 lowercase hex characters");
        }
    }
    Ok(serde_json::json!({
        "artifact_sha256": artifact,
        "data_sha256": data,
        "issuer": "storage",
        "kind": "artifact",
        "leaf_index": leaf_index,
        "merkle_profile": MERKLE_PROFILE,
        "merkle_proof": proof,
        "merkle_root": merkle_root,
        "model_sha256": model,
        "pipeline_sha256": pipeline,
    }))
}

pub fn agent_action_body(plan: &str, output: &str, model: &str, agent_id: &str) -> anyhow::Result<Value> {
    for digest in [plan, output, model] {
        if !is_hex64(digest) {
            anyhow::bail!("agent action digest must be 64 lowercase hex characters");
        }
    }
    if agent_id.is_empty() || agent_id.len() > 128 {
        anyhow::bail!("agent id must be 1 to 128 bytes");
    }
    Ok(serde_json::json!({
        "agent_id": agent_id,
        "axiom": LLM_OUTPUT_UNVERIFIED,
        "issuer": "flow",
        "kind": "agent-action",
        "model_sha256": model,
        "output_sha256": output,
        "plan_sha256": plan,
    }))
}

/// A signed invariant verdict over one agent action.
///
/// This is the receipt that can discharge `llm_output_unverified`. It is a
/// separate statement by a separate role: the axiom on the agent action is
/// never rewritten, because the agent must not be able to clear itself.
/// `action_id` is the receipt id of the agent action, which is the hash of its
/// signed body, so naming it binds that plan, output, model and agent id at
/// once. `output_sha256` repeats the output the invariant read; `verify`
/// checks that repetition rather than trusting it.
///
/// `held: false` is a legitimate receipt. A refused run is worth signing, and
/// a verdict that did not hold discharges nothing.
pub fn invariant_body(
    action_id: &str,
    output: &str,
    invariant_id: &str,
    invariant_version: &str,
    held: bool,
) -> anyhow::Result<Value> {
    for digest in [action_id, output] {
        if !is_hex64(digest) {
            anyhow::bail!("invariant verdict digest must be 64 lowercase hex characters");
        }
    }
    for name in [invariant_id, invariant_version] {
        if name.is_empty() || name.len() > 128 {
            anyhow::bail!("invariant id and version must be 1 to 128 bytes");
        }
    }
    Ok(serde_json::json!({
        "action_id": action_id,
        "held": held,
        "invariant_id": invariant_id,
        "invariant_version": invariant_version,
        "issuer": "invariant",
        "kind": "invariant",
        "output_sha256": output,
    }))
}

pub fn commit_root(previous_root: &str, admission_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(previous_root.as_bytes());
    hasher.update(b"\n");
    hasher.update(admission_id.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn empty_root() -> String {
    "0".repeat(64)
}

pub fn policy_bytes() -> Vec<u8> {
    let policy = serde_json::json!({
        "effect": "none",
        "schema": "arkhe-policy/v1"
    });
    canonical(&policy).into_bytes()
}

fn signed_preimage(body: &Value) -> Vec<u8> {
    let mut message = DOMAIN.to_vec();
    message.extend(canonical(body).into_bytes());
    message
}

fn receipt_id(body: &Value) -> String {
    sha256_hex(&signed_preimage(body))
}

pub fn generate_secret(role: &str) -> anyhow::Result<Secret> {
    check_role(role)?;
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let key = SigningKey::from_bytes(&seed);
    Ok(Secret {
        schema: SECRET_SCHEMA.to_string(),
        role: role.to_string(),
        seed_hex: hex::encode(key.to_bytes()),
    })
}

pub fn secret_from_seed(role: &str, seed: [u8; 32]) -> anyhow::Result<Secret> {
    check_role(role)?;
    Ok(Secret {
        schema: SECRET_SCHEMA.to_string(),
        role: role.to_string(),
        seed_hex: hex::encode(seed),
    })
}

pub fn public_hex(secret: &Secret) -> anyhow::Result<String> {
    Ok(hex::encode(signing_key(secret)?.verifying_key().to_bytes()))
}

pub fn trust_from_secrets(purpose: &str, secrets: &[Secret]) -> anyhow::Result<Trust> {
    if purpose.is_empty() || purpose.len() > 64 {
        anyhow::bail!("purpose must be 1 to 64 bytes");
    }
    let mut keys = BTreeMap::new();
    for secret in secrets {
        if keys.insert(secret.role.clone(), public_hex(secret)?).is_some() {
            anyhow::bail!("duplicate role {}", secret.role);
        }
    }
    for role in ["flow", "storage", "anchor"] {
        if !keys.contains_key(role) {
            anyhow::bail!("trust is missing the {role} key");
        }
    }
    Ok(Trust {
        schema: TRUST_SCHEMA.to_string(),
        purpose: purpose.to_string(),
        keys,
    })
}

pub fn sign_body(secret: &Secret, body: &Value) -> anyhow::Result<Receipt> {
    validate_body(body)?;
    let issuer = body
        .get("issuer")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("issuer missing"))?;
    if issuer != secret.role {
        anyhow::bail!("secret role {} cannot sign issuer {issuer}", secret.role);
    }
    let key = signing_key(secret)?;
    let signature = key.sign(&signed_preimage(body));
    Ok(Receipt {
        schema: RECEIPT_SCHEMA.to_string(),
        id: receipt_id(body),
        body: body.clone(),
        signer: hex::encode(key.verifying_key().to_bytes()),
        signature: hex::encode(signature.to_bytes()),
    })
}

pub fn admission_body(
    tenant: &str,
    operation: &str,
    subject_sha256: &str,
    policy_sha256: &str,
) -> anyhow::Result<Value> {
    if tenant.is_empty() || tenant.len() > 128 || operation.is_empty() || operation.len() > 128 {
        anyhow::bail!("tenant and operation must be 1 to 128 bytes");
    }
    if !is_hex64(subject_sha256) || !is_hex64(policy_sha256) {
        anyhow::bail!("subject and policy digests must be 64 lowercase hex characters");
    }
    Ok(serde_json::json!({
        "issuer": "flow",
        "kind": "admission",
        "operation": operation,
        "policy_sha256": policy_sha256,
        "subject_sha256": subject_sha256,
        "tenant": tenant,
    }))
}

pub fn commit_body(admission_id: &str, leaf_index: u64, previous_root: &str) -> anyhow::Result<Value> {
    if !is_hex64(admission_id) || !is_hex64(previous_root) {
        anyhow::bail!("admission id and previous root must be 64 lowercase hex characters");
    }
    if leaf_index > 1_000_000 {
        anyhow::bail!("leaf index is out of range");
    }
    let root = commit_root(previous_root, admission_id);
    Ok(serde_json::json!({
        "admission_id": admission_id,
        "issuer": "storage",
        "kind": "commit",
        "leaf_index": leaf_index,
        "previous_root": previous_root,
        "root": root,
    }))
}

pub fn anchor_body(commit_id: &str, transport: &str, reference: &str, observed: &str) -> anyhow::Result<Value> {
    if !is_hex64(commit_id) {
        anyhow::bail!("commit id must be 64 lowercase hex characters");
    }
    if transport.is_empty() || transport.len() > 64 || reference.len() > 256 {
        anyhow::bail!("transport or reference is out of range");
    }
    if observed != "pending" && observed != "confirmed" {
        anyhow::bail!("observed must be pending or confirmed");
    }
    Ok(serde_json::json!({
        "commit_id": commit_id,
        "issuer": "anchor",
        "kind": "anchor",
        "observed": observed,
        "reference": reference,
        "transport": transport,
    }))
}

pub fn verify(input: VerifyInput<'_>) -> Verdict {
    let mut components = base_components();
    let mut notes = Vec::new();
    let kind = input
        .receipt
        .body
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if input.receipt.schema != RECEIPT_SCHEMA {
        components.insert("schema".into(), "FAIL".into());
        notes.push("receipt schema is not arkhe-receipt/v1".into());
        return finish(input.receipt, &kind, components, notes);
    }
    if let Err(error) = validate_body(&input.receipt.body) {
        components.insert("schema".into(), "FAIL".into());
        notes.push(error.to_string());
        return finish(input.receipt, &kind, components, notes);
    }
    let expected_id = receipt_id(&input.receipt.body);
    if expected_id != input.receipt.id {
        components.insert("schema".into(), "FAIL".into());
        notes.push("receipt id is not the hash of the signed body".into());
        return finish(input.receipt, &kind, components, notes);
    }
    components.insert("schema".into(), "PASS".into());

    match check_signature(input.receipt) {
        Ok(()) => {
            components.insert("signature".into(), "PASS".into());
        }
        Err(error) => {
            components.insert("signature".into(), "FAIL".into());
            notes.push(error);
            return finish(input.receipt, &kind, components, notes);
        }
    }

    match check_signer(input.receipt, input.trust) {
        Ok(()) => {
            components.insert("signer".into(), "PASS".into());
        }
        Err(error) => {
            components.insert("signer".into(), "FAIL".into());
            notes.push(error);
            return finish(input.receipt, &kind, components, notes);
        }
    }

    match input.expect_purpose {
        Some(purpose) if purpose == input.trust.purpose && input.trust.schema == TRUST_SCHEMA => {
            components.insert("purpose".into(), "PASS".into());
        }
        Some(_) => {
            components.insert("purpose".into(), "FAIL".into());
            notes.push("trust purpose or schema does not match the expected value".into());
        }
        None => {
            components.insert("purpose".into(), "NOT_PERFORMED".into());
            notes.push("caller did not name the trust purpose".into());
        }
    }

    match kind.as_str() {
        "admission" => check_admission(&input, &mut components, &mut notes),
        "commit" => check_commit(&input, &mut components, &mut notes),
        "anchor" => check_anchor(&input, &mut components, &mut notes),
        "artifact" => check_artifact(&input, &mut components, &mut notes),
        "agent-action" => check_agent_action(&input, &mut components, &mut notes),
        "invariant" => check_invariant(&input, &mut components, &mut notes),
        _ => {
            components.insert("schema".into(), "FAIL".into());
            notes.push("unknown kind".into());
        }
    }
    finish(input.receipt, &kind, components, notes)
}

pub fn write_json(path: &Path, value: &impl Serialize) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(value)? + "\n";
    fs::write(path, text)?;
    Ok(())
}

pub fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> anyhow::Result<T> {
    let bytes = fs::read(path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

pub fn emit_gate0(out: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(out)?;
    let flow = secret_from_seed("flow", GATE0_FLOW_SEED)?;
    let storage = secret_from_seed("storage", GATE0_STORAGE_SEED)?;
    let anchor = secret_from_seed("anchor", GATE0_ANCHOR_SEED)?;
    let trust = trust_from_secrets(GATE0_PURPOSE, &[flow.clone(), storage.clone(), anchor.clone()])?;
    let subject_path = out.join("subject.bin");
    let policy = policy_bytes();
    fs::write(&subject_path, GATE0_SUBJECT)?;
    fs::write(out.join("policy.json"), &policy)?;
    write_json(&out.join("trust.json"), &trust)?;

    let admission = sign_body(
        &flow,
        &admission_body(
            "gate0",
            "record",
            &sha256_hex(GATE0_SUBJECT),
            &sha256_hex(&policy),
        )?,
    )?;
    write_json(&out.join("admission.json"), &admission)?;

    let commit = sign_body(
        &storage,
        &commit_body(&admission.id, 0, &empty_root())?,
    )?;
    write_json(&out.join("commit.json"), &commit)?;

    let anchor_receipt = sign_body(
        &anchor,
        &anchor_body(&commit.id, "none", "", "pending")?,
    )?;
    write_json(&out.join("anchor.json"), &anchor_receipt)?;
    Ok(())
}

fn check_admission(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    bind_hash(
        "subject",
        input.receipt.body.get("subject_sha256").and_then(Value::as_str),
        input.subject_sha256,
        components,
        notes,
        "subject file was not supplied",
    );
    bind_hash(
        "policy",
        input.receipt.body.get("policy_sha256").and_then(Value::as_str),
        input.policy_sha256,
        components,
        notes,
        "policy file was not supplied",
    );
}

fn check_commit(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    let previous = input.receipt.body.get("previous_root").and_then(Value::as_str).unwrap_or("");
    let admission = input.receipt.body.get("admission_id").and_then(Value::as_str).unwrap_or("");
    let stated = input.receipt.body.get("root").and_then(Value::as_str).unwrap_or("");
    if stated == commit_root(previous, admission) {
        components.insert("recompute".into(), "PASS".into());
    } else {
        components.insert("recompute".into(), "FAIL".into());
        notes.push("storage root does not match the recomputed preimage".into());
    }
    match input.admission_id {
        Some(linked) if linked == admission => {
            components.insert("binding".into(), "PASS".into());
        }
        Some(_) => {
            components.insert("binding".into(), "FAIL".into());
            notes.push("linked admission id does not match the commit".into());
        }
        None => {
            components.insert("binding".into(), "NOT_PERFORMED".into());
            notes.push("admission receipt was not supplied".into());
        }
    }
}

fn check_anchor(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    let commit = input.receipt.body.get("commit_id").and_then(Value::as_str).unwrap_or("");
    let transport = input.receipt.body.get("transport").and_then(Value::as_str).unwrap_or("");
    let observed = input.receipt.body.get("observed").and_then(Value::as_str).unwrap_or("");
    match input.commit_id {
        Some(linked) if linked == commit => {
            components.insert("binding".into(), "PASS".into());
        }
        Some(_) => {
            components.insert("binding".into(), "FAIL".into());
            notes.push("linked commit id does not match the anchor".into());
        }
        None => {
            components.insert("binding".into(), "NOT_PERFORMED".into());
            notes.push("commit receipt was not supplied".into());
        }
    }
    if transport == "none" && observed == "confirmed" {
        components.insert("anchor".into(), "FAIL".into());
        notes.push("transport none cannot be observed as confirmed".into());
        return;
    }
    if observed == "pending" || observed == "confirmed" {
        components.insert("anchor".into(), "INCONCLUSIVE".into());
        notes.push(
            "this package has no external anchor client; pending and unconfirmed transports stay inconclusive"
                .into(),
        );
        return;
    }
    components.insert("anchor".into(), "FAIL".into());
    notes.push("observed state is not pending or confirmed".into());
}

/// Internal recomputation, then the bindings to the files in hand.
///
/// The leaf is rebuilt from the four digests the receipt states and the proof
/// must fold to the stated root: that is the part no caller input can affect.
/// The four `bind_hash` components are what tie those digests to bytes the
/// caller actually holds, and they stay `NOT_PERFORMED` when nothing was
/// supplied, so a receipt verified without its files cannot read as PASS.
fn check_artifact(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    let body = &input.receipt.body;
    let stated = |key: &str| body.get(key).and_then(Value::as_str).unwrap_or("");
    for (name, key, supplied, missing) in [
        ("artifact", "artifact_sha256", input.artifact_sha256, "artifact file was not supplied"),
        ("model", "model_sha256", input.model_sha256, "model manifest was not supplied"),
        ("data", "data_sha256", input.data_sha256, "data manifest was not supplied"),
        ("pipeline", "pipeline_sha256", input.pipeline_sha256, "pipeline manifest was not supplied"),
    ] {
        bind_hash(name, Some(stated(key)), supplied, components, notes, missing);
    }

    let statement = artifact_statement(
        stated("artifact_sha256"),
        stated("model_sha256"),
        stated("data_sha256"),
        stated("pipeline_sha256"),
    );
    let index = body.get("leaf_index").and_then(Value::as_u64).unwrap_or(u64::MAX);
    let proof: Vec<String> = body
        .get("merkle_proof")
        .and_then(Value::as_array)
        .map(|steps| steps.iter().filter_map(Value::as_str).map(str::to_owned).collect())
        .unwrap_or_default();
    match fold_merkle(&statement, index, &proof) {
        Ok(folded) if folded == stated("merkle_root") => {
            components.insert("merkle".into(), "PASS".into());
        }
        Ok(_) => {
            components.insert("merkle".into(), "FAIL".into());
            notes.push("merkle proof does not fold to the stated root".into());
        }
        Err(error) => {
            components.insert("merkle".into(), "FAIL".into());
            notes.push(error.to_string());
        }
    }
}

/// An agent action is a signed statement about a model output. It can bind the
/// plan, the output and the model manifest to bytes in hand, and it can be
/// linked to the artifact storage committed. It can never reach PASS.
///
/// `validate_body` has already rejected any agent-action body that does not
/// carry `llm_output_unverified`, so reaching here means the receipt carries
/// it. Nothing in this package discharges that axiom: there is no invariant
/// checker here. So `llm_output` is `INCONCLUSIVE` by construction, the same
/// way `anchor` is inconclusive while no anchor client exists. A signed agent
/// action is signed, not verified, and the verdict says so.
fn check_agent_action(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    let body = &input.receipt.body;
    let stated = |key: &str| body.get(key).and_then(Value::as_str).unwrap_or("");
    for (name, key, supplied, missing) in [
        ("plan", "plan_sha256", input.plan_sha256, "plan was not supplied"),
        ("output", "output_sha256", input.output_sha256, "agent output was not supplied"),
        ("model", "model_sha256", input.model_sha256, "model manifest was not supplied"),
    ] {
        bind_hash(name, Some(stated(key)), supplied, components, notes, missing);
    }

    match discharge(input, stated("output_sha256")) {
        Discharge::Verified(invariant_id) => {
            components.insert("llm_output".into(), "PASS".into());
            notes.push(format!(
                "{LLM_OUTPUT_UNVERIFIED} discharged by a signed verdict from invariant {invariant_id}"
            ));
        }
        Discharge::Refused(reason) => {
            components.insert("llm_output".into(), "FAIL".into());
            notes.push(format!("invariant verdict refused: {reason}"));
        }
        Discharge::Absent(reason) => {
            components.insert("llm_output".into(), "INCONCLUSIVE".into());
            notes.push(reason);
        }
    }

    match input.artifact_sha256 {
        Some(artifact) if artifact == stated("output_sha256") && is_hex64(artifact) => {
            components.insert("produced".into(), "PASS".into());
        }
        Some(_) => {
            components.insert("produced".into(), "FAIL".into());
            notes.push("committed artifact digest is not the output this agent action signed".into());
        }
        None => {
            components.insert("produced".into(), "NOT_PERFORMED".into());
            notes.push("no committed artifact digest was supplied to link this action to storage".into());
        }
    }
}

/// A verdict receipt on its own: what it says, bound to what the caller holds.
///
/// `expect_invariant` is not consulted here. Whether this is the *right*
/// invariant is a question about the action it discharges, and it is asked
/// there, in `check_agent_action`.
fn check_invariant(input: &VerifyInput<'_>, components: &mut BTreeMap<String, String>, notes: &mut Vec<String>) {
    let body = &input.receipt.body;
    let stated = |key: &str| body.get(key).and_then(Value::as_str).unwrap_or("");
    bind_hash(
        "output",
        Some(stated("output_sha256")),
        input.output_sha256,
        components,
        notes,
        "agent output was not supplied",
    );
    match input.action_id {
        Some(action) if action == stated("action_id") => {
            components.insert("binding".into(), "PASS".into());
        }
        Some(_) => {
            components.insert("binding".into(), "FAIL".into());
            notes.push("linked agent action id does not match this verdict".into());
        }
        None => {
            components.insert("binding".into(), "NOT_PERFORMED".into());
            notes.push("agent action receipt was not supplied".into());
        }
    }
    if body.get("held").and_then(Value::as_bool) == Some(true) {
        components.insert("held".into(), "PASS".into());
    } else {
        components.insert("held".into(), "FAIL".into());
        notes.push("invariant did not hold; this output needs a human".into());
    }
}

/// Why the axiom was or was not discharged.
enum Discharge {
    /// A verdict bound this action, held, and is the invariant the caller named.
    Verified(String),
    /// A verdict was offered and does not do the job. Loud, not silent.
    Refused(String),
    /// No verdict, or no invariant named. Nothing was checked either way.
    Absent(String),
}

/// Every step is a reason to refuse. The order matters only in what the note
/// says; any single failure leaves the axiom standing.
///
/// Note what is *not* here: no judgement about whether this invariant is an
/// adequate test of the task. `expect_invariant` pushes that question back to
/// the caller, the same way `expect_purpose` does for the trust roster. A
/// caller who names no invariant gets `INCONCLUSIVE`, never `PASS`.
fn discharge(input: &VerifyInput<'_>, action_output: &str) -> Discharge {
    let Some(verdict) = input.invariant else {
        return Discharge::Absent(format!(
            "receipt carries {LLM_OUTPUT_UNVERIFIED} and no invariant verdict was supplied, so the output is signed, not verified"
        ));
    };
    let Some(expected) = input.expect_invariant else {
        return Discharge::Absent(
            "a verdict was supplied but the caller did not name the invariant this action must satisfy".into(),
        );
    };
    if verdict.schema != RECEIPT_SCHEMA {
        return Discharge::Refused("invariant verdict schema is not arkhe-receipt/v1".into());
    }
    if let Err(error) = validate_body(&verdict.body) {
        return Discharge::Refused(format!("invariant verdict body is malformed: {error}"));
    }
    if verdict.body.get("kind").and_then(Value::as_str) != Some("invariant") {
        return Discharge::Refused("the supplied receipt is not an invariant verdict".into());
    }
    if receipt_id(&verdict.body) != verdict.id {
        return Discharge::Refused("invariant verdict id is not the hash of its signed body".into());
    }
    if let Err(error) = check_signature(verdict) {
        return Discharge::Refused(format!("invariant verdict signature: {error}"));
    }
    if let Err(error) = check_signer(verdict, input.trust) {
        return Discharge::Refused(format!("invariant verdict signer: {error}"));
    }
    let stated = |key: &str| verdict.body.get(key).and_then(Value::as_str).unwrap_or("");
    if stated("action_id") != input.receipt.id {
        return Discharge::Refused("invariant verdict is about another agent action".into());
    }
    if stated("output_sha256") != action_output {
        return Discharge::Refused("invariant verdict checked another output".into());
    }
    if verdict.body.get("held").and_then(Value::as_bool) != Some(true) {
        return Discharge::Refused("invariant did not hold".into());
    }
    if stated("invariant_id") != expected {
        return Discharge::Refused(format!(
            "verdict is from invariant {} and the caller requires {expected}",
            stated("invariant_id")
        ));
    }
    Discharge::Verified(stated("invariant_id").to_string())
}

fn bind_hash(
    name: &str,
    stated: Option<&str>,
    supplied: Option<&str>,
    components: &mut BTreeMap<String, String>,
    notes: &mut Vec<String>,
    missing: &str,
) {
    match (stated, supplied) {
        (Some(stated), Some(supplied)) if stated == supplied && is_hex64(supplied) => {
            components.insert(name.into(), "PASS".into());
        }
        (_, Some(_)) => {
            components.insert(name.into(), "FAIL".into());
            notes.push(format!("{name} digest does not match the receipt"));
        }
        (_, None) => {
            components.insert(name.into(), "NOT_PERFORMED".into());
            notes.push(missing.into());
        }
    }
}

fn finish(receipt: &Receipt, kind: &str, components: BTreeMap<String, String>, notes: Vec<String>) -> Verdict {
    let overall = if components.values().any(|value| value == "FAIL") {
        "FAIL"
    } else if components
        .values()
        .any(|value| value == "INCONCLUSIVE" || value == "NOT_PERFORMED")
    {
        "INCONCLUSIVE"
    } else {
        "PASS"
    };
    Verdict {
        schema: VERDICT_SCHEMA.to_string(),
        receipt_id: receipt.id.clone(),
        kind: kind.to_string(),
        overall: overall.to_string(),
        components,
        persistence: "NOT_PERFORMED".to_string(),
        notes,
    }
}

fn base_components() -> BTreeMap<String, String> {
    let mut components = BTreeMap::new();
    for name in [
        "anchor", "artifact", "binding", "data", "held", "llm_output", "merkle", "model", "pipeline", "plan", "policy",
        "produced", "purpose", "output", "recompute", "schema", "signature", "signer", "subject",
    ] {
        components.insert(name.to_string(), "NOT_APPLICABLE".to_string());
    }
    components
}

fn check_signature(receipt: &Receipt) -> Result<(), String> {
    let signer = decode_key(&receipt.signer).map_err(|error| error.to_string())?;
    let bytes = hex::decode(&receipt.signature).map_err(|_| "signature is not hex".to_string())?;
    let signature = ed25519_dalek::Signature::from_slice(&bytes).map_err(|_| "signature length".to_string())?;
    signer
        .verify(&signed_preimage(&receipt.body), &signature)
        .map_err(|_| "signature does not verify under the signer key".to_string())
}

fn check_signer(receipt: &Receipt, trust: &Trust) -> Result<(), String> {
    if trust.schema != TRUST_SCHEMA {
        return Err("trust schema is not arkhe-trust/v1".into());
    }
    let issuer = receipt
        .body
        .get("issuer")
        .and_then(Value::as_str)
        .ok_or_else(|| "issuer missing".to_string())?;
    let expected = trust
        .keys
        .get(issuer)
        .ok_or_else(|| format!("trust has no key for {issuer}"))?;
    if expected != &receipt.signer || !is_hex64(expected) {
        return Err("signer is not the trusted key for this issuer".into());
    }
    Ok(())
}

fn validate_body(body: &Value) -> anyhow::Result<()> {
    let map = body.as_object().ok_or_else(|| anyhow::anyhow!("body must be an object"))?;
    let kind = required_str(map, "kind")?;
    let issuer = required_str(map, "issuer")?;
    match kind {
        "admission" => {
            require_keys(map, &["issuer", "kind", "operation", "policy_sha256", "subject_sha256", "tenant"])?;
            if issuer != "flow" {
                anyhow::bail!("admission issuer must be flow");
            }
            let tenant = required_str(map, "tenant")?;
            let operation = required_str(map, "operation")?;
            if tenant.is_empty() || tenant.len() > 128 || operation.is_empty() || operation.len() > 128 {
                anyhow::bail!("tenant or operation is out of range");
            }
            require_hex(map, "subject_sha256")?;
            require_hex(map, "policy_sha256")?;
        }
        "commit" => {
            require_keys(map, &["admission_id", "issuer", "kind", "leaf_index", "previous_root", "root"])?;
            if issuer != "storage" {
                anyhow::bail!("commit issuer must be storage");
            }
            require_hex(map, "admission_id")?;
            require_hex(map, "previous_root")?;
            require_hex(map, "root")?;
            let index = map
                .get("leaf_index")
                .and_then(Value::as_u64)
                .ok_or_else(|| anyhow::anyhow!("leaf_index must be an integer"))?;
            if index > 1_000_000 {
                anyhow::bail!("leaf index is out of range");
            }
        }
        "anchor" => {
            require_keys(map, &["commit_id", "issuer", "kind", "observed", "reference", "transport"])?;
            if issuer != "anchor" {
                anyhow::bail!("anchor issuer must be anchor");
            }
            require_hex(map, "commit_id")?;
            let transport = required_str(map, "transport")?;
            let reference = required_str(map, "reference")?;
            let observed = required_str(map, "observed")?;
            if transport.is_empty() || transport.len() > 64 || reference.len() > 256 {
                anyhow::bail!("transport or reference is out of range");
            }
            if observed != "pending" && observed != "confirmed" {
                anyhow::bail!("observed must be pending or confirmed");
            }
        }
        "artifact" => {
            require_keys(map, &[
                "artifact_sha256", "data_sha256", "issuer", "kind", "leaf_index", "merkle_profile", "merkle_proof",
                "merkle_root", "model_sha256", "pipeline_sha256",
            ])?;
            if issuer != "storage" {
                anyhow::bail!("artifact issuer must be storage");
            }
            for key in ["artifact_sha256", "data_sha256", "merkle_root", "model_sha256", "pipeline_sha256"] {
                require_hex(map, key)?;
            }
            if required_str(map, "merkle_profile")? != MERKLE_PROFILE {
                anyhow::bail!("merkle profile is not arkhe-storage-merkle/v1");
            }
            let index = map.get("leaf_index").and_then(Value::as_u64).ok_or_else(|| anyhow::anyhow!("leaf_index must be an integer"))?;
            if index > 1_000_000 {
                anyhow::bail!("leaf index is out of range");
            }
            let proof = map.get("merkle_proof").and_then(Value::as_array).ok_or_else(|| anyhow::anyhow!("merkle proof must be an array"))?;
            for step in proof {
                let text = step.as_str().ok_or_else(|| anyhow::anyhow!("merkle proof step must be a string"))?;
                let sibling = text.strip_prefix("L:").or_else(|| text.strip_prefix("R:")).ok_or_else(|| anyhow::anyhow!("merkle proof step is malformed"))?;
                if !is_hex64(sibling) {
                    anyhow::bail!("merkle proof sibling is malformed");
                }
            }
        }
        "agent-action" => {
            require_keys(map, &["agent_id", "axiom", "issuer", "kind", "model_sha256", "output_sha256", "plan_sha256"])?;
            if issuer != "flow" {
                anyhow::bail!("agent action issuer must be flow");
            }
            if required_str(map, "axiom")? != LLM_OUTPUT_UNVERIFIED {
                anyhow::bail!("agent action must carry llm_output_unverified");
            }
            let agent = required_str(map, "agent_id")?;
            if agent.is_empty() || agent.len() > 128 {
                anyhow::bail!("agent id is out of range");
            }
            for key in ["model_sha256", "output_sha256", "plan_sha256"] {
                require_hex(map, key)?;
            }
        }
        "invariant" => {
            require_keys(map, &[
                "action_id", "held", "invariant_id", "invariant_version", "issuer", "kind", "output_sha256",
            ])?;
            if issuer != "invariant" {
                anyhow::bail!("invariant verdict issuer must be invariant");
            }
            require_hex(map, "action_id")?;
            require_hex(map, "output_sha256")?;
            if map.get("held").and_then(Value::as_bool).is_none() {
                anyhow::bail!("held must be a boolean");
            }
            for key in ["invariant_id", "invariant_version"] {
                let value = required_str(map, key)?;
                if value.is_empty() || value.len() > 128 {
                    anyhow::bail!("{key} is out of range");
                }
            }
        }
        _ => anyhow::bail!("unknown kind"),
    }
    Ok(())
}

fn require_keys(map: &Map<String, Value>, expected: &[&str]) -> anyhow::Result<()> {
    let mut actual: Vec<&str> = map.keys().map(String::as_str).collect();
    actual.sort_unstable();
    let mut wanted = expected.to_vec();
    wanted.sort_unstable();
    if actual != wanted {
        anyhow::bail!("body fields do not match the kind");
    }
    Ok(())
}

fn required_str<'a>(map: &'a Map<String, Value>, key: &str) -> anyhow::Result<&'a str> {
    map.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("{key} must be a string"))
}

fn require_hex(map: &Map<String, Value>, key: &str) -> anyhow::Result<()> {
    let value = required_str(map, key)?;
    if is_hex64(value) {
        Ok(())
    } else {
        anyhow::bail!("{key} must be 64 lowercase hex characters")
    }
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn check_role(role: &str) -> anyhow::Result<()> {
    if matches!(role, "flow" | "storage" | "anchor" | "invariant") {
        Ok(())
    } else {
        anyhow::bail!("role must be flow, storage, anchor, or invariant")
    }
}

fn signing_key(secret: &Secret) -> anyhow::Result<SigningKey> {
    if secret.schema != SECRET_SCHEMA {
        anyhow::bail!("secret schema is not arkhe-secret/v1");
    }
    check_role(&secret.role)?;
    let bytes = hex::decode(&secret.seed_hex)?;
    let bytes: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| anyhow::anyhow!("seed must be 32 bytes"))?;
    Ok(SigningKey::from_bytes(&bytes))
}

fn decode_key(hex_key: &str) -> anyhow::Result<VerifyingKey> {
    let bytes = hex::decode(hex_key)?;
    let bytes: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| anyhow::anyhow!("signer must be 32 bytes"))?;
    Ok(VerifyingKey::from_bytes(&bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn gate0() -> (Trust, Receipt, Receipt, Receipt) {
        let dir = std::env::temp_dir().join(format!(
            "arkhe-gate0-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        emit_gate0(&dir).unwrap();
        let trust = read_json(&dir.join("trust.json")).unwrap();
        let admission = read_json(&dir.join("admission.json")).unwrap();
        let commit = read_json(&dir.join("commit.json")).unwrap();
        let anchor = read_json(&dir.join("anchor.json")).unwrap();
        let _ = fs::remove_dir_all(&dir);
        (trust, admission, commit, anchor)
    }

    fn input<'a>(
        receipt: &'a Receipt,
        trust: &'a Trust,
        subject: Option<&'a str>,
        policy: Option<&'a str>,
        admission: Option<&'a str>,
        commit: Option<&'a str>,
    ) -> VerifyInput<'a> {
        VerifyInput {
            receipt,
            trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: subject,
            policy_sha256: policy,
            admission_id: admission,
            commit_id: commit,
            artifact_sha256: None,
            model_sha256: None,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: None,
            output_sha256: None,
            action_id: None,
            invariant: None,
            expect_invariant: None,
        }
    }

    #[test]
    fn three_receipts_recompute_without_secrets() {
        let (trust, admission, commit, anchor) = gate0();
        let subject = sha256_hex(GATE0_SUBJECT);
        let policy = sha256_hex(&policy_bytes());
        let admission_verdict = verify(input(&admission, &trust, Some(&subject), Some(&policy), None, None));
        assert_eq!(admission_verdict.overall, "PASS");
        assert_eq!(admission_verdict.exit_code(), 0);

        let commit_verdict = verify(input(&commit, &trust, None, None, Some(&admission.id), None));
        assert_eq!(commit_verdict.overall, "PASS");
        assert_eq!(commit_verdict.components["recompute"], "PASS");

        let anchor_verdict = verify(input(&anchor, &trust, None, None, None, Some(&commit.id)));
        assert_eq!(anchor_verdict.overall, "INCONCLUSIVE");
        assert_eq!(anchor_verdict.components["anchor"], "INCONCLUSIVE");
        assert_eq!(anchor_verdict.components["signature"], "PASS");
        assert_eq!(anchor_verdict.exit_code(), 2);
    }

    #[test]
    fn tampered_root_and_fabricated_anchor_fail() {
        let (trust, admission, mut commit, anchor) = gate0();
        let mut signature = hex::decode(&commit.signature).unwrap();
        signature[0] ^= 0xff;
        commit.signature = hex::encode(signature);
        let verdict = verify(input(&commit, &trust, None, None, Some(&admission.id), None));
        assert_eq!(verdict.components["signature"], "FAIL");

        let storage = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
        let mut body = commit_body(&admission.id, 0, &empty_root()).unwrap();
        body["root"] = Value::String("ab".repeat(32));
        let resigned = sign_body(&storage, &body).unwrap();
        let verdict = verify(input(&resigned, &trust, None, None, Some(&admission.id), None));
        assert_eq!(verdict.components["recompute"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");

        let anchor_secret = secret_from_seed("anchor", GATE0_ANCHOR_SEED).unwrap();
        let forged = sign_body(
            &anchor_secret,
            &anchor_body(anchor.body["commit_id"].as_str().unwrap(), "none", "", "confirmed").unwrap(),
        )
        .unwrap();
        let verdict = verify(input(&forged, &trust, None, None, None, Some(forged.body["commit_id"].as_str().unwrap())));
        assert_eq!(verdict.components["anchor"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
    }

    #[test]
    fn omitted_subject_stays_inconclusive() {
        let (trust, admission, _, _) = gate0();
        let policy = sha256_hex(&policy_bytes());
        let verdict = verify(input(&admission, &trust, None, Some(&policy), None, None));
        assert_eq!(verdict.components["subject"], "NOT_PERFORMED");
        assert_eq!(verdict.overall, "INCONCLUSIVE");
    }

    /// Three leaves, with the one under test at index 1, so the proof has both
    /// a left and a right step and a wrong index cannot pass by accident.
    fn leaves() -> (Vec<String>, [String; 4]) {
        let artifact = sha256_hex(b"artifact-bytes");
        let model = sha256_hex(b"model-manifest");
        let data = sha256_hex(b"data-manifest");
        let pipeline = sha256_hex(b"pipeline-manifest");
        let statements = vec![
            artifact_statement(&sha256_hex(b"other-artifact-1"), &model, &data, &pipeline),
            artifact_statement(&artifact, &model, &data, &pipeline),
            artifact_statement(&sha256_hex(b"other-artifact-2"), &model, &data, &pipeline),
        ];
        (statements, [artifact, model, data, pipeline])
    }

    fn artifact_receipt(digests: &[String; 4], statements: &[String], index: u64) -> Receipt {
        let storage = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
        let (root, proof) = prove_merkle(statements, 1).unwrap();
        let body = artifact_body(
            &digests[0], &digests[1], &digests[2], &digests[3], index, &root, &proof,
        )
        .unwrap();
        sign_body(&storage, &body).unwrap()
    }

    fn artifact_input<'a>(
        receipt: &'a Receipt,
        trust: &'a Trust,
        supplied: Option<&'a [String; 4]>,
    ) -> VerifyInput<'a> {
        VerifyInput {
            receipt,
            trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: supplied.map(|d| d[0].as_str()),
            model_sha256: supplied.map(|d| d[1].as_str()),
            data_sha256: supplied.map(|d| d[2].as_str()),
            pipeline_sha256: supplied.map(|d| d[3].as_str()),
            plan_sha256: None,
            output_sha256: None,
            action_id: None,
            invariant: None,
            expect_invariant: None,
        }
    }

    #[test]
    fn an_artifact_proof_folds_and_binds_the_files_in_hand() {
        let (trust, _, _, _) = gate0();
        let (statements, digests) = leaves();
        let receipt = artifact_receipt(&digests, &statements, 1);
        let verdict = verify(artifact_input(&receipt, &trust, Some(&digests)));
        assert_eq!(verdict.components["merkle"], "PASS");
        assert_eq!(verdict.components["artifact"], "PASS");
        assert_eq!(verdict.components["model"], "PASS");
        assert_eq!(verdict.components["data"], "PASS");
        assert_eq!(verdict.components["pipeline"], "PASS");
        assert_eq!(verdict.overall, "PASS");
        assert_eq!(verdict.exit_code(), 0);
    }

    #[test]
    fn a_resigned_root_does_not_fold() {
        let (trust, _, _, _) = gate0();
        let (statements, digests) = leaves();
        let storage = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
        let (_, proof) = prove_merkle(&statements, 1).unwrap();
        let body = artifact_body(
            &digests[0], &digests[1], &digests[2], &digests[3], 1, &"ab".repeat(32), &proof,
        )
        .unwrap();
        let receipt = sign_body(&storage, &body).unwrap();
        let verdict = verify(artifact_input(&receipt, &trust, Some(&digests)));
        assert_eq!(verdict.components["signature"], "PASS");
        assert_eq!(verdict.components["merkle"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
    }

    #[test]
    fn a_leaf_index_the_proof_contradicts_fails() {
        let (trust, _, _, _) = gate0();
        let (statements, digests) = leaves();
        // The proof is for index 1; the body claims index 0.
        let receipt = artifact_receipt(&digests, &statements, 0);
        let verdict = verify(artifact_input(&receipt, &trust, Some(&digests)));
        assert_eq!(verdict.components["merkle"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
    }

    #[test]
    fn an_artifact_without_its_files_stays_inconclusive() {
        let (trust, _, _, _) = gate0();
        let (statements, digests) = leaves();
        let receipt = artifact_receipt(&digests, &statements, 1);
        let verdict = verify(artifact_input(&receipt, &trust, None));
        assert_eq!(verdict.components["merkle"], "PASS");
        assert_eq!(verdict.components["artifact"], "NOT_PERFORMED");
        assert_eq!(verdict.overall, "INCONCLUSIVE");
        assert_eq!(verdict.exit_code(), 2);
    }

    #[test]
    fn a_substituted_artifact_fails_its_binding() {
        let (trust, _, _, _) = gate0();
        let (statements, digests) = leaves();
        let receipt = artifact_receipt(&digests, &statements, 1);
        let other = [
            sha256_hex(b"different-bytes"),
            digests[1].clone(),
            digests[2].clone(),
            digests[3].clone(),
        ];
        let verdict = verify(artifact_input(&receipt, &trust, Some(&other)));
        assert_eq!(verdict.components["merkle"], "PASS");
        assert_eq!(verdict.components["artifact"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
    }

    fn agent_receipt(plan: &str, output: &str, model: &str) -> Receipt {
        let flow = secret_from_seed("flow", GATE0_FLOW_SEED).unwrap();
        let body = agent_action_body(plan, output, model, "claude.computer-use").unwrap();
        sign_body(&flow, &body).unwrap()
    }

    fn agent_input<'a>(
        receipt: &'a Receipt,
        trust: &'a Trust,
        plan: Option<&'a str>,
        output: Option<&'a str>,
        model: Option<&'a str>,
        committed: Option<&'a str>,
    ) -> VerifyInput<'a> {
        VerifyInput {
            receipt,
            trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: committed,
            model_sha256: model,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: plan,
            output_sha256: output,
            action_id: None,
            invariant: None,
            expect_invariant: None,
        }
    }

    /// Everything binds, the artifact is the one storage committed, the
    /// signature verifies — and the verdict is still inconclusive, because
    /// nothing here checked whether the output was right.
    #[test]
    fn a_fully_bound_agent_action_is_still_not_verified() {
        let (trust, _, _, _) = gate0();
        let plan = sha256_hex(b"plan");
        let output = sha256_hex(b"output");
        let model = sha256_hex(b"model-manifest");
        let receipt = agent_receipt(&plan, &output, &model);
        let verdict = verify(agent_input(
            &receipt,
            &trust,
            Some(&plan),
            Some(&output),
            Some(&model),
            Some(&output),
        ));
        assert_eq!(verdict.components["signature"], "PASS");
        assert_eq!(verdict.components["plan"], "PASS");
        assert_eq!(verdict.components["output"], "PASS");
        assert_eq!(verdict.components["model"], "PASS");
        assert_eq!(verdict.components["produced"], "PASS");
        assert_eq!(verdict.components["llm_output"], "INCONCLUSIVE");
        assert_eq!(verdict.overall, "INCONCLUSIVE");
        assert_eq!(verdict.exit_code(), 2);
    }

    #[test]
    fn an_unlinked_artifact_fails_the_produced_binding() {
        let (trust, _, _, _) = gate0();
        let plan = sha256_hex(b"plan");
        let output = sha256_hex(b"output");
        let model = sha256_hex(b"model-manifest");
        let elsewhere = sha256_hex(b"an-artifact-from-another-run");
        let receipt = agent_receipt(&plan, &output, &model);
        let verdict = verify(agent_input(
            &receipt,
            &trust,
            Some(&plan),
            Some(&output),
            Some(&model),
            Some(&elsewhere),
        ));
        assert_eq!(verdict.components["produced"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
    }

    #[test]
    fn an_unlinked_agent_action_stays_inconclusive() {
        let (trust, _, _, _) = gate0();
        let plan = sha256_hex(b"plan");
        let output = sha256_hex(b"output");
        let model = sha256_hex(b"model-manifest");
        let receipt = agent_receipt(&plan, &output, &model);
        let verdict = verify(agent_input(&receipt, &trust, Some(&plan), Some(&output), Some(&model), None));
        assert_eq!(verdict.components["produced"], "NOT_PERFORMED");
        assert_eq!(verdict.overall, "INCONCLUSIVE");
    }

    /// The axiom is not decoration. `sign_body` refuses to sign a body that
    /// drops it, and a receipt forged past that check with the trusted key is
    /// still refused at the schema, before any binding is looked at.
    #[test]
    fn an_agent_action_that_drops_the_axiom_is_refused() {
        let (trust, _, _, _) = gate0();
        let flow = secret_from_seed("flow", GATE0_FLOW_SEED).unwrap();
        let plan = sha256_hex(b"plan");
        let output = sha256_hex(b"output");
        let model = sha256_hex(b"model-manifest");
        let mut body = agent_action_body(&plan, &output, &model, "claude.computer-use").unwrap();
        body["axiom"] = Value::String("llm_output_verified".to_string());

        assert!(
            sign_body(&flow, &body).is_err(),
            "signing must refuse a body without the axiom"
        );

        // Forge it anyway, with the key the trust roster lists: the signature
        // itself will verify, so only the schema stands in the way.
        let key = signing_key(&flow).unwrap();
        let signature = key.sign(&signed_preimage(&body));
        let receipt = Receipt {
            schema: RECEIPT_SCHEMA.to_string(),
            id: receipt_id(&body),
            body,
            signer: hex::encode(key.verifying_key().to_bytes()),
            signature: hex::encode(signature.to_bytes()),
        };
        let verdict = verify(agent_input(
            &receipt,
            &trust,
            Some(&plan),
            Some(&output),
            Some(&model),
            Some(&output),
        ));
        assert_eq!(verdict.components["schema"], "FAIL");
        assert_eq!(verdict.overall, "FAIL");
        // The dispatch never ran, so nothing downstream was even looked at.
        assert_eq!(verdict.components["signature"], "NOT_APPLICABLE");
        assert_eq!(verdict.components["llm_output"], "NOT_APPLICABLE");
    }

    /// A roster that lists the invariant role as well. `emit_gate0` writes the
    /// published three-role fixture and is left alone, so discharge tests build
    /// their own trust from the same deterministic seeds.
    fn trust_with_invariant() -> Trust {
        let flow = secret_from_seed("flow", GATE0_FLOW_SEED).unwrap();
        let storage = secret_from_seed("storage", GATE0_STORAGE_SEED).unwrap();
        let anchor = secret_from_seed("anchor", GATE0_ANCHOR_SEED).unwrap();
        let invariant = secret_from_seed("invariant", GATE0_INVARIANT_SEED).unwrap();
        trust_from_secrets(GATE0_PURPOSE, &[flow, storage, anchor, invariant]).unwrap()
    }

    const CHECKER: &str = "invariant.json-object";

    fn verdict_for(action: &Receipt, output: &str, held: bool) -> Receipt {
        let checker = secret_from_seed("invariant", GATE0_INVARIANT_SEED).unwrap();
        let body = invariant_body(&action.id, output, CHECKER, "1.0.0", held).unwrap();
        sign_body(&checker, &body).unwrap()
    }

    #[allow(clippy::too_many_arguments)]
    fn discharge_input<'a>(
        receipt: &'a Receipt,
        trust: &'a Trust,
        plan: &'a str,
        output: &'a str,
        model: &'a str,
        verdict: Option<&'a Receipt>,
        expect: Option<&'a str>,
    ) -> VerifyInput<'a> {
        VerifyInput {
            receipt,
            trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: Some(output),
            model_sha256: Some(model),
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: Some(plan),
            output_sha256: Some(output),
            action_id: None,
            invariant: verdict,
            expect_invariant: expect,
        }
    }

    fn action_digests() -> (String, String, String) {
        (
            sha256_hex(b"plan"),
            sha256_hex(b"output"),
            sha256_hex(b"model-manifest"),
        )
    }

    /// The only way an agent action reaches PASS: a signed verdict, from the
    /// role the roster lists, about this action, on this output, that held, and
    /// from the invariant the caller named.
    #[test]
    fn a_matching_verdict_discharges_the_axiom() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, true);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "PASS");
        assert_eq!(result.components["produced"], "PASS");
        assert_eq!(result.overall, "PASS");
        assert_eq!(result.exit_code(), 0);
        // The axiom on the action itself was never rewritten.
        assert_eq!(action.body["axiom"], Value::String(LLM_OUTPUT_UNVERIFIED.to_string()));
    }

    #[test]
    fn a_verdict_that_did_not_hold_discharges_nothing() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, false);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    #[test]
    fn a_verdict_about_another_action_is_refused() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let elsewhere = agent_receipt(&plan, &sha256_hex(b"another-output"), &model);
        let verdict = verdict_for(&elsewhere, &output, true);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    /// `action_id` already binds the output, so the repeated `output_sha256` is
    /// redundant. Redundancy that is checked is fine; redundancy that is not
    /// would be a hole, so this is the test that it is checked.
    #[test]
    fn a_verdict_that_checked_another_output_is_refused() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &sha256_hex(b"something-else"), true);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    #[test]
    fn a_verdict_from_an_invariant_the_caller_did_not_ask_for_is_refused() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, true);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), Some("invariant.something-stricter"),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    /// A caller who names no invariant has stated no policy, so the strongest
    /// verdict is inconclusive even with a perfectly good receipt in hand.
    #[test]
    fn a_verdict_nobody_asked_for_stays_inconclusive() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, true);

        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&verdict), None,
        ));
        assert_eq!(result.components["llm_output"], "INCONCLUSIVE");
        assert_eq!(result.overall, "INCONCLUSIVE");
        assert_eq!(result.exit_code(), 2);
    }

    /// The agent must not be able to clear itself. `sign_body` refuses the
    /// role, and a body forged with the flow key is refused at the signer.
    #[test]
    fn a_verdict_signed_by_the_agent_key_is_refused() {
        let trust = trust_with_invariant();
        let flow = secret_from_seed("flow", GATE0_FLOW_SEED).unwrap();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let body = invariant_body(&action.id, &output, CHECKER, "1.0.0", true).unwrap();

        assert!(
            sign_body(&flow, &body).is_err(),
            "the flow role must not sign an invariant verdict"
        );

        let key = signing_key(&flow).unwrap();
        let signature = key.sign(&signed_preimage(&body));
        let forged = Receipt {
            schema: RECEIPT_SCHEMA.to_string(),
            id: receipt_id(&body),
            body,
            signer: hex::encode(key.verifying_key().to_bytes()),
            signature: hex::encode(signature.to_bytes()),
        };
        let result = verify(discharge_input(
            &action, &trust, &plan, &output, &model, Some(&forged), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    /// A roster that does not list the invariant role cannot be discharged
    /// against, however valid the receipt is on its own.
    #[test]
    fn a_verdict_outside_the_roster_is_refused() {
        let (gate0_trust, _, _, _) = gate0();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, true);

        let result = verify(discharge_input(
            &action, &gate0_trust, &plan, &output, &model, Some(&verdict), Some(CHECKER),
        ));
        assert_eq!(result.components["llm_output"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }

    #[test]
    fn a_verdict_receipt_verifies_on_its_own() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, true);

        let result = verify(VerifyInput {
            receipt: &verdict,
            trust: &trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: None,
            model_sha256: None,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: None,
            output_sha256: Some(&output),
            action_id: Some(&action.id),
            invariant: None,
            expect_invariant: None,
        });
        assert_eq!(result.components["signer"], "PASS");
        assert_eq!(result.components["output"], "PASS");
        assert_eq!(result.components["binding"], "PASS");
        assert_eq!(result.components["held"], "PASS");
        assert_eq!(result.overall, "PASS");
    }

    #[test]
    fn a_verdict_receipt_that_did_not_hold_fails_on_its_own() {
        let trust = trust_with_invariant();
        let (plan, output, model) = action_digests();
        let action = agent_receipt(&plan, &output, &model);
        let verdict = verdict_for(&action, &output, false);

        let result = verify(VerifyInput {
            receipt: &verdict,
            trust: &trust,
            expect_purpose: Some(GATE0_PURPOSE),
            subject_sha256: None,
            policy_sha256: None,
            admission_id: None,
            commit_id: None,
            artifact_sha256: None,
            model_sha256: None,
            data_sha256: None,
            pipeline_sha256: None,
            plan_sha256: None,
            output_sha256: Some(&output),
            action_id: Some(&action.id),
            invariant: None,
            expect_invariant: None,
        });
        assert_eq!(result.components["held"], "FAIL");
        assert_eq!(result.overall, "FAIL");
    }
}
