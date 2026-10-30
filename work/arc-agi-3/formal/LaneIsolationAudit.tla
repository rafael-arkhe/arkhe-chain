------------------------ MODULE LaneIsolationAudit ---------------------------
EXTENDS LaneIsolation
CONSTANT FaultMode
ASSUME FaultMode \in 0..3
UnsoundAdmit ==
 /\ FaultMode = 1 /\ stage = "PROVISIONAL" /\ ~verdict[ver].hold
 /\ stage' = "ADMITTED" /\ gateVer' = ver
 /\ admittedSet' = admittedSet \cup {ver}
 /\ UNCHANGED <<ver,verdict,effects,repairReads>>
UnbindAdmission ==
 /\ FaultMode = 2 /\ stage = "ADMITTED"
 /\ gateVer' = 0
 /\ UNCHANGED <<ver,stage,verdict,admittedSet,effects,repairReads>>
ShortcutAdmit ==
 /\ FaultMode = 3 /\ stage = "CANDIDATE" /\ verdict[ver].hold
 /\ stage' = "ADMITTED" /\ gateVer' = ver
 /\ admittedSet' = admittedSet \cup {ver}
 /\ UNCHANGED <<ver,verdict,effects,repairReads>>
AuditNext == Next \/ UnsoundAdmit \/ UnbindAdmission \/ ShortcutAdmit
AuditSpec == Init /\ [][AuditNext]_vars
=============================================================================
