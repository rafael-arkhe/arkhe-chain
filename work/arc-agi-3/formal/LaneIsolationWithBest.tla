--------------------- MODULE LaneIsolationWithBest ----------------------------
\* Audit facade over the already checked incumbent state machine.
EXTENDS LaneIncumbent
BestIsAdmissible == (best > 0 /\ admitted # {}) =>
    (best \in admitted \/ \E v \in admitted : scores[v] >= bestScore)
BestAlreadyAdmitted == (best > 0 /\ Good(best)) => best \in admitted
AlwaysLatestBest == best = 0 \/ best = ver
ExistsGoodEventuallyAdmitted ==
    (\E v \in Versions : Good(v)) => <>(admitted # {})
CompleteFairSpec == FairSpec /\ WF_vars(NewVersion) /\ WF_vars(Evaluate)
=============================================================================
