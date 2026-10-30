use crate::ContentHash;
use serde::{Deserialize, Serialize};
pub type OperationId = ContentHash;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Did(pub String);
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RequestIdentity(pub ContentHash);
impl RequestIdentity {
    pub fn new(key: &[u8]) -> Self {
        Self(ContentHash::domain("AGI/REQUEST/v1", &[key]))
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Timestamp(pub i64);
