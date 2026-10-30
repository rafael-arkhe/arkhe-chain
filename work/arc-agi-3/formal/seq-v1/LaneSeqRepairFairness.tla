---- MODULE LaneSeqRepairFairness ----
EXTENDS LaneIsolationSeq
RepairFairSpec == LiveSpec /\ WF_vars(Repair)
====
