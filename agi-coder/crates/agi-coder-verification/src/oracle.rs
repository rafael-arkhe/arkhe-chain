use agi_coder_core::ContentHash;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Case {
    pub input: i64,
    pub expected: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Specification {
    pub requirement: String,
    pub author: String,
    pub cases: Vec<Case>,
}
impl Specification {
    pub fn digest(&self) -> Result<ContentHash, agi_coder_core::Error> {
        Ok(ContentHash::domain(
            "AGI/SPEC/v1",
            &[&agi_coder_core::cbor::canonical(self)?],
        ))
    }
}
pub trait Implementation {
    fn evaluate(&self, input: i64) -> Result<i64, String>;
}
impl<F: Fn(i64) -> Result<i64, String>> Implementation for F {
    fn evaluate(&self, input: i64) -> Result<i64, String> {
        self(input)
    }
}
