# Generality pilot: accounting harness and bounded fixture broker

Update 2026-10-26: [signed local WER/MMR envelope and opt-in strict GGUF provider](EVIDENCE-ENVELOPE.md).
The live B CLI now refuses Ollama in strict mode and requires explicit
`--allow-observed-total` for that provider. Historical unsigned runs and their
POSTCHECK_ONLY scope below are preserved; no prior record is promoted.

Implemented on 2026-10-26. Accounting, scheduling, a trusted-adapter tool broker,
and a scripted fixture executor are available. This is not an implemented
three-arm agent campaign. No capability pilot has run.

## Run

Python standard library only. Commands from the repository root:

```powershell
python -m unittest discover -s scripts/tests -p test_generality_pilot.py -v
python scripts/generality_pilot.py --tasks tasks.json --output schedule.json
python scripts/generality_pilot.py --tasks tasks.json --records records.json --schedule schedule.json --output report.json
python -m unittest discover -s scripts/tests -p test_tool_broker.py -v
```

Output creation is exclusive: existing reports cannot be overwritten. Task input
is a JSON array of objects with unique `id` and an `axis`. It must contain no
answers when used to schedule executions. Records are trusted observer/grader
input, not claims accepted directly from the candidate:

```json
{
  "task_id": "task-001",
  "arm": "A",
  "attempt": 1,
  "status": "FAILURE",
  "reason": "timeout",
  "tokens": 120,
  "tool_calls": 2,
  "wall_seconds": 30
}
```

When validating against a schedule, each record must additionally carry its
zero-based `schedule_index`. All primary records must appear in scheduled order;
an external-failure retry immediately follows its primary. The report retains
the agenda digest and seed. This validates supplied record ordering, not actual
execution chronology against a malicious observer. Legacy inputs without an
agenda remain supported and explicitly report `schedule_validation=NOT_VERIFIED`.
Pilot-labelled accounting requires an agenda; this does not authenticate provenance.

## Executed fixture runner

Use a new output directory for every run:

```powershell
python scripts/generality_pilot.py --tasks tests/evaluation/broker-fixture-tasks.json --seed 20261026 --output output/broker-fixture-schedule.json
python scripts/run_pilot.py --tasks tests/evaluation/broker-fixture-tasks.json --schedule output/broker-fixture-schedule.json --limits tests/evaluation/broker-fixture-limits.json --output-dir output/broker-fixture-run
```

`run_pilot.py` uses the SAME scripted fixture adapter in A, B and C, so the arm
labels are scheduling labels only. Fixtures exercise success, incorrect answers,
call-budget exhaustion and abandonment, not cognition. There is no model call;
token usage is zero and `token_meter=NO_MODEL_CALLS`. Each task/arm receives a fresh
broker with identical limits. A host-side grader compares the final tool result
to the fixture answer. This is not independent human or blinded evaluation.

The broker exposes only bounded integer `add` and per-instance `lookup`, running
in fresh fixed Python worker processes with subprocess timeouts. It never runs
candidate commands. Worker startup counts toward wall time. Deadlines are checked
at admission and completion; this does not preempt arbitrary Python adapter code.
Tool calls cannot access another broker's lookup data through this API. The host
process still holds all data: this is API separation, not a security sandbox.
No frozen learned memory or real A/B/C adapter isolation has been qualified.

The token reservation API is HOST-ONLY for future trusted provider adapters.
Admission reserves an upper bound; settlement uses trusted measured usage and
cannot be replayed. Unsettled reservations prevent successful completion. An
adapter reporting an overrun preserves its cost and fails the budget. Reservation
alone cannot force an arbitrary model provider to obey the cap. Candidate-supplied
token counts must never be treated as authoritative. Do not expose this Python
object, settlement API or host filesystem to untrusted agents.

The runner persists its initial manifest and completed records incrementally in
`records.jsonl`; host exceptions abort without a completed report. A partial
directory is an incomplete execution, not a successful run. There is no automatic
resume or infrastructure retry in the fixture executor. Retries remain supported
by the accounting input contract. No crash-durable fsync guarantee is claimed.

One primary execution is required for every task/arm. Only `INVALID` with reason
`infra` or `runner_bug` permits one replacement. Original attempts and their costs
remain in the report. Agent timeout, token/tool limit, and abandonment must be
`FAILURE`. Secondary pass@k is deliberately not implemented; it requires a separate
sampling protocol. Pass@1 does not inherently require temperature zero. Freeze
sampling settings for all arms and record them in a future campaign manifest.

Reports distinguish assigned tasks, usable final tasks, raw attempts, invalid
attempts and unresolved invalids. Assigned-task success rates expose missingness;
paired contrasts explicitly count pairs excluded for external failure. External
failures can be informative, so complete-case rates alone are not a sufficient
campaign conclusion. Every current report remains INCONCLUSIVE, with human
comparison, native WER and WormGraph anchoring explicitly marked unimplemented.
SHA-256 identifies these JSON inputs; it is not Arkhe canonical CBOR, a WER digest,
a signed commitment, or a proof of execution. Stored artifacts may contain private
task IDs and must not be published automatically.

The report defaults to `phase=fixture`; the original historical v1 fixture report
used `phase=pilot`, which was a labeling error. It is preserved as historical
output, not rewritten. `decision_reason=confirmatory_inference_not_implemented`
makes clear that INCONCLUSIVE is not a calculated confidence interval. Contrast
`gain_pp=null` means no usable pairs, not zero gain; variance is null below two
pairs. Input hashes permit checking these local files but are not signatures.

## Statistical corrections to the pasted v4

The expression `(z*s/delta)^2` estimates precision of a mean under approximation;
it does not size a pilot for precision of the standard deviation. There is no
general guarantee that 30–50 heterogeneous tasks stabilize variance. Use a pilot
sampling plan and inspect uncertainty and domain coverage.

For paired differences D = Arkhe - human, a normal-approximation noninferiority
planning expression is `n ~= (z_(1-alpha)+z_(1-beta))^2 * Var(D) / (delta+m)^2`,
where delta is the expected signed difference and delta > -m. The factor two for
equal-sized independent groups cannot be appended when variance already describes
paired differences. Binary outcomes, task-family clustering, repeated humans and
multiple hypotheses require an appropriate design-specific calculation. This
approximation is documented, not implemented as a confirmatory calculator.

Noninferiority does not universally require more samples than superiority:
required size depends on the distance from the chosen null boundary and variance.
Human scores cannot be assumed known without uncertainty. A frozen human protocol
and actual human observations are needed before computing Arkhe-human differences.

