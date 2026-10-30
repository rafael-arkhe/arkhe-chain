------------------------- MODULE LaneProposeGuard ----------------------------
EXTENDS LaneIsolation
CurrentGood == IF ver = 0 THEN FALSE ELSE AllPass(ver)
GuardedPropose == Propose /\ ~CurrentGood
GuardedNext == GuardedPropose \/ Repair \/ Promote \/ Admit \/ ProdExec
GuardedSpec == Init /\ [][GuardedNext]_vars
    /\ WF_vars(GuardedPropose) /\ WF_vars(Repair)
    /\ WF_vars(Promote) /\ WF_vars(Admit) /\ WF_vars(ProdExec)
=============================================================================
