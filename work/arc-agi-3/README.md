## Proposer com JSON Schema

134 testes passaram.3 respostas completas válidas/tipadas chegaram ao replay;3 falharam por retornar identidade.1erro operacional CUDA. Veja [LOCAL-PROPOSER-SCHEMA-v1.md](LOCAL-PROPOSER-SCHEMA-v1.md).

## Proposer local: exemplos genéricos

129 testes passaram. Nova condição de prompt:4 respostas reais,4 rejeições estruturais,0 replay. Veja [LOCAL-PROPOSER-EXAMPLES-v1.md](LOCAL-PROPOSER-EXAMPLES-v1.md).

## Proposer real local

Ollama conectado ao ciclo DSL:4 chamadas,3 respostas rejeitadas no parser e1 erro operacional; nenhum replayPASS.127 testes passaram. Veja [LOCAL-PROPOSER-v1.md](LOCAL-PROPOSER-v1.md).

## Interface de propostas DSL

Parser e ciclo de reparo pelo treino implementados; 125 testes passaram. Controle com fixture conhecida, sem chamadas LLM. Veja [DSL-PROPOSAL-INTERFACE-v1.md](DSL-PROPOSAL-INTERFACE-v1.md).

## Busca tipada do DSL

117 testes passaram. Dois controles de síntese executados: busca incompleta na geração, até tamanho5 concluído; nenhum programa recuperado. Veja [FINITE-DSL-SEARCH-v1.md](FINITE-DSL-SEARCH-v1.md).

## Interpretador do DSL: controles dinâmicos

Add saturado e interpretador restrito implementados. 113 testes passaram; controles de clique, movimento e memória executados manualmente. Busca ainda não implementada. Veja [FINITE-DSL-RUNTIME-v1.md](FINITE-DSL-RUNTIME-v1.md).

## Probe de transição com contexto local

Variante offline e controles de movimento/bloqueio e modo oculto. Veja [CONTEXT-PROBE-v1.md](CONTEXT-PROBE-v1.md).

## Diagnóstico de máscaras v3

Resumo exploratório com alvos fixos, perda seletiva e quatro controles sintéticos. 57 testes passaram. Veja [MASK-DIAGNOSTIC-v3.md](MASK-DIAGNOSTIC-v3.md). Nenhuma máscara promovida à política ativa.

# ARC-AGI-3: local baseline preparation

## Grouped OOF mask diagnostic v2

[MASK-DIAGNOSTIC-v2.md](MASK-DIAGNOSTIC-v2.md) adds grouped folds, paired conditional
bootstrap, fixed full/core targets and positive/negative controls. The negative
control shows a learned common intersection hiding a genuine prediction error,
so that target is auxiliary and never pooled. Five-fold existing-archive results
show vc33 fixed-core gains but full-frame losses for border-2; ls20 is unchanged.
No mask or new policy was promoted. Fifty-two Python tests pass.

## Grouped user-script mask diagnostic

[MASK-DIAGNOSTIC-v1.md](MASK-DIAGNOSTIC-v1.md) documents the corrected adaptation
of the supplied JSONL script: consecutive transitions, coordinate-safe actions,
episode/level holdouts, boundary-leakage prevention, training-only variance masks,
action-specific conflict attribution and full/retained target separation.
Synthetic assertions pass and the existing five-seed archive was analyzed without
new environment actions. The live policy remains unchanged; 47 tests pass.

## Translation positive control and extraction inspection

See [TRANSLATION-DIAGNOSIS-v1.md](TRANSLATION-DIAGNOSIS-v1.md). The measured 10x10
control predicts 8/8 training and 16/16 unseen-position transitions. Adding a
blocked movement produces abstention even with stable extraction. Original ls20
models abstain on every training and test query; selected archived frame pairs
show the same candidate region moving +5 or staying still for action 4. This
supports testing conditional dynamics without claiming global extractor accuracy.
The successful run is `output/arc3-translation-diagnosis-20261027-r2`; 39 tests
pass. The live agent, original frozen models and Kaggle state are unchanged.

