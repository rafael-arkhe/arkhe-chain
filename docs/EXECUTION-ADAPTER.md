# Execution adapter — 2026-11-18

An agent (a Claude skill, a computer-use harness, a cron wrapper) runs a task
and produces an artifact. The adapter decides whether that counts: it runs one
deterministic invariant over the finished run and either commits the evidence
the kernel looks for, or excludes the run with a reason. It never authorizes.

Crate: `integration/arkhe-exec-adapter`. No change to `arkhe-core`,
`arkhe-kernel`, `arkhe-governance` or `arkhe-wormgraph` was needed.

## Why no kernel change was needed

`ContainmentGate::authorize_admitted` already requires, for a protected
intent, a precise shape:

| Requirement (kernel) | What the adapter puts there |
|---|---|
| exactly one `SourceReport` context entry | digest of the run report, which binds the runner identity, the execution id and the artifact |
| exactly one `AnalysisRecord` context entry, admitted in the store under that hash, `kind = "WorkerExecutionRecord"`, `subject = source` | the record of the invariant run |
| `worker.input_digest == source` | the invariant read that run, and no other |
| `worker.output_digest == intent.parameters_digest` | the proposed transition *is* the verdict: `{invariant_id, invariant_version, source, output}` |
| `required_worker_evidence` allows `worker.module_id` | `InvariantProfile`: one invariant module per task class, nothing by default |
| `required_worker_evidence` allows `worker.operation` | `Analyze` only |

The last two rows are the whole argument. An agent reporting its own work
carries `Execute`, and `Execute` is never allowed, so an unchecked model output
cannot authorize anything — it is rejected as `operation not allowed`. A task
class governance never opted in to has no evidence requirement at all, and the
kernel rejects it as `missing worker evidence policy`. The unknown is excluded,
not waved through.

## The honest boundary

The adapter makes the verifiable fraction of a job explicit: **the tasks for
which someone can write a decidable invariant.** For those, admission is
mechanical. For the rest, the adapter returns `Exclusion` and the human decides.
It produces no number and no estimate of how much of a job that is.

An invariant must be a pure function of the run report and the artifact. An
auditor replays `Invariant::check` and recomputes every digest; an invariant
that reads the clock, the network or the filesystem silently breaks that, and
with it the only reason the admission means anything. That requirement is
documented on the trait and is *not* enforced by the type system.

## Observed

`cargo test -p arkhe-exec-adapter`, 2026-11-18, local:

```
running 9 tests
test a_malformed_run_is_excluded_before_any_check ... ok
test an_unknown_invariant_excludes_and_commits_nothing ... ok
test a_failed_invariant_excludes_with_its_reason ... ok
test an_uncommitted_analysis_is_rejected ... ok
test an_uncovered_task_class_is_rejected ... ok
test a_substituted_artifact_is_rejected ... ok
test an_execute_record_cannot_stand_as_the_analysis ... ok
test invariant_holds_and_the_kernel_authorizes ... ok
test an_identical_retry_is_idempotent ... ok

test result: ok. 9 passed; 0 failed
```

Each case ends at the kernel, not at the adapter: an admission the kernel would
reject is not an admission. `invariant_holds_and_the_kernel_authorizes` is the
only case that reaches `AuthorizationDecision::Allow`.

Also observed, same date:
`cargo check -p arkhe-kernel -p arkhe-wormgraph -p arkhe-governance -p arkhe-runtime --all-targets`
exits 0. `cargo clippy` over this crate cannot complete: it fails earlier in
`verification/crates/arkhe-verify-core/src/provenance_broker.rs:209`
(`needless_lifetimes`), an untracked file from work in progress on this branch.

## Not done

- **No executor.** Nothing here launches a skill or a computer-use session. The
  adapter takes a finished run; capturing one is the caller side, and it is
  plain Claude with no Arkhe in it.
- **The profile is hardcoded in the binary.** `POST /v1/tasks` exists — see
  below — but `main.rs` writes its `InvariantProfile` inline, one task class to
  one invariant, exactly as unproven as the `DevPolicyResolver` policy beside
  it. A real deployment supplies a signed profile rather than compiling in which
  invariant may stand as the analysis for which transition.
- **One invariant, not a library.** `invariants::NoDirectIdentifier` is real —
  see below. The others that would matter for actual work (a filed document
  matching its source record, a migration that round-trips, a payment file
  reconciling to a total) are not written.
- **The join is one-sided.** `arkhe-flow` can now discharge
  `llm_output_unverified` when handed a signed invariant verdict, but nothing
  turns an `Admission` from this crate into one. `arkhe-exec-adapter` still has
  no dependency on `arkhe-flow`, and the two digest families are not
  reconciled: this crate uses blake3 with a domain per object type, while
  `arkhe-flow` fields are named `*_sha256` and its `is_hex64` only checks the
  shape — 32 bytes of hex either way. A blake3 digest would fit the field and
  the name would be a lie. Closing that needs a profile field on the body, or a
  sha256 of the artifact carried next to the adapter digests.