References: [NIST paired observations](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm),
[NIST variance inference](https://www.itl.nist.gov/div898/handbook/eda/section3/eda358.htm).

## Remaining work before an actual pilot

- Extend the built-in fixture broker with real A/B/C provider adapters, trusted
  token metering and provider-enforced caps. Qualify wall-time termination for
  those adapters; current bounded tool workers are not a general agent executor.
- Freeze model, sources, prompts, sampling, tools, memory and evaluator identities.
  Clear per-task scratch state; give each B task the same frozen learned memory.
- Isolate candidates from answer keys, evaluation records, other arms, and host
  credentials using the existing qualified execution profile. Random order and
  new Python objects do not constitute sandbox isolation.
- Grade outside the candidate with blinded independent evaluation, separately
  retaining signed observations. Check budget usage rather than trusting candidates.
- Integrate native WER admission, WormGraph persistence and independently verified
  checkpoints using their existing contracts. Do not substitute custom JSON hashes.
- Acquire held-out tasks and human observations. Pre-register missing-data rules,
  primary comparisons, multiplicity policy, consequence margins and stopping rules.
- Add a multi-task three-arm smoke (no grading) to validate the protocol before
  any pilot; then run the pilot, and freeze confirmatory decisions before opening
  a fresh held-out.

Code tests establish local harness behavior only; they do not establish learner
efficacy, executor/model identity, independent replication or AGI.

## Arm A: local Ollama smoke adapter

`scripts/ollama_arm_a.py` makes a real local model request without tools, learned
memory, or answer keys. This is one baseline adapter, not the full tool-using
baseline or an A/B/C campaign. It checks the existing `config/ollama.json` model
tag/digest before and after generation against the trusted local server. This
is not cryptographic execution attestation and cannot eliminate tag-swap races.
No model is downloaded. No WER or WormGraph record is manufactured.

```powershell
python -m unittest discover -s scripts/tests -p test_ollama_arm_a.py -v
python scripts/ollama_arm_a.py --prompt-file tests/evaluation/arm-a-smoke-prompt.txt --output-dir output/arm-a-smoke --max-tokens 1024 --max-output-tokens 64 --max-wall-clock 45 --allow-observed-total
python scripts/ollama_arm_a.py --prompt-file tests/evaluation/arm-a-smoke-cpu-prompt.txt --output-dir output/arm-a-smoke-cpu --max-tokens 1024 --max-output-tokens 64 --max-wall-clock 180 --allow-observed-total --device-placement cpu
```

`--device-placement cpu` adds `num_gpu: 0` to the request options and records
`device_placement_requested`. The server may ignore request options, so this is a
request, not an attestation of where inference ran. The record therefore also
carries an `nvidia-smi` observation before and after generation: GPU state
consistent with the requested placement is evidence, not proof, and a missing
`nvidia-smi` is recorded, never fatal. Provider default and CPU are different
execution profiles; freeze one placement identically across future arms.

Each run creates a new directory and freezes a manifest (model and digest, limits,
prompt digest, output cap, sampling seed/temperature/context, raw mode, requested
placement) before executing; the returned request is verified against it after
generation, and drift fails the run as `ManifestMismatch`. The request uses
`raw=true` (no model template), fixed temperature zero, seed and
context size, and `num_predict` for a provider output cap. Raw prompting differs
from chat prompting; freeze the same choice across future arms. In deterministic
raw mode a one-byte prompt difference (a trailing newline) changes the whole
continuation; smoke fixtures are pinned by `prompt_sha256`. Provider usage
is read from `prompt_eval_count + eval_count`, never parsed from generated prose.
`token_meter=OLLAMA_SERVER_REPORTED` carries `token_meter_class=PROVIDER_REPORTED`.
The fixture runner reports `NO_MODEL_CALLS`; the remaining classes are
`HOST_METERED` (host-side counting) and `CANDIDATE_REPORTED` (candidate-supplied
counts, never authoritative).
The retained raw provider response and exact request digest permit inspection.
Counts are local-server reports, not independently verified tokenizer/hardware
measurements. Context truncation has not been independently qualified.

**Strict prompt+output admission is unsupported.** Ollama's output cap is not a
cap on total input plus output. The adapter defaults to refusal, before network
access; `--allow-observed-total` explicitly enables a smoke with
`total_token_cap=POSTCHECK_ONLY`. It reserves the remaining budget, settles
server-reported usage, preserves any overrun and fails the budget. This mode
cannot support a campaign claiming a hard total-token ceiling. It is intentionally
not wired into the three-arm accounting runner as a comparable capability arm.

The host wraps the HTTP work in a killable subprocess with the remaining broker
wall-time deadline. Killing the client does not guarantee provider-side generation
stops. On timeout or provider/protocol failure, the reservation remains unresolved;
`usage_complete=false` distinguishes unknown usage from zero. Closing a successfully
settled request also checks the broker deadline. A request ending because of the
generation-length limit fails even if it contains a partial answer. No automatic
retry occurs, and there is no grading or capability conclusion. The output uses
`phase=adapter_smoke`, not `pilot` or synthetic fixture.

Official provider contracts consulted on 2026-10-26:
[generate API and usage fields](https://docs.ollama.com/api/generate),
[generation parameters](https://docs.ollama.com/modelfile).

### Local validation, 2026-10-26

The adapter has seventeen unit tests (trusted usage settlement, missing/invalid
usage, total overrun, timeout, output-limit failure, digest mismatch, local
endpoint validation, strict-mode refusal, provider request parameters,
device-placement requests, token-meter classification, GPU-state observation and
frozen-manifest verification). Accounting and broker/runner suites have ten and
twelve tests respectively.

Host diagnosis, 2026-10-26: the GPU is a GTX 1660 Ti (Turing, 6 GB) with driver
581.29/CUDA 13.0, and the installed Ollama 0.40.11 serves through a
`llama-server-cuda_v13` runner. Model loading succeeds, but warmup crashes inside
ggml-cuda at `cudaFuncGetAttributes` ("CUDA error: shared object initialization
failed"; see `output/arm-a-ollama-server-20261026.err.log`) and llama-server exits
`0xc0000409`. GPU inference is therefore unqualified on this host. No driver,
server or model change was made. A direct server probe with `num_gpu: 0` completed
on CPU (cold load 34.1 s, then 5 output tokens in 0.54 s with `done_reason=stop`
and complete usage counts), which motivated the request-level CPU placement option.

Five real integration smoke attempts were preserved, not selected as benchmark
retries or used in any capability score:

- `output/arm-a-smoke-20261026/record.json`: 45-second deadline reached during
  cold loading; execution failed, measured tokens unavailable, reservation retained.
- `output/arm-a-smoke-180s-20261026/record.json`: larger integration deadline;
  provider failed after approximately 37 seconds on the CUDA warmup crash above.
- `output/arm-a-smoke-cpu-20261026/record.json`: CPU placement, original 2+2
  prompt. The provider call succeeded and 77 tokens were settled, but generation
  ended at the `num_predict` cap and the budget was rejected as `token_limit`,
  as specified, even though answer text was present.
- `output/arm-a-smoke-cpu2-20261026/record.json`: CPU placement with a fixture
  that accidentally carried a trailing newline; 72 tokens settled and the budget
  was again rejected as `token_limit`. The run was not retried on that fixture.
- `output/arm-a-smoke-cpu3-20261026/record.json`: CPU placement with the
  byte-exact fixture `tests/evaluation/arm-a-smoke-cpu-prompt.txt`.
  `execution_status=COMPLETED_UNGRADED`: `done_reason=stop`, 13 tokens settled
  (8 prompt + 5 output), wall 2.3 s warm, `usage_complete=true`,
  `device_placement_requested=cpu` recorded.
- `output/arm-a-smoke-cpu4-20261026/record.json`: repeat under the frozen manifest
  with post-generation manifest verification and placement observation.
  `execution_status=COMPLETED_UNGRADED`: 13 tokens settled, cold reload included
  in 36.1 s wall, `token_meter_class=PROVIDER_REPORTED`, and `nvidia-smi` shows
  the GPU at ~1.3 GiB with no model-sized device allocation before and after —
  consistent with, not proof of, the requested CPU placement.

All smoke attempts are adapter development, not campaign data: in campaign
accounting every one of them would be `INVALID` with reason `adapter_development`
and would never enter a capability denominator. The successful smokes prove the
adapter, not the model.

Planning inputs from this host, all CONJECTURE until measured inside the pilot:
CPU generation was observed around 9 output tokens/second with a ~34 s cold load,
so a 50-task three-arm single-attempt pilot at roughly 25 s per execution is
about two hours of generation. Run-to-run variance of byte-identical prompts on
the same arm under temperature zero must be measured in the pilot before
freezing pass@1 as the primary metric; the trailing-newline fixture shows
temperature zero is not a substitute for byte-exact prompt pinning.

The installed Ollama server was started hidden for these attempts and left running.
No model download, model replacement, driver change or success claim was made.
Successful live generation with complete server-reported usage is validated for
the CPU-placement smoke only; the GPU path remains failed on this host, and
grading was never performed, so nothing here is a capability result. Manifest
freeze, request verification and placement observation are now part of every
arm-A smoke record. The next artefact is adapter B on the same broker, placement
and manifest freeze — ContainmentGate admission, native WER records, WormGraph
anchoring and CitationVerifier, with wall time split into generation and
verification — then adapter C and a cross-arm isolation test. The adapter is
still not sufficient by itself to estimate human-paired Var(D), calibrate
consequence margins, or run a valid three-arm pilot.

## Native B/C development bridge

`orchestration/arkhe-runtime/examples/pilot_evidence.rs` uses the EXISTING native
`WorkIntent`, canonical CBOR, `WorkerExecutionRecord`, `ContainmentGate`,
`DevPolicyResolver` and in-memory `WormGraph`. It does not change their contracts.
`scripts/arkhe_arm_bc.py` invokes this prebuilt binary before generation for a
local `Simulate` preflight and again after generation to create the native WER.
Compilation is performed outside the task budget. Preflight, generation and
native postcheck share a single wall-time budget, with completed-stage timings
reported separately. The provider remains CPU-requested and POSTCHECK_ONLY for
total tokens, under the same limitations as arm A.

```powershell
cargo test --locked -p arkhe-runtime --example pilot_evidence
cargo build --locked -p arkhe-runtime --example pilot_evidence
python -m unittest discover -s scripts/tests -p test_arkhe_arm_bc.py -v
python scripts/arkhe_arm_bc.py --arm C --prompt-file tests/evaluation/arm-a-smoke-cpu-prompt.txt --bridge-exe target/debug/examples/pilot_evidence.exe --output-dir output/arm-c-native-smoke --allow-observed-total
python scripts/arkhe_arm_bc.py --arm B --prompt-file tests/evaluation/arm-a-smoke-cpu-prompt.txt --memory-file tests/evaluation/arm-b-smoke-memory.txt --bridge-exe target/debug/examples/pilot_evidence.exe --output-dir output/arm-b-native-smoke --allow-observed-total
```

B requires a caller-supplied memory snapshot; C rejects any memory-file argument.
The snapshot is read once into host-owned text and persisted in the output along
with the task and composed prompt. The memory prefix is explicitly untrusted
context, not a prompt-injection defense. No learning process is implied by a
snapshot. The synthetic example is only an integration fixture. Snapshot outputs
can be private; do not publish them automatically.

The manifest freezes model/config, limits, sampling, placement, prompt and memory
digests, and the native bridge binary hash. Its digest is bound into the native
intent parameters. Postcheck must produce the same intent digest as preflight;
answer changes change the WER digest. Worker input binds the native intent;
worker output binds answer bytes with an explicit domain. Native CBOR and WER
digests are produced by Rust, not reimplemented in Python. Host runtime and Python
source attestation are not implemented. Local hashes alone do not establish
trusted execution.

The bridge records an UNSIGNED host observation under DEV_UNPROTECTED policy.
Protected intents and emergency stop are rejected. The policy does not authorize
network inference or certify compliance with the Python budget. A Simulate ALLOW
is only the actual native development-policy decision. The postcheck appends and
reads back an envelope in the existing in-memory WormGraph; the process then exits.
JSON artifacts retain the native objects, but durable admission, authenticated
worker signing, MMR proofs and externally authenticated checkpoints are NOT
integrated. `persisted=false` and `wormgraph_anchor=NOT_INTEGRATED` make this explicit.
At initial bridge validation no citation verifier or correctness grader was wired
in. B now has the lexical diagnostic described below; no correctness grader is
integrated. This remains a partial B/C bridge, not "Arkhe complete" or a qualified
three-arm pilot.

The native tests cover canonical WER/intent binding, memory-dependent identity,
protected-action and emergency-stop rejection, and C/preflight misuse. Python
tests cover preflight-before-generation, memory separation at the API, manifest
binding, preservation of generation after postcheck failure and budget failure
recording. These establish API behavior, not security isolation between agents.

### B/C validation, 2026-10-26

Four native bridge tests and five Python B/C tests passed locally. The existing
accounting (10), broker/fixture runner (12) and arm-A adapter (17) tests also passed.
The native example was built with the existing locked workspace dependencies.

- `output/arm-c-native-smoke-20261026/record.json`: COMPLETED_UNGRADED, 13
  provider-reported tokens settled, approximately 36.0 s total (0.67 s preflight,
  35.0 s generation including cold load, 0.22 s native postcheck). The native WER
  and CBOR are retained in `native-evidence.json`. No signed or durable admission.
- `output/arm-b-native-smoke-20261026/record.json`: preflight allowed, generation
  hit its output cap. FAILURE/token_limit with 96 tokens settled and no native
  postcheck artifact. The supplied memory was synthetic, not learned experience.

These development attempts were not added to campaign denominators. The B failure
is preserved; there was no automatic retry or selection of a best response.
The historical B failure record contains only completed-stage timings; code now
also records duration for a failed stage and explicitly emits native_wer=NOT_CREATED
until a WER has actually been created. Historical artifacts are not rewritten.

## Byte-exact B and multi-task protocol smoke

`tests/evaluation/arm-b-byteexact-memory-v2.txt` contains exactly
`Reply with the single word OK.` without a final newline. It is synthetic context,
not learned experience or a held-out task. The v2 B development run uses 256 output
tokens and 2048 total-token postcheck budget, explicitly different from the
historical 64-output-token failed run. This is a new development configuration,
not a successful retry to replace a primary capability score.

`output/arm-b-byteexact-v2-20261026/record.json` completed ungraded with 128
provider-reported tokens, a native unsigned WER and in-memory readback. The
generated response contains explanation beyond the requested single word. No
correctness conclusion follows from execution completion.

`scripts/abc_protocol_smoke.py` runs five task IDs across A/B/C in a frozen seeded
order, sequentially and without grading. The fixture intentionally REPEATS the
same prompt five times: it tests scheduling, fresh per-execution budgets and
artifact bookkeeping, not five capabilities, task diversity or transfer. B gets
the same frozen synthetic snapshot in each execution; A/C get no memory. No arm
receives another arm's result through adapter input. All adapters run in the same
trusted host, so this is not a qualified cross-arm security boundary. API tests
cannot establish that a malicious agent cannot read host files.

```powershell
python -m unittest discover -s scripts/tests -p test_abc_protocol_smoke.py -v
python scripts/abc_protocol_smoke.py --fixture tests/evaluation/abc-development-smoke-v1.json --bridge-exe target/debug/examples/pilot_evidence.exe --output-dir output/abc-protocol-smoke
```

The new directory holds the complete frozen fixture/config/schedule, incremental
records and one exclusive subdirectory per scheduled execution. Failures are
retained once, without retries. The report counts completed-ungraded and failed
executions, not successes on a task. It always remains INCONCLUSIVE for capability.
The ordinary SUCCESS/FAILURE accounting harness is deliberately not fed invented
correctness labels for these ungraded runs. The total-token ceiling remains a
postcheck and there is no authenticated checkpoint.

### Digest reproduction and private artifacts

Native memory identity is `BLAKE3(UTF8("AKG:PILOT:MEMORY:v1") || 0x00 || UTF8(memory))`;
the separator is one NUL byte. Prompt and answer identities use the prefixes
`AKG:PILOT:PROMPT:v1` and `AKG:PILOT:ANSWER:v1`, each followed by the same NUL byte.
The new native output includes these domains in `digest_contract`. Empty memory
therefore has a domain-separated BLAKE3 digest, not SHA-256 of empty bytes.
WER and WorkIntent retain their existing native canonical contracts.

Python `digest(value)` is SHA-256 of deterministic JSON (UTF-8, sorted keys,
compact separators, no NaN). Its string digests include JSON quote bytes: the
SHA-256 for JSON string `""` is also different from SHA-256 of zero bytes. Neither
kind should be compared directly with a native domain-separated BLAKE3 digest.
The B/C wrapper records `input_snapshot` and `input_snapshot_sha256`; this binds
the saved task/memory/composed-prompt object for local reproduction. It does not
attest the runtime or turn caller-supplied memory into learned memory.

Prompts, memory snapshots, generated answers and ALL provider responses (including
partial output on a budget failure) may be private. They remain local; no automatic
publication or redaction is implemented. Partial output is diagnostic only and
does not bypass budget failure. The original failure artifacts remain unchanged.

### Completed protocol run, 2026-10-26

`output/abc-protocol-smoke-20261026/report.json` records 15 assigned executions,
14 completed ungraded and one output-token-limit failure. A and C completed 5/5;
B completed 4/5. All 15 executions have fully settled server-reported usage:
A=65, B=793 and C=65 tokens, including the failed B execution. No best-of selection
or retry was performed. The common fixture used a 256-output-token cap, CPU
placement requested, 2048-total-token postcheck budget and 90-second deadline.

The five task IDs repeat one prompt and do not demonstrate task diversity. B
varied in completion despite a fixed text/configuration; temperature zero does
not establish repeatability. All outcomes remain in the diagnostic report.

All 15 records matched their frozen scheduled order. The nine native B/C exports
from completed executions were regenerated from saved snapshots/manifests in new
processes; WER and memory digests matched, as did the Python snapshot digests.
`local-reproduction.json` explicitly records that the SAME native implementation
was used and this was NOT independent evaluation or checkpoint verification.

Three protocol-runner tests, seventeen provider-adapter tests, five B/C adapter
tests and four native bridge tests passed after the changes (29 relevant tests).
The protocol tests also check API-level memory inputs, no automatic retry, failure
cost retention and refusal to overwrite existing outputs. Security isolation,
authenticated worker signing and durable checkpoint integration remain pending.

## Lexical citation diagnostics in B

B now invokes the EXISTING native `arkhe_rag::citation::OverlapVerifier` after
successful generation. The complete response is treated as ONE host-assigned
claim against the complete frozen memory snapshot (`evidence_id=frozen-memory`).
This does not extract individual factual claims or require model-produced
citations. A/C do not receive B's memory. The enabled mode is frozen into B's
manifest and native intent parameters before generation. Missing native reports
prevent B from claiming completed verification.

The verifier checks literal case-sensitive entity presence and keyword Jaccard
overlap at the existing 0.5 threshold. Outputs are `PASS_LEXICAL`, `FAIL_LEXICAL`
or `NOT_EVALUATED` for empty answer/memory. Empty claims cannot pass vacuously.
The diagnostic is saved as `citation-report.json` and included in native evidence.
Its domain-separated digest (prefix `AKG:PILOT:CITATION-REPORT:v1` followed by NUL,
then native canonical encoding of the report) is included in the WER's existing
uncertainty note, binding this unsigned observation without changing the WER
schema. No evidence reference is falsely presented as independently admitted.

This is NOT semantic entailment, truth verification, a capability score, or a
new authorization rule. Tests explicitly show the limitation: a sentence and its
negation can both PASS_LEXICAL against the same source. A lexical rejection does
not change COMPLETED_UNGRADED into a graded failure, nor does an ALLOW from the
development gate certify the answer. A generation budget failure still prevents
postcheck, and never receives a fabricated citation result. Report text and raw
responses may contain private data; the existing local-only handling applies.

The mode is disabled by default in the native bridge so archived exports with no
citation field retain their previous identity. The current Python B wrapper
requires it explicitly. C rejects citation mode with B's memory. Historical
artifacts are preserved; new manifests identify the changed native binary.

## Measured host isolation boundary and usage breakdown

`scripts/probe_smoke_isolation.py` checks temporary synthetic sentinels only.
Host Python child processes with separate A/B/C working directories can read one
another's sentinel through an absolute path. The saved result
`output/smoke-isolation-probe-20261026.json` is therefore `NOT_ISOLATED`, NOT a
successful sandbox qualification. This is a probe of trusted host-process
privileges, not evidence that the model was given filesystem tools. No real arm
records were accessed. API routing tests do establish that A/C receive no B
memory as adapter arguments; they cannot establish filesystem confidentiality.

The existing 15-execution run was also decomposed without new inference using
`scripts/analyze_protocol_usage.py`. `output/abc-protocol-usage-20261026.json`
retains partial-output failure costs, checks provider counts against broker
settlement, and leaves cost_per_success null because grading was not performed:

| Arm | Prompt tokens | Output tokens | Total | Generation seconds | Preflight + native seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 40 | 25 | 65 | 8.65 | 0 |
| B | 125 | 668 | 793 | 68.50 | 1.65 |
| C | 40 | 25 | 65 | 8.38 | 2.52 |

The observed B/A token ratio is 12.2, including the failed B execution. The native
gate and verifier make no model call, so they contribute wall time, not model
tokens. These are observed counts and durations, not monetary prices or measured
benefit. Five repeated prompts expose variation, but do not identify its cause
or provide a reliable estimate of general capability variance.

```powershell
python -m unittest discover -s scripts/tests -p test_smoke_diagnostics.py -v
python scripts/probe_smoke_isolation.py --output output/isolation-probe.json
python scripts/analyze_protocol_usage.py --records output/abc-protocol-smoke-20261026/records.jsonl --output output/protocol-usage.json
```

### Citation integration validation, 2026-10-26

- `output/arm-b-citation-smoke-20261026/record.json`: a new actual B generation
  hit the 256-output-token limit. All 281 tokens were settled. Citation postcheck
  was NOT performed and no WER was fabricated; partial output was retained.
- `output/arm-b-citation-reanalysis-20261026/report.json`: the completed byte-exact
  v2 B export was separately reanalyzed with the new native verifier, WITHOUT new
  inference. Result `FAIL_LEXICAL`: the entity `Frozen` in the response was absent
  from the cited memory snapshot. This is the actual verifier's narrow contract,
  not a determination of truth or semantic entailment. The reanalysis has its own
  manifest, intent and unsigned WER; it does not rewrite the source execution or
  claim the new diagnostic ran during the original request.

`scripts/recheck_bc_citations.py` requires a completed ungraded B source and checks
its prompt/memory/model bindings before reanalysis. Source snapshots and outputs
remain private local artifacts under the same handling as other smoke records.
The reanalysis uses the same native implementation and is not an independent
evaluation, authenticated checkpoint or execution attestation.

```powershell
python scripts/recheck_bc_citations.py --source-dir output/arm-b-byteexact-v2-20261026 --bridge-exe target/debug/examples/pilot_evidence.exe --output-dir output/citation-reanalysis
python -m unittest discover -s scripts/tests -p test_recheck_bc_citations.py -v
```

Current targeted validation: seven native bridge tests, six B/C adapter tests,
three protocol tests, three usage/isolation diagnostic tests and three reanalysis
tests passed (22 total). Real host-process isolation was NOT achieved: the probe
documents the missing boundary rather than classifying it as a successful test.

## Explicit claims and actual source chunks

Correction to a subsequent pasted audit: `frozen-memory` was an evidence ID,
not its text. The existing whole-response check supplied the actual caller memory
as `Evidence.text`. Its rejection of `Frozen` was caused by checking the response
against that memory text, not by comparing it to the identifier. The memory and
claims were synthetic development content, and the verifier remained heuristic.

The separate native example `pilot_retrieval_citations` now accepts explicit JSON
claims and actual source chunks with host-supplied tenant/readers, expected
content digests and source references. It calls existing `authorized_retrieval`
before invoking `OverlapVerifier`. A claim can cite only an authorized chunk ID.
Identical chunk content does not transfer authorization to another chunk ID or
tenant. Unauthorized IDs fail; tampered authorized text fails closed. Empty
claim lists and extra top-level answer/metadata fields are rejected. Prompt
scaffolding is outside this structured claim interface.

This does not repair NER in arbitrary prose. The existing capitalization heuristic
can misclassify adjectives and still has known limitations. Silently ignoring
sentence-initial capitals would also hide actual entities such as Sydney. The
new tests preserve detection of that entity instead of adding a fixture-specific
Frozen exception. Explicit claims avoid treating prompt metadata as factual
claims only when the caller actually supplies the structured interface.

`scripts/run_retrieval_citation_smoke.py` reads the provider paragraph from
`integration/arkhe-ollama/README.md`, records the source's raw SHA-256, and creates
a whitespace-joined excerpt with the existing native chunk digest domain. Its
source and bridge are pinned in a new manifest. The local README is source text,
not independently verified external truth. Two HOST-AUTHORED claims are checked,
without a model call:

- The literal source paragraph: PASS_LEXICAL.
- The same paragraph with Ollama changed to UnlistedVendor: FAIL_LEXICAL,
  entity UnlistedVendor absent from the cited text.

Results: `output/retrieval-citation-smoke-20261026/report.json`. Five native tests
cover explicit claims, sentence-initial names, ACL/content integrity, same-content
cross-tenant aliases, and malformed/empty responses. One Python test covers CRLF
source extraction and evidence ID/text separation. All six passed. This is a
separate structured diagnostic: it is NOT yet the live B model's retrieval/JSON
claim-generation adapter, nor a precision/recall or entailment evaluation.

```powershell
cargo test --locked -p arkhe-runtime --example pilot_retrieval_citations
cargo build --locked -p arkhe-runtime --example pilot_retrieval_citations
python scripts/run_retrieval_citation_smoke.py --bridge-exe target/debug/examples/pilot_retrieval_citations.exe --output-dir output/retrieval-citation-smoke
```

## Actual container filesystem probe

`scripts/probe_container_arm_isolation.py` runs three temporary containers on
the existing rootless Podman `arkhe-runtime` connection. It resolves the installed
Node image to an immutable ID and uses `--pull=never`; no image is downloaded.
Each container has its own tmpfs, a read-only rootfs, no host mounts, no network,
UID/GID 65534, capabilities dropped, and no-new-privileges requested.

All three source sentinels must be positively read inside their own running
containers before cross-arm reads count. With A/B/C concurrently alive, A→B,
B→A and C→B each returned ENOENT for the target's absolute sentinel path. The
observed effective capabilities were zero. Configuration inspection confirmed
network none, read-only rootfs and no host bind/volume mounts for each container.
All temporary containers were removed afterward. No actual model or record files
were exposed to this test.

The first resource-limited attempt failed before startup because the remote
runtime could not open cgroup memory.max. Its saved report remains INCOMPLETE.
The filesystem-only v2 and three-arm v3 probes explicitly use cgroups disabled;
they do NOT enforce memory/CPU/process budgets. These were bounded trusted
synthetic processes, not untrusted agent execution. The v3 result is saved in
`output/container-arm-isolation-filesystem-v3-20261026.json` as
filesystem_probe=PASSED and sandbox_qualified_for_pilot=false. It does not
establish container escape resistance, secret isolation, syscall qualification,
provider-side containment, or integration into the current host-run adapters.

```powershell
python scripts/probe_container_arm_isolation.py --output output/container-filesystem-probe.json
```

The original host Python probe remains NOT_ISOLATED; the model adapters still run
on that host. Before an untrusted-agent pilot, the actual adapters and budget
broker must be placed behind a qualified execution boundary with enforced
resource limits. A passing synthetic container file probe is not that boundary.

## Live B: authorized retrieval -> model claims -> native lexical check

`scripts/arkhe_b_retrieval.py` now runs this local development flow:

1. Freeze config, corpus, query, limits and native binary hashes.
2. Use `authorized_retrieval` to check ACLs and chunk digests in Rust; rank only
   authorized text with the existing `Bm25Index`. Refuse generation for no hits.
3. Compose the model prompt from selected chunks only and freeze it with the JSON
   response schema before the native Simulate preflight. The schema requires
   nonempty claims and constrains citation IDs to the selected sources.
4. Make one real Ollama call. Independently parse its actual JSON response in
   Rust and check claims against the same frozen authorized retrieval selection.
5. Create the native unsigned WER and in-memory envelope. The canonical digest
   of the lexical report is bound into the WER uncertainty note. Native preflight
   and postcheck intent digests must match.

The lexical report is produced by the retrieval helper in the same trusted host
pipeline, not recomputed by the WER bridge. The native record explicitly says
`citation_report_trust=HOST_SUPPLIED_NOT_REVERIFIED_IN_BRIDGE` in that initial
profile; the bridge then checked shape and integer-only representation only.
The later native recomputation profile is described below. Neither is independent attestation,
an authenticated worker receipt or durable admission. JSON formatting is not
factual verification; the native checker still rejects malformed claim output.

`tests/evaluation/live-retrieval-local-corpus-v1.json` contains actual local README
excerpts with source hashes and a synthetic other-tenant control chunk. The corpus
and ACLs are caller-trusted, not established by an external authority. Context is
retrieved, not learned memory. The model cannot supply source ACLs, actor identity
or expected digests. Retrieval and verification share the wall-time budget, with
stages timed separately. max_tool_calls=0 means no dynamic model-issued tools,
not zero host subprocess calls. Total tokens remain POSTCHECK_ONLY, explicitly
opted into. The current adapters still run on the host.

```powershell
cargo build --locked -p arkhe-runtime --example pilot_evidence --example pilot_retrieval_citations
python scripts/arkhe_b_retrieval.py --corpus tests/evaluation/live-retrieval-local-corpus-v1.json --query "Which model does the local Ollama provider use?" --bridge-exe target/debug/examples/pilot_evidence.exe --retrieval-exe target/debug/examples/pilot_retrieval_citations.exe --output-dir output/B-live-retrieval --allow-observed-total
python -m unittest discover -s scripts/tests -p test_arkhe_b_retrieval.py -v
```

### Actual execution, 2026-10-26

`output/arm-b-live-retrieval-20261026/record.json` completed UNGRADED with 143
provider-reported tokens, all settled, in about 51.0 seconds. The model generated:

> The local Ollama provider uses the north-mini-code-1.0:latest model.

It cited the retrieved provider chunk. The private other-tenant sentinel ID and
text were absent from the frozen model prompt. This is one concrete ACL/routing
observation, not sandbox qualification. The source excerpt, actual response,
format schema, lexical report, native WER and timings are retained locally.

The lexical result was FAIL_LEXICAL: Jaccard overlap 0.3913 was below the unchanged
0.5 threshold when comparing the short claim with the longer source paragraph.
No entity substitution was rejected in this run. This exposes a length/overlap
limitation, not a semantic finding that the model claim is false. The threshold
was not changed to make the example pass. Completion is separate from lexical
support and from task correctness; semantic_entailment=NOT_MEASURED and
capability_demonstrated=false remain explicit.

Targeted validation: 8 native evidence tests, 6 native retrieval/citation tests,
3 live-retrieval adapter tests, 18 provider tests, 6 B/C tests, 1 source extraction
test and 3 protocol tests passed (45 total). Tests cover retrieval-before-model,
only selected text entering the prompt, real response being passed to the checker,
source/schema binding, external report binding into the WER, preservation of
generation on postcheck failure, and existing adapter regressions.

The local B retrieval path is integrated and exercised once. No precision/recall
study, semantic NLI, graded benchmark, cross-arm capability comparison, independent
replication or qualified pilot follows from it. The container/resource-limit front
was deliberately not changed in this step. Maturity is LEMMA for the tested local
profile: saved JSONs alone do not meet the repository's remote-CI requirements
for THEOREM. Prior artifacts and their original scope are preserved.

## Native recomputation and correction of reservation interpretation

The following distinction is required when reading broker events:

```json
{"event":"tokens_reserved","grant":0,"upper_bound":4096}
```

`grant` is the reservation ID, starting at zero. It is NOT the token quantity.
`upper_bound` is the reserved quantity. The broker increments its reserved balance
BEFORE starting the provider worker and settles that same ID afterward. Changing
grant from 0 to 4096 would change an identifier, not add a reservation. A targeted
test inspects broker state from the subprocess callback and sees the full reserved
balance before execution. Other tests cover over-admission, unsettled reservations,
single-use settlement and preservation of reported overruns.

Reservation does not imply prepayment or a provider-enforced prompt+output cap.
It controls local admission/accounting. The existing POSTCHECK_ONLY limitation
remains: provider num_predict bounds output; the adapter does not know an
independently measured full prompt-token count before inference. Strict total-cap
mode still refuses before HTTP and is not relaxed by this change.

Model digest comparison against the local catalog already runs before AND after
generation. Tests reject either a missing/mismatched initial pin or post-generation
drift. These are local-server observations, not hardware weight attestation or an
independent token meter. No service signature is created by this pipeline.

### Recomputed citation report in the WER bridge

The structured checker is now shared at
`orchestration/arkhe-runtime/examples/support/retrieval_citations.rs`; both native
CLIs compile this implementation. The live B adapter sends the complete citation
context (tenant, subject, chunks, query, top_k) in preflight and postcheck. The
domain-separated canonical context digest, using prefix
`AKG:PILOT:CITATION-CONTEXT:v1` plus NUL, is bound into WorkIntent parameters.
The context cannot include a response_json field: postcheck uses the exact answer
already bound by the native worker record. Preflight requires authorized hits.

On postcheck the bridge re-executes authorization, chunk digest validation, BM25
selection, response parsing and OverlapVerifier. It compares the complete result
against the helper report. Missing context, missing report, a changed verdict,
or a response/report mismatch is rejected before WER/evidence creation. The WER
binds the recalculated report digest in its existing uncertainty note.

The new status is `RECOMPUTED_IN_BRIDGE_SAME_IMPLEMENTATION`, deliberately not an
independent-verification claim. It detects caller/report disagreement under the
host trust assumptions; it does not remove shared code bugs, prove facts, attest
the model, provide a signature, or qualify the sandbox. Whole-response lexical
mode remains a separate development path. Historical artifacts keep their
original HOST_SUPPLIED_NOT_REVERIFIED_IN_BRIDGE status and are not rewritten.

### Actual validation, 2026-10-26

`output/arm-b-native-reverified-20261026/record.json` completed ungraded with 143
server-reported tokens in approximately 42.5 seconds. All tokens were settled.
The helper and bridge agreed exactly on FAIL_LEXICAL; the threshold was unchanged.
The private other-tenant sentinel remained absent from the saved model prompt.
The native record declares RECOMPUTED_IN_BRIDGE_SAME_IMPLEMENTATION.

The export was then reproduced in another native process. A second controlled
call changed the helper verdict to PASS_LEXICAL while retaining the actual source
and answer; the bridge rejected it with a nonzero exit and no WER output. This
used no model call and did not rewrite the original execution. Evidence:
`output/bridge-reverification-validation-20261026/report-tamper-probe.json`.

`scripts/validate_pilot_reverification.py` saves the exact local validation commands,
stdout/stderr logs, exit codes, hashes of the listed source/test files and an
after-run check that these files stayed unchanged. This is a scoped local source
manifest, not a complete dependency closure or runtime attestation. All five
commands passed:

- Broker/fixture suite: 12 tests.
- Provider adapter suite: 20 tests, including pre-worker reservation and catalog drift.
- Live B retrieval adapter: 3 tests.
- Legacy B/C adapter: 6 tests.
- Native examples: 16 tests in the bridge and 6 in the checker CLI. Six shared
  checker tests execute in both binaries; these are not independent test cases.

Logs and summary: `output/bridge-reverification-validation-20261026/`.

```powershell
python scripts/validate_pilot_reverification.py --output-dir output/native-reverification-validation
```

Saved JSON/CBOR exports remain on disk after processes exit; the in-memory
WormGraph itself does not. These local files do not constitute transactional
durable admission, append-only trusted storage, signed WERs or authenticated
checkpoints. Those capabilities remain unimplemented in this smoke profile.

## Second implementation: Python lexical and unsigned-export crosscheck

`scripts/python_citation_crosscheck.py` implements the lexical rules separately
with Python regex tokenization, sets and exact rational Jaccard. It does not
invoke the Rust checker, Rust/WASM/FFI, or the model to compute its result.
The stopword/entity contract is intentionally shared; this is implementation
diversity, not an independently designed semantic method or independent author.

Initial coverage is explicitly ASCII. Non-ASCII claims or selected evidence,
unsupported control characters, extra claim metadata and unsupported typed WER
profiles fail closed as unsupported/mismatched rather than assuming Unicode
table equivalence between Rust and Python. The tool rejects duplicate JSON keys.
It independently encodes the report and supported unsigned WER using deterministic
CBOR and the existing pure-Python BLAKE3 reference. It checks the report digest,
WER CBOR bytes and digest, report-digest note binding, and answer-output binding.
This checks consistency of unsigned artifacts, NOT their authenticity. A fully
rewritten self-consistent unsigned export is not authenticated by this procedure.
BM25/ACL decisions, source truth, model identity, signatures and semantic
entailment are outside the lexical crosscheck's scope.

`output/python-citation-crosscheck-final-20261026.json` reproduced the real
claim's FAIL_LEXICAL outcome, exact ratio 9/23 = 0.391304347826087, native report
digest `899fd3cfe6026f383f4f2f6f36fe181e333de37440818166136b177e9b2c5bdc`, and
unsigned WER encoding/digest without Rust lexical computation. The earlier
crosscheck artifact is preserved under its original source hash.

`scripts/differential_citation_crosscheck.py` runs the native checker as a separate
black-box comparator on 10 designed cases and 64 seeded cases. In
`output/python-rust-citation-differential-20261026/report.json`, all 74 matched,
including error class/entity details and scores when the native error supplies
one. Per-case inputs and both results are retained. There were no model calls.
The cases explicitly retain shared limitations: negation can pass and numeral
presence is substring-based. Agreement does not fix these heuristic defects.

Eight crosscheck tests cover the actual native golden export, rational score,
CBOR boolean encoding, altered verdict/digest/WER rejection, Unicode refusal,
duplicate/extra JSON fields and the known negation limitation. The golden export
under `tests/evaluation/python-citation-reference-export-v1` originates from the
actual local ungraded B smoke, not a new capability dataset.

```powershell
python scripts/python_citation_crosscheck.py --export-dir output/arm-b-native-reverified-20261026 --output output/python-crosscheck.json
python scripts/differential_citation_crosscheck.py --native-exe target/debug/examples/pilot_retrieval_citations.exe --output-dir output/citation-differential
python -m unittest discover -s scripts/tests -p test_python_citation_crosscheck.py -v
```

### Optional guard in live B

`arkhe_b_retrieval.py --python-crosscheck` freezes the enabled profile and Python
source hashes in the manifest. After native WER creation it checks the saved
response, selected evidence and export within the same wall-time budget. A
disagreement or unsupported input blocks completion of this profile, preserves
generation and any native WER already created, and writes a diagnostic. It never
relabels a previously created WER as nonexistent. A matching result adds
`cross_implementation_agreement=MATCHED_ASCII_LEXICAL_PROFILE` to the outer record.

The native field remains RECOMPUTED_IN_BRIDGE_SAME_IMPLEMENTATION because that
accurately describes the Rust bridge itself. It is not silently promoted to an
unqualified INDEPENDENTLY_VERIFIED label. The Python result is a separate scoped
artifact, with organizational_independence=false, unsigned authenticity not
verified, semantic_entailment=NOT_MEASURED and capability_demonstrated=false.
No trusted gate authorizes more actions because of implementation agreement.

Actual run: `output/arm-b-python-crosschecked-20261026/record.json` completed
ungraded with 143 provider-reported tokens in about 40.3 seconds. Python and Rust
matched the lexical failure and export commitments. This is one local development
run, not an independent evaluator, organizational replication or capability test.

```powershell
python scripts/arkhe_b_retrieval.py --corpus tests/evaluation/live-retrieval-local-corpus-v1.json --query "Which model does the local Ollama provider use?" --bridge-exe target/debug/examples/pilot_evidence.exe --retrieval-exe target/debug/examples/pilot_retrieval_citations.exe --output-dir output/B-python-crosschecked --allow-observed-total --python-crosscheck
```

Validation logs are retained under `output/python-citation-validation-20261026/`.
All six commands passed, with listed sources unchanged: broker 12, provider 20,
live B 5, legacy B/C 6 and Python crosscheck 8 tests; native examples execute 16
and 6 tests, with six shared tests repeated across binaries. No remote CI or
stronger maturity label is inferred from these local runs.

The token reservation interpretation is unchanged: grant 0 is an identifier,
upper_bound is the reserved amount, and pre-worker reservation is already tested.
Neither the second lexical implementation nor matching report bytes adds a hard
provider-enforced prompt+output cap, hardware attestation, semantic verification,
qualified sandbox, signature or authenticated durable checkpoint.

## External-review handoff, not simulated organizational independence

`output/citation-external-review-20261026/external-review.zip` is ready for a
reviewer outside the original author/team who has not seen the prior sources or
conversation. ONLY that ZIP is the handoff artifact. Its allowlisted public
contents are a standalone ASCII profile specification, 75 answer-free cases,
result schema, submission template, conceptual-review instructions and file
hashes. It contains neither prior implementation source nor the private answer
key. Cases include the prior 74 differential inputs and one real model-generated
claim/source pair; shuffled opaque IDs carry no verdict label. Reusing cases
does not make them a secret capability benchmark or an independent sample.

The specification at `specs/evaluation/ASCII-LEXICAL-EXTERNAL-REVIEW-v1.md` defines
token boundaries, exact entity/substrings, both stopword sets, cardinalities and
the threshold without providing an implementation. It explicitly requires a
critique of conceptual adequacy and adversarial counterexamples alongside
conformance. It was documented by the original organizer; this is not itself
an independently authored specification. A reviewer should disclose access to
prior code or this conversation, not claim blindness retrospectively.

`prepare_external_citation_review.py` keeps the expected outputs and provenance
in a separate `private/` directory, excluded from the ZIP. Do not distribute that
directory, the organizer self-test outputs, or the repository to the blind
reviewer. No reviewer was contacted and no artifact was published by this task.

`grade_external_citation_review.py` reads submitted result JSONL and hashes the
supplied source/archive as opaque bytes. It NEVER executes or extracts reviewer
code. It rejects mismatched spec/case hashes, altered package/source hashes,
duplicate or malformed rows, and reports missing/extra/different IDs without
shrinking the fixed denominator. The returned manifest records reviewer identity,
organization and source-access declarations, but these are unverified claims.
Even complete agreement leaves organizational_independence_verified=false and
production_trust_field_modified=false until independent human assessment. The
conceptual review is not scored automatically.

Six local tests passed, covering package separation, source nonexecution, false
independence promotion, denominator preservation, malformed submissions and
tampering. An explicitly labeled ORGANIZER_SELF_TEST with copied reference
answers matched 75/75 solely to validate the grading machinery. It is NOT a third
implementation or external review. Its report is kept separately under
`output/citation-external-review-selftest-20261026/`. Actual external implementation,
review and verified organizational independence remain pending.

```powershell
python scripts/prepare_external_citation_review.py --output-dir output/external-review-package
python -m unittest discover -s scripts/tests -p test_external_citation_review.py -v
python scripts/grade_external_citation_review.py --package-dir output/external-review-package --responses reviewer-results.jsonl --submission reviewer-submission.json --implementation-file reviewer-source.zip --output output/reviewer-conformance.json
```

The token budget and signing fronts were not changed by preparation of this
handoff. Reservation already occurs before inference; provider-enforced total
prompt+output admission is a separate unsatisfied requirement. Repeating reserve
and settle or renaming POSTCHECK_ONLY cannot satisfy it. Signed WERs likewise need
an explicitly trusted signer and verification policy, not a self-declared trust
promotion. A third implementation alone does not enable either property or prove
semantic support/AGI.
