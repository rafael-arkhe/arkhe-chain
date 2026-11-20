//! Camada 0: the constitution and the mandates that descend from it.
//!
//! `policy_bundle` authenticates a policy — who signed it, at which version,
//! inside which window — but deliberately does not interpret it. This module
//! is the interpretation for one shape of policy: the founder's constitution,
//! and the delegations issued under it.
//!
//! A constitution states three things and nothing else: the effects it permits
//! at all, the decisions it reserves to the founder, and the ceilings. Anything
//! absent is denied, which is the same default-deny posture the gate policy
//! already uses.
//!
//! A mandate is itself a `SignedPolicyBundle`, so it inherits the window, the
//! version floor and the signature check for free. What this module adds is
//! containment: a mandate may only narrow what it descends from. It can never
//! permit an effect the constitution does not, raise a ceiling, carry a
//! reserved decision, or outlive the maximum delegation the constitution fixes.
//! Subdelegation is the same check with a mandate as the parent.
//!
//! Money is in minor units as integers. There are no floats here, for the same
//! reason the AID payload has none: two readers must agree on the number.

use serde::{Deserialize, Serialize};

pub const CONSTITUTION_SCHEMA: &str = "arkhe.governance.constitution/1";
pub const MANDATE_SCHEMA: &str = "arkhe.governance.mandate/1";

/// Spending limits, in the minor units of one currency.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ceilings {
    /// ISO 4217, uppercase.
    pub currency: String,
    pub per_action_minor: u64,
    pub daily_minor: u64,
}

/// What the founder signs. The root of authority, expressed so that a machine
/// can refuse what it does not permit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Constitution {
    pub schema: String,
    /// Every effect any mandate may ever carry. Absence is denial.
    pub effects: Vec<String>,
    /// Decisions that return to the founder and may not be delegated.
    pub reserved: Vec<String>,
    pub ceilings: Ceilings,
    /// Jurisdictions the operation is authorized to act in.
    pub jurisdictions: Vec<String>,
    /// The longest window any single mandate may have, in seconds.
    pub max_mandate_seconds: i64,
}

