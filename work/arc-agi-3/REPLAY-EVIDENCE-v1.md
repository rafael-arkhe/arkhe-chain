# Replay evidence and statistical scope

The attachment's proposal must separate three kinds of evidence:

1. A fitted model executes on a stored training input and matches its recorded
   target. This is model replay consistency, not a new environment observation.
2. A frozen model predicts a future transition before seeing that target. This
   is forward validation, scoped to the target representation and data split.
3. The environment is reset, a path is executed again, and the starting state,
   actual actions and outcomes match. This is a controlled environment replay,
   and every RESET/navigation/probe dispatch must consume the action budget.

`ModelEvidence` in `replay_evidence_audit.py` records model replay and frozen
future counters separately. Controlled environment replay remains NOT_PERFORMED.
No generic `confirmed` Boolean or causal confirmation is derived from a model
replaying its own training data. Observations remain recorded even if a model
cannot explain them. A failed model replay does not invalidate the observation.
No new policy, action budget, gate or live recorder behavior was introduced.

## Actual execution

The audit fits each trace's lookup on prefix 2500 and freezes it for suffix 2500,
using four seed-0 5000-action traces. It compares all-frame input identity with
border-2 input identity, each against retained and full last-render targets.
This is a retrospective public-development diagnostic, not a blind holdout.

All unmasked lookups reproduce every non-reset training target: 2481/2481 in
each ls20 trace and 2452/2452 in each vc33 trace. None predicts a raw pair absent
from its training prefix. Thus perfect fitted replay is compatible with zero
unseen-pair prediction coverage. Synthetic tests additionally demonstrate that
perfect replay can coexist with a wrong subsequent prediction.

For masked vc33, replay of the retained target abstains on 264/2452 observations
in the frontier trace and 175/2452 in the random trace. Training contains
conflicting retained outcomes, so the deterministic masked lookup cannot
reproduce every training transition. Both the retained and full-target replay
checks fail. The earlier retained-target future success is therefore partial
predictive utility, not a globally validated state or fully consistent model.
No candidate predicts an abstract state/action pair absent from its own prefix.

## Statistical follow-up

`paired_seed_analysis.py` analyzes the existing five policy seeds at cap 200.
It resamples entire seed vectors across both fixed games and both policies,
rather than treating individual transitions or duplicated episodes as independent.
All 5^5=3125 ordinary bootstrap draws are enumerated. The observed mean paired
difference is +0.10 completed levels per game, with descriptive percentile
interval [-0.20,+0.40]. This is post-hoc and assumes exchangeable policy-seed
blocks. It is not population inference across games, equivalence evidence or
a retrospective preregistration. With only two games, no game-cluster robust
standard error is reported. Engine seeds were not independently controlled.

The attachment alternates between twenty episodes in total and twenty per seed.
Neither count is a universal statistical rule. Two hits across two seeds are not
an inferential test or a sufficient acceptance criterion. Sample size, effect
size, dependence, multiple candidate testing and target population must be stated.

## Source checks

- Saadati's author page lists the non-LLM novelty/case-memory poster. The linked
  PDF could not be fetched here, so its detailed UI-separation and performance
  claims were not independently verified from the poster.
  https://mohammadsaadati80.github.io/
- A separate graph-exploration paper is by Rudakov, Shock and Cowley and reports
  a median 30/52 levels on six preview games. It must not be relabelled as
  Saadati's work or directly compared with the current 25-game benchmark.
  https://arxiv.org/abs/2512.24156
- Occam's 57.60% and 17/25 claims appeared in a secondary post. The cited GitHub
  endpoint returned 404 and the Zenodo record was inaccessible through the web
  tool. These numbers remain unverified here, not disproved. No Occam code was
  installed, executed or adopted as an established local baseline.
- The ztare repository was found, but the supplied exact replay/holdout quote
  and v600 statistical protocol were not located in accessible primary content.
  A project's rule would in any case not be a universal statistical standard.
  https://github.com/sparckix/ztare

The existing native API remains Allow/Reject with a reason string and a working
emergency-stop path. All current native rejections are terminal in this adapter;
the proposed `Reject(_) => continue` would weaken that contract. Missing enum
spelling is not a compilation failure or absence of emergency-stop behavior.

## Artifacts

- `output/arc3-replay-evidence-20261027/report.json`
- `output/arc3-five-seeds-200-20261027/paired-seed-analysis.json`
- `next-policy-protocol-draft.json`: prospective design, not execution-ready or
  externally preregistered. Candidate implementation and sample-size reasoning
  remain unresolved. No new environment episodes or Kaggle actions were taken.

Thirty-five Python tests pass. New tests distinguish fitted replay from future
error, abstention from successful verification, event counts from pair counts,
seed-block resampling from transition resampling, and missing/duplicate episodes.
