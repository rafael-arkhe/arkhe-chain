# ARC3 recorder v2: implemented contract

This profile is public development validation, not AGI evidence or a hidden-game
evaluation. The native bridge still uses DevPolicyResolver, unsigned WER and
ephemeral WormGraph. No durable anchor or production signature was added.

## Separation and ordering

`ExplorationPolicy` selects a legal candidate using `StateGraph`. It never calls
the gate or environment. `StateGraph` predicts only previously observed,
non-contradictory exact transitions; conflicting edges cause abstention.
`TransitionRecorder` accumulates event counters and has no selection authority.
The runtime freezes a prediction, archives the source snapshot, obtains native
preflight approval, writes a proposal journal, and dispatches the action. It then
archives the outcome, obtains native record evidence, assesses the frozen
prediction, and updates the recorder and graph. A current outcome cannot enter
its own pre-dispatch prediction through this path.

Native preflight binds the prediction in the observation payload. The subsequent
WER binds the same intent and the host-reported outcome. The binding probe
demonstrates that changing a prediction changes the native intent digest. This
does not attest the host's clock, ordering, environment or observations.

Preflight failure is fatal and logged as an operational event, not a transition.
`ARKHE_ARC_EMERGENCY_STOP=1` is passed to the native gate; no alternate-action loop
bypasses a rejection. The actual AuthorizationDecision API has Allow/Reject;
the proposed `gate.authorize(action,state)` and Escalate branch were pseudocode,
not the repository's native API. With native mode off, native authorization is
explicitly absent; this mode is used equally for both policy comparison arms.

## Data and metrics

All action identities include click coordinates. Before/after snapshots contain
all visible frame layers, game state, level count and advertised legal actions.
They are canonical JSON compressed with gzip in `frames/<sha256>.json.gz`.
The SHA-256 covers uncompressed bytes. Traces reference these snapshots and
include the frozen prediction and prediction assessment. Proposal journals and
outcome hash chains are unsigned host files.

Metrics count prediction events rather than unique predicted pairs. Exploration
ratios exclude RESET; level efficiency counts all successful dispatches, including
RESET, and records the initial level count rather than assuming cumulative levels
are progress. Zero predictions produce prediction coverage 0 and error null;
no observed actions produce undefined ratios, not fabricated evidence of success.
The recorder measures repeated pairs, same-outcome repeated triples, source-state
coverage, pair novelty, prediction coverage/error and levels normalized per 100
dispatches. `stuck_repeat_ratio` remains null: duplicate transitions cannot alone
identify a useless loop. Same-outcome repeats are a subset of pair repeats, and
pair novelty is the complement of pair repetition under the same denominator.

Prediction coverage alone does not distinguish generalization from memorization.
A lookup model can predict every revisited pair perfectly and still predict no
unseen pair. This implementation explicitly labels generalization unestablished.
No objects, semantic state abstraction or inferred goal model was implemented.

## Validation artifacts

- `output/arc3-recorder-native-20261027`: six 80-action runs with/without native
  mode, snapshots, proposal journals, trace verification and prediction-binding
  probe. The on/off frontier trajectories match in both games.
- `output/arc3-budget-matrix-20261027/plan.json`: declared budgets 80/200/1000/5000,
  seed 0, ls20/vc33, random/frontier, native mode off for both. All actual counts,
  levels, metrics, errors and wall time are retained in the corresponding reports.
- `submission-native-recorder-v2`: prepared offline CPU notebook only. The
  previously validated Kaggle notebook remains version 1 of the older agent.

The budget sweep tests the same policy under different caps; it does not isolate
why a policy succeeds or fails. Clearing a level does not by itself validate a
world model; failing at 5000 does not prove that budget cannot be relevant.
Model support must come from frozen predictions assessed against future outcomes,
with separate tests for previously unseen transitions and any state abstraction.

## Completed seed-0 budget matrix

All 16 runs completed with their exact requested action counts, totalling 25,120
dispatches. Each cell below is the final number of levels completed, not RHAE.

| Action cap | ls20 random | ls20 frontier | vc33 random | vc33 frontier |
|---|---:|---:|---:|---:|
| 80 | 0 | 0 | 1 | 0 |
| 200 | 0 | 0 | 1 | 1 |
| 1000 | 0 | 0 | 1 | 1 |
| 5000 | 0 | 0 | 1 | 1 |

