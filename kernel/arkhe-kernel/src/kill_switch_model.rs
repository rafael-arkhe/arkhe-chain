//! Pure, allocation-free state-transition core for the L2 persisted global kill switch.
//!
//! `SqliteDispatchJournal` delegates its fail-closed reservation, completion, and toggle
//! decisions to these functions. Keeping this core free of C FFI, filesystem I/O, and
//! heap allocation allows bounded formal verification via Kani (`#[cfg(kani)]`) and
//! SMT correspondence via Z3 (`formal/proof/kill_switch/verify_kill_switch_z3.py`).
//!
//! Explicit scope boundary (τ):
//! Proofs on this module verify the pure transition logic only:
//! - unavailable/corrupted state always refuses reservation;
//! - engaged kill switch prevents new reservations until disengaged;
//! - an already-reserved owner (`Uncertain { owner_matches: true }`) may still record
//!   completion so the journal reflects effects that actually occurred.
//!
//! These proofs do NOT automatically cover SQLite C internals, filesystem permissions,
//! OS UID enforcement (L1), or host clock/hardware integrity.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObservedKillSwitch {
    /// Singleton row exists with `engaged = 0`.
    Disengaged,
    /// Singleton row exists with `engaged = 1`.
    Engaged,
    /// Singleton row is missing, has an unexpected value, or storage failed.
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotState {
    /// No prior reservation exists for `(caller, operation)`.
    Empty,
    /// Prior reservation exists with matching binding and `status = 'UNCERTAIN'`.
    Uncertain { owner_matches: bool },
    /// Prior reservation exists with matching binding and `status = 'COMPLETED'`.
    Completed,
    /// Prior reservation exists with a different binding digest.
    BindingConflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReserveOutcome {
    Acquire,
    Replay,
    Uncertain,
    RejectBindingConflict,
    RejectKillSwitchEngaged,
    RejectKillSwitchUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompleteOutcome {
    CommitCompleted,
    RejectNotOwnerOrInvalidState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToggleOutcome {
    Applied { next_engaged: bool, next_epoch: u64 },
    RejectUnavailable,
    RejectEpochOverflow,
    RejectMissingMetadata,
}

/// Interpret the raw SQLite singleton `engaged` column fail-closed.
/// Any missing row (`None`) or integer other than `0`/`1` maps to `Unavailable`.
pub const fn evaluate_kill_switch(raw_engaged: Option<i64>) -> ObservedKillSwitch {
    match raw_engaged {
        Some(0) => ObservedKillSwitch::Disengaged,
        Some(1) => ObservedKillSwitch::Engaged,
        _ => ObservedKillSwitch::Unavailable,
    }
}

/// Pure reservation decision. Fail-closed on `Unavailable` and `Engaged`.
pub const fn decide_reserve(ks: ObservedKillSwitch, slot: SlotState) -> ReserveOutcome {
    match ks {
        ObservedKillSwitch::Unavailable => ReserveOutcome::RejectKillSwitchUnavailable,
        ObservedKillSwitch::Engaged => ReserveOutcome::RejectKillSwitchEngaged,
        ObservedKillSwitch::Disengaged => match slot {
            SlotState::Empty => ReserveOutcome::Acquire,
            SlotState::Completed => ReserveOutcome::Replay,
            SlotState::Uncertain { .. } => ReserveOutcome::Uncertain,
            SlotState::BindingConflict => ReserveOutcome::RejectBindingConflict,
        },
    }
}

/// Pure completion decision for an in-flight operation.
/// An operation previously reserved by this owner (`Uncertain { owner_matches: true }`)
/// may record completion regardless of a subsequent kill-switch engage, so persisted
/// journal state stays truthful to effects already executed.
pub const fn decide_complete(_ks: ObservedKillSwitch, slot: SlotState) -> CompleteOutcome {
    match slot {
        SlotState::Uncertain {
            owner_matches: true,
        } => CompleteOutcome::CommitCompleted,
        _ => CompleteOutcome::RejectNotOwnerOrInvalidState,
    }
}

/// Pure administrative toggle decision (`engage` / `disengage`).
pub const fn decide_toggle(
    ks: ObservedKillSwitch,
    current_epoch: Option<u64>,
    target_engaged: bool,
    has_operator: bool,
    has_reason: bool,
) -> ToggleOutcome {
    if !has_operator || !has_reason {
        return ToggleOutcome::RejectMissingMetadata;
    }
    if matches!(ks, ObservedKillSwitch::Unavailable) {
        return ToggleOutcome::RejectUnavailable;
    }
    let Some(epoch) = current_epoch else {
        return ToggleOutcome::RejectUnavailable;
    };
    match epoch.checked_add(1) {
        Some(next_epoch) => ToggleOutcome::Applied {
            next_engaged: target_engaged,
            next_epoch,
        },
        None => ToggleOutcome::RejectEpochOverflow,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_KS: [ObservedKillSwitch; 3] = [
        ObservedKillSwitch::Disengaged,
        ObservedKillSwitch::Engaged,
        ObservedKillSwitch::Unavailable,
    ];
    const ALL_SLOTS: [SlotState; 5] = [
        SlotState::Empty,
        SlotState::Uncertain {
            owner_matches: true,
        },
        SlotState::Uncertain {
            owner_matches: false,
        },
        SlotState::Completed,
        SlotState::BindingConflict,
    ];

    #[test]
    fn exhaustive_finite_state_checks_match_formal_invariants() {
        for ks in ALL_KS {
            for slot in ALL_SLOTS {
                let r = decide_reserve(ks, slot);
                if ks == ObservedKillSwitch::Unavailable {
                    assert_eq!(r, ReserveOutcome::RejectKillSwitchUnavailable);
                }
                if ks == ObservedKillSwitch::Engaged {
                    assert_eq!(r, ReserveOutcome::RejectKillSwitchEngaged);
                }
                if r == ReserveOutcome::Acquire {
                    assert_eq!(ks, ObservedKillSwitch::Disengaged);
                    assert_eq!(slot, SlotState::Empty);
                }
                let c = decide_complete(ks, slot);
                assert_eq!(
                    c == CompleteOutcome::CommitCompleted,
                    slot == SlotState::Uncertain {
                        owner_matches: true
                    }
                );
            }
        }
    }
}

#[allow(unexpected_cfgs)]
#[cfg(kani)]
mod kani_proofs {
    use super::*;

    fn any_slot() -> SlotState {
        let tag: u8 = kani::any();
        match tag {
            0 => SlotState::Empty,
            1 => SlotState::Uncertain {
                owner_matches: true,
            },
            2 => SlotState::Uncertain {
                owner_matches: false,
            },
            3 => SlotState::Completed,
            _ => SlotState::BindingConflict,
        }
    }

    fn any_ks() -> ObservedKillSwitch {
        let tag: u8 = kani::any();
        match tag {
            0 => ObservedKillSwitch::Disengaged,
            1 => ObservedKillSwitch::Engaged,
            _ => ObservedKillSwitch::Unavailable,
        }
    }

    /// Harness 1 (V-AGI-03): Unavailable/corrupted kill-switch state ALWAYS refuses reservation.
    #[kani::proof]
    fn proof_unavailable_kill_switch_always_refuses_reserve() {
        let has_row: bool = kani::any();
        let raw_val: i64 = kani::any();
        let raw = if has_row {
            kani::assume(raw_val != 0 && raw_val != 1);
            Some(raw_val)
        } else {
            None
        };
        let slot = any_slot();
        let ks = evaluate_kill_switch(raw);
        kani::assert(
            ks == ObservedKillSwitch::Unavailable,
            "missing or non-binary kill switch row must map to Unavailable",
        );
        let outcome = decide_reserve(ks, slot);
        kani::assert(
            outcome == ReserveOutcome::RejectKillSwitchUnavailable,
            "unavailable kill switch must always refuse reservation fail-closed",
        );
    }

    /// Harness 2 (V-AGI-03): Engaged kill switch blocks all new reservations until resumed.
    #[kani::proof]
    fn proof_engaged_kill_switch_blocks_all_new_reserves_until_resumed() {
        let slot = any_slot();
        let outcome = decide_reserve(ObservedKillSwitch::Engaged, slot);
        kani::assert(
            outcome == ReserveOutcome::RejectKillSwitchEngaged,
            "engaged kill switch must block reservation for every slot state",
        );

        let epoch: u64 = kani::any();
        let has_op: bool = kani::any();
        let has_reason: bool = kani::any();
        let stay_engaged = decide_toggle(
            ObservedKillSwitch::Engaged,
            Some(epoch),
            true,
            has_op,
            has_reason,
        );
        let next_ks = match stay_engaged {
            ToggleOutcome::Applied {
                next_engaged: true, ..
            } => ObservedKillSwitch::Engaged,
            ToggleOutcome::Applied {
                next_engaged: false,
                ..
            } => unreachable!(),
            _ => ObservedKillSwitch::Engaged,
        };
        kani::assert(
            decide_reserve(next_ks, SlotState::Empty) != ReserveOutcome::Acquire,
            "no transition without disengage may allow a new reservation",
        );
    }

    /// Harness 3 (V-AGI-03): Previously reserved owner can still record completion even when halted.
    #[kani::proof]
    fn proof_previously_reserved_owner_can_complete_even_when_engaged() {
        let ks = any_ks();
        let slot = any_slot();
        let outcome = decide_complete(ks, slot);
        let expected_commit = matches!(
            slot,
            SlotState::Uncertain {
                owner_matches: true
            }
        );
        kani::assert(
            (outcome == CompleteOutcome::CommitCompleted) == expected_commit,
            "completion commits iff slot is Uncertain and owned by caller, independent of kill switch",
        );
    }

    /// Harness 4 (V-AGI-03): Fail-closed exhaustiveness for Acquire and strict epoch monotonicity.
    #[kani::proof]
    fn proof_fail_closed_acquire_and_epoch_monotonicity() {
        let has_row: bool = kani::any();
        let raw_val: i64 = kani::any();
        let raw = if has_row { Some(raw_val) } else { None };
        let slot = any_slot();
        let ks = evaluate_kill_switch(raw);
        let outcome = decide_reserve(ks, slot);
        if outcome == ReserveOutcome::Acquire {
            kani::assert(
                raw == Some(0) && slot == SlotState::Empty,
                "Acquire is only reachable when singleton row is explicitly 0 and slot is Empty",
            );
        }

        let ks2 = any_ks();
        let has_epoch: bool = kani::any();
        let epoch_val: u64 = kani::any();
        let target: bool = kani::any();
        let has_op: bool = kani::any();
        let has_reason: bool = kani::any();
        let toggle = decide_toggle(
            ks2,
            if has_epoch { Some(epoch_val) } else { None },
            target,
            has_op,
            has_reason,
        );
        if let ToggleOutcome::Applied {
            next_engaged,
            next_epoch,
        } = toggle
        {
            kani::assert(
                ks2 != ObservedKillSwitch::Unavailable
                    && has_epoch
                    && has_op
                    && has_reason
                    && next_engaged == target
                    && next_epoch > epoch_val,
                "applied toggle must require available state, metadata, and strictly monotonic epoch",
            );
        }
    }
}
