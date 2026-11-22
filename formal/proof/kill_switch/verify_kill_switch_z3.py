"""Z3 SMT formal verification of the L2/L3 global kill-switch state-transition model.

Corresponds directly to the pure Rust decision core in:
  kernel/arkhe-kernel/src/kill_switch_model.rs

Discharges five delimited theorems (each proved by checking UNSAT of its negation)
plus one negative sanity check (confirming a deliberately weakened guard yields SAT
with a concrete counterexample, so the proof harness is non-vacuous).

Explicit scope boundary (tau):
This SMT proof covers the abstract state-transition model only. It does NOT cover
SQLite C internals, filesystem permissions, OS UID separation (L1), or host integrity.
"""
import argparse
import json
from pathlib import Path
import sys
import z3


# Enumeration constants mirroring kernel/arkhe-kernel/src/kill_switch_model.rs
KS_DISENGAGED = 0
KS_ENGAGED = 1
KS_UNAVAILABLE = 2

SLOT_EMPTY = 0
SLOT_UNCERTAIN_OWNER = 1
SLOT_UNCERTAIN_OTHER = 2
SLOT_COMPLETED = 3
SLOT_CONFLICT = 4

RES_ACQUIRE = 0
RES_REPLAY = 1
RES_UNCERTAIN = 2
RES_REJECT_CONFLICT = 3
RES_REJECT_ENGAGED = 4
RES_REJECT_UNAVAILABLE = 5

COMP_COMMIT = 0
COMP_REJECT = 1


def eval_ks(has_row, raw_engaged):
    return z3.If(
        z3.Not(has_row),
        KS_UNAVAILABLE,
        z3.If(
            raw_engaged == 0,
            KS_DISENGAGED,
            z3.If(raw_engaged == 1, KS_ENGAGED, KS_UNAVAILABLE),
        ),
    )


def decide_reserve(ks, slot):
    return z3.If(
        ks == KS_UNAVAILABLE,
        RES_REJECT_UNAVAILABLE,
        z3.If(
            ks == KS_ENGAGED,
            RES_REJECT_ENGAGED,
            z3.If(
                slot == SLOT_EMPTY,
                RES_ACQUIRE,
                z3.If(
                    slot == SLOT_COMPLETED,
                    RES_REPLAY,
                    z3.If(
                        z3.Or(slot == SLOT_UNCERTAIN_OWNER, slot == SLOT_UNCERTAIN_OTHER),
                        RES_UNCERTAIN,
                        RES_REJECT_CONFLICT,
                    ),
                ),
            ),
        ),
    )


def decide_complete(_ks, slot):
    return z3.If(slot == SLOT_UNCERTAIN_OWNER, COMP_COMMIT, COMP_REJECT)


def valid_slot(slot):
    return z3.And(slot >= SLOT_EMPTY, slot <= SLOT_CONFLICT)


def valid_ks(ks):
    return z3.And(ks >= KS_DISENGAGED, ks <= KS_UNAVAILABLE)


def check_unsat(name, claim, formula_negation):
    solver = z3.Solver()
    solver.add(formula_negation)
    result = solver.check()
    if result == z3.unsat:
        return {"theorem": name, "claim": claim, "z3_result": "unsat", "proved": True}
    return {
        "theorem": name,
        "claim": claim,
        "z3_result": str(result),
        "proved": False,
        "counterexample": str(solver.model()) if result == z3.sat else None,
    }