These are fresh runs at each cap with the same policy seed. They are not multiple
independent seeds, and no significance or generalization claim follows. The
native observer was tested separately at 80 actions on both games; no 5000-action
native cost comparison was performed. Sixteen Python tests pass, including
prediction-event counting, pre-dispatch journal ordering, snapshot tampering,
proposal tampering, exact action limits and no dispatch after gate rejection.

All 16 matrix traces passed internal hash/snapshot/proposal checks. The current
agent source hash still matches the declared matrix plan. All six v2 80-action
trajectories also match the historical v1 trajectories exactly, confirming no
observed policy change from this instrumentation on those runs.

At 5000 actions, exact prediction coverage is 20.37%/15.17% for random ls20/vc33,
and 3.81%/1.33% for frontier. Error on issued predictions is zero in these runs.
These are predictions of previously observed exact pairs: correct replay and
coverage do not establish unseen-transition generalization or goal inference.
The random policy's greater lookup coverage does not make it a better world model.

## Prediction scope audit and causal limits

`analyze_prediction_scope.py` separates the frequency of issued predictions over
successful non-reset queries from coverage of distinct visited state/action pairs.
It reads the frozen recorded forecasts, without refitting a model. At 5000 actions,
frontier frequency is 3.81%/1.33% on ls20/vc33, while visited-pair coverage is
0.88%/0.062%. No first-visit pair received a prediction in any matrix trace.
Coverage of the entire unknown state/action space is undefined. The live recorder
now exposes both explicit metric names; historical `prediction_coverage` remains
a documented alias for frequency. Older reports and prepared notebooks retain
their original source hashes and are not relabelled as the newer implementation.

`fragmentation_rate = distinct_hashes / logical_states` cannot be measured from
these snapshots without independently justified logical-state labels. Different
pixels may encode relevant dynamics; merging them is a hypothesis, not proof of
redundancy. The audit reports logical-state count and fragmentation rate as null.
No UI mask, object abstraction or causal root cause has been validated. A mask
must be evaluated for false merges and future prediction quality, not chosen by
an unsupported threshold such as 2--3 versus 50--100 hashes per logical state.

The existing native API is `AuthorizationDecision::Reject { reason: String }`,
with an implemented emergency-stop branch. No missing EmergencyStop enum variant
prevents compilation. The bridge's two native tests passed again on 2026-10-27.
Typed rejection reasons are an optional API change, not required by the current
fail-closed adapter. Existing frontier routing and least-visit fallback already
consult the graph; an untried action has no known successor in this lookup model.

The local maturity label is LEMMA under `docs/MATURITY-CRITERIA.md`, not THEOREM.
Observed trajectory parity is restricted to the tested games, seed and 80-action
cap; native overhead was measured and can matter under wall-clock limits.
The observed negative result neither identifies a unique cause nor refutes a
statistical alternative. At least five seeds are a sampling choice, not a theorem
or a guarantee of adequate statistical power.

## Five-seed follow-up at a fixed 200-action cap

Seeds 0/1/2/3/4 were declared before the run in
`output/arc3-five-seeds-200-20261027/plan.json`. Twenty runs completed without
failure, totaling 4000 dispatches, with the native gate off equally for both
policies. Five seeds were evaluated only at cap 200; the other action caps still
have the earlier single-seed evidence. SDK engine seeds were not independently
controlled. A stale descriptive sentence in the run harness referred to a single
seed; its correction is recorded in metadata without changing the declared seed
array, measured results or agent hash.

| Game | Random seeds reaching >=1 level | Frontier seeds reaching >=1 level |
|---|---:|---:|
| ls20 | 0/5 | 0/5 |
| vc33 | 3/5 | 4/5 |

On vc33 the paired level counts give frontier 2 wins, 2 ties and 1 loss. This
small descriptive difference does not establish population superiority, identify
the causal bottleneck or validate a state abstraction. The primary artifacts are
`five-seed-summary.json`, `trace-verification.json` and `prediction-scope-audit.json`
in that output directory. No new Kaggle execution or submission was performed.