- **No anchoring.** Evidence goes to whatever `EvidenceCommitter` the caller
  passes. The tests use the in-memory `WormGraph`; durability and anchoring are
  the store concern, unchanged by this crate.

## arkhe-flow: the two missing verifiers

`packaging/core/crates/arkhe-flow` is a separate Cargo workspace, untracked in
git as of this date, with its own spine: Ed25519 receipts, a Merkle profile,
admission/commit/anchor bodies. Earlier on 2026-11-18 it did not build. `verify`
dispatched `"artifact"` to `check_artifact` and `"agent-action"` to
`check_agent_action` and neither function existed, while `check_admission`,
`check_commit` and `check_anchor` did — the two payload kinds that carry a model
output were exactly the two with no verification body. Both are now written,
under the component names `base_components()` had already reserved for them.

**`check_artifact`** splits into recomputation and binding. The leaf is rebuilt
from the four digests the receipt states, and `fold_merkle` must reach the
stated root: that is `merkle`, which no caller input can influence. Then
`artifact`, `model`, `data` and `pipeline` tie those digests to bytes the caller
actually holds. They stay `NOT_PERFORMED` when nothing was supplied, so a
receipt verified without its files reads INCONCLUSIVE and never PASS.

**`check_agent_action`** cannot reach PASS, by construction. It binds `plan`,
`output` and `model` the same way, and `produced` links the action to what
storage committed: PASS when the supplied artifact digest is the output this
action signed, FAIL when it is a different one. Then `llm_output` is set to
`INCONCLUSIVE` with a note — the receipt carries the axiom, this package has no
invariant checker, so the output is signed, not verified. That mirrors how
`anchor` stays inconclusive while no anchor client exists. The strongest verdict
a signed agent action can get is exit code 2.

Which is where the two halves meet. `arkhe-flow` can now say *signed, not
verified*; `arkhe-exec-adapter` is what would discharge that axiom, because it
is the piece that holds an invariant verdict. A receipt kind carrying that
verdict is the join, and it is not written.

### Observed

`cargo test -p arkhe-flow` in `packaging/core`, 2026-11-18: 12 passed, 0 failed
— the three that existed plus nine new ones. Five cover `artifact` (a proof that
folds with every file bound; a resigned root; a leaf index the proof
contradicts; a receipt with no files in hand; a substituted artifact) and four
cover `agent-action` (fully bound and still inconclusive; an artifact from
another run; no link to storage at all; a forged body that drops the axiom,
refused at the schema before the signature is even checked).

`cargo clippy -p arkhe-flow --all-targets` is clean, after two pre-existing
`needless_borrow` hits inside `tampered_root_and_fabricated_anchor_fail` were
fixed; they were blocking clippy for the whole crate. `cargo check --workspace
--all-targets` in `packaging/core` exits 0.

`cargo fmt -p arkhe-flow -- --check` still reports a diff, starting at
`prove_merkle` (`src/lib.rs:148`), which predates this change. The crate is not
rustfmt-clean, and running `cargo fmt` over it would rewrite unrelated lines, so
it was left alone.

Not wired: the `arkhe-flow` CLI has no `verify` subcommand, and no way to sign
an artifact or agent-action receipt. Both kinds are reachable from the library
only.

## The join: a verdict receipt that discharges the axiom

An agent action could not reach PASS. That was correct but terminal: the axiom
had nothing that could ever clear it. The join is a fourth receipt kind,
`invariant`, signed by a fourth role of the same name, stating that one
invariant ran over one agent action and held.

The axiom on the agent action is **never rewritten**. Discharging it is a
separate statement by a separate key, so an agent cannot clear itself. Three
things enforce that, independently:

- `check_role` accepts the new role, and `sign_body` refuses when the secret
  role does not match the body issuer, so the `flow` key cannot sign a verdict.
- `check_signer` looks the issuer up in the trust roster, so a verdict forged
  with the `flow` key past `sign_body` fails on the key.
- `emit_gate0` still writes a three-role fixture. A roster that does not
  deliberately list the invariant role cannot be discharged against at all.

`action_id` is the agent-action receipt id, which is the hash of its signed
body, so naming it binds that plan, output, model and agent id at once.
`output_sha256` repeats the output the invariant read, and `verify` checks the
repetition rather than trusting it — the test
`a_verdict_that_checked_another_output_is_refused` exists because unchecked
redundancy is a hole.