/// One delegation issued under a constitution, or under another mandate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Mandate {
    pub schema: String,
    /// The payload digest of the constitution this descends from, as
    /// `blake3:<64hex>` — what a `PolicyBinding` of the constitution cites.
    pub constitution_digest: String,
    /// The parent mandate's payload digest, for a subdelegation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_mandate_digest: Option<String>,
    pub cell: String,
    pub purpose: String,
    pub effects: Vec<String>,
    pub ceilings: Ceilings,
    /// Who answers for this delegation. A name, not a key.
    pub responsible: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MandateError {
    /// The statements do not declare the schema this module interprets.
    SchemaMismatch { expected: &'static str, found: String },
    /// The mandate descends from another constitution.
    ConstitutionMismatch { expected: String, found: String },
    /// A subdelegation that does not name its parent, or names another.
    ParentMismatch { expected: String, found: Option<String> },
    /// A mandate with no effect authorizes nothing and should not exist.
    EmptyScope,
    /// An effect the parent does not permit.
    EffectNotPermitted(String),
    /// An effect the constitution reserves to the founder.
    ReservedDecisionDelegated(String),
    /// Ceilings in a different currency cannot be compared.
    CurrencyMismatch { parent: String, child: String },
    /// A ceiling above the parent's.
    CeilingExceeded { limit: u64, requested: u64 },
    /// A window longer than the constitution's maximum delegation.
    WindowTooLong { maximum: i64, requested: i64 },
    /// `issued_at > expires_at`.
    MalformedWindow,
}

impl Constitution {
    /// Reject a constitution that cannot be applied: wrong schema, no effects,
    /// an effect it also reserves, a non-positive delegation window.
    pub fn validate(&self) -> Result<(), MandateError> {
        if self.schema != CONSTITUTION_SCHEMA {
            return Err(MandateError::SchemaMismatch {
                expected: CONSTITUTION_SCHEMA,
                found: self.schema.clone(),
            });
        }
        if self.effects.is_empty() {
            return Err(MandateError::EmptyScope);
        }
        for effect in &self.effects {
            if self.reserved.iter().any(|r| r == effect) {
                return Err(MandateError::ReservedDecisionDelegated(effect.clone()));
            }
        }
        if self.max_mandate_seconds <= 0 {
            return Err(MandateError::WindowTooLong {
                maximum: self.max_mandate_seconds,
                requested: 0,
            });
        }
        Ok(())
    }
}

/// A mandate issued directly under the constitution.
pub fn mandate_within_constitution(
    constitution: &Constitution,
    constitution_digest: &str,
    mandate: &Mandate,
    issued_at: i64,
    expires_at: i64,
) -> Result<(), MandateError> {
    constitution.validate()?;
    check_mandate_schema(mandate)?;
    if mandate.constitution_digest != constitution_digest {
        return Err(MandateError::ConstitutionMismatch {
            expected: constitution_digest.to_owned(),
            found: mandate.constitution_digest.clone(),
        });
    }
    if mandate.parent_mandate_digest.is_some() {
        return Err(MandateError::ParentMismatch {
            expected: String::new(),
            found: mandate.parent_mandate_digest.clone(),
        });
    }
    for effect in &mandate.effects {
        if constitution.reserved.iter().any(|r| r == effect) {
            return Err(MandateError::ReservedDecisionDelegated(effect.clone()));
        }
    }
    contains(
        &constitution.effects,
        &constitution.ceilings,
        &mandate.effects,
        &mandate.ceilings,
    )?;
    check_window(constitution.max_mandate_seconds, issued_at, expires_at)
}

/// A subdelegation: the child may only narrow the parent, and the constitution
/// still bounds the window and the reserved decisions.
pub fn mandate_within_mandate(
    constitution: &Constitution,
    constitution_digest: &str,
    parent: &Mandate,
    parent_digest: &str,
    child: &Mandate,
    issued_at: i64,
    expires_at: i64,
) -> Result<(), MandateError> {
    constitution.validate()?;
    check_mandate_schema(parent)?;
    check_mandate_schema(child)?;
    if child.constitution_digest != constitution_digest {
        return Err(MandateError::ConstitutionMismatch {
            expected: constitution_digest.to_owned(),
            found: child.constitution_digest.clone(),
        });
    }
    if child.parent_mandate_digest.as_deref() != Some(parent_digest) {
        return Err(MandateError::ParentMismatch {
            expected: parent_digest.to_owned(),
            found: child.parent_mandate_digest.clone(),
        });
    }
    for effect in &child.effects {
        if constitution.reserved.iter().any(|r| r == effect) {
            return Err(MandateError::ReservedDecisionDelegated(effect.clone()));
        }
    }
    contains(
        &parent.effects,
        &parent.ceilings,
        &child.effects,
        &child.ceilings,
    )?;
    check_window(constitution.max_mandate_seconds, issued_at, expires_at)
}

fn check_mandate_schema(mandate: &Mandate) -> Result<(), MandateError> {
    if mandate.schema != MANDATE_SCHEMA {
        return Err(MandateError::SchemaMismatch {
            expected: MANDATE_SCHEMA,
            found: mandate.schema.clone(),
        });
    }
    Ok(())
}

/// The child's scope is inside the parent's: every effect permitted, no ceiling
/// raised, the same currency, and at least one effect.
fn contains(
    parent_effects: &[String],
    parent_ceilings: &Ceilings,
    child_effects: &[String],
    child_ceilings: &Ceilings,
) -> Result<(), MandateError> {
    if child_effects.is_empty() {
        return Err(MandateError::EmptyScope);
    }
    for effect in child_effects {
        if !parent_effects.iter().any(|permitted| permitted == effect) {
            return Err(MandateError::EffectNotPermitted(effect.clone()));
        }
    }
    if parent_ceilings.currency != child_ceilings.currency {
        return Err(MandateError::CurrencyMismatch {
            parent: parent_ceilings.currency.clone(),
            child: child_ceilings.currency.clone(),
        });
    }
    for (limit, requested) in [
        (
            parent_ceilings.per_action_minor,
            child_ceilings.per_action_minor,
        ),
        (parent_ceilings.daily_minor, child_ceilings.daily_minor),
    ] {
        if requested > limit {
            return Err(MandateError::CeilingExceeded { limit, requested });
        }
    }
    Ok(())
}

fn check_window(maximum: i64, issued_at: i64, expires_at: i64) -> Result<(), MandateError> {
    if issued_at > expires_at {
        return Err(MandateError::MalformedWindow);
    }
    let requested = expires_at - issued_at;
    if requested > maximum {
        return Err(MandateError::WindowTooLong { maximum, requested });
    }
    Ok(())
}
