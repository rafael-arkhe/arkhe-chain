-------------------------- MODULE LaneCyclesAudit ----------------------------
EXTENDS LaneIsolationCycles
CONSTANT Bug
ASSUME Bug \in {"none","leakExec","leakHoldout","unsoundAdmit","unbind","shortcut","repeat"}
VARIABLES readCount, cycleCount
counts == <<readCount,cycleCount>>
allvars == <<vars,counts>>
RecordQuery ==
 /\ readCount' = [readCount EXCEPT ![Cur] = @ + 1]
 /\ cycleCount' = [cycleCount EXCEPT ![cyc] = @ + 1]
AuditInit == Init /\ readCount = [v \in Versions |-> 0]
                  /\ cycleCount = [c \in 1..MaxCyc |-> 0]
SafeNext ==
 \/ ((Propose \/ Repair \/ Promote \/ RejectDev \/ ProdExec \/ NewCycle) /\ UNCHANGED counts)
 \/ ((Admit \/ RejectHold) /\ RecordQuery)
LeakExec ==
 /\ Bug = "leakExec" /\ ver > 0 /\ stage \in {"CANDIDATE","PROVISIONAL"}
 /\ effects' = effects \cup {Cur}
 /\ UNCHANGED <<cyc,ver,stage,verdict,gateVer,admittedSet,repairReads,holdQ,qTotal,counts>>
LeakHoldout ==
 /\ Bug = "leakHoldout" /\ repairReads' = repairReads \cup {"holdout"}
 /\ UNCHANGED <<cyc,ver,stage,verdict,gateVer,admittedSet,effects,holdQ,qTotal,counts>>
UnsoundAdmit ==
 /\ Bug = "unsoundAdmit" /\ stage = "PROVISIONAL" /\ holdQ = 0 /\ ~verdict[Cur].hold
 /\ stage' = "ADMITTED" /\ gateVer' = Cur
 /\ admittedSet' = admittedSet \cup {Cur}
 /\ holdQ' = 1 /\ qTotal' = qTotal + 1 /\ RecordQuery
 /\ UNCHANGED <<cyc,ver,verdict,effects,repairReads>>
Unbind ==
 /\ Bug = "unbind" /\ stage = "ADMITTED" /\ gateVer' = 0
 /\ UNCHANGED <<cyc,ver,stage,verdict,admittedSet,effects,repairReads,holdQ,qTotal,counts>>
Shortcut ==
 /\ Bug = "shortcut" /\ stage = "CANDIDATE" /\ holdQ = 0 /\ verdict[Cur].hold
 /\ stage' = "ADMITTED" /\ gateVer' = Cur
 /\ admittedSet' = admittedSet \cup {Cur}
 /\ holdQ' = 1 /\ qTotal' = qTotal + 1 /\ RecordQuery
 /\ UNCHANGED <<cyc,ver,verdict,effects,repairReads>>
RepeatQuery ==
 /\ Bug = "repeat" /\ cyc = MaxCyc /\ ver > 0 /\ holdQ = 1
 /\ qTotal < MaxCyc /\ qTotal' = qTotal + 1 /\ RecordQuery
 /\ UNCHANGED <<cyc,ver,stage,verdict,gateVer,admittedSet,effects,repairReads,holdQ>>
AuditNext == SafeNext \/ LeakExec \/ LeakHoldout \/ UnsoundAdmit \/ Unbind \/ Shortcut \/ RepeatQuery
AuditSpec == AuditInit /\ [][AuditNext]_allvars
HoldoutReadOncePerArtifact == \A v \in Versions : readCount[v] <= 1
HoldoutOncePerCycle == \A c \in 1..MaxCyc : cycleCount[c] <= 1
CounterTypes == readCount \in [Versions -> 0..MaxCyc]
             /\ cycleCount \in [1..MaxCyc -> 0..MaxCyc]
CounterBinding == holdQ = cycleCount[cyc]
BoundImpliesArtifactOnce == HoldQPerCycle => HoldoutReadOncePerArtifact
=============================================================================
