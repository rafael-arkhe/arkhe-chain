#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ChainError {
    #[error("FAIL_CLOSED: MEMPOOL_EMPTY")]
    MempoolEmpty,
    #[error("FAIL_CLOSED: MEMPOOL_FULL")]
    MempoolFull,
    #[error("FAIL_CLOSED: EMPTY_VALIDATORS")]
    EmptyValidators,
    #[error("FAIL_CLOSED: NOT_PROPOSER")]
    NotProposer,
    #[error("FAIL_CLOSED: BAD_PROPOSER_KEY")]
    BadProposerKey,
    #[error("FAIL_CLOSED: BAD_PROPOSER_SIGNATURE")]
    BadProposerSignature,
    #[error("FAIL_CLOSED: BAD_ACCOUNT")]
    BadAccount,
    #[error("FAIL_CLOSED: BAD_TIMESTAMP")]
    BadTimestamp,
    #[error("FAIL_CLOSED: BAD_SIGNATURE_LENGTH")]
    BadSignatureLength,
    #[error("FAIL_CLOSED: UNVERIFIED_SIGNATURE")]
    UnverifiedSignature,
    #[error("FAIL_CLOSED: ADMISSION: {0}")]
    Admission(&'static str),
    #[error("FAIL_CLOSED: ATTEST: {0}")]
    Attest(&'static str),
    #[error("FAIL_CLOSED: BAD_NONCE")]
    BadNonce,
    #[error("FAIL_CLOSED: SELF_TRANSFER")]
    SelfTransfer,
    #[error("FAIL_CLOSED: INSUFFICIENT_BALANCE")]
    InsufficientBalance,
    #[error("FAIL_CLOSED: OVERFLOW")]
    Overflow,
    #[error("FAIL_CLOSED: MMR")]
    Mmr,
    #[error("FAIL_CLOSED: MALFORMED")]
    Malformed,
    #[error("FAIL_CLOSED: PARENT_MISMATCH")]
    ParentMismatch,
    #[error("FAIL_CLOSED: FORK")]
    Fork,
    #[error("FAIL_CLOSED: QUORUM_ABSENT")]
    QuorumAbsent,
    #[error("FAIL_CLOSED: COMMIT_GAP")]
    CommitGap,
    #[error("FAIL_CLOSED: ROUND_REGRESSION")]
    RoundRegression,
    #[error("FAIL_CLOSED: PART_SET")]
    BadPartSet,
    #[error("FAIL_CLOSED: CHAIN_ID")]
    ChainId,
    #[error("FAIL_CLOSED: GENESIS")]
    Genesis,
    #[error("FAIL_CLOSED: BUSY")]
    Busy,
    #[error("FAIL_CLOSED: EQUIVOCATION")]
    Equivocation,
    #[error("FAIL_CLOSED: STATE_MISMATCH")]
    StateMismatch,
    #[error("FAIL_CLOSED: UNKNOWN_BLOCK")]
    UnknownBlock,
    #[error("FAIL_CLOSED: LOCK_POISONED")]
    LockPoisoned,
    #[error("FAIL_CLOSED: ANCHOR_ADDRESS")]
    AnchorAddress,
    #[error("FAIL_CLOSED: ETHEREUM_HEADER")]
    EthereumHeader,
    #[error("FAIL_CLOSED: ETHEREUM_CONFLICT")]
    EthereumConflict,
    #[error("FAIL_CLOSED: CIRCUIT_CONFIG")]
    CircuitConfig,
    #[error("FAIL_CLOSED: PROOF_REJECTED")]
    ProofRejected,
    #[error("FAIL_CLOSED: INVALID_SELECTOR")]
    InvalidSelector,
    #[error("FAIL_CLOSED: INVALID_SEAL_LENGTH expected {expected} got {got}")]
    InvalidSealLength { expected: usize, got: usize },
    #[error("FAIL_CLOSED: INVALID_ANCHOR_PREFIX")]
    InvalidAnchorPrefix,
    #[error("FAIL_CLOSED: AUDIT_BUNDLE: {0}")]
    AuditBundle(&'static str),
    #[error("FAIL_CLOSED: EXTERNAL_ANCHOR_ABSENT")]
    ExternalAnchorAbsent,
    /// Documented offline stub (e.g. `rekor:dryrun:`); not a production trust root.
    #[error("FAIL_CLOSED: EXTERNAL_ANCHOR_STUB")]
    ExternalAnchorStub,
    #[error("FAIL_CLOSED: VERIFIER_ABSENT")]
    VerifierAbsent,
    #[error("FAIL_CLOSED: RPC_ABSENT")]
    RpcAbsent,
    #[error("FAIL_CLOSED: RPC_TIMEOUT")]
    RpcTimeout,
    #[error("FAIL_CLOSED: RPC_UNAVAILABLE")]
    RpcUnavailable,
    #[error("FAIL_CLOSED: EMERGENCY_HALT")]
    EmergencyHalt,
    #[error("FAIL_CLOSED: HALT_CONFIG")]
    HaltConfig,
    #[error("FAIL_CLOSED: P2P: {0}")]
    P2p(&'static str),
    #[error("FAIL_CLOSED: SNAPSHOT")]
    Snapshot,
}
