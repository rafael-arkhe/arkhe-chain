------------------------ MODULE LaneRepairFairness ---------------------------
EXTENDS LaneIsolation
RepairFairSpec == LiveSpec /\ WF_vars(Repair)
=============================================================================
