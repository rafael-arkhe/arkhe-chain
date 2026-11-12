//! Production deployment is not configured. This function does not edit a repository.
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProductionDeployment {
    pub deployed: bool,
    pub editor: bool,
    pub verdict: &'static str,
    pub reason: &'static str,
}

pub fn production_deployment() -> ProductionDeployment {
    ProductionDeployment {
        deployed: false,
        editor: false,
        verdict: "inconclusive",
        reason: "No production executor or repository editor is configured.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_deployment_stays_undeployed() {
        let deployment = production_deployment();
        assert!(!deployment.deployed);
        assert!(!deployment.editor);
        assert_eq!(deployment.verdict, "inconclusive");
    }
}