## Offline border-mask ablation

See [BORDER-MASK-PROBE-v1.md](BORDER-MASK-PROBE-v1.md) for the primary-source
checks, 24 large-trace and 120 short-trace configuration results, and same-query
persistence control. A two-row border mask barely compresses ls20 and strongly
compresses vc33; retained-target prediction improvements do not establish
full-state equivalence or policy gains. Logical fragmentation stays undefined.
No live policy, gate or Kaggle notebook was changed. Thirty Python tests pass.

## Offline region-model probe

See [OBJECT-PROBE-v1.md](OBJECT-PROBE-v1.md) for the executed, frozen-prefix
candidate model of palette-region translations. It issued no predictions on
9864 suffix queries: ls20 had no sufficiently supported consistent nonzero
translation rules, and vc33 click actions were unsupported. This is a negative
candidate-model result, not a live policy change, semantic-object validation,
fragmentation measurement or private benchmark. Outputs are in
`output/arc3-object-probe-v1-20261027`; 26 Python tests pass.

## Current recorder profile

The live agent is now `arc-observation-explorer-v2-recorder`. See
[RECORDER-v2.md](RECORDER-v2.md) for the implemented policy/model/recorder separation,
pre-dispatch prediction journal, recoverable hashed pixel snapshots, explicit
metric denominators, native binding probe and completed 80/200/1000/5000 budget
matrix. This newer profile is prepared locally, not uploaded or submitted to
Kaggle. Historical private Kaggle version 1 remains the earlier profile.

## Experimental Arkhe integration (2026-10-27)

The first observation-only explorer is `arkhe_agent.py`, independent of the
historical official baseline below. It builds a graph of observed pixel-state
transitions, chooses untried legal actions, and searches learned edges toward
unexplored actions. Click candidates come from visible palette components plus
a coarse grid. It contains no game-ID strategy, solved routes, engine introspection
or LLM. This does not yet implement learned goal discovery, causal abstraction,
or the existing Arkhe cognition crates' world model/learning modules.

`arc_action_gate.rs` is a real native adapter to ContainmentGate with
DevPolicyResolver, canonical WorkIntent and unsigned WorkerExecutionRecord,
followed by in-memory WormGraph readback. Preflight is required before dispatch;
record binds the host-reported outcome. Bridge failure is fatal, with no silent
fallback. This is an unprotected simulation policy, not a production sandbox,
signed trajectory, durable admission, external checkpoint or execution attestation.
The Python JSONL hash chain is host-generated and unsigned.

`evaluate_arkhe.py` compares a seeded random control using the same advertised
candidate actions with the frontier policy, and the frontier policy with the
native observer. Each agent/game gets fresh memory and an exact dispatch budget.
The seed controls the policy, not an independently verified engine seed.
The random control is not the historical official random starter.

Actual public smoke: `output/arc3-arkhe-paired-20261027-r2/report.json`.
Six runs completed, each with exactly 80 actions. Random: ls20=0 levels, vc33=1;
frontier: both 0; frontier+native: both 0. The two frontier trajectories match
exactly across observer on/off. This single-seed, two-game development result
shows no policy advantage. Pixel-state identity is too fine-grained for many
revisits (80 observed states in ls20), limiting the graph's utility.
The first run is retained separately as FAILED because numeric GameAction
construction was incompatible with the SDK; the fixed version resolves by name.

Seven Python tests and two native example tests passed. Trace verification checks
host hash continuity, step budgets and intent/worker input consistency; it does
not independently attest the environment, verify signatures or grade semantics.

