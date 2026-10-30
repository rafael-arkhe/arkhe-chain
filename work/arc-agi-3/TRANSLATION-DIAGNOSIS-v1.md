# Translation probe: controls, train/test fit and selected visual pairs

This diagnostic implements the requested positive control and extractor inspection
using the original TranslationModel and archived visible frames. No ARC game
source was inspected, no ARC environment step was dispatched, no live policy
was changed and no Kaggle operation was performed.

## Positive control and a competing explanation

`SpriteWorld` is an explicitly synthetic 10x10 grid containing one 2x2 sprite.
Each cardinal action moves it by one cell when free. Eight training transitions
at two positions produce 8/8 exact training predictions. Sixteen tests at four
other positions produce 16/16 exact full-render predictions, with no test raw
state/action pair in training. The model remains frozen during assessment.

Thus the same learner can recover simple translation and transfer it to new
positions under this controlled phenomenon. This does not exclude every possible
implementation/data-path bug or validate ARC performance. A smaller positive
unit test already existed; this expands it into a measured control artifact.

A second control adds one blocked rightward movement at the screen edge. Sprite
segmentation and signature stay stable, but rightward displacement becomes
conditional: the training data contains both +1 and 0. The original unconditional
model consequently abstains on all rightward predictions: 3/9 training queries
and 4/16 test queries. This reproduces abstention without an unstable extractor.
It demonstrates that H1/H2/H3 should not be treated as mutually exclusive or
exhaustive, and that a stable extractor alone does not make this model adequate.

## Frozen fit on the original ARC traces

Original exported models are restored with their original minimum support and
their export digests checked against the previous probe report. They are not
refitted or tuned for this diagnostic. Each trace uses prefix/suffix 2500.

| Trace | Train queries | Train predictions | Test queries | Test predictions |
|---|---:|---:|---:|---:|
| frontier ls20 | 2481 | 0 | 2481 | 0 |
| random ls20 | 2481 | 0 | 2481 | 0 |
| frontier vc33 | 2452 | 0 | 2451 | 0 |
| random vc33 | 2452 | 0 | 2451 | 0 |

For ls20, every query abstains for lack of a supported consistent nonzero
translation. For vc33, every query is an unsupported click action. Exact
reproduction over all queries is 0; conditional prediction accuracy is null,
not zero or perfect. This is failure to reproduce the observed training frames,
not merely failure on future inputs. The model has learned stationary and
conflicting region/action effects, but its acceptance/prediction rules do not
produce a supported full-frame forecast. The target includes visible UI changes.

## Three selected pairs, inspected visually

Selection is deterministic and retrospective: find the earliest uniquely matched
moving region whose fitted action/signature key has conflicting outcomes, then
the earliest stationary and another moving example for that same key. This is
not a random sample for estimating tracking accuracy. Matching by signature makes
signature equality a selection condition, not independent evidence of identity.

The selected frontier-ls20 region has color index 9, normalized area 15 and
appears as part of a multicolor block in the displayed observations:

| Step | Action id | Before position | After position | Displacement |
|---|---:|---|---|---|
| 1 | 4 | (34,47) | (39,47) | (+5,0) |
| 78 | 4 | (24,37) | (24,37) | (0,0) |
| 2 | 4 | (39,47) | (44,47) | (+5,0) |

All six before/after observations contain one frame layer. The component's
appearance and location are visually compatible with the selected associations.
This is evidence against assuming that every conflicting rule is caused by
lost shape identity. Movement conditional on visible surroundings is a plausible
next hypothesis, not an established collision law or global tracking guarantee.
There are no independent semantic object IDs; H2 remains unresolved globally.
The illustration uses index-based display colors, not semantic color labels.

## Next experiment boundary

Retain these controls. Add blocked/free layouts with independently known sprite
IDs, distractors, duplicate appearances and shape changes to measure matching
errors. Test a conditional displacement hypothesis using training-derived local
context, including zero displacement as a legitimate effect. Freeze that model
before validation on new positions and obstacle layouts, and report region-motion
fit separately from full-render/UI fit. Do not infer whole-world or goal
prediction from matching one region. Hold extraction fixed for the first model
ablation so that a policy/representation/model bundle does not confound the result.

Neither neural networks nor LLM program synthesis follow as a necessity from
the present controls. A lookup remains useful as a baseline; this experiment
does not replace or qualify the live solver.

## Artifacts and repair history

The successful run is `output/arc3-translation-diagnosis-20261027-r2/`:
`synthetic-controls.json`, `report.json`, `ls20-pair-inspection.json` and PNG.
The first run is retained with a failure receipt: a plotting coordinate bug
occurred after the positive control and first fit measurement. It was corrected
and covered by a synthetic end-to-end plot test before the separate r2 run.
Thirty-nine Python tests pass. This remains local LEMMA, not remote CI THEOREM.
