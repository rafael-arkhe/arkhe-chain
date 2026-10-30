# Candidate palette-region transition model: scope

`object_transition_probe.py` is an offline diagnostic, separate from the live
agent, gate, recorder and Kaggle notebook. It reads archived observations only.
It neither reads game source nor dispatches environment actions.

The candidate scene representation extracts 4-connected same-color regions from
the last rendered grid. The most frequent color is the candidate background.
Each remaining region has color, exact normalized shape and position. A synthetic
test verifies exact pixel reconstruction, including irregular shapes. These
regions are not validated semantic objects, UI elements, goals or causal entities.
This representation does not supply ground-truth logical-state labels or make
the logical fragmentation ratio identifiable.

The model learns displacement counts for `(action id, color/shape signature)`.
It matches a region across frames only if the signature is unique in each scene.
Conflicting observed displacement, insufficient support, collisions and screen
bounds cause abstention. Click actions are deliberately unsupported: treating
all clicks as the same action would discard their coordinates. No game-ID branch,
pretrained model, engine internals or hand-written solution is used.

For each of the four seed-0 5000-action traces, the first 2500 dispatches are the
training prefix and the last 2500 are the evaluation suffix. Models are separate
per trace and frozen before suffix evaluation. Reset actions are excluded from
prediction queries. The model's exported hash is checked after evaluation.
The plan records source and trace hashes before fitting. This is a retrospective
chronological development split chosen after seeing aggregate benchmark results,
not a blind confirmatory holdout or private-game evaluation.

Targets are complete last-render pixels. Baselines are frozen exact lookup and
copying the current render (persistence). Reports distinguish overall prediction
frequency, predictions on raw state/action pairs absent from the training prefix,
exact-render accuracy and pixel error on the same issued-prediction queries.
Abstention yields zero coverage and undefined accuracy, not zero error or success.
Correct object motion alone would not establish correct goal inference, planning
or full-frame prediction. The same object/action need not have the same effect
under different obstacles, resources, interactions or latent state.

Five new tests cover scene reconstruction, position-independent translation on
synthetic boards, conflicting observations, freeze/bounds behavior and click
abstention. Together with the existing suite, 26 Python tests pass. Synthetic
transfer tests validate the implementation, not ARC generalization.

The output directory is `output/arc3-object-probe-v1-20261027`. The live policy and
all previous reports remain unchanged. No Kaggle execution or submission is part
of this probe.

## Executed result

All four chronological probes completed. Training uses 2481 non-reset transitions
per ls20 trace and 2452 per vc33 trace. Test contains 2481 non-reset queries per
ls20 trace and 2451 per vc33 trace: 9864 total, including 8687 raw state/action
pairs not present in the respective training prefix.

No object-model predictions were issued. Therefore prediction frequency is zero
and accuracy/error are undefined, not perfect. For ls20, the frontier model has
134 stationary-only keys and 12 conflicting-outcome keys; the random model has
138 stationary-only keys and 12 conflicting-outcome keys. Neither has a supported
consistent nonzero translation rule. For vc33, all queries are unsupported click
actions; this candidate cannot evaluate click dynamics or establish their
learnability. The frozen lookup baseline predicts only already trained raw pairs.

This result rejects using this simple context-independent, conservative region
translation model as a useful predictor on these traces. It does not reject
object-centric modeling in general or establish state fragmentation as the cause.
Color/shape signatures are candidate identities, and matching can be ambiguous.
Conditional dynamics, occupancy, object interaction, goal hypotheses and click
effects remain unimplemented. No policy promotion or broader benchmark is
justified by this result. Source/trace hashes and frozen model hashes were checked.
