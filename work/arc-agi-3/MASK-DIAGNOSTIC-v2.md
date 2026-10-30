# V2: grouped OOF evaluation with fixed targets

`mask_diagnostic_v2.py` adapts the second supplied script without modifying the
v1 script, live agent, gate or Kaggle notebook. It reuses v1 input validation,
coordinate-safe actions, explicit archive transitions and boundary filtering.

## Target correction and controls

A common target is necessary for comparing feature masks, but an intersection
learned from the training set can delete the phenomenon being predicted. It also
varies across folds. Therefore two targets are fixed before evaluation and held
constant across feature masks and folds:

- Full last render plus supplied visible context.
- Central 56 rows (rows 4..59), with the same visible context.

The learned intersection is retained only as an auxiliary per-fold diagnostic.
Its hash and kept-cell count are recorded. Its errors are never pooled into a
single fixed-target bootstrap. The fixed central area is a coordinate projection,
not an annotation of gameplay or a guarantee that removed rows contain only UI.

The independent-HUD synthetic control uses six episodes and two levels. In
three-fold episode OOF evaluation, border-2 and border-4 predict all 708 fixed-core
targets correctly. Raw lookup finds no matching held-out inputs. Masked lookup
does not correctly reproduce the full held-out frames with different HUD colors.

The negative control encodes a direction-inverting flag in row 0. With the
unmasked input, fixed-core prediction is 354/354 correct. Border masking loses
the flag and gives 234/354: 33.90% error. The training-derived intersection
nevertheless gives apparent zero error for that same border-masked predictor,
because it deletes the actor's changing pixels. Its 3578 kept cells do not make
it semantically adequate. This demonstrates why nonempty common intersections
must not be treated automatically as a fair or useful prediction target.

These assertions are executed by `--selftest`, including exact full/core target
separation. They validate the diagnostic on known synthetic mechanisms, not ARC
generalization or a latent-state abstraction.

## Splits, inputs and uncertainty

- Episode IDs are namespaced by input filename by default. Explicit
  `--merge-file-episodes` permits chunked episodes, while duplicate steps still
  fail. Original string IDs are preserved rather than coerced to integers.
- Both frame and next_frame are validated. Explicit and inferred outcomes may
  coexist, but inferred successors must be consecutive within the same unit.
- `--split level` means level ordinal across episodes, not episode/level instance.
  Cross-level boundary outcomes are removed, preserving the v1 leakage guard.
- Grouped K-fold assigns each group to exactly one test fold and never includes
  it in that fold's training. Insufficient or empty folds are reported, not
  discarded. Masks and lookups are fitted only on each fold's training data.
- Per-mask model hashes are checked unchanged on test. Training metrics remain
  per-fold descriptive values; their fold variance is not reported as an SE.
- Observed conflict-support classes preserve raw source AND action. They are not
  interpreted as physical randomness or a causal decomposition of aliasing.
- Empirical-mode lookup and conflict-abstaining lookup are both reported.
  Bootstrap draws resample the same episode-group IDs for all masks, producing
  paired correct-coverage contrasts. Undefined error draws and their counts are
  explicit. A zero prediction denominator never becomes zero error.

Bootstrap intervals are conditional descriptive intervals on the fitted OOF
predictions. Models and masks are not refitted inside bootstrap; training-set
uncertainty and dependence from overlapping fold training are not fully modeled.
Five groups per policy/game remain a small sample. The fewer-than-20 warning is
a heuristic warning, not a power calculation or an acceptance threshold. Results
do not imply population inference over unseen games or official RHAE gains.

## Actual five-fold archive result

The existing five policy seeds at cap 200 are reused, with no new ARC actions.
There are 4000 input rows and 3960 non-reset transitions. Each transition is
evaluated once OOF. Four policy/game groups complete all five episode folds.
Variance threshold is fixed at .5, bootstrap draws at 1000 and split seed at 0.

For empirical-mode lookup, counts are correct predictions divided by all queries
(abstentions do not disappear from this denominator):

| vc33 policy | Queries | Fixed core, raw | Fixed core, border-2 | Full target, raw | Full target, border-2 |
|---|---:|---:|---:|---:|---:|
| frontier | 985 | 66 | 683 | 66 | 31 |
| random | 985 | 58 | 574 | 58 | 26 |

Border-2 boosts fixed-core correct coverage by 62.64 and 52.39 percentage points,
but lowers full-target correct coverage by 3.55 and 3.25 points. Conditional
full-target error on its issued predictions is about 95.5%. These are different
targets and must not be substituted for each other. Border-2 does not change the
ls20 counts: 103/995 for frontier and 106/995 for random under either target.

The result supports a limited visual projection in vc33, not a full world model,
semantic equivalence, improved action selection or automatic mask promotion.
The model remains lookup on trained abstract pairs; no unseen abstract transition
rule is synthesized. Logical fragmentation_rate remains undefined.

## Artifacts

`output/arc3-mask-diagnostic-v2-20261027/` contains synthetic assertions, the full
episode OOF report and the summary. The original user script is retained under
`references/user-mask-diagnostic-v2/`, unexecuted. Source, helper and input hashes
are recorded. Fifty-two Python tests pass; no new environment or Kaggle run was
performed.

```powershell
.\work\arc-agi-3\.venv\Scripts\python.exe work/arc-agi-3/mask_diagnostic_v2.py --selftest --out output/new-v2-selftest.json
.\work\arc-agi-3\.venv\Scripts\python.exe work/arc-agi-3/mask_diagnostic_v2.py --archive-dir output/arc3-five-seeds-200-20261027 --split episode --folds 5 --boot 1000 --out output/new-v2-oof.json
```