`held: false` is a legitimate receipt. A refused run is worth signing, and a
verdict that did not hold discharges nothing: `llm_output` goes to FAIL, not
INCONCLUSIVE, because a verdict was presented and it says no.

### What this deliberately does not decide

Nothing here judges whether an invariant is an adequate test of a task.
`arkhe-flow` has no governance profile; that lives in `InvariantProfile` on the
kernel side. So the discharge requires the caller to name the invariant it
demands, through `expect_invariant`, exactly the way `expect_purpose` already
works for the trust roster. A caller who names none gets INCONCLUSIVE even
holding a perfectly valid verdict — `a_verdict_nobody_asked_for_stays_inconclusive`.
The policy question is pushed back to the caller rather than settled by a
signature.

`check_invariant`, which verifies a verdict receipt on its own, does not
consult `expect_invariant` either: whether this is the right invariant is a
question about the action it discharges, and it is asked there.

### Observed

`cargo test --workspace` in `packaging/core`, 2026-11-18: 31 passed, 0 failed
across five crates, with `arkhe-flow` itself at 22 — the 12 above plus ten for
the join. Eight cover the discharge (a matching verdict, which is the first and
only way an agent action reaches exit code 0; a verdict that did not hold; one
about another action; one that checked another output; one from an invariant the
caller did not ask for; a valid verdict nobody asked for; one signed by the
agent key; one from outside the roster) and two cover a verdict receipt
verified on its own.

`cargo clippy -p arkhe-flow --all-targets` is clean.
`cargo clippy --workspace --all-targets` is not, and neither hit is on a line
changed here: `crates/arkhe-storage/src/lib.rs:140` (`needless_borrow`) and
`crates/arkhe-provenance-mcp/src/lib.rs:76` (`question_mark`). The edits to
those two files were three `None` fields each, where `VerifyInput` grew
`action_id`, `invariant` and `expect_invariant`.

Wired since: `arkhe_provenance_mcp` carries the fields for every kind, its
`verify` command takes `--artifact --model --data --pipeline --plan --output
--action --invariant --expect-invariant`, and the MCP tool advertises them. The
Gate 0 fixture now ships an `artifact`, an `agent-action` and an `invariant`
receipt, so a third party can reproduce the discharge from files alone —
`packaging/core/HOW_TO_AUDIT.md`. The `arkhe-flow` CLI itself still has no
`verify`; it only emits.

## The endpoint: POST /v1/tasks

`arkhe_runtime::task_admission`, merged into the runtime router beside
`/v1/runs` and sharing its bearer token.

The difference between the two is the whole point. `/v1/runs` admits a WER
saying a run *happened* — `output_digest: ZERO`, no evidence refs — which proves
a bearer of the token said so. `/v1/tasks` runs the invariant the task names
over what the run actually produced, and answers with an authorization or an
exclusion carrying its reason.

`requested_by` is the authenticated actor and is not a body field. A bearer of
the token cannot propose work as someone else, and because the request is
`deny_unknown_fields`, trying to send one is a 422 rather than a silent
override — `a_caller_cannot_name_the_requester`.

The status codes carry the distinction, so a client that reads only the status
cannot mistake an exclusion for success:

| | |
|---|---|
| `200` | ADMITTED. The invariant held and the kernel authorized. The body carries `authorization_ref` and the `analysis`, `source`, `output` and `operation_id` digests an auditor replays from. |
| `403` | EXCLUDED. Well-formed, understood, refused: a failed invariant, an invariant this process does not have, or a kernel rejection. The body is the reason. |
| `400` | The request names something unusable — a target that is not a digest, an output that is not hex, an identifier out of range. |
| `401` / `422` | No token or the wrong one / malformed or unknown fields. |
| `503` | Evidence could not be committed. Infrastructure, not a verdict about the run, and the store's own reason stays out of the response. |

### Observed

`cargo test -p arkhe-runtime`, 2026-11-18: 37 passed, 0 failed, 2 ignored (the
PostgreSQL cases), of which 8 are this endpoint — a suppressed record admitted;
a record carrying an identifier excluded at 403; an invariant the process does
not have; a task class outside the profile refused by the kernel with `missing
worker evidence policy`; three auth cases; a caller trying to name the
requester; three unusable fields; and a retry reaching the same `operation_id`
and the same `authorization_ref`.

## The first real invariant

Until `invariants::NoDirectIdentifier`, every `impl Invariant` in the repository
was in this crate's own tests. The sentence above — that the automatable
fraction of a job is the part someone can write a decidable invariant for — had
no instance.

It is not new code. `arkhe_anonymize::release` was already a pure function of a
JSON value returning a binary verdict with a closed reason. Wiring it was
finding it.