Linux bridge built in WSL Ubuntu with Rust 1.96.0, `cargo build --locked`, separate
target directory `/home/arkhen/.cache/arkhe-arc3-target`, then stripped. It depends
on glibc/libm/libgcc, so Kaggle execution is necessary for compatibility validation.
`build_arkhe_notebook.py` embeds the binary compressed with XZ (the initial gzip
notebook exceeded Kaggle's 1 MB source limit). The private CPU/offline notebook
executes native allow/record/emergency-stop self-tests even in commit mode; actual
gameplay remains the competition gateway's rerun path. No production signatures
or local Ollama are embedded. The historical baseline submission is 57682958,
COMPLETE with public score 0.00; it did not contain this native integration.

The private notebook `henark/arkhe-arc3-native-explorer`, version 1, completed
successfully on Kaggle. Downloaded native-selftest.json reports PASS and the
expected binary hash. Fixed-fixture intent/worker digests match Windows, Linux
and Kaggle. Evidence is in `output/arc3-native-kaggle-v1/integration-receipt.json`.
This confirms native runtime compatibility and bootstrap checks, not hidden-game
play. No competition submission of this new profile was sent: local policy
advantage has not been demonstrated. The new agent is not the full Arkhe cognitive
architecture, and the gate's observer role does not improve its policy by itself.

### Post-hoc exploration audit

`analyze_exploration.py` analyzes existing traces without changing the policy or
dispatching more actions. Two diagnostic tests passed. Results are in
`output/arc3-arkhe-paired-20261027-r2/exploration-diagnostics.json`.
Repeat ratio (repeated exact source-state/action pairs divided by non-reset
actions) is 0 in all six traces, including the random control. Coordinates are
part of click identity. ls20 has 80 distinct source hashes in 80 actions for both
policies. vc33 has 77 source hashes in 79 non-reset frontier actions, and 78 for
the random control. Random vc33 first completes a level at dispatch 60.

Thus exact-state repetition collapse is not observed, and zero repetition is
not sufficient evidence of useful exploration. Semantic repetition can remain
hidden by over-fine pixel state identity; no causal attribution to HUD/animation
has been established because these traces retain hashes, not complete frames.
The current explorer already has an observed transition graph and frontier BFS.
Missing capabilities include validated state abstraction, object dynamics,
goal inference and prediction on unseen transitions. One public seed does not
establish statistical superiority or inferiority of either policy. Native timing
overhead is measured (roughly 27/29 s versus 0.8/1.4 s), so working integration
does not establish that it cannot become a wall-clock bottleneck.

Future model validation must distinguish fitting/replaying observed transitions
from predicting held-out transitions. Requiring accurate prediction for every
exploratory action would prevent probing unknown dynamics; bounded exploration
must have an explicit policy rather than treating confidence as proof.

The expanded analyzer now writes `exploration-diagnostics-v2.json`, retaining
the first report. Six diagnostic tests pass. It separates repeated source/action
pairs, repeated exact transition triples, new outcomes for previously seen pairs,
source-state coverage, pair novelty and levels normalized per 100 total dispatches.
Repeating a known triple is not classified as being stuck: it can be navigation
or confirmation. Under these definitions, same-outcome repeats are a subset of
pair repeats, and pair novelty equals one minus pair repeat ratio. These metrics
cannot be treated as independent evidence of learning.

A diagnostic-only empirical TransitionModel predicts before incorporating each
current outcome, abstaining on unknown pairs or tied modes. All six real traces
have pair novelty 1.0 and prediction coverage 0.0, so prediction error is null
(not zero). It is an exact-lookup diagnostic with no unseen-pair generalization,
not a new live policy, held-out state abstraction, or verified semantic model.
Normalized levels/100 actions are 1.25 for random vc33 and zero for the other runs;
this is arithmetic normalization of 80-action runs, not a 100-action measurement.
No policy, native binary or Kaggle notebook was changed for this analysis.

Architectural boundaries remain explicit: the Python graph learns from observed
frame results in-process; native WER binds digests of host-reported inputs/outcomes.
The native WormGraph is recreated per bridge request and does not accumulate a
durable cross-step transition dataset. The gate enforces its development policy;
it neither learns dynamics nor records exploration by itself.

Prepared on 2026-10-26 after the user confirmed competition registration.
This workspace is independent of the active Arkhe Rust workspace. It currently
captures the OFFICIAL random starter, not an Arkhe cognitive solver.

## Actual baseline

The official starter ran through the real SDK on public ls20 and vc33 games with
arc-agi 0.9.9, arcengine 0.9.3, Python 3.12.13 and an isolated local virtualenv.
Both completed the process with zero completed levels and reported score 0.0.
This is a local public smoke, not Kaggle evaluation or AGI evidence. The starter
uses time/hash-based random seeding; trajectories are not reproducibly seeded.

The official loop uses `action_counter <= MAX_ACTIONS`: the requested 50-step
smoke produced 51 actions per game. It was left unchanged as an upstream baseline.
Any future Arkhe action budget must count actual dispatched actions and terminate
before dispatch, rather than inheriting that boundary unchecked.

Run again into a new directory:

```powershell
.\.venv\Scripts\python.exe verify_local.py --output-dir D:\arkhe\output\arc-official-baseline-new
```

Source pins live in source-pins.json; package versions in requirements.lock and
each run's requirements.freeze.txt. These are version pins, not a cryptographic
build attestation or a platform-independent wheel lock. The reference repos are
cloned locally, not published or absorbed into Arkhe. The framework's init is
modified only by the official starter's slim_framework.py; its hash is recorded.

`verify_local.py` captures logs, source hashes, actual levels/actions and process
status. It also generates a CPU notebook using the official builder and checks
the agent cell AST and internet-disabled metadata. It DOES NOT execute the
notebook/gateway, qualify the output parquet or consume a Kaggle submission.
The official agent remains random and unmodified. Its native Arkhe integration,
WorkIntent/ContainmentGate action path, WER trajectory and signed checkpoints are
NOT IMPLEMENTED in this competition profile.

## Verified contract and roadmap

The official framework subclasses agents.agent.Agent and expects
is_done(frames, latest_frame) and choose_action(frames, latest_frame) returning
GameAction. The attached design's observation/history signature is not this API.
No language model is required: the reference starter is non-ML and supports CPU.
Kaggle evaluation disables external internet; the desktop Ollama service cannot
be treated as an available competition provider. Any chosen model must be
packaged for the permitted offline runtime and evaluated under its limits.

Prioritize a solver with observation-only exploration, transition prediction,
goal discovery and planning. First compare a reproducibly seeded agent without
the Arkhe observer against the same agent with it, under the same actions/time
and permitted observation interface. Measure completed levels and official RHAE,
not the number of signed records. Never inspect hidden environment internals for
a strategy. Keep public-game development and private evaluation distinct.

The .ark language remains a separate design proposal. A compiler frontend is
not needed to validate a game agent, and cannot create trusted signatures or
external checkpoints by compilation alone. No grammar/compiler was implemented
here. Existing typed artifacts and runtime contracts must be checked individually
before claiming a new DSL emits compatible objects.

## Primary sources consulted

- https://www.kaggle.com/competitions/arc-prize-2026-arc-agi-3
- https://www.kaggle.com/competitions/arc-prize-2026-arc-agi-3/overview/evaluation
- https://arcprize.org/competitions/2026/arc-agi-3
- https://github.com/arcprize/ARC-AGI-3-Kaggle-Starter
- https://github.com/arcprize/ARC-AGI-3-Agents

The indexed Kaggle page lists final submission on November 2, 2026, 23:59 UTC
(20:59 Sao Paulo), and nine-hour CPU/GPU notebook limits. Competition rules and
mounted SDK assets must be rechecked before an actual submission. Official
prize eligibility requires open source; the general rules specify CC0/MIT-0 for
submitter-authored code and publicly shareable licenses for third-party code.
The framework includes its upstream MIT license. The current reference workspace
is private local preparation, not a published or prize-qualified solution.
