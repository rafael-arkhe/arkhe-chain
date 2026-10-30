# User-script adaptation: grouped offline mask diagnostic

`mask_diagnostic.py` adapts the supplied script; the original is retained under
`references/user-mask-diagnostic/` with its SHA-256 and was not executed. This
diagnostic does not change the live agent, gate or Kaggle notebook.

## Corrected contracts

- Input frames must be 64x64 integer arrays in [0,255]. Invalid values/shapes are
  rejected before uint8 conversion, rather than silently wrapping or truncating.
- Actions are canonical JSON keys, including click coordinates. Dictionary
  actions no longer fail as unhashable or collapse distinct clicks.
- Legacy pre-action rows create a transition only for consecutive t values
  within the same episode/level. Duplicate t values are rejected. Gaps and last
  rows without successors are counted. Legacy data cannot reconstruct omitted
  cross-level terminal transitions.
- The archive adapter uses each stored explicit before/after pair, preserving
  actual outcomes and visible state/level/available-action metadata. RESET is
  excluded only when explicitly marked; generic action 0 in the synthetic test
  is a legitimate movement, not an assumed ARC reset.
- Episode splits keep whole episodes disjoint. Level splits hold out level
  ordinals across all episodes, rather than episode/level instances. Such splits
  may share episodes and are not independent episode tests. Cross-level boundary
  transitions are excluded in level mode so a training target cannot import a
  held-out level. Insufficient split units are reported explicitly.
- Variance masks use only training transitions and a streaming change counter.
  Thresholds .01/.05/.1/.5 are declared before evaluation, with no automatic
  holdout-based selection. Completely erased masks are flagged as degenerate.
- Observed projected conflicts are partitioned by the same raw source AND action.
  Conflict on action A does not contaminate action B. The report distinguishes
  within-raw-pair conflicts from disagreements only across merged raw sources;
  neither label proves physical stochasticity or semantic equivalence.
- Both unique-target lookup (abstains on conflicts) and empirical-mode lookup
  are reported. Mode ties use a declared deterministic hash order, not confidence.
  All prediction ratios have query/issued/correct/unseen counts. Retained-target
  success and full-target success remain separate. Logical fragmentation stays
  undefined without independent labels.

## Synthetic control

Two episodes contain the same known sprite-motion mechanism and a changing top
row with different HUD color between episodes. Splitting by episode gives 177
training and 177 test transitions. Raw lookup has zero test coverage; border-2
lookup predicts all 177 retained targets correctly. Full-frame correct coverage
on unseen pairs is zero. These assertions are executed by `--selftest`.

The variance-.1 mask deletes the six positions occupied by the moving sprite
across three levels while retaining the low-frequency moving HUD indicator.
Thus change frequency alone is not an oracle identifying UI. The variance-.5
mask removes no cells in this fixture. No automatic mask promotion follows.

## Real archive: episode split

Input is the existing five-seed, 200-action archive: 4000 rows, 40 marked resets
excluded, 3960 explicit observed transitions. Per policy/game, seeds 0/1 are
training episodes and seeds 2/3/4 are test episodes. This is retrospective public
development validation, not a new randomized experiment or private evaluation.

| Game/policy | Test queries | Correct retained: no mask | Correct retained: border-2 |
|---|---:|---:|---:|
| ls20 frontier | 597 | 36 | 36 |
| ls20 random | 597 | 40 | 40 |
| vc33 frontier | 591 | 30 | 305 |
| vc33 random | 591 | 22 | 283 |

For unseen raw pairs, border-2 gives 277/561 correct retained targets for frontier
vc33 and 263/569 for random vc33. Correct full targets are only 2/561 and 2/569.
There are respectively 5 and 4 conflicting training pairs only across distinct
raw sources, and zero within the same observed raw source/action in these data.
These results scope the useful projection; they do not establish a sufficient
world state, policy advantage or a causal reason for the ls20 result.

## Level split and provenance

The level-mode report is partial: ls20 has only one observed level and cannot
supply a held-out level. vc33 can supply a split, with boundary transitions
excluded and shared episode identities disclosed. A partial/invalid split now
produces nonzero exit status, while preserving its report.

The first synthetic/episode reports retain their exact executed source as
`source-used-in-first-reports.py`. Aggregate exit-status reporting was added
afterwards. An initial level report is retained with its executed source but
superseded by `level-report-r2.json`, which excludes cross-level outcomes. These
repairs do not rewrite historical measurements or relabel source hashes.

Outputs: `output/arc3-grouped-mask-diagnostic-20261027/`, including
`synthetic-report.json`, `episode-report.json`, `episode-summary.json` and
`level-report-r2.json`. Forty-seven Python tests pass, covering discontinuities,
coordinate actions, real unit disjointness, level-boundary leakage, split
insufficiency, action-specific conflict attribution and degenerate masks.

## Usage from the workspace root

```powershell
.\work\arc-agi-3\.venv\Scripts\python.exe work/arc-agi-3/mask_diagnostic.py --selftest --out output/new-synthetic-report.json
.\work\arc-agi-3\.venv\Scripts\python.exe work/arc-agi-3/mask_diagnostic.py --archive-dir output/arc3-five-seeds-200-20261027 --split episode --out output/new-episode-report.json
```

For user JSONL, use the positional input path with `--split episode` or `level`.
Outputs are created exclusively so an existing report is not overwritten.