`release` suppresses and *then* checks, so the decidable property over an
agent's output is whether anything **had** to be suppressed: an output needing
no redaction never carried an identifier. A `Refused` status is worse — a
pattern survived suppression — and is reported separately. The counters are
categories, not field names: `labeled` when a field's key is a known identifier
label, and `cpf`, `email`, `phone` for a value pattern found anywhere, including
inside free text under an innocuous key. `a_cpf_buried_in_free_text_is_excluded`
covers that last case, which is the realistic failure: nothing in the field name
warns anyone.

**The version is an obligation.** An auditor replays `check` and must reach the
same verdict, and this one delegates to `arkhe-anonymize`, whose label set
decides it. Changing that set changes the verdict for the same bytes, so
`NO_DIRECT_IDENTIFIER_VERSION` has to change with it, or two different checks
will claim to be the same one. Nothing enforces that; it is a stated obligation.

### How it is linked, and why that is an exception

`arkhe-anonymize` lives in `packaging/core`, which the next section says cannot
be a path dependency of this workspace. This one crate can, because everything
it inherits with `workspace = true` — `anyhow`, `clap`, `serde`, `serde_json` —
is also in the root `[workspace.dependencies]`. `arkhe-flow` cannot, because of
`rand`. So the blocker is per-crate, not absolute: it bites exactly when the
inner manifest inherits something the outer workspace does not declare.

The direction is worth noting: the monorepo now depends on a crate in the
packaging bundle, which is backwards if the bundle is meant to be downstream.
Relocating the suppression engine, or declaring the missing dependencies at the
root, would both fix that, and both are decisions about how the bundle relates
to the monorepo.

## Emitting the verdict: what the adapter does and does not hold

`receipt::VerdictClaim` produces the body of an `invariant` receipt from an
`Admission`. It **does not sign and holds no key.** Signing belongs to the
invariant role, whose secret is the concern of whoever runs the log, and the
point of a separate role is that this process cannot clear its own work. An
emitter that took a key would undo the three layers above in one line.

`held` is not a parameter anywhere. It comes from which constructor ran:
`from_admission` always `true`, `from_failure` always `false`. A caller cannot
state it.

`Admission` carries a private field. A struct with one cannot be constructed
outside its module, so `admit` is the only way to obtain one, and
`from_admission` is therefore holding something an invariant actually produced
rather than a value a caller assembled to look like one. That cost the test
suite a refactor: the adversarial cases used to rebuild an `Admission` with one
field swapped, and now pass a mutated `WorkIntent` straight to the gate, which
is what the gate decides on anyway.

`from_admission` also recomputes the run digest and compares it to
`admission.source`, so a verdict cannot be emitted for one run using the bytes
of another — `a_claim_built_from_another_run_is_refused`. Only
`Exclusion::InvariantFailed` yields a failure claim; the other exclusions never
reached a checker, so the invariant role has nothing to say about them.

### The digest families, carried rather than unified

The claim carries sha256 of the artifact next to the blake3 the kernel saw, and
`a_claim_carries_both_digests_of_the_same_bytes` asserts the two differ, so
neither can be mistaken for the other. This is the cheap reconciliation, not the
honest one. The honest one is a profile field on the receipt body
(`digest_algorithm`), so a verifier knows which algorithm it is checking instead
of inferring it from a field name. That changes the `arkhe-flow` schema and is
not done.

### What is still half

The two crates cannot be linked by Cargo. `arkhe-flow` is in `packaging/core`,
`arkhe-exec-adapter` in the root workspace, and both manifests inherit
dependencies with `workspace = true`, which Cargo resolves against the
**outermost** workspace: a path dependency from the root into `packaging/core`
fails with `dependency.rand was not found in workspace.dependencies`, and the
mirror direction fails the same way on `blake3`, `async-trait` and `thiserror`.
Observed, 2026-11-18, by adding the dev-dependency and reverting it.

So no single test crosses admission, emission and consumption. The body shape is
asserted literally in `tests/flow_receipt.rs` and enforced on the other side by
`require_keys` in the `invariant` arm of `arkhe_flow::validate_body` — a drift
between the two would be caught by neither. A vector read by both suites would
catch it, and does not exist. Closing it properly means making `packaging/core`
a member of the root workspace, or pinning explicit versions in one of the two
manifests; both are decisions about how the bundle relates to the monorepo.

### Observed

`cargo test -p arkhe-exec-adapter`, 2026-11-18: 14 passed, 0 failed — the 9
admission cases plus 5 for the emitter (both digests over the same bytes and the
exact body; a claim from another run; a malformed action id; a `held: false`
claim from a failed invariant; an exclusion that never reached a checker).

`cargo clippy -p arkhe-exec-adapter` cannot run: it fails earlier in
`verification/crates/arkhe-verify-core/src/provenance_broker.rs:209`
(`needless_lifetimes`), an untracked file from other work in progress on this
branch.
