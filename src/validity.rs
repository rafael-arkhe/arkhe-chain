use serde::Deserialize;

use crate::error::ChainError;

const JOURNAL_LEN: usize = 8 + 32 + 32;
const PHASE0_SELECTOR: [u8; 4] = [0x73, 0xc4, 0x57, 0xba];

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidityCircuit {
    pub profile: String,
    pub phase: u64,
    pub system: String,
    pub verifier: VerifierPin,
    #[serde(rename = "journal_encoding")]
    pub journal_encoding: String,
    pub public_inputs: Vec<PublicInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifierPin {
    pub chain: String,
    pub selector_hex: String,
    pub seal_bytes: usize,
    pub max_gas: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicInput {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProofJournal {
    pub target_block_number: u64,
    pub claimed_root: [u8; 32],
    pub parent_hash: [u8; 32],
}

pub fn load_circuit() -> Result<ValidityCircuit, ChainError> {
    let cfg: ValidityCircuit =
        serde_json::from_str(include_str!("../circuits/validity_slash.json"))
            .map_err(|_| ChainError::CircuitConfig)?;
    let inputs = [
        ("target_block_number", "u64be"),
        ("claimed_root", "bytes32"),
        ("parent_hash", "bytes32"),
    ];
    let inputs_ok = cfg.public_inputs.len() == inputs.len()
        && cfg
            .public_inputs
            .iter()
            .zip(inputs)
            .all(|(field, (name, ty))| field.name == name && field.ty == ty);
    if cfg.profile != "arkhe-validity-slash-v1"
        || cfg.phase != 0
        || cfg.system != "risc0-groth16"
        || cfg.verifier.chain != "base-sepolia"
        || cfg.verifier.seal_bytes != 260
        || cfg.verifier.max_gas != 276_000
        || cfg.journal_encoding != "u64be||bytes32||bytes32"
        || decode_selector(&cfg.verifier.selector_hex)? != PHASE0_SELECTOR
        || !inputs_ok
    {
        return Err(ChainError::CircuitConfig);
    }
    Ok(cfg)
}

/// Read the public journal. A matching shape is not a Groth16 verification.
pub fn read_journal(proof: &[u8]) -> Result<ProofJournal, ChainError> {
    let cfg = load_circuit()?;
    let selector = decode_selector(&cfg.verifier.selector_hex)?;
    let len = 4 + JOURNAL_LEN + cfg.verifier.seal_bytes;
    if proof.len() != len || proof[..4] != selector {
        return Err(ChainError::ProofRejected);
    }
    let journal = &proof[4..4 + JOURNAL_LEN];
    let target_block_number = match journal[..8].try_into() {
        Ok(bytes) => u64::from_be_bytes(bytes),
        Err(_) => return Err(ChainError::ProofRejected),
    };
    let mut claimed_root = [0u8; 32];
    let mut parent_hash = [0u8; 32];
    claimed_root.copy_from_slice(&journal[8..40]);
    parent_hash.copy_from_slice(&journal[40..72]);
    if target_block_number == 0 || claimed_root == [0u8; 32] {
        return Err(ChainError::ProofRejected);
    }
    Ok(ProofJournal {
        target_block_number,
        claimed_root,
        parent_hash,
    })
}

fn decode_selector(hex: &str) -> Result<[u8; 4], ChainError> {
    if hex.len() != 8 {
        return Err(ChainError::CircuitConfig);
    }
    let mut out = [0u8; 4];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16)
            .map_err(|_| ChainError::CircuitConfig)?;
    }
    Ok(out)
}
