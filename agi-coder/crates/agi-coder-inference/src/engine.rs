//! Native DeepInfer execution is not linked. This report does not load weights or spawn a process.
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EngineStatus {
    pub revision: &'static str,
    pub weights_loaded: bool,
    pub native_generation: bool,
    pub reason: &'static str,
}

pub fn engine_status() -> EngineStatus {
    EngineStatus {
        revision: crate::DEEPINFER_REVISION,
        weights_loaded: false,
        native_generation: false,
        reason: "No weights are loaded and no native engine is linked. The process bridge remains a separate, unverified path.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_is_not_loaded() {
        let status = engine_status();
        assert!(!status.weights_loaded);
        assert!(!status.native_generation);
        assert_eq!(status.revision, crate::DEEPINFER_REVISION);
    }
}