def run_proofs():
    results = []

    # T1: Unavailable or corrupted singleton state ALWAYS refuses reservation.
    has_row = z3.Bool("has_row")
    raw_engaged = z3.Int("raw_engaged")
    slot = z3.Int("slot")
    ks = eval_ks(has_row, raw_engaged)
    unavailable_pre = z3.Or(z3.Not(has_row), z3.And(raw_engaged != 0, raw_engaged != 1))
    results.append(
        check_unsat(
            "T1_unavailable_state_refuses_reserve",
            "Missing or non-binary kill-switch singleton always rejects reservation fail-closed",
            z3.And(
                valid_slot(slot),
                unavailable_pre,
                decide_reserve(ks, slot) != RES_REJECT_UNAVAILABLE,
            ),
        )
    )

    # T2: Engaged kill switch blocks all new reservations until an authorized disengage.
    # Inductive step: from engaged=1, any transition that is NOT an authorized disengage
    # (either no toggle, an engage toggle, or missing operator/reason metadata) preserves
    # engaged=1 and continues rejecting Acquire for every slot state.
    engaged0 = z3.Int("engaged0")
    engaged1 = z3.Int("engaged1")
    epoch0 = z3.Int("epoch0")
    epoch1 = z3.Int("epoch1")
    is_toggle = z3.Bool("is_toggle")
    target_engaged = z3.Int("target_engaged")
    has_os_operator = z3.Bool("has_os_operator")
    has_reason = z3.Bool("has_reason")
    slot2 = z3.Int("slot2")

    authorized_disengage = z3.And(
        is_toggle, has_os_operator, has_reason, target_engaged == 0
    )
    applied_toggle = z3.And(
        is_toggle,
        has_os_operator,
        has_reason,
        z3.Or(target_engaged == 0, target_engaged == 1),
    )
    step_transition = z3.If(
        applied_toggle,
        z3.And(engaged1 == target_engaged, epoch1 == epoch0 + 1),
        z3.And(engaged1 == engaged0, epoch1 == epoch0),
    )
    results.append(
        check_unsat(
            "T2_engaged_blocks_reserves_until_authorized_disengage",
            "Confirmed halt blocks new reservations inductively across all steps without authorized disengage",
            z3.And(
                engaged0 == 1,
                epoch0 >= 0,
                valid_slot(slot2),
                step_transition,
                z3.Not(authorized_disengage),
                z3.Or(
                    engaged1 != 1,
                    decide_reserve(eval_ks(z3.BoolVal(True), engaged1), slot2)
                    != RES_REJECT_ENGAGED,
                ),
            ),
        )
    )

    # T3: Previously reserved owner can still record completion even while halted or unavailable,
    # and NO non-owner or invalid slot can commit completion.
    ks3 = z3.Int("ks3")
    slot3 = z3.Int("slot3")
    results.append(
        check_unsat(
            "T3_previously_reserved_owner_completion_iff",
            "Completion commits iff slot is Uncertain with matching owner, independent of kill-switch state",
            z3.And(
                valid_ks(ks3),
                valid_slot(slot3),
                (decide_complete(ks3, slot3) == COMP_COMMIT) != (slot3 == SLOT_UNCERTAIN_OWNER),
            ),
        )
    )

    # T4: Conservative open_halted startup cannot acquire until an authorized operator disengages
    # with strictly monotonic epoch.
    init_has_row = z3.BoolVal(True)
    init_engaged = z3.IntVal(1)
    init_epoch = z3.IntVal(0)
    next_engaged = z3.Int("next_engaged_t4")
    next_epoch = z3.Int("next_epoch_t4")
    op_ok = z3.Bool("op_ok_t4")
    reason_ok = z3.Bool("reason_ok_t4")
    req_target = z3.Int("req_target_t4")
    slot4 = z3.Int("slot4")
    t4_toggle_applied = z3.And(
        op_ok, reason_ok, z3.Or(req_target == 0, req_target == 1)
    )
    t4_step = z3.If(
        t4_toggle_applied,
        z3.And(next_engaged == req_target, next_epoch == init_epoch + 1),
        z3.And(next_engaged == init_engaged, next_epoch == init_epoch),
    )
    can_acquire_after = (
        decide_reserve(eval_ks(init_has_row, next_engaged), slot4) == RES_ACQUIRE
    )
    results.append(
        check_unsat(
            "T4_conservative_init_requires_authorized_activation_and_monotonic_epoch",
            "Conservative halted init refuses Acquire until authorized disengage with epoch > 0",
            z3.And(
                valid_slot(slot4),
                t4_step,
                can_acquire_after,
                z3.Not(z3.And(op_ok, reason_ok, req_target == 0, next_epoch > init_epoch)),
            ),
        )
    )

    # T5: Reopening an existing DB whose singleton row was deleted never fails open.
    table_existed = z3.Bool("table_existed")
    row_before = z3.Bool("row_before")
    row_after_reopen = z3.Bool("row_after_reopen")
    engaged_after = z3.Int("engaged_after_reopen")
    slot5 = z3.Int("slot5")
    # Mirrors SqliteDispatchJournal::open_with_kill_switch_mode:
    # ONLY when !table_existed is a singleton row created.
    reopen_spec = z3.If(
        z3.Not(table_existed),
        z3.And(row_after_reopen == z3.BoolVal(True), engaged_after == 1),
        row_after_reopen == row_before,
    )
    results.append(
        check_unsat(
            "T5_deleted_singleton_reopen_never_fails_open",
            "Reopening an existing DB with deleted singleton row preserves unavailability and refuses Acquire",
            z3.And(
                table_existed,
                z3.Not(row_before),
                valid_slot(slot5),
                reopen_spec,
                decide_reserve(eval_ks(row_after_reopen, engaged_after), slot5)
                == RES_ACQUIRE,
            ),
        )
    )

    # N1: Non-vacuity negative control — a buggy fail-open model (treating missing row as 0)
    # MUST be falsified by Z3 (returns SAT with counterexample).
    buggy_solver = z3.Solver()
    b_has_row = z3.Bool("buggy_has_row")
    b_raw = z3.Int("buggy_raw")
    b_slot = z3.Int("buggy_slot")
    buggy_ks = z3.If(z3.Not(b_has_row), KS_DISENGAGED, eval_ks(b_has_row, b_raw))
    buggy_solver.add(
        valid_slot(b_slot),
        z3.Not(b_has_row),
        decide_reserve(buggy_ks, b_slot) == RES_ACQUIRE,
    )
    neg_res = buggy_solver.check()
    negative_control = {
        "check": "N1_non_vacuity_buggy_fail_open_detected",
        "expected": "sat",
        "z3_result": str(neg_res),
        "passed": neg_res == z3.sat,
        "counterexample": str(buggy_solver.model()) if neg_res == z3.sat else None,
    }

    all_passed = all(r["proved"] for r in results) and negative_control["passed"]
    return {
        "scope": "L3_Z3_STATE_TRANSITION_MODEL_ONLY",
        "z3_version": z3.get_version_string(),
        "rust_source": "kernel/arkhe-kernel/src/kill_switch_model.rs",
        "theorems": results,
        "negative_control": negative_control,
        "all_passed": all_passed,
        "limits": [
            "Proves pure state-transition logic only; does not prove SQLite C internals, filesystem permissions, OS UID enforcement (L1), or host integrity.",
            "Rust-to-SMT correspondence is manual; cargo kani verifies the Rust functions directly (V-AGI-03).",
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    report = run_proofs()
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["all_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
