use arkhe_core::Digest32;

use crate::error::ChainError;

pub const MLDSA65_SIG_LEN: usize = 3309;
pub const MLDSA65_PK_LEN: usize = 1952;
pub const MLDSA65_CONTEXT: &[u8] = b"AKG:CHAIN:MLDSA65:v1";
pub const BLOCK_DOMAIN: &[u8] = b"AKG:CHAIN:BLOCK:v1\0";
const TX_DOMAIN: &[u8] = b"AKG:CHAIN:TX:v1\0";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Transaction {
    pub nonce: u64,
    pub sender: String,
    pub recipient: String,
    pub value: u64,
    pub payload: Vec<u8>,
    pub signature_mldsa: Vec<u8>,
    pub sender_signature: [u8; 64],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockHeader {
    pub block_number: u64,
    pub parent_hash: [u8; 32],
    pub state_root: [u8; 32],
    pub mmr_count: u64,
    pub timestamp: u64,
    pub proposer: String,
    pub proposer_signature: [u8; 64],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Block {
    pub header: BlockHeader,
    pub transactions: Vec<Transaction>,
    /// Attestation ops, applied after the transactions at this block's height.
    pub attestations: Vec<crate::attest::AttestOp>,
    /// Consistency witness for the attestation MMR when the registry is full.
    pub rotation_proof: Option<Vec<u8>>,
}

pub fn account_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._@+-/:".contains(&b))
}

impl Transaction {
    /// Digest bound into the containment verdict. The payload is excluded
    /// because the verdict itself carries this digest as its subject.
    pub fn subject(&self) -> Digest32 {
        let mut body = Vec::new();
        body.extend_from_slice(&self.nonce.to_be_bytes());
        push_str(&mut body, &self.sender);
        push_str(&mut body, &self.recipient);
        body.extend_from_slice(&self.value.to_be_bytes());
        let sig_len = u32::try_from(self.signature_mldsa.len()).unwrap_or(u32::MAX);
        body.extend_from_slice(&sig_len.to_be_bytes());
        body.extend_from_slice(&self.signature_mldsa);
        Digest32::blake3(TX_DOMAIN, &body)
    }

    /// Leaf committed to the rbb-mmr v3 frontier. Covers the canonical
    /// transaction, including the containment payload.
    pub fn record(&self) -> [u8; 32] {
        Digest32::blake3(b"AKG:CHAIN:TXREC:v1\0", &crate::codec::encode_tx(self)).0
    }

    pub fn check_shape(&self) -> Result<(), ChainError> {
        if !account_id(&self.sender) || !account_id(&self.recipient) {
            return Err(ChainError::BadAccount);
        }
        if self.signature_mldsa.is_empty() {
            return Err(ChainError::UnverifiedSignature);
        }
        if self.signature_mldsa.len() != MLDSA65_SIG_LEN {
            return Err(ChainError::BadSignatureLength);
        }
        if self.payload.len() > 4096 {
            return Err(ChainError::Admission("payload"));
        }
        Ok(())
    }

    pub fn verify_sender(&self, public_key: &[u8; 32]) -> Result<(), ChainError> {
        let public = libp2p::identity::ed25519::PublicKey::try_from_bytes(public_key)
            .map_err(|_| ChainError::UnverifiedSignature)?;
        if public.verify(&sender_message(self), &self.sender_signature) {
            Ok(())
        } else {
            Err(ChainError::UnverifiedSignature)
        }
    }

    pub fn verify_mldsa(&self, public_key: &[u8; MLDSA65_PK_LEN]) -> Result<(), ChainError> {
        if self.signature_mldsa.len() != MLDSA65_SIG_LEN {
            return Err(ChainError::UnverifiedSignature);
        }
        use fips204::traits::{SerDes, Verifier};
        let pk = fips204::ml_dsa_65::PublicKey::try_from_bytes(*public_key)
            .map_err(|_| ChainError::UnverifiedSignature)?;
        let signature: [u8; MLDSA65_SIG_LEN] = self
            .signature_mldsa
            .as_slice()
            .try_into()
            .map_err(|_| ChainError::UnverifiedSignature)?;
        if pk.verify(&mldsa_message(self), &signature, MLDSA65_CONTEXT) {
            Ok(())
        } else {
            Err(ChainError::UnverifiedSignature)
        }
    }
}

pub fn mldsa_message(tx: &Transaction) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(&tx.nonce.to_be_bytes());
    push_str(&mut body, &tx.sender);
    push_str(&mut body, &tx.recipient);
    body.extend_from_slice(&tx.value.to_be_bytes());
    body
}

pub fn decode_mldsa_public(public_key: &[u8; MLDSA65_PK_LEN]) -> Result<(), ChainError> {
    use fips204::traits::SerDes;
    fips204::ml_dsa_65::PublicKey::try_from_bytes(*public_key)
        .map(|_| ())
        .map_err(|_| ChainError::UnverifiedSignature)
}
pub fn sign_mldsa(
    tx: &mut Transaction,
    seed: &[u8; 32],
) -> Result<[u8; MLDSA65_PK_LEN], ChainError> {
    use fips204::traits::{KeyGen, SerDes, Signer};
    use std::collections::HashMap;
    use std::sync::Mutex;

    struct Pair {
        public: [u8; MLDSA65_PK_LEN],
        secret: Vec<u8>,
    }
    static CACHE: Mutex<Option<HashMap<[u8; 32], Pair>>> = Mutex::new(None);
    let mut cache = CACHE.lock().unwrap_or_else(|poison| poison.into_inner());
    let pairs = cache.get_or_insert_with(HashMap::new);
    if !pairs.contains_key(seed) {
        let (public, secret) = fips204::ml_dsa_65::KG::keygen_from_seed(seed);
        pairs.insert(
            *seed,
            Pair {
                public: public.into_bytes(),
                secret: secret.into_bytes().to_vec(),
            },
        );
    }
    let pair = pairs.get(seed).expect("keypair");
    let public = pair.public;
    let secret_bytes: [u8; 4032] = pair
        .secret
        .as_slice()
        .try_into()
        .map_err(|_| ChainError::UnverifiedSignature)?;
    drop(cache);
    let secret = fips204::ml_dsa_65::PrivateKey::try_from_bytes(secret_bytes)
        .map_err(|_| ChainError::UnverifiedSignature)?;
    let signature = secret
        .try_sign_with_seed(&[0x77; 32], &mldsa_message(tx), MLDSA65_CONTEXT)
        .map_err(|_| ChainError::UnverifiedSignature)?;
    tx.signature_mldsa = signature.to_vec();
    Ok(public)
}

pub(crate) fn sender_message(tx: &Transaction) -> Vec<u8> {
    let mut out = b"AKG:CHAIN:SENDER:v1\0".to_vec();
    out.extend_from_slice(&tx.subject().0);
    out
}

pub fn block_hash(bytes: &[u8]) -> [u8; 32] {
    Digest32::blake3(BLOCK_DOMAIN, bytes).0
}

fn push_str(buf: &mut Vec<u8>, s: &str) {
    let n = u32::try_from(s.len()).unwrap_or(u32::MAX);
    buf.extend_from_slice(&n.to_be_bytes());
    buf.extend_from_slice(s.as_bytes());
}
