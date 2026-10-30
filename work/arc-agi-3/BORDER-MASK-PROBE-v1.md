# Border-mask ablation: implementation and evidence

This is an offline public-development diagnostic. It reads the archived visible
frames and never executes an environment, external notebook or game source.
Neither the live agent nor the gate was changed. No mask was promoted.

## Primary-source checks

- OPINE-World reports 20/25 public games and score 78.4. Its programmatic object
  rules depend on observable context; color/shape plus action is not its full
  model. The paper describes heuristic, potentially ambiguous object pairing.
  Sources: https://arxiv.org/abs/2607.01531 and
  https://david-courtis.github.io/opine-world/
- The downloaded URAD 0.6 notebook contains `stable_picture_key`, which zeros
  the first/last two rows on 64-row boards. This verifies the implementation of
  the heuristic, not an ablation proving its efficacy or safety on Arkhe.
  The notebook was not executed or copied into the agent. Source bytes/hash and
  extracted helper are retained under `references/urad06/`.
  Source: https://www.kaggle.com/code/boristown/arc-agi-3-urad-0-6-candidate
- Twin reports replay validation and 179/183 levels. Replay consistency is a
  model acceptance check, not proof of correctness on an unseen transition.
  Source: https://arxiv.org/abs/2608.14490
- AnyGoal studies recombinations of factors within marginal training support.
  A new raw pixel hash alone does not establish compositional generalization.
  Source: https://arxiv.org/abs/2610.26844

These are external public results under their own configurations. They do not
establish transfer to this agent, private-game performance or AGI. The Grid-JEPA
and Tycho claims were not needed for this probe and were not independently
verified here. No architecture was adopted merely from a paper's headline score.

## Protocol

Six declared identities are compared: all-frame identity, last frame alone, and
zeroing 1/2/4/8 rows at both ends of the last frame. State, completed-level count
and available actions remain in the key. Click coordinates remain absolute.
These are candidate border masks, not ground-truth HUD annotations.

Each trace has its own training-prefix lookup. Training observations with
conflicting targets cause abstention. The fitted maps are frozen during the test
suffix, and their hashes are checked afterwards. This is a retrospective
chronological split, not a blind or private holdout. Predictions are evaluated
against two targets: the retained/masked next render with state metadata, and
the entire unmasked next render with metadata.

The reports distinguish issued-prediction frequency, accuracy on issued
predictions and correct predictions divided by all eligible unseen-pair queries.
Raw unseen pairs are partitioned further into cases whose raw state and action
were both separately seen during training. Every lookup prediction still uses
an abstract state/action pair observed during training: there is no newly
synthesized transition rule or prediction on an unseen abstract pair.

Hash compression is reported as distinct raw source hashes per abstract training
group, with alias-group and next-target-conflict counts. This is not logical
fragmentation. Logical-state count and fragmentation_rate remain null because
no independently validated logical-state equivalence exists. Thresholds such as
2, 3 or 10 hashes per logical state are not adopted without justification.

The large diagnostic uses the four seed-0 5000-action traces, prefix 2500 and
suffix 2500. A separate follow-up uses all 20 five-seed 200-action traces with
prefix/suffix 100. These are two scopes, not five seeds at 5000 actions.

## Seed-0 5000-action findings for border-2

| Trace | Raw source hashes | Masked source hashes | Correct coverage on unseen raw pairs, retained target | Full target |
|---|---:|---:|---:|---:|
| frontier ls20 | 1804 | 1798 | 1/2348 (0.043%) | 1/2348 |
| random ls20 | 1704 | 1697 | 0/1896 | 0/1896 |
| frontier vc33 | 879 | 36 | 1810/2402 (75.35%) | 0/2402 |
| random vc33 | 906 | 37 | 1643/2041 (80.50%) | 0/2041 |

On unseen raw vc33 pairs where the masked lookup issued predictions, accuracy
is 97.89% (frontier) and 97.68% (random). Persistence on those exact same queries
is 86.37% and 85.97%. The model correctly predicts 216/252 and 199/236 issued
queries with observed retained-target changes, so the conditional improvement
is not only from unchanged renders. Persistence nevertheless predicts on all
queries, whereas lookup abstains; full population coverage and conditional
accuracy must not be interchanged.

The mask merges training groups with conflicting retained outcomes (37/36 in the
vc33 traces; see the report for exact counts), and many more conflicting full
outcomes. Masking therefore does not prove harmless information removal or a
sufficient Markov state. For ls20, the two-row mask barely changes state counts.
The experiment does not show that a generic HUD mask fixes the observed agent.

## Artifacts and limits

- `output/arc3-border-mask-probe-v1-20261027/`: declared plan, frozen-model
  diagnostics and same-query persistence control.
- `output/arc3-border-mask-five-seeds-20261027/`: short-run follow-up.
- `border_mask_probe.py` and `compare_mask_persistence.py`: analysis only.
- Thirty Python tests pass, including border behavior, retained metadata,
  conflict abstention, frozen predictions and the earlier recorder/model tests.

The next gate for adoption is a policy comparison preserving access to omitted
resource/goal information, with a fixed mask choice and a distinct validation
set. Compression and masked-render accuracy alone do not establish better
planning, completed levels, full dynamics, safety or private generalization.

## Five-seed short-trace follow-up

All 20 traces completed all six configurations (120 trace/configuration results).
For border-2, pooled suffix counts yield correct retained-target coverage on
unseen raw pairs of 120/490 (24.49%) for frontier vc33 and 129/484 (26.65%) for
random vc33. Both ls20 policies have zero correct retained-target predictions on
their unseen raw pairs. Full-target correct coverage is zero in all four groups.
These pooled query counts are not independent episodes or a significance test.
They are five policy seeds at a 200-action cap with prefix/suffix 100, distinct
from the seed-0 prefix/suffix 2500 result above.
