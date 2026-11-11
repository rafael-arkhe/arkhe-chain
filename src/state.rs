use std::collections::BTreeMap;

use arkhe_core::decision::{Decision, DecisionVerdict};
use arkhe_core::CanonicalEncode;
use arkhe_verify_core::rbb::mmr::Frontier;

use crate::error::ChainError;
use crate::tx::Transaction;

pub const GENESIS_ACCOUNT: &str = "genesis-alloc";
pub const GENESIS_SUPPLY: u64 = 100_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChainState {
    balances: BTreeMap<String, u64>,
    nonces: BTreeMap<String, u64>,
    pub height: u64,
    pub tip: [u8; 32],
    pub frontier: Frontier,
    account_keys: BTreeMap<String, [u8; 32]>,
    account_mldsa: BTreeMap<String, [u8; crate::tx::MLDSA65_PK_LEN]>,
}

impl ChainState {
    /// Initialize public replay state from the same account validation as a node.
    /// No signing key is needed to verify transactions and state commitments.
    pub fn with_accounts(accounts: Vec<crate::Account>) -> Result<Self, ChainError> {
        let parsed = crate::parse_accounts(accounts)?;
        let mut state = Self::genesis();
        state.set_account_keys(parsed.ed25519, parsed.mldsa)?;
        Ok(state)
    }

    pub fn genesis() -> Self {
        let mut balances = BTreeMap::new();
        balances.insert(GENESIS_ACCOUNT.to_string(), GENESIS_SUPPLY);
        Self {
            balances,
            nonces: BTreeMap::new(),
            height: 0,
            tip: [0u8; 32],
            frontier: Frontier::default(),
            account_keys: BTreeMap::new(),
            account_mldsa: BTreeMap::new(),
        }
    }

    pub(crate) fn set_account_keys(
        &mut self,
        keys: BTreeMap<String, [u8; 32]>,
        mldsa: BTreeMap<String, [u8; crate::tx::MLDSA65_PK_LEN]>,
    ) -> Result<(), ChainError> {
        for (account, public_key) in &keys {
            if !crate::tx::account_id(account) {
                return Err(ChainError::BadAccount);
            }
            libp2p::identity::ed25519::PublicKey::try_from_bytes(public_key)
                .map_err(|_| ChainError::UnverifiedSignature)?;
        }
        for (account, public_key) in &mldsa {
            if !keys.contains_key(account) {
                return Err(ChainError::BadAccount);
            }
            crate::tx::decode_mldsa_public(public_key)?;
        }
        self.account_keys = keys;
        self.account_mldsa = mldsa;
        Ok(())
    }

    pub fn balance(&self, account: &str) -> u64 {
        self.balances.get(account).copied().unwrap_or(0)
    }

    pub(crate) fn balance_map(&self) -> &BTreeMap<String, u64> {
        &self.balances
    }

    pub(crate) fn nonce_map(&self) -> &BTreeMap<String, u64> {
        &self.nonces
    }

    pub(crate) fn account_keys(&self) -> &BTreeMap<String, [u8; 32]> {
        &self.account_keys
    }

    pub(crate) fn account_mldsa(&self) -> &BTreeMap<String, [u8; crate::tx::MLDSA65_PK_LEN]> {
        &self.account_mldsa
    }

    pub fn supply(&self) -> Result<u64, ChainError> {
        self.balances.values().try_fold(0u64, |total, balance| {
            total.checked_add(*balance).ok_or(ChainError::Overflow)
        })
    }

    pub fn mmr_root(&self) -> Result<[u8; 32], ChainError> {
        self.frontier.root().map_err(|_| ChainError::Mmr)
    }

    /// Header commitment. Covers the MMR root, its count, the balances, and
    /// the nonces. The raw MMR root stays available through `mmr_root`.
    pub fn state_commitment(&self) -> Result<[u8; 32], ChainError> {
        let mut body = Vec::new();
        body.extend_from_slice(&self.mmr_root()?);
        body.extend_from_slice(&self.frontier.count.to_be_bytes());
        write_accounts(&mut body, &self.balances)?;
        write_accounts(&mut body, &self.nonces)?;
        Ok(arkhe_core::Digest32::blake3(b"AKG:CHAIN:STATE:v1\0", &body).0)
    }

