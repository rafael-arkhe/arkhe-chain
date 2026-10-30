use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};

#[derive(
    Debug, Default, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
)]
#[serde(try_from = "String", into = "String")]
pub struct ContentHash(pub [u8; 32]);

impl ContentHash {
    pub const ZERO: Self = Self([0; 32]);
    pub fn hash(data: &[u8]) -> Self {
        Self(*blake3::hash(data).as_bytes())
    }
    pub fn domain(domain: &str, parts: &[&[u8]]) -> Self {
        let mut h = blake3::Hasher::new();
        h.update(&(domain.len() as u64).to_be_bytes());
        h.update(domain.as_bytes());
        for p in parts {
            h.update(&(p.len() as u64).to_be_bytes());
            h.update(p);
        }
        Self(*h.finalize().as_bytes())
    }
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}
impl fmt::Display for ContentHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", hex::encode(self.0))
    }
}
impl FromStr for ContentHash {
    type Err = crate::Error;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bytes = hex::decode(s).map_err(|e| crate::Error::Invalid(e.to_string()))?;
        Ok(Self(bytes.try_into().map_err(|_| {
            crate::Error::Invalid("expected a 32-byte hash".into())
        })?))
    }
}
impl TryFrom<String> for ContentHash {
    type Error = crate::Error;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}
impl From<ContentHash> for String {
    fn from(h: ContentHash) -> Self {
        h.to_string()
    }
}
