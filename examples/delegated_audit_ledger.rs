//! Controlled two-validator audit receipt demo and public offline verifier.
use std::io::{self, Read};
use std::path::Path;
use std::sync::Arc;

use arkhe_chain::{
    block_hash, decode_block, encode_block, precommit_message, proposer_message, public_key,
    sign_mldsa, sign_precommit, sign_sender, spawn_server, submit_precommit, sync_canonical,
    Account, ArkheNode, ChainState, Precommit, Transaction, Validator, CHAIN_ID, GENESIS_ACCOUNT,
};
use arkhe_core::decision::{Decision, DecisionReason, DecisionVerdict};
use arkhe_core::CanonicalEncode;
use arkhe_governance::event_policy::{EventPolicy, EventRule, RuleAction};
use arkhe_verify_core::rbb::mmr;
use libp2p::identity::ed25519;
use serde::{Deserialize, Serialize};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Secrets {
    delegate: [u8; 32],
    mldsa: [u8; 32],
    validator_a: [u8; 32],
    validator_b: [u8; 32],
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PublicKeys {
    delegate: [u8; 32],
    mldsa: Vec<u8>,
    validator_a: [u8; 32],
    validator_b: [u8; 32],
}

impl PublicKeys {
    fn validators(&self) -> Result<Vec<Validator>> {
        if self.validator_a == self.validator_b {
            return Err("duplicate validator key".into());
        }
        Ok(vec![
            Validator {
                id: "audit-a".into(),
                public_key: self.validator_a,
            },
            Validator {
                id: "audit-b".into(),
                public_key: self.validator_b,
            },
        ])
    }

    fn accounts(&self) -> Result<Vec<Account>> {
        Ok(vec![Account {
            id: GENESIS_ACCOUNT.into(),
            public_key: self.delegate,
            mldsa_public_key: Some(
                self.mldsa
                    .as_slice()
                    .try_into()
                    .map_err(|_| "ML-DSA public key length")?,
            ),
        }])
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SealRequest {
    secrets: Secrets,
    receipt_digest: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct LedgerEvidence {
    version: u32,
    receipt_digest: String,
    block: Vec<u8>,
    signatures: Vec<Vec<u8>>,
    mmr_proof: mmr::Proof,
    imported_blocks: u64,
    reopened_committed: [u64; 2],
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VerifyRequest {
    public_keys: PublicKeys,
    receipt_digest: String,
    evidence: LedgerEvidence,
}

fn digest_valid(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn bare_transaction(digest: &str) -> Result<Transaction> {
    if !digest_valid(digest) {
        return Err("receipt digest".into());
    }
    Ok(Transaction {
        nonce: 0,
        sender: GENESIS_ACCOUNT.into(),
        recipient: format!("audit/{digest}"),
        value: 0,
        payload: Vec::new(),
        signature_mldsa: Vec::new(),
        sender_signature: [0; 64],
    })
}

fn public_keys(secrets: &Secrets) -> Result<PublicKeys> {
    let mut probe = bare_transaction(&"0".repeat(64))?;
    let mldsa = sign_mldsa(&mut probe, &secrets.mldsa)?;
    Ok(PublicKeys {
        delegate: public_key(&secrets.delegate)?,
        mldsa: mldsa.to_vec(),
        validator_a: public_key(&secrets.validator_a)?,
        validator_b: public_key(&secrets.validator_b)?,
    })
}

fn transfer(secrets: &Secrets, digest: &str) -> Result<Transaction> {
    let mut tx = bare_transaction(digest)?;
    sign_mldsa(&mut tx, &secrets.mldsa)?;
    let policy = EventPolicy {
        policy_id: "chain-v1".into(),
        version: 1,
        rules: vec![EventRule {
            rule_id: "transfer".into(),
            event_type: "chain-transfer".into(),
            action: RuleAction::Allow,
        }],
    };
    tx.payload = DecisionVerdict {
        version: 1,
        subject: tx.subject(),
        event_type: "chain-transfer".into(),
        policy_id: policy.policy_id.clone(),
        policy_digest: Some(policy.digest()),
        rule_id: Some("transfer".into()),
        decision: Decision::Allow,
        reason: DecisionReason::RuleAllowed,
    }
    .canonical_bytes();
    sign_sender(&mut tx, &secrets.delegate)?;
    Ok(tx)
}

fn vote(id: &str, seed: &[u8; 32], hash: [u8; 32]) -> Result<Precommit> {
    let mut vote = Precommit {
        validator_id: id.into(),
        height: 1,
        round: 0,
        block_hash: hash,
        parts: 1,
        part_hash: hash,
        chain_id: CHAIN_ID.into(),
        signature: [0; 64],
    };
    sign_precommit(&mut vote, seed)?;
    Ok(vote)
}

async fn seal(request: SealRequest, directory: &Path) -> Result<LedgerEvidence> {
    let keys = public_keys(&request.secrets)?;
    let validators = keys.validators()?;
    let path_a = directory.join("validator-a.snapshot");
    let path_b = directory.join("validator-b.snapshot");
    if path_a.exists() || path_b.exists() {
        return Err("demo requires fresh snapshot paths".into());
    }
    let a = Arc::new(ArkheNode::open(
        &path_a,
        "audit-a",
        &request.secrets.validator_a,
        validators.clone(),
        keys.accounts()?,
    )?);
    let b = ArkheNode::open(
        &path_b,
        "audit-b",
        &request.secrets.validator_b,
        validators.clone(),
        keys.accounts()?,
    )?;
    a.ingest(transfer(&request.secrets, &request.receipt_digest)?)?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let block = a
        .propose_and_seal_block(timestamp)?
        .block
        .ok_or("missing block")?;
    let server = spawn_server(Arc::clone(&a)).await?;
    let imported = sync_canonical(&b, server.listen_addr.clone(), server.local_peer_id).await?;
    if imported != 1 || a.tip()? != b.tip()? || a.mmr_root()? != b.mmr_root()? {
        return Err("replica mismatch".into());
    }
    let hash = a.tip()?;
    let vote_b = vote("audit-b", &request.secrets.validator_b, hash)?;
    submit_precommit(
        &b,
        server.listen_addr.clone(),
        server.local_peer_id,
        &vote_b,
    )
    .await?;
    if a.committed_height()? != 1 || b.committed_height()? != 1 {
        return Err("quorum missing".into());
    }
    drop(server);
    drop(a);
    drop(b);
    let a = ArkheNode::open(
        &path_a,
        "audit-a",
        &request.secrets.validator_a,
        validators.clone(),
        keys.accounts()?,
    )?;
    let b = ArkheNode::open(
        &path_b,
        "audit-b",
        &request.secrets.validator_b,
        validators,
        keys.accounts()?,
    )?;
    let reopened = [a.committed_height()?, b.committed_height()?];
    if reopened != [1, 1] {
        return Err("reopen lost commit".into());
    }
    Ok(LedgerEvidence {
        version: 1,
        receipt_digest: request.receipt_digest,
        mmr_proof: mmr::prove(&[block.transactions[0].record()], 0)?,
        block: encode_block(&block),
        signatures: vec![
            vote("audit-a", &request.secrets.validator_a, hash)?
                .signature
                .to_vec(),
            vote_b.signature.to_vec(),
        ],
        imported_blocks: imported,
        reopened_committed: reopened,
    })
}

fn verify(request: VerifyRequest) -> Result<serde_json::Value> {
    let evidence = request.evidence;
    if evidence.version != 1
        || evidence.receipt_digest != request.receipt_digest
        || evidence.imported_blocks != 1
        || evidence.reopened_committed != [1, 1]
        || evidence.block.len() > 2 * 1024 * 1024
    {
        return Err("evidence envelope".into());
    }
    let block = decode_block(&evidence.block)?;
    if encode_block(&block) != evidence.block
        || block.header.block_number != 1
        || block.header.parent_hash != [0; 32]
        || block.header.timestamp == 0
        || block.transactions.len() != 1
    {
        return Err("block shape".into());
    }
    let validators = request.public_keys.validators()?;
    let proposer = validators
        .iter()
        .find(|validator| validator.id == block.header.proposer)
        .ok_or("unknown proposer")?;
    let public = ed25519::PublicKey::try_from_bytes(&proposer.public_key)?;
    if !public.verify(&proposer_message(&block), &block.header.proposer_signature) {
        return Err("proposer signature".into());
    }
    let tx = &block.transactions[0];
    let expected = bare_transaction(&request.receipt_digest)?;
    if tx.sender != expected.sender
        || tx.recipient != expected.recipient
        || tx.value != 0
        || tx.nonce != 0
    {
        return Err("receipt binding".into());
    }
    let mut replay = ChainState::with_accounts(request.public_keys.accounts()?)?;
    replay.apply_tx(tx)?;
    if replay.state_commitment()? != block.header.state_root
        || replay.frontier.count != block.header.mmr_count
    {
        return Err("state replay".into());
    }
    let hash = block_hash(&evidence.block);
    if evidence.signatures.len() != validators.len() {
        return Err("certificate size".into());
    }
    let message = precommit_message(1, 0, &hash, 1, &hash, CHAIN_ID);
    for (validator, signature) in validators.iter().zip(&evidence.signatures) {
        let public = ed25519::PublicKey::try_from_bytes(&validator.public_key)?;
        if signature.len() != 64 || !public.verify(&message, signature) {
            return Err("quorum signature".into());
        }
    }
    mmr::verify(
        &tx.record(),
        &evidence.mmr_proof,
        replay.frontier.count,
        &replay.mmr_root()?,
    )?;
    Ok(
        serde_json::json!({"verified": true, "height": 1, "certificate_votes": 2,
        "mmr_count": replay.frontier.count, "transaction_value": 0,
        "receipt_digest": request.receipt_digest, "timestamp": block.header.timestamp}),
    )
}

#[tokio::main]
async fn main() -> Result<()> {
    let arguments: Vec<_> = std::env::args().collect();
    let mut input = String::new();
    io::stdin()
        .take(4 * 1024 * 1024 + 1)
        .read_to_string(&mut input)?;
    if input.len() > 4 * 1024 * 1024 {
        return Err("input resource limit".into());
    }
    let output = match arguments.get(1).map(String::as_str) {
        Some("keys") if arguments.len() == 2 => {
            serde_json::to_value(public_keys(&serde_json::from_str(&input)?)?)?
        }
        Some("seal") if arguments.len() == 3 => serde_json::to_value(
            seal(serde_json::from_str(&input)?, Path::new(&arguments[2])).await?,
        )?,
        Some("verify") if arguments.len() == 2 => verify(serde_json::from_str(&input)?)?,
        _ => {
            return Err(
                "usage: delegated_audit_ledger keys|seal DIRECTORY|verify; JSON on stdin".into(),
            )
        }
    };
    println!("{}", serde_json::to_string(&output)?);
    Ok(())
}