    pub fn apply_tx(&mut self, tx: &Transaction) -> Result<(), ChainError> {
        tx.check_shape()?;
        let public_key = self
            .account_keys
            .get(&tx.sender)
            .ok_or(ChainError::UnverifiedSignature)?;
        tx.verify_sender(public_key)?;
        let public = self
            .account_mldsa
            .get(&tx.sender)
            .ok_or(ChainError::UnverifiedSignature)?;
        tx.verify_mldsa(public)?;
        let verdict = DecisionVerdict::from_canonical_bytes(&tx.payload)
            .map_err(|_| ChainError::Admission("verdict"))?;
        if verdict.decision != Decision::Allow {
            return Err(ChainError::Admission("not-allow"));
        }
        if verdict.canonical_bytes() != tx.payload {
            return Err(ChainError::Admission("payload"));
        }
        if verdict.subject != tx.subject() {
            return Err(ChainError::Admission("subject"));
        }
        validate_transfer_policy(&verdict)?;
        let expected = self.nonces.get(&tx.sender).copied().unwrap_or(0);
        if tx.nonce != expected {
            return Err(ChainError::BadNonce);
        }
        apply_transfer(&mut self.balances, &tx.sender, &tx.recipient, tx.value)?;
        self.frontier
            .append(&tx.record())
            .map_err(|_| ChainError::Mmr)?;
        let next = expected.checked_add(1).ok_or(ChainError::Overflow)?;
        self.nonces.insert(tx.sender.clone(), next);
        Ok(())
    }
}

/// Consensus policy for this protocol version. Admission recomputes its digest
/// locally instead of trusting a policy identifier or digest supplied by a sender.
fn validate_transfer_policy(verdict: &DecisionVerdict) -> Result<(), ChainError> {
    use arkhe_governance::event_policy::{EventPolicy, EventRule, RuleAction};
    use std::sync::OnceLock;

    static POLICY: OnceLock<EventPolicy> = OnceLock::new();
    let policy = POLICY.get_or_init(|| EventPolicy {
        policy_id: "chain-v1".into(),
        version: 1,
        rules: vec![EventRule {
            rule_id: "transfer".into(),
            event_type: "chain-transfer".into(),
            action: RuleAction::Allow,
        }],
    });
    let rule = &policy.rules[0];
    if verdict.policy_id != policy.policy_id
        || verdict.policy_digest != Some(policy.digest())
        || verdict.event_type != rule.event_type
        || verdict.rule_id.as_deref() != Some(rule.rule_id.as_str())
    {
        return Err(ChainError::Admission("policy"));
    }
    Ok(())
}

/// Move `value` from `sender` to `recipient`. A zero value does not change
/// balances. The debit and credit are both applied, or neither is.
pub fn apply_transfer(
    balances: &mut BTreeMap<String, u64>,
    sender: &str,
    recipient: &str,
    value: u64,
) -> Result<(), ChainError> {
    if value == 0 {
        return Ok(());
    }
    if sender == recipient {
        return Err(ChainError::SelfTransfer);
    }
    let sender_balance = balances.get(sender).copied().unwrap_or(0);
    if sender_balance < value {
        return Err(ChainError::InsufficientBalance);
    }
    let recipient_balance = balances.get(recipient).copied().unwrap_or(0);
    let credited = recipient_balance
        .checked_add(value)
        .ok_or(ChainError::Overflow)?;
    balances.insert(sender.to_string(), sender_balance - value);
    balances.insert(recipient.to_string(), credited);
    Ok(())
}

fn write_accounts(out: &mut Vec<u8>, map: &BTreeMap<String, u64>) -> Result<(), ChainError> {
    let count = u32::try_from(map.len()).map_err(|_| ChainError::Overflow)?;
    out.extend_from_slice(&count.to_be_bytes());
    for (account, value) in map {
        let len = u32::try_from(account.len()).map_err(|_| ChainError::Overflow)?;
        out.extend_from_slice(&len.to_be_bytes());
        out.extend_from_slice(account.as_bytes());
        out.extend_from_slice(&value.to_be_bytes());
    }
    Ok(())
}
